import type { Location, NavigateFunction } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { BILLING_UNAVAILABLE_MESSAGE, getAccessFailure } from "@/lib/api-errors";

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

export const startBillingCheckout = async (billingEnabled: boolean): Promise<boolean> => {
  if (!billingEnabled) {
    toast.error(BILLING_UNAVAILABLE_MESSAGE);
    return false;
  }

  try {
    const { url } = await api.createBillingCheckout();
    window.location.href = url;
    return true;
  } catch (error) {
    const failure = getAccessFailure(error, "Failed to start checkout");
    toast.error(failure.message);
    return false;
  }
};

export const ORGANIZATION_UPGRADE_MESSAGE =
  "This Organization needs a paid plan before using this feature.";

/**
 * Handles a 403 upgrade_required/limit_reached for the active context. An
 * Organization's limits come from Organization entitlements, which a Personal Pro
 * checkout cannot lift, so an Organization gets a message instead of checkout.
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
  }
): Promise<void> => {
  const failure = getAccessFailure(error, options.fallbackMessage);

  if (failure.kind === "auth_required" && options.navigate && options.location) {
    navigateToLoginWithReturnPath(options.navigate, options.location);
    return;
  }

  if (failure.kind === "upgrade_required") {
    await startBillingCheckout(options.billingEnabled ?? true);
    return;
  }

  toast.error(failure.message);
};
