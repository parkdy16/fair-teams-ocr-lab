import React, { useEffect, useState } from "react";
import { LogOut, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSharedRosterAccount,
  listenToSharedRosterUser,
  signInToSharedRosters,
  signOutOfSharedRosters,
  type SharedRosterUser,
} from "@/lib/sharedRosterService";

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/auth\/email-already-in-use/i.test(message)) return "Account exists. Sign in.";
  if (/auth\/invalid-email/i.test(message)) return "Invalid email.";
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return "Email or password did not match.";
  if (/auth\/weak-password/i.test(message)) return "Use at least 6 characters.";
  if (/auth\/network-request-failed/i.test(message)) return "Network error.";
  return message.replace(/^Firebase:\s*/i, "");
}

export function FirebaseSharedRosterAuthCard() {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState<"signin" | "create" | "signout" | "">("");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

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
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  if (!authReady) {
    return <div className="rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-500">Checking sign-in…</div>;
  }

  if (user) {
    return (
      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-xs font-bold text-slate-600">{user.email}</div>
          <Button type="button" variant="outline" className="h-8 shrink-0 rounded-xl border-slate-100 bg-slate-50 px-2 text-[10px] font-black" onClick={handleSignOut} disabled={Boolean(busyAction)}>
            <LogOut className="mr-1 h-3.5 w-3.5" />
            {busyAction === "signout" ? "…" : "Logout"}
          </Button>
        </div>
        {notice && <div className="rounded-xl bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">{notice.text}</div>}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="email" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
        </div>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="password" className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-9 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]" onClick={handleSignIn} disabled={!canSubmit}>{busyAction === "signin" ? "Signing in…" : "Sign in"}</Button>
        <Button type="button" variant="outline" className="h-9 rounded-2xl border-slate-100 bg-slate-50 px-2 text-xs font-black" onClick={handleCreateAccount} disabled={!canSubmit}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          {busyAction === "create" ? "Creating…" : "Create"}
        </Button>
      </div>
      {notice && <div className="rounded-xl bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">{notice.text}</div>}
    </div>
  );
}
