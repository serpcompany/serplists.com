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
  readonly code: string | undefined;
  readonly details?: unknown;

  constructor(params: { status: number; message: string; code?: string | undefined; details?: unknown }) {
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

export const isNotFoundError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 404;
};

export const isAuthRequiredError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 401;
};

export type LimitContext = "personal" | "organization";

const limitReachedDetailsSchema = z.object({
  context: z.enum(["personal", "organization"]),
});

export const getLimitContext = (error: ApiError): LimitContext | null => {
  const parsed = limitReachedDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.context : null;
};

const isPersonalLimitReached = (error: ApiError): boolean =>
  error.code === "limit_reached" && getLimitContext(error) !== "organization";

export const isUpgradeRequiredError = (error: unknown): error is ApiError => {
  if (!isApiError(error) || error.status !== 403) {
    return false;
  }

  return error.code === "upgrade_required" || isPersonalLimitReached(error);
};

export const isEditConflictError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 409 && error.code === "edit_conflict";
};

export const isBillingUnavailableError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.code === "billing_unavailable";
};

export const isSubscriptionNeedsAttentionError = (error: unknown): error is ApiError => {
  return isApiError(error) && error.status === 409 && error.code === "subscription_needs_attention";
};

export const isOpenSubscriptionConflictError = (error: unknown): error is ApiError => {
  return isApiError(error)
    && error.status === 409
    && (error.code === "already_subscribed" || error.code === "subscription_needs_attention");
};

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
