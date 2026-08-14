import React, { useCallback, useEffect, useRef, useState } from "react";
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
  PASSWORD_RESET_CONFIRMATION,
  canSubmitWorkspaceInvitationJoin,
  resolveWorkspaceInvitationOnboardingView,
} from "@/lib/workspaceInvitationOnboardingState";

export type WorkspaceInvitationOnboardingProps = {
  invitationId: string;
  onAccepted: (result: AcceptWorkspaceOrganizerInvitationResult) => void | Promise<void>;
  onContinue: () => void;
};

type Notice = { tone: "error" | "info" | "success"; text: string };
type BusyAction = "signin" | "create" | "reset" | "verify" | "refresh" | "join" | "signout" | "handoff" | "";

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanOrganizerName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/auth\/email-already-in-use/i.test(message)) return "An account already exists. Sign in instead.";
  if (/auth\/invalid-email/i.test(message)) return "Enter a valid email address.";
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return "Email or password did not match.";
  if (/auth\/weak-password/i.test(message)) return "Use a password with at least 6 characters.";
  if (/auth\/network-request-failed|network/i.test(message)) return "Network error. Check your connection and try again.";
  if (/auth\/too-many-requests|resource-exhausted/i.test(message)) return "Too many attempts. Try again later.";
  return "Stripes could not complete that account action. Try again.";
}

function invitationActionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/network/i.test(message)) return "Network error. Check your connection and try again.";
  if (/too-many|resource-exhausted/i.test(message)) return "Too many attempts. Try again later.";
  if (/expired/i.test(message)) return "This invitation has expired.";
  if (/cancel/i.test(message)) return "This invitation is no longer active.";
  if (/already|consumed|used/i.test(message)) return "This invitation has already been used.";
  if (/verified email|verify your/i.test(message)) return "Verify the invited email before joining.";
  return "Stripes could not complete this invitation. Try again.";
}

function InvitationContextHeader({ context }: { context: WorkspaceInvitationContext }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-violet-600">
        <ShieldCheck className="h-4 w-4" />
        Organizer invitation
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold leading-tight text-[#102A43] sm:text-3xl">
          Join {context.workspaceName}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
          {context.inviterDisplayName} invited you to join this Stripes workspace as an organizer.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
        Invited email: <span className="break-all text-[#102A43]">{context.maskedInvitedEmail}</span>
      </div>
    </div>
  );
}

