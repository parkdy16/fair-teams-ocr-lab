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

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Something went wrong.");
  if (/auth\/email-already-in-use/i.test(message)) return "Account exists. Sign in.";
  if (/auth\/invalid-email/i.test(message)) return "Invalid email.";
  if (/auth\/invalid-credential|auth\/wrong-password|auth\/user-not-found/i.test(message)) return "Email or password did not match.";
  if (/auth\/weak-password/i.test(message)) return "Use at least 6 characters.";
  if (/auth\/network-request-failed/i.test(message)) return "Network error.";
  return message.replace(/^Firebase:\s*/i, "");
}

function cleanOrganizerName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function fallbackOrganizerName(email: string) {
  const prefix = email.split("@")[0] || "Organizer";
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Organizer";
}

export function FirebaseSharedRosterAuthCard() {
  const [user, setUser] = useState<SharedRosterUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [busyAction, setBusyAction] = useState<"signin" | "create" | "signout" | "name" | "">("");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = listenToSharedRosterUser((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser?.displayName) setOrganizerName(nextUser.displayName);
      else if (nextUser?.email) setOrganizerName(fallbackOrganizerName(nextUser.email));
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
      setNotice({ tone: "info", text: "Organizer name saved." });
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSignIn = async () => {
    if (!canSignIn) return;
    setBusyAction("signin");
    setNotice(null);
    try {
      const nextUser = await signInToSharedRosters(trimmedEmail, password);
      setUser(nextUser);
      setPassword("");
      if (!nextUser.displayName) setEditingName(true);
    } catch (error) {
      setNotice({ tone: "error", text: friendlyAuthError(error) });
    } finally {
      setBusyAction("");
    }
  };

  const handleSaveOrganizerName = async () => {
    if (!trimmedOrganizerName) return;
    setBusyAction("name");
    setNotice(null);
    try {
      const nextUser = await updateSharedRosterOrganizerName(trimmedOrganizerName);
      setUser(nextUser);
      setOrganizerName(nextUser.displayName || trimmedOrganizerName);
      setEditingName(false);
      setNotice({ tone: "info", text: "Organizer name updated." });
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
      setEditingName(false);
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
    const displayName = cleanOrganizerName(user.displayName || organizerName) || fallbackOrganizerName(user.email);
    return (
      <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">Organizer name</div>
            <div className="truncate text-sm font-black text-[#102A43]">{displayName}</div>
            <div className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{user.email}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="outline" className="h-8 rounded-xl border-slate-100 bg-slate-50 px-2 text-[10px] font-black" onClick={() => setEditingName((value) => !value)} disabled={Boolean(busyAction)}>
              {editingName ? <X className="mr-1 h-3.5 w-3.5" /> : null}
              {editingName ? "Close" : "Change"}
            </Button>
            <Button type="button" variant="outline" className="h-8 rounded-xl border-slate-100 bg-slate-50 px-2 text-[10px] font-black" onClick={handleSignOut} disabled={Boolean(busyAction)}>
              <LogOut className="mr-1 h-3.5 w-3.5" />
              {busyAction === "signout" ? "…" : "Logout"}
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
              placeholder="Joon"
              className="h-10 w-full min-w-0 rounded-xl border border-slate-100 bg-white px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300"
            />
            <Button type="button" className="h-10 w-full rounded-xl bg-[#102A43] px-3 text-xs font-black text-white hover:bg-[#0b2036]" onClick={handleSaveOrganizerName} disabled={!trimmedOrganizerName || Boolean(busyAction)}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {busyAction === "name" ? "Saving…" : "Save organizer name"}
            </Button>
          </div>
        )}

        {notice && <div className={`rounded-xl px-2 py-1 text-[10px] font-bold ${notice.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}
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
      <input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} type="text" autoComplete="name" placeholder="your organizer name" className="h-10 rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-[#102A43] outline-none placeholder:text-slate-300" />
      <div className="text-[10px] font-bold text-slate-500">Shown only to people you share rosters with.</div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-9 rounded-2xl bg-[#102A43] text-xs font-black text-white hover:bg-[#0b2036]" onClick={handleSignIn} disabled={!canSignIn}>{busyAction === "signin" ? "Signing in…" : "Sign in"}</Button>
        <Button type="button" variant="outline" className="h-9 rounded-2xl border-slate-100 bg-slate-50 px-2 text-xs font-black" onClick={handleCreateAccount} disabled={!canCreate}>
          <UserPlus className="mr-1 h-3.5 w-3.5" />
          {busyAction === "create" ? "Creating…" : "Create"}
        </Button>
      </div>
      {notice && <div className="rounded-xl bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">{notice.text}</div>}
    </div>
  );
}
