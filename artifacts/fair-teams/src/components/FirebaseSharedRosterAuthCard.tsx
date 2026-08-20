import React, { useEffect, useState } from "react";
import { Check, LogOut, Mail, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSharedRosterAccount,
  listenToSharedRosterUser,
  signInToSharedRosters,
  signOutOfSharedRosters,
  updateSharedRosterOrganizerName,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";
import {
  clearPendingGoogleLinkCredential,
  completePendingGoogleLinkForCurrentUser,
  googleAuthError,
  hasPendingGoogleLinkCredential,
  signInToSharedRostersWithGoogle,
} from "@/lib/firebaseGoogleAuth";
import { googleAuthErrorText, useStripesTranslation, type StripesTranslator } from "@/i18n";

function friendlyAuthError(error: unknown, t: StripesTranslator) {
  const message = error instanceof Error ? error.message : String(error || t("shared.auth.errors.generic"));
  if (/auth\/email-already-in-use/i.test(message)) return t("shared.auth.errors.accountExists");
  if (/auth\/invalid-email/i.test(message)) return t("shared.auth.errors.invalidEmail");
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return t("shared.auth.errors.credentialsMismatch");
  if (/auth\/weak-password/i.test(message)) return t("shared.auth.errors.weakPassword");
  if (/auth\/network-request-failed/i.test(message)) return t("shared.auth.errors.network");
  return message.replace(/^Firebase:\s*/i, "");
}

function cleanOrganizerName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}


function releaseMobileInputAndScroll() {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();

  const release = () => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    delete document.body.dataset.fairTeamsScrollLock;
  };

  release();
  window.setTimeout(release, 0);
  window.setTimeout(release, 120);
}

function fallbackOrganizerName(email: string, t: StripesTranslator) {
  const fallback = t("shared.auth.fallbackOrganizerName");
  const prefix = email.split("@")[0] || fallback;
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || fallback;
}

function blurOnDoneKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

