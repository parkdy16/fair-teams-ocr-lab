import React, { useEffect, useState } from "react";
import { Check, Cloud, Lock, LogOut, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSharedRosterAccount,
  getSharedRosterBackendLabel,
  listenToSharedRosterUser,
  signInToSharedRosters,
  signOutOfSharedRosters,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/auth\/email-already-in-use/i.test(message)) return "That email already has an account. Try Sign in instead.";
  if (/auth\/invalid-email/i.test(message)) return "Enter a valid email address.";
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return "Email or password did not match.";
  if (/auth\/weak-password/i.test(message)) return "Use a password with at least 6 characters.";
  if (/auth\/network-request-failed/i.test(message)) return "Network error. Check your connection and try again.";
  return message.replace(/^Firebase:\s*/i, "");
}

export function FirebaseSharedRosterAuthCard() {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"signin" | "create" | "signout" | "">("");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const trimmedEmail = email.trim();
  const canSubmit = Boolean(trimmedEmail && password.length >= 6 && !busyAction);

  const handleCreateAccount = async () => {
    if (!canSubmit) return;
    setBusyAction("create");
    setNotice(null);
    try {
      await createSharedRosterAccount(trimmedEmail, password);
      setPassword("");
      setNotice({ tone: "success", text: "Account created. You can now create, open, and accept shared roster invites." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSignIn = async () => {
    if (!canSubmit) return;
    setBusyAction("signin");
    setNotice(null);
    try {
      await signInToSharedRosters(trimmedEmail, password);
      setPassword("");
      setNotice({ tone: "success", text: "Signed in. Shared rosters and invites are available below." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSignOut = async () => {
    setBusyAction("signout");
    setNotice(null);
    try {
      await signOutOfSharedRosters();
      setNotice({ tone: "info", text: "Signed out of Firebase shared rosters." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  return (
    <div className="grid gap-3 rounded-3xl border border-sky-100 bg-sky-50/60 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-2xl bg-white p-2 text-sky-700 shadow-sm">
          <Cloud className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-wide text-sky-700">
            New shared roster system
          </div>
          <div className="mt-0.5 text-sm font-black tracking-tight text-[#102A43]">
            Shared roster account
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-600">
            Use this account only for online shared rosters. Local rosters still work without signing in.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
          Backend
        </div>
        <div className="mt-0.5 truncate text-xs font-black text-slate-700">
          {getSharedRosterBackendLabel()}
        </div>
      </div>

      {!authReady ? (
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-xs font-bold text-slate-500">
          Checking Firebase sign-in…
        </div>
      ) : user ? (
        <div className="grid gap-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Signed in
            </div>
            <div className="mt-1 truncate text-xs font-black text-[#102A43]">
              {user.email}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-start rounded-2xl gap-2 border-slate-100 bg-white/90 px-3 text-xs font-black"
            onClick={handleSignOut}
            disabled={Boolean(busyAction)}
          >
            <LogOut className="h-4 w-4" />
            {busyAction === "signout" ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Email</span>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
              <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300"
              />
            </div>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Password</span>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
              <Lock className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Minimum 6 characters"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300"
              />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="h-10 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]"
              onClick={handleSignIn}
              disabled={!canSubmit}
            >
              {busyAction === "signin" ? "Signing in..." : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl gap-1 border-slate-100 bg-white/90 px-2 text-xs font-black"
              onClick={handleCreateAccount}
              disabled={!canSubmit}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {busyAction === "create" ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`rounded-2xl px-3 py-2 text-[11px] font-bold leading-snug ${
            notice.tone === "success"
              ? "bg-emerald-50 text-emerald-700"
              : notice.tone === "error"
                ? "bg-rose-50 text-rose-700"
                : "bg-white/80 text-slate-600"
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}
