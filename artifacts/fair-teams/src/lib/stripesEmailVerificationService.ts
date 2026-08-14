import { getFunctions, httpsCallable } from "firebase/functions";
import { getFairTeamsAuth, getFairTeamsFirebaseApp } from "@/lib/firebaseClient";
import { cleanWorkspaceInvitationId } from "@/lib/workspaceInvitationOnboardingState";
import {
  StripesEmailVerificationError,
  verificationEmailError,
} from "@/lib/stripesEmailVerificationState";
export {
  StripesEmailVerificationError,
  verificationEmailError,
  verificationResendLabel,
} from "@/lib/stripesEmailVerificationState";

export type StripesEmailVerificationResult = {
  ok: true;
  status: "sent";
  resendAvailableAt: string;
  dailyRemaining: number;
};

function functionsRegion() {
  return (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "europe-west1").trim();
}

function functionsClient() {
  return getFunctions(getFairTeamsFirebaseApp(), functionsRegion());
}

function validIso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export async function requestStripesEmailVerification(
  invitationId?: string,
): Promise<StripesEmailVerificationResult> {
  if (!getFairTeamsAuth().currentUser) {
    throw new StripesEmailVerificationError("signed_out", "Sign in to request a verification email.");
  }
  const callable = httpsCallable<
    { invitationId?: string },
    StripesEmailVerificationResult
  >(functionsClient(), "sendStripesEmailVerification");
  try {
    const result = await callable(invitationId
      ? { invitationId: cleanWorkspaceInvitationId(invitationId) }
      : {});
    const resendAvailableAt = validIso(result.data.resendAvailableAt);
    if (result.data.status !== "sent" || !resendAvailableAt) {
      throw new Error("Invalid verification response.");
    }
    return {
      ok: true,
      status: "sent",
      resendAvailableAt,
      dailyRemaining: Math.max(0, Math.min(9, Number(result.data.dailyRemaining) || 0)),
    };
  } catch (error) {
    throw verificationEmailError(error);
  }
}
