import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import {
  BILLING_UNAVAILABLE_MESSAGE,
  getAccessFailure,
  isApiError,
  isOpenSubscriptionConflictError,
} from "@/lib/api-errors";
import { withReturnPath } from "@/lib/auth/returnPath";
import { BILLING_STATUS_QUERY_PREFIX } from "@/lib/billing";
import { currentLocationPath } from "@/lib/navigation/replaceCurrentUrl";
import { buildLoginPath } from "@/lib/routes";

export type NavigateTo = (href: string) => unknown;

export const navigateToLoginWithReturnPath = (navigate: NavigateTo): void => {
  navigate(withReturnPath(buildLoginPath(), currentLocationPath()));
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

const revealsPlanNewerThanCache = (error: unknown): boolean =>
  isOpenSubscriptionConflictError(error)
  || (isApiError(error) && error.code === "plan_managed_by_support");

const storedPlanListeners = new Set<() => void>();

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
    if (revealsPlanNewerThanCache(error)) {
      storedPlanListeners.forEach((listener) => listener());
    }
    const failure = getAccessFailure(error, "Failed to start checkout");
    if (failure.kind === "subscription_needs_attention") {
      return openBillingPortal(failure.message);
    }
    toast.error(failure.message);
    return false;
  }
};

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
    navigate?: NavigateTo;
    isCurrent?: () => boolean;
  }
): Promise<void> => {
  const failure = getAccessFailure(error, options.fallbackMessage);
  const stillHere = options.isCurrent?.() ?? true;

  if (failure.kind === "auth_required" && options.navigate && stillHere) {
    navigateToLoginWithReturnPath(options.navigate);
    return;
  }

  if (failure.kind === "upgrade_required" && stillHere) {
    await startBillingCheckout(options.billingEnabled ?? true);
    return;
  }

  toast.error(failure.message);
};