export function FirebaseSharedRosterAuthCard() {
  const { t } = useStripesTranslation();
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [googleLinkPending, setGoogleLinkPending] = useState(() => hasPendingGoogleLinkCredential());
  const [busyAction, setBusyAction] = useState<"google" | "signin" | "create" | "signout" | "name" | "">("");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser?.displayName) setOrganizerName(nextUser.displayName);
      else if (nextUser?.email) setOrganizerName(fallbackOrganizerName(nextUser.email, t));
    });
    return unsubscribe;
  }, []);

  const trimmedEmail = email.trim();
  const trimmedOrganizerName = cleanOrganizerName(organizerName);
  const canSignIn = Boolean(trimmedEmail && password.length >= 6 && !busyAction);
  const canCreate = Boolean(canSignIn && trimmedOrganizerName);

  const handleCreateAccount = async () => {
    if (!canCreate) return;
    setBusyAction("create");
    setNotice(null);
    try {
      const nextUser = await createSharedRosterAccount(trimmedEmail, password, trimmedOrganizerName);
      setUser(nextUser);
      setPassword("");
      setNotice({ tone: "info", text: t("shared.auth.notices.organizerNameSaved") });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSignIn = async () => {
    if (!canSignIn) return;
    setBusyAction("signin");
    setNotice(null);
    try {
      let nextUser = await signInToSharedRosters(trimmedEmail, password);
      setPassword("");
      if (hasPendingGoogleLinkCredential()) {
        const completion = await completePendingGoogleLinkForCurrentUser();
        nextUser = completion.user;
        setGoogleLinkPending(false);
        if (completion.linked) {
          setNotice({ tone: "info", text: t("shared.auth.notices.googleConnected") });
        }
      } else {
        setGoogleLinkPending(false);
      }
      setUser(nextUser);
      if (!nextUser.displayName) setEditingName(true);
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
      if (!nextUser.displayName) setEditingName(true);
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

  const handleSaveOrganizerName = async () => {
    if (!trimmedOrganizerName) return;
    const nextName = trimmedOrganizerName;
    releaseMobileInputAndScroll();
    setEditingName(false);
    setOrganizerName(nextName);
    setBusyAction("name");
    setNotice(null);
    try {
      const nextUser = await updateSharedRosterOrganizerName(nextName);
      setUser(nextUser);
      setOrganizerName(nextUser.displayName || nextName);
      setNotice({ tone: "info", text: t("shared.auth.notices.organizerNameUpdated") });
    } catch (error) {
      setEditingName(true);
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
      releaseMobileInputAndScroll();
    }
  };

  const handleSignOut = async () => {
    setBusyAction("signout");
    setNotice(null);
    try {
      await signOutOfSharedRosters();
      setEditingName(false);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error, t) });
    } finally {
      setBusyAction("");
    }
  };

  if (!authReady) {
    return <div className="rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500">{t("shared.auth.checking")}</div>;
  }

  if (user) {
    const displayName = cleanOrganizerName(user.displayName || organizerName) || fallbackOrganizerName(user.email, t);
    return (
      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{t("shared.auth.organizerName")}</div>
            <div className="truncate text-sm font-black text-[#102A43]">{displayName}</div>
            <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{user.email}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="outline" className="h-8 rounded-xl border-slate-100 bg-slate-50 px-2 text-[10px] font-black" onClick={() => {
                releaseMobileInputAndScroll();
                setEditingName((value) => !value);
              }} disabled={Boolean(busyAction)}>
              {editingName ? <X className="mr-1 h-3.5 w-3.5" /> : null}
              {editingName ? t("common.close") : t("shared.auth.change")}
            </Button>
            <Button type="button" variant="outline" className="h-8 rounded-xl border-slate-100 bg-slate-50 px-2 text-[10px] font-black" onClick={handleSignOut} disabled={Boolean(busyAction)}>
              <LogOut className="mr-1 h-3.5 w-3.5" />
              {busyAction === "signout" ? "…" : t("shared.auth.logout")}
            </Button>
          </div>
        </div>

        {editingName && (
          <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-2">
            <input
              value={organizerName}
              onChange={(event) => setOrganizerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              placeholder={t("shared.auth.organizerNamePlaceholder")}
              className="h-10 w-full min-w-0 rounded-xl border border-slate-100 bg-white px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300"
            />
            <Button type="button" className="h-10 w-full rounded-xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]" onClick={handleSaveOrganizerName} disabled={!trimmedOrganizerName || Boolean(busyAction)}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {busyAction === "name" ? t("shared.auth.saving") : t("shared.auth.saveOrganizerName")}
            </Button>
          </div>
        )}

        {notice && <div className={`rounded-xl px-2 py-1 text-[10px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}
        {googleLinkPending && (
          <Button type="button" variant="outline" className="min-h-8 rounded-xl border-slate-100 bg-slate-50 text-[10px] font-black" onClick={handleCancelGoogleLink} disabled={Boolean(busyAction)}>
            {t("shared.auth.cancelGoogleConnection")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
      <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white text-xs font-black text-[#102A43]" onClick={() => void handleGoogleSignIn()} disabled={Boolean(busyAction)}>
        <span aria-hidden="true" className="font-black text-blue-600">{t("shared.auth.googleMark")}</span>
        {busyAction === "google" ? t("shared.auth.connecting") : t("shared.auth.continueWithGoogle")}
      </Button>
      <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-100" />
        {t("shared.auth.or")}
        <span className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" type="email" autoComplete="email" placeholder={t("shared.auth.emailPlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
        </div>
        <input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" type="password" autoComplete="current-password" placeholder={t("shared.auth.passwordPlaceholder")} className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
      </div>
      <input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} onKeyDown={blurOnDoneKey} enterKeyHint="done" type="text" autoComplete="name" placeholder={t("shared.auth.organizerNameInputPlaceholder")} className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
      <div className="text-[10px] font-bold text-slate-500">{t("shared.auth.organizerNamePrivacy")}</div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-9 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]" onClick={handleSignIn} disabled={!canSignIn}>{busyAction === "signin" ? t("shared.auth.signingIn") : t("shared.auth.signIn")}</Button>
        <Button type="button" variant="outline" className="h-9 rounded-2xl border-slate-100 bg-slate-50 px-2 text-xs font-black" onClick={handleCreateAccount} disabled={!canCreate}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          {busyAction === "create" ? t("shared.auth.creating") : t("shared.auth.create")}
        </Button>
      </div>
      {notice && <div className="rounded-xl bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">{notice.text}</div>}
      {googleLinkPending && (
        <Button type="button" variant="outline" className="min-h-8 rounded-xl border-slate-100 bg-slate-50 text-[10px] font-black" onClick={handleCancelGoogleLink} disabled={Boolean(busyAction)}>
          {t("shared.auth.cancelGoogleConnection")}
        </Button>
      )}
    </div>
  );
}
