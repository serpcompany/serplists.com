/**
 * One-shot notices that /login shows from its query string.
 *
 * Better Auth redirects the email verification link back to
 * EMAIL_VERIFIED_CALLBACK_URL. On success it redirects to the callback as is;
 * on failure it appends `&error=<code>` (or `?error=<code>` when the callback
 * has no query), so a failed link lands on `/login?verified=1&error=...`.
 * Always check `error` before `verified`.
 */

/**
 * Callback for verification emails. Better Auth 1.3.4 concatenates it into the
 * email link without encoding it, so it must carry exactly one query parameter:
 * a second `&` would become a parameter of /verify-email and be lost.
 */
export const EMAIL_VERIFIED_CALLBACK_URL = "/login?verified=1";

export type VerificationFailureReason =
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

export interface LoginSearchState {
  notice: LoginNotice | null;
  email: string | null;
}

/** Query parameters that only exist to trigger a notice once. */
const ONE_SHOT_PARAMS = ["verified", "error", "verify_email", "email"] as const;

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

  // Any error means the link failed, even when `verified=1` is also present.
  if (error !== null) {
    const reason = toFailureReason(error);
    return {
      kind: "verification_failed",
      reason,
      message: VERIFICATION_FAILURE_MESSAGES[reason],
    };
  }

  // Strict match: Better Auth's change-email path produces
  // `verified=1?error=unauthorized`, which must not count as success.
  if (params.get("verified") === "1") {
    return { kind: "verified", message: "Email verified. You can sign in now." };
  }

  if (params.get("verify_email") === "1") {
    return { kind: "verify_email", message: "Verify your email first, then sign in." };
  }

  return null;
}

export function parseLoginSearch(search: string): LoginSearchState {
  const email = new URLSearchParams(search).get("email");
  return {
    notice: getLoginNotice(search),
    email: email && email.trim() ? email.trim() : null,
  };
}

/**
 * Returns the query string without the one-shot notice parameters, or null
 * when there is nothing to remove. Removing them stops a reload or back
 * navigation from replaying the notice and keeps the email out of history.
 */
export function stripLoginNoticeParams(search: string): string | null {
  const params = new URLSearchParams(search);
  let changed = false;
  for (const name of ONE_SHOT_PARAMS) {
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