export function WorkspaceInvitationOnboarding({
  invitationId,
  onAccepted,
  onContinue,
}: WorkspaceInvitationOnboardingProps) {
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
  const [verificationSent, setVerificationSent] = useState(false);
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

  const view = resolveWorkspaceInvitationOnboardingView({
    loading: !authReady || contextLoading,
    unavailable: contextUnavailable,
    context,
  });
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = cleanOrganizerName(organizerName);

  const handleSignIn = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    if (password.length < 6) {
      setNotice({ tone: "error", text: "Enter your password." });
      return;
    }
    setBusyAction("signin");
    setNotice(null);
    try {
      const nextUser = await signInToSharedRosters(normalizedEmail, password);
      setUser(nextUser);
      setPassword("");
      await refreshContext();
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleCreateAccount = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    if (password.length < 6) {
      setNotice({ tone: "error", text: "Use a password with at least 6 characters." });
      return;
    }
    if (!cleanName) {
      setNotice({ tone: "error", text: "Enter your organizer display name." });
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
          await sendStripesEmailVerification(invitationId);
          setVerificationSent(true);
          setNotice({ tone: "success", text: "Account created. Check your inbox to verify your email." });
        } catch (error) {
          setNotice({ tone: "error", text: `Account created. ${friendlyAuthError(error)}` });
        }
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handlePasswordReset = async () => {
    if (!validEmail(normalizedEmail)) {
      setNotice({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    setBusyAction("reset");
    setNotice(null);
    try {
      await sendStripesPasswordResetEmail(normalizedEmail, invitationId);
      setNotice({ tone: "info", text: PASSWORD_RESET_CONFIRMATION });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (/network|too-many|resource-exhausted/i.test(message)) {
        setNotice({ tone: "error", text: friendlyAuthError(error) });
      } else {
        setNotice({ tone: "info", text: PASSWORD_RESET_CONFIRMATION });
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
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSendVerification = async () => {
    setBusyAction("verify");
    setNotice(null);
    try {
      await sendStripesEmailVerification(invitationId);
      setVerificationSent(true);
      setNotice({ tone: "success", text: "Verification email sent. Check your inbox." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
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
        setNotice({ tone: "info", text: "Email verification is not confirmed yet. Open the email link, then try again." });
      }
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
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
        text: "You joined successfully, but Stripes could not open the workspace yet. Continue to try opening it again.",
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
      setNotice({ tone: "error", text: invitationActionError(error) });
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
          <h1 className="font-display text-2xl font-semibold text-[#102A43]">You joined {acceptedResult.workspaceName}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">Your organizer membership is active.</p>
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button
          type="button"
          className="min-h-11 rounded-2xl bg-[#102A43] font-black text-white hover:bg-[#0b2036]"
          disabled={Boolean(busyAction)}
          onClick={() => void handOffAcceptedResult(acceptedResult)}
        >
          {busyAction === "handoff" ? <Loader2 className="animate-spin" /> : null}
          Continue to workspace
        </Button>
      </div>,
    );
  }

  if (view === "loading") {
    return shell(
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking invitation…
      </div>,
    );
  }

  if (view === "unavailable" || !context) {
    return shell(<TerminalState
      title="Invitation unavailable"
      description="This organizer invitation could not be found or is no longer available."
      onContinue={onContinue}
    />);
  }

  if (view === "expired" || view === "cancelled" || view === "accepted") {
    const copy = view === "expired"
      ? { title: "Invitation expired", description: "Ask an organizer to send you a new invitation." }
      : view === "cancelled"
        ? { title: "Invitation no longer active", description: "This organizer invitation was cancelled." }
        : { title: "Invitation already used", description: "This invitation has already been used. It does not confirm access for the current account." };
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
          <div className="text-sm font-black text-amber-900">Use the invited account</div>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800">
            This invitation was sent to a different email address. You are signed in as <span className="break-all font-black">{user?.email || "another account"}</span>.
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-800">Invited email: {context.maskedInvitedEmail}</p>
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button type="button" variant="outline" className="min-h-11 rounded-2xl border-slate-200 font-black" disabled={Boolean(busyAction)} onClick={() => void handleSignOut()}>
          <LogOut />
          {busyAction === "signout" ? "Signing out…" : "Sign out / use another account"}
        </Button>
      </div>,
    );
  }

  if (view === "verification_required") {
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-sm font-semibold leading-relaxed text-violet-900">
          Verify <span className="break-all font-black">{user?.email}</span> before joining. Opening the verification email will not join the workspace automatically.
        </div>
        {notice && <NoticeBox notice={notice} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="min-h-11 whitespace-normal rounded-2xl border-violet-200 font-black text-violet-800" disabled={Boolean(busyAction)} onClick={() => void handleSendVerification()}>
            <Mail />
            {busyAction === "verify" ? "Sending…" : verificationSent ? "Resend verification" : "Send verification email"}
          </Button>
          <Button type="button" className="min-h-11 whitespace-normal rounded-2xl bg-[#102A43] font-black text-white hover:bg-[#0b2036]" disabled={Boolean(busyAction)} onClick={() => void handleVerificationRefresh()}>
            {busyAction === "refresh" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            I’ve verified — continue
          </Button>
        </div>
      </div>,
    );
  }

  if (view === "join_ready") {
    return shell(
      <div className="grid gap-5">
        <InvitationContextHeader context={context} />
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold leading-relaxed text-emerald-900">
          Signed in with the verified invited email. Joining will add you as an equal organizer.
        </div>
        {notice && <NoticeBox notice={notice} />}
        <Button type="button" className="min-h-12 rounded-2xl bg-violet-600 text-base font-black text-white hover:bg-violet-700" disabled={!canSubmitWorkspaceInvitationJoin(view, Boolean(busyAction))} onClick={() => void handleJoin()}>
          {busyAction === "join" ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {busyAction === "join" ? "Joining…" : `Join ${context.workspaceName}`}
        </Button>
      </div>,
    );
  }

  return shell(
    <div className="grid gap-5">
      <InvitationContextHeader context={context} />
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button type="button" className={`min-h-10 rounded-xl px-3 text-xs font-black ${authMode === "signin" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setAuthMode("signin")}>Sign in</button>
        <button type="button" className={`min-h-10 rounded-xl px-3 text-xs font-black ${authMode === "create" ? "bg-white text-[#102A43] shadow-sm" : "text-slate-500"}`} onClick={() => setAuthMode("create")}>Create account</button>
      </div>
      <div className="grid gap-3">
        <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="Invited email address" className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={authMode === "create" ? "new-password" : "current-password"} placeholder="Password" className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        {authMode === "create" && (
          <Input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} type="text" autoComplete="name" placeholder="Organizer display name" className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold" />
        )}
      </div>
      {authMode === "signin" && (
        <button type="button" className="justify-self-start text-xs font-black text-violet-700 underline-offset-4 hover:underline" onClick={() => setResetOpen((open) => !open)}>
          Forgot password?
        </button>
      )}
      {resetOpen && authMode === "signin" && (
        <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-semibold leading-relaxed text-slate-600">Stripes will send Firebase’s secure password-reset link and return you to this invitation.</p>
          <Button type="button" variant="outline" className="min-h-10 rounded-xl border-slate-200 bg-white text-xs font-black" disabled={Boolean(busyAction)} onClick={() => void handlePasswordReset()}>
            <Mail />
            {busyAction === "reset" ? "Sending…" : "Send password reset"}
          </Button>
        </div>
      )}
      {notice && <NoticeBox notice={notice} />}
      <Button type="button" className="min-h-12 rounded-2xl bg-[#102A43] text-sm font-black text-white hover:bg-[#0b2036]" disabled={Boolean(busyAction)} onClick={() => void (authMode === "signin" ? handleSignIn() : handleCreateAccount())}>
        {busyAction === "signin" || busyAction === "create" ? <Loader2 className="animate-spin" /> : authMode === "create" ? <UserPlus /> : null}
        {busyAction === "signin" ? "Signing in…" : busyAction === "create" ? "Creating account…" : authMode === "signin" ? "Sign in" : "Create account"}
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
  return (
    <div className="grid gap-4 text-center">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#102A43]">{title}</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{description}</p>
      </div>
      <Button type="button" variant="outline" className="min-h-11 rounded-2xl border-slate-200 font-black" onClick={onContinue}>
        Continue to Stripes
      </Button>
    </div>
  );
}
