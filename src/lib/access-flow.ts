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

const requestBillingCheckout = async (): Promise<boolean> => {
  try {
    const { url } = await api.createBillingCheckout();
    window.location.href = url;
    return true;
  } catch (error) {
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
