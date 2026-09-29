import type { QueryClient } from "@tanstack/react-query";
import type { Location, NavigateFunction } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/lib/api";
import {
  BILLING_UNAVAILABLE_MESSAGE,
  getAccessFailure,
  isApiError,
  isOpenSubscriptionConflictError,
} from "@/lib/api-errors";
import { BILLING_STATUS_QUERY_PREFIX } from "@/lib/billing";

type ReturnLocation = Pick<Location, "pathname" | "search" | "hash">;

export const navigateToLoginWithReturnPath = (
  navigate: NavigateFunction,
  location: ReturnLocation
): void => {
  navigate("/login", {
    state: {
      from: {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
    },
  });
};

const openBillingPortal = async (reason: string): Promise<boolean> => {
  try {
    const { url } = await api.createBillingPortal();
    toast.message(reason);
    window.location.href = url;
    return true;
  } catch {
    toast.error(reason);
    return false;
  }
};

// Checkout asks Stripe, so it can find an open subscription, or a plan support manages,
// that the cached billing status does not show yet. The server has stored that plan by now.
const revealsStoredPlan = (error: unknown): boolean =>
  isOpenSubscriptionConflictError(error)
  || (isApiError(error) && error.code === "plan_managed_by_support");

const storedPlanListeners = new Set<() => void>();

/**
 * Reloads every cached billing status (Personal and each Organization) when a checkout
 * started here finds that the plan already changed on the server. Pages that gate a Pro
 * feature on the cached plan (Import and Export, template Copy and Export) then stop
 * asking for checkout on every click. The app registers its QueryClient once; returns
 * the function that stops it.
 */
export const refreshBillingStatusOnCheckoutConflict = (
  queryClient: Pick<QueryClient, "invalidateQueries">
): (() => void) => {
  const listener = () => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  };
  storedPlanListeners.add(listener);
  return () => {
    storedPlanListeners.delete(listener);
  };
};

const requestBillingCheckout = async (): Promise<boolean> => {
  try {
    const { url } = await api.createBillingCheckout();
    window.location.href = url;
    return true;
  } catch (error) {
    // Once per request: a second click joins this one (pendingCheckout).
    if (revealsStoredPlan(error)) {
      storedPlanListeners.forEach((listener) => listener());
    }
    const failure = getAccessFailure(error, "Failed to start checkout");
    if (failure.kind === "subscription_needs_attention") {
      // The existing subscription is fixed in the Customer Portal, not with a second one.
      return openBillingPortal(failure.message);
    }
    toast.error(failure.message);
    return false;
  }
};

// Several buttons and access failures can start checkout. A second start while one is
// pending (a double click) joins it instead of sending a second checkout request.
let pendingCheckout: Promise<boolean> | null = null;

export const startBillingCheckout = async (billingEnabled: boolean): Promise<boolean> => {
  if (!billingEnabled) {
    toast.error(BILLING_UNAVAILABLE_MESSAGE);
    return false;
  }

  if (!pendingCheckout) {
    pendingCheckout = requestBillingCheckout().finally(() => {
      pendingCheckout = null;
    });
  }
  return pendingCheckout;
};

export const ORGANIZATION_UPGRADE_MESSAGE =
  "This Organization needs a paid plan before using this feature.";

/**
 * Handles a 403 upgrade_required/limit_reached in the ownership context that
 * produced it. Organization limits come from the Organization's plan, so a Personal
 * Pro checkout can never lift them: in an Organization this only explains the limit.
 * Resolves true when a checkout redirect has started.
 */
export const handleUpgradeRequiredForContext = async (options: {
  billingEnabled: boolean;
  isTeamWorkspace: boolean;
}): Promise<boolean> => {
  if (options.isTeamWorkspace) {
    toast.error(ORGANIZATION_UPGRADE_MESSAGE);
    return false;
  }

  return startBillingCheckout(options.billingEnabled);
};

export const handleAccessFailure = async (
  error: unknown,
  options: {
    fallbackMessage: string;
    billingEnabled?: boolean;
    navigate?: NavigateFunction;
    location?: ReturnLocation;
    // The page visit that sent the request (see usePageVisit). Once the user has left
    // that page, the failure is only shown: no sign-in or checkout redirect.
    isCurrent?: () => boolean;
  }
): Promise<void> => {
  const failure = getAccessFailure(error, options.fallbackMessage);
  const stillHere = options.isCurrent?.() ?? true;

  if (failure.kind === "auth_required" && options.navigate && options.location && stillHere) {
    navigateToLoginWithReturnPath(options.navigate, options.location);
    return;
  }

  if (failure.kind === "upgrade_required" && stillHere) {
    await startBillingCheckout(options.billingEnabled ?? true);
    return;
  }

  toast.error(failure.message);
};
