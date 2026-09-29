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

// A settled "does not exist" answer: the API returns 404 for a missing, deleted or private
// resource. Anything else (network failure, 5xx, rate limit) may be transient.
export const isNotFoundError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 404;
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

// A template or run changed after the editor loaded it.
export const isEditConflictError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 409 && error.code === "edit_conflict";
};

export const isBillingUnavailableError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.code === "billing_unavailable";
};

/** Checkout refused because an open subscription must be fixed in the Customer Portal. */
export const isSubscriptionNeedsAttentionError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 409 && error.code === "subscription_needs_attention";
};

/**
 * Checkout refused because the user already has a subscription. Checkout also asks
 * Stripe, so it can find one the displayed billing status does not show yet.
 */
export const isOpenSubscriptionConflictError = (error: unknown): error is ApiError => {
  return isApiError(error)
    && error.status === 409
    && (error.code === "already_subscribed" || error.code === "subscription_needs_attention");
};

/**
 * The Customer Portal refused because Stripe no longer has the billing account. The
 * API replaced it, so refetched billing status offers Upgrade instead of the portal.
 */
export const isBillingCustomerMissingError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 409 && error.code === "billing_customer_missing";
};

export type AccessFailure =
  | { kind: "auth_required"; message: string }
  | { kind: "upgrade_required"; message: string }
  | { kind: "billing_unavailable"; message: string }
  | { kind: "subscription_needs_attention"; message: string }
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

  if (isSubscriptionNeedsAttentionError(error)) {
    return {
      kind: "subscription_needs_attention",
      message: getApiErrorMessage(error, "Your Pro subscription needs attention."),
    };
  }

  return { kind: "error", message: getApiErrorMessage(error, fallbackMessage) };
};
