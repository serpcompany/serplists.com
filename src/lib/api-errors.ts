import { z } from "zod";

const DEFAULT_ERROR_PREFIX = "HTTP";

type ApiErrorPayload = {
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

export const BILLING_UNAVAILABLE_MESSAGE = "Billing is temporarily unavailable. Please contact support.";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(params: { status: number; message: string; code?: string; details?: unknown }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
  }
}

const isApiErrorPayload = (value: unknown): value is ApiErrorPayload => {
  return typeof value === "object" && value !== null;
};

export const createApiError = (status: number, payload?: unknown): ApiError => {
  const message = isApiErrorPayload(payload) && typeof payload.error === "string" && payload.error.length > 0
    ? payload.error
    : `${DEFAULT_ERROR_PREFIX} ${status}`;
  const code = isApiErrorPayload(payload) && typeof payload.code === "string"
    ? payload.code
    : undefined;
  const details = isApiErrorPayload(payload) ? payload.details : undefined;

  return new ApiError({ status, message, code, details });
};

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
};

export const isAuthRequiredError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 401;
};

export type LimitContext = "personal" | "organization";

// `details` of a 403 limit_reached response. `context` names whose limit was hit: a Personal
// Pro plan never lifts an Organization's limit, so only a Personal limit may lead to checkout.
const limitReachedDetailsSchema = z.object({
  context: z.enum(["personal", "organization"]),
});

/** The context of a limit_reached error, or null when the response did not name a valid one. */
export const getLimitContext = (error: ApiError): LimitContext | null => {
  const parsed = limitReachedDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.context : null;
};

export const isUpgradeRequiredError = (error: unknown): error is ApiError => {
  if (!isApiError(error) || error.status !== 403) {
    return false;
  }

  if (error.code === "upgrade_required") {
    return true;
  }

  // An Organization limit is not something a Personal Pro checkout can fix, so it is a plain
  // error carrying the server's message. A missing context keeps the old Personal behavior.
  return error.code === "limit_reached" && getLimitContext(error) !== "organization";
};

export const isBillingUnavailableError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.code === "billing_unavailable";
};

export type AccessFailure =
  | { kind: "auth_required"; message: string }
  | { kind: "upgrade_required"; message: string }
  | { kind: "billing_unavailable"; message: string }
  | { kind: "error"; message: string };

export const getAccessFailure = (error: unknown, fallbackMessage: string): AccessFailure => {
  if (isAuthRequiredError(error)) {
    return { kind: "auth_required", message: "Sign in to continue." };
  }

  if (isUpgradeRequiredError(error)) {
    return {
      kind: "upgrade_required",
      message: getApiErrorMessage(error, "Upgrade to Pro to continue."),
    };
  }

  if (isBillingUnavailableError(error)) {
    return { kind: "billing_unavailable", message: BILLING_UNAVAILABLE_MESSAGE };
  }

  return { kind: "error", message: getApiErrorMessage(error, fallbackMessage) };
};
