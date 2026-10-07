import { RETURN_PATH_PARAM } from "@/lib/auth/returnPath";

export const EMAIL_VERIFIED_CALLBACK_URL = "/login/?verified=1";

const encodeForBetterAuthCallback = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function buildEmailVerifiedCallbackURL(returnPath: string | null): string {
  if (!returnPath) {
    return EMAIL_VERIFIED_CALLBACK_URL;
  }

  return `${EMAIL_VERIFIED_CALLBACK_URL}${encodeForBetterAuthCallback(
    `&${RETURN_PATH_PARAM}=${encodeForBetterAuthCallback(returnPath)}`,
  )}`;
}

type VerificationFailureReason =
  | "token_expired"
  | "invalid_token"
  | "user_not_found"
  | "unknown";

export type LoginNotice =
  | { kind: "verified"; message: string }
  | { kind: "verify_email"; message: string }
  | {
      kind: "verification_failed";
      reason: VerificationFailureReason;
      message: string;
    };

const ONE_SHOT_NOTICE_PARAMS = ["verified", "error", "verify_email", "email"] as const;

const VERIFICATION_FAILURE_MESSAGES: Record<VerificationFailureReason, string> = {
  token_expired:
    "That verification link has expired. Enter your email to get a new one.",
  invalid_token:
    "That verification link is invalid. Enter your email to get a new one.",
  user_not_found:
    "We couldn't find an account for that verification link. Sign up again, or enter your email to get a new link.",
  unknown: "We couldn't verify your email. Enter your email to get a new link.",
};

function toFailureReason(code: string): VerificationFailureReason {
  if (code === "token_expired" || code === "invalid_token" || code === "user_not_found") {
    return code;
  }
  return "unknown";
}

export function getLoginNotice(search: string): LoginNotice | null {
  const params = new URLSearchParams(search);
  const error = params.get("error");

  if (error !== null) {
    const reason = toFailureReason(error);
    return {
      kind: "verification_failed",
      reason,
      message: VERIFICATION_FAILURE_MESSAGES[reason],
    };
  }

  if (params.get("verified") === "1") {
    return { kind: "verified", message: "Email verified. You can sign in now." };
  }

  if (params.get("verify_email") === "1") {
    return { kind: "verify_email", message: "Verify your email first, then sign in." };
  }

  return null;
}

export function stripLoginNoticeParams(search: string): string | null {
  const params = new URLSearchParams(search);
  let changed = false;
  for (const name of ONE_SHOT_NOTICE_PARAMS) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  if (!changed) {
    return null;
  }
  const remaining = params.toString();
  return remaining ? `?${remaining}` : "";
}
