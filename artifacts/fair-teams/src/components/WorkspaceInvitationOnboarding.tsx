import React, { useCallback, useEffect, useRef, useState } from "react";
import { Trans } from "react-i18next";
import { CheckCircle2, Loader2, LogOut, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSharedRosterAccount,
  listenToSharedRosterUser,
  signInToSharedRosters,
  signOutOfSharedRosters,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import {
  reloadAndRefreshStripesAuthIdentity,
  sendStripesEmailVerification,
  sendStripesPasswordResetEmail,
} from "@/lib/sharedWorkspaceInvitationAuth";
import {
  acceptWorkspaceOrganizerInvitation,
  getWorkspaceOrganizerInvitationContext,
  type AcceptWorkspaceOrganizerInvitationResult,
  type WorkspaceInvitationContext,
} from "@/lib/sharedWorkspaceInvitationService";
import {
  canSubmitWorkspaceInvitationJoin,
  resolveWorkspaceInvitationOnboardingView,
} from "@/lib/workspaceInvitationOnboardingState";
import {
  clearPendingGoogleLinkCredential,
  completePendingGoogleLinkForCurrentUser,
  googleAuthError,
  hasPendingGoogleLinkCredential,
  signInToSharedRostersWithGoogle,
} from "@/lib/firebaseGoogleAuth";
import {
  verificationEmailError,
} from "@/lib/stripesEmailVerificationService";
import {
  googleAuthErrorText,
  useStripesTranslation,
  verificationEmailErrorText,
  verificationResendText,
  type StripesTranslator,
} from "@/i18n";

export type WorkspaceInvitationOnboardingProps = {
  invitationId: string;
  onAccepted: (result: AcceptWorkspaceOrganizerInvitationResult) => void | Promise<void>;
  onContinue: () => void;
};

type Notice = { tone: "error" | "info" | "success"; text: string };
type BusyAction = "google" | "signin" | "create" | "reset" | "verify" | "refresh" | "join" | "signout" | "handoff" | "";

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanOrganizerName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function friendlyAuthError(error: unknown, t: StripesTranslator) {
  const message = error instanceof Error ? error.message : String(error || t("shared.auth.errors.generic"));
  if (/auth\/email-already-in-use/i.test(message)) return t("shared.invitation.errors.accountExists");
  if (/auth\/invalid-email/i.test(message)) return t("shared.invitation.errors.invalidEmail");
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return t("shared.auth.errors.credentialsMismatch");
  if (/auth\/weak-password/i.test(message)) return t("shared.invitation.errors.weakPassword");
  if (/auth\/network-request-failed|network/i.test(message)) return t("shared.invitation.errors.network");
  if (/auth\/too-many-requests|resource-exhausted/i.test(message)) return t("shared.invitation.errors.tooManyAttempts");
  return t("shared.invitation.errors.accountAction");
}

function invitationActionError(error: unknown, t: StripesTranslator) {
  const message = error instanceof Error ? error.message : String(error || t("shared.auth.errors.generic"));
  if (/network/i.test(message)) return t("shared.invitation.errors.network");
  if (/too-many|resource-exhausted/i.test(message)) return t("shared.invitation.errors.tooManyAttempts");
  if (/expired/i.test(message)) return t("shared.invitation.errors.expired");
  if (/cancel/i.test(message)) return t("shared.invitation.errors.inactive");
  if (/already|consumed|used/i.test(message)) return t("shared.invitation.errors.used");
  if (/verified email|verify your/i.test(message)) return t("shared.invitation.errors.verifyFirst");
  return t("shared.invitation.errors.action");
}

function InvitationContextHeader({ context }: { context: WorkspaceInvitationContext }) {
  const { t } = useStripesTranslation();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-600">
        <ShieldCheck className="h-4 w-4" />
        {t("shared.invitation.header")}
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold leading-tight text-[#102A43] sm:text-3xl">
          {t("shared.invitation.joinWorkspace", { workspace: context.workspaceName })}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
          {t("shared.invitation.invitedBy", { inviter: context.inviterDisplayName })}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
        {t("shared.invitation.invitedEmailLabel")} <span className="break-all text-[#102A43]">{context.maskedInvitedEmail}</span>
      </div>
    </div>
  );
}

export function WorkspaceInvitationOnboarding({
  invitationId,
  onAccepted,
  onContinue,
}: WorkspaceInvitationOnboardingProps) {
  const { t } = useStripesTranslation();
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [context, setContext] = useState<WorkspaceInvitationContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextUnavailable, setContextUnavailable] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [googleLinkPending, setGoogleLinkPending] = useState(() => hasPendingGoogleLinkCredential());
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationResendAt, setVerificationResendAt] = useState<string | null>(null);
  const [verificationClock, setVerificationClock] = useState(() => Date.now());
  const [busyAction, setBusyAction] = useState<BusyAction>("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [acceptedResult, setAcceptedResult] = useState<AcceptWorkspaceOrganizerInvitationResult | null>(null);
  const contextRequestRef = useRef(0);
  const joinPendingRef = useRef(false);

  const refreshContext = useCallback(async () => {
    const requestId = contextRequestRef.current + 1;
    contextRequestRef.current = requestId;
    setContextLoading(true);
    setContextUnavailable(false);
    try {
      const nextContext = await getWorkspaceOrganizerInvitationContext(invitationId);
      if (contextRequestRef.current !== requestId) return null;
      setContext(nextContext);
      return nextContext;
    } catch {
      if (contextRequestRef.current === requestId) {
        setContext(null);
        setContextUnavailable(true);
      }
      return null;
    } finally {
      if (contextRequestRef.current === requestId) setContextLoading(false);
    }
  }, [invitationId]);

  useEffect(() => listenToSharedRosterUser((nextUser) => {
    setUser(nextUser);
    setAuthReady(true);
  }), []);

  useEffect(() => {
    if (!authReady) return;
    void refreshContext();
  }, [authReady, user?.uid, user?.emailVerified, refreshContext]);

  useEffect(() => {
    if (!verificationResendAt || Date.parse(verificationResendAt) <= Date.now()) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setVerificationClock(now);
      if (Date.parse(verificationResendAt) <= now) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [verificationResendAt]);

  const view = resolveWorkspaceInvitationOnboardingView({
    loading: !authReady || contextLoading,
    unavailable: contextUnavailable,
    context,
  });
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = cleanOrganizerName(organizerName);
  const verificationCooldownLabel = verificationResendText(verificationResendAt, verificationClock, t);

  const handleSignIn = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.invalidEmail") });
      return;
    }
    if (password.length < 6) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.passwordRequired") });
      return;
    }
    setBusyAction("signin");
    setNotice(null);
    try {
      let nextUser = await signInToSharedRosters(normalizedEmail, password);
      setPassword("");
      if (hasPendingGoogleLinkCredential()) {
        const completion = await completePendingGoogleLinkForCurrentUser();
        nextUser = completion.user;
        setGoogleLinkPending(false);
        if (completion.linked) {
          setNotice({ tone: "success", text: t("shared.auth.notices.googleConnected") });
        }
      } else {
        setGoogleLinkPending(false);
      }
      setUser(nextUser);
      await refreshContext();
    } catch (error) {
      setGoogleLinkPending(hasPendingGoogleLinkCredential());
      setNotice({ tone: "error", text: error instanceof Error && error.name === "StripesGoogleAuthError"
        ? googleAuthErrorText(googleAuthError(error), t)
        : friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handleGoogleSignIn = async () => {
    setBusyAction("google");
    setNotice(null);
    try {
      const nextUser = await signInToSharedRostersWithGoogle();
      setUser(nextUser);
      await refreshContext();
    } catch (error) {
      const safeError = googleAuthError(error);
      setGoogleLinkPending(hasPendingGoogleLinkCredential());
      setNotice({ tone: "error", text: googleAuthErrorText(safeError, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handleCancelGoogleLink = () => {
    clearPendingGoogleLinkCredential();
    setGoogleLinkPending(false);
    setNotice({ tone: "info", text: t("shared.auth.notices.googleCancelled") });
  };

  const handleCreateAccount = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.invalidEmail") });
      return;
    }
    if (password.length < 6) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.weakPassword") });
      return;
    }
    if (!cleanName) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.organizerNameRequired") });
      return;
    }
    setBusyAction("create");
    setNotice(null);
    try {
      const nextUser = await createSharedRosterAccount(normalizedEmail, password, cleanName);
      setUser(nextUser);
      setPassword("");
      const nextContext = await refreshContext();
      if (nextContext?.state === "pending" && nextContext.viewerStatus === "matching_unverified") {
        try {
          const verification = await sendStripesEmailVerification(invitationId);
          setVerificationSent(true);
          setVerificationResendAt(verification.resendAvailableAt);
          setVerificationClock(Date.now());
          setNotice({ tone: "success", text: t("shared.invitation.notices.accountCreated") });
        } catch (error) {
          const safeError = verificationEmailError(error);
          setVerificationResendAt(safeError.resendAvailableAt);
          setVerificationClock(Date.now());
          setNotice({ tone: "error", text: t("shared.invitation.notices.accountCreatedPrefix", { message: verificationEmailErrorText(safeError, t) }) });
        }
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordReset = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: t("shared.invitation.errors.invalidEmail") });
      return;
    }
    setBusyAction("reset");
    setNotice(null);
    try {
      await sendStripesPasswordResetEmail(normalizedEmail, invitationId);
      setNotice({ tone: "info", text: t("shared.invitation.notices.passwordReset") });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (/network|too-many|resource-exhausted/i.test(message)) {
        setNotice({ tone: "error", text: friendlyAuthError(error, t) });
      } else {
        setNotice({ tone: "info", text: t("shared.invitation.notices.passwordReset") });
      }
    } finally {
      setBusyAction("");
    }
  };

  const handleSignOut = async () => {
    setBusyAction("signout");
    setNotice(null);
    try {
      await signOutOfSharedRosters();
      setUser(null);
      setAuthMode("signin");
      await refreshContext();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSendVerification = async () => {
    setBusyAction("verify");
    setNotice(null);
    try {
      const verification = await sendStripesEmailVerification(invitationId);
      setVerificationSent(true);
      setVerificationResendAt(verification.resendAvailableAt);
      setVerificationClock(Date.now());
      setNotice({ tone: "success", text: t("shared.invitation.notices.verificationSent") });
    } catch (error) {
      const safeError = verificationEmailError(error);
      setVerificationResendAt(safeError.resendAvailableAt);
      setVerificationClock(Date.now());
      setNotice({ tone: "error", text: verificationEmailErrorText(safeError, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handleVerificationRefresh = async () => {
    setBusyAction("refresh");
    setNotice(null);
    try {
      const nextUser = await reloadAndRefreshStripesAuthIdentity();
      setUser(nextUser);
      const nextContext = await refreshContext();
      if (nextContext?.viewerStatus !== "matching_verified") {
        setNotice({ tone: "info", text: t("shared.invitation.notices.verificationPending") });
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handOffAcceptedResult = async (result: AcceptWorkspaceOrganizerInvitationResult) => {
    setBusyAction("handoff");
    setNotice(null);
    try {
      await onAccepted(result);
    } catch {
      setNotice({
        tone: "error",
        text: t("shared.invitation.notices.joinedButOpenFailed"),
      });
    } finally {
      setBusyAction("");
    }
  };

  const handleJoin = async () => {
    if (!canSubmitWorkspaceInvitationJoin(view, joinPendingRef.current)) return;
    joinPendingRef.current = true;
    setBusyAction("join");
    setNotice(null);
    try {
      const result = await acceptWorkspaceOrganizerInvitation(invitationId);
      setAcceptedResult(result);
      await handOffAcceptedResult(result);
    } catch (error) {
      joinPendingRef.current = false;
      setNotice({ tone: "error", text: invitationActionError(error, t) });
      await refreshContext();
    } finally {
      setBusyAction("");
    }
  };

  const shell = (content: React.ReactNode) => (
    <section className="mx-auto w-full max-w-lg rounded-[28px] border border-slate-100 bg-white p-4 shadow-[0_16px_50px_rgba(15,23,42,0.14)] sm:p-6">
      {content}
    </section>
  );

  if (acceptedResult) {
    return shell(
      <div className="grid gap-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#102A43]">{t("shared.invitation.accepted.title", { workspace: acceptedResult.workspaceName })}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">{t("shared.invitation.accepted.description")}</p>
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button
          type="button"
          className="min-h-11 rounded-2xl bg-[#102A43] font-black text-white hover:bg-[#0b2036]"
          disabled={Boolean(busyAction)}
          onClick={() => void handOffAcceptedResult(acceptedResult)}
        >
          {busyAction === "handoff" ? <Loader2 className="animate-spin" /> : null}
          {t("shared.invitation.continueToWorkspace")}
        </Button>
      </div>,
    );
  }

  if (view === "loading") {
    return shell(
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("shared.invitation.checking")}
      </div>,
    );
  }

  if (view === "unavailable" || !context) {
    return shell(<TerminalState
      title={t("shared.invitation.unavailable.title")}
      description={t("shared.invitation.unavailable.description")}
      onContinue={onContinue}
    />);
  }

  if (view === "expired" || view === "cancelled" || view === "accepted") {
    const copy = view === "expired"
      ? { title: t("shared.invitation.expired.title"), description: t("shared.invitation.expired.description") }
      : view === "cancelled"
        ? { title: t("shared.invitation.cancelled.title"), description: t("shared.invitation.cancelled.description") }
        : { title: t("shared.invitation.used.title"), description: t("shared.invitation.used.description") };
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <TerminalState {...copy} onContinue={onContinue} />
      </div>,
    );
  }

  if (view === "wrong_account") {
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-sm font-black text-amber-900">{t("shared.invitation.wrongAccount.title")}</div>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800">
            <Trans
              i18nKey="shared.invitation.wrongAccount.description"
              values={{ account: user?.email || t("shared.invitation.anotherAccount") }}
              components={{ account: <span className="break-all font-black" /> }}
            />
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-800">{t("shared.invitation.invitedEmail", { email: context.maskedInvitedEmail })}</p>
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button type="button" variant="outline" className="min-h-11 rounded-2xl border-slate-200 font-black" disabled={Boolean(busyAction)} onClick={() => void handleSignOut()}>
          <LogOut />
          {busyAction === "signout" ? t("shared.invitation.signingOut") : t("shared.invitation.signOutOther")}
        </Button>
        {googleLinkPending && (
          <Button type="button" variant="outline" className="min-h-10 rounded-2xl border-slate-200 text-xs font-black" disabled={Boolean(busyAction)} onClick={handleCancelGoogleLink}>
            {t("shared.auth.cancelGoogleConnection")}
          </Button>
        )}
      </div>,
    );
  }

  if (view === "verification_required") {
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-sm font-semibold leading-relaxed text-violet-900">
          <Trans
            i18nKey="shared.invitation.verificationRequired.description"
            values={{ email: user?.email }}
            components={{ email: <span className="break-all font-black" /> }}
          />
        </div>
        {notice && <NoticeBox notice={notice} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-11 whitespace-normal rounded-2xl border-violet-200 font-black text-violet-800" disabled={Boolean(busyAction) || Boolean(verificationCooldownLabel)} onClick={() => void handleSendVerification()}>
            <Mail />
            {busyAction === "verify" ? t("shared.invitation.sending") : verificationSent ? t("shared.invitation.resendVerification") : t("shared.invitation.sendVerification")}
          </Button>
          <Button type="button" className="min-h-11 whitespace-normal rounded-2xl bg-[#102A43] font-black text-white hover:bg-[#0b2036]" disabled={Boolean(busyAction)} onClick={() => void handleVerificationRefresh()}>
            {busyAction === "refresh" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t("shared.invitation.verifiedContinue")}
          </Button>
        </div>
        {verificationCooldownLabel && <p className="text-center text-xs font-bold text-slate-500">{verificationCooldownLabel}</p>}
      </div>,
    );
  }

  if (view === "join_ready") {
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-900">
          {t("shared.invitation.joinReady")}
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button type="button" className="min-h-12 rounded-2xl bg-violet-600 text-base font-black text-white hover:bg-violet-700" disabled={!canSubmitWorkspaceInvitationJoin(view, Boolean(busyAction))} onClick={() => void handleJoin()}>
          {busyAction === "join" ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {busyAction === "join" ? t("shared.invitation.joining") : t("shared.invitation.joinWorkspace", { workspace: context.workspaceName })}
        </Button>
      </div>,
    );
  }

  return shell(
    <div className="grid gap-5">
      <InvitationContextHeader context={context} />
      <Button type="button" variant="outline" className="min-h-12 rounded-2xl border-slate-200 bg-white text-sm font-black text-[#102A43]" disabled={Boolean(busyAction)} onClick={() => void handleGoogleSignIn()}>
        <span aria-hidden="true" className="font-black text-blue-600">{t("shared.auth.googleMark")}</span>
        {busyAction === "google" ? t("shared.auth.connecting") : t("shared.auth.continueWithGoogle")}
      </Button>
      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wide text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-100" />
        {t("shared.auth.or")}
        <span className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" className={`min-h-10 rounded-xl px-3 text-xs font-black ${authMode === "signin" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setAuthMode("signin")}>{t("shared.auth.signIn")}</button>
        <button type="button" className={`min-h-10 rounded-xl px-3 text-xs font-black ${authMode === "create" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setAuthMode("create")}>{t("shared.invitation.createAccount")}</button>
      </div>
      <div className="grid gap-3">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder={t("shared.invitation.emailPlaceholder")} className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={authMode === "create" ? "new-password" : "current-password"} placeholder={t("shared.invitation.passwordPlaceholder")} className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        {authMode === "create" && (
          <Input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} type="text" autoComplete="name" placeholder={t("shared.invitation.namePlaceholder")} className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        )}
      </div>
      {authMode === "signin" && (
        <button type="button" className="justify-self-start text-xs font-black text-violet-700 underline-offset-4 hover:underline" onClick={() => setResetOpen((open) => !open)}>
          {t("shared.invitation.forgotPassword")}
        </button>
      )}
      {resetOpen && authMode === "signin" && (
        <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-semibold leading-relaxed text-slate-600">{t("shared.invitation.passwordResetHelp")}</p>
          <Button type="button" variant="outline" className="min-h-10 rounded-xl border-slate-200 bg-white text-xs font-black" disabled={Boolean(busyAction)} onClick={() => void handlePasswordReset()}>
            <Mail />
            {busyAction === "reset" ? t("shared.invitation.sending") : t("shared.invitation.sendPasswordReset")}
          </Button>
        </div>
      )}
      {notice && <NoticeBox notice={notice} />}
      {googleLinkPending && (
        <Button type="button" variant="outline" className="min-h-10 rounded-2xl border-slate-200 text-xs font-black" disabled={Boolean(busyAction)} onClick={handleCancelGoogleLink}>
          {t("shared.auth.cancelGoogleConnection")}
        </Button>
      )}
      <Button type="button" className="min-h-12 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={Boolean(busyAction)} onClick={() => void (authMode === "signin" ? handleSignIn() : handleCreateAccount())}>
        {busyAction === "signin" || busyAction === "create" ? <Loader2 className="animate-spin" /> : authMode === "create" ? <UserPlus /> : null}
        {busyAction === "signin" ? t("shared.auth.signingIn") : busyAction === "create" ? t("shared.invitation.creatingAccount") : authMode === "signin" ? t("shared.auth.signIn") : t("shared.invitation.createAccount")}
      </Button>
    </div>,
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div className={`rounded-2xl px-3 py-2 text-xs font-bold leading-relaxed ${notice.tone === "error" ? "bg-rose-50 text-rose-800" : notice.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`} role="status">
      {notice.text}
    </div>
  );
}

function TerminalState({ title, description, onContinue }: { title: string; description: string; onContinue: () => void }) {
  const { t } = useStripesTranslation();
  return (
    <div className="grid gap-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#102A43]">{title}</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{description}</p>
      </div>
      <Button type="button" variant="outline" className="min-h-11 rounded-2xl border-slate-200 font-black" onClick={onContinue}>
        {t("shared.invitation.continueToStripes")}
      </Button>
    </div>
  );
}
