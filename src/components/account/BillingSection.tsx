import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  BILLING_STATUS_QUERY_PREFIX,
  getBillingPlanLabel,
  getBillingPlanStatus,
  getBillingStatusQueryKey,
  getPersonalBillingAction,
  getSubscriptionAttentionMessage,
  PLAN_MANAGED_BY_SUPPORT_MESSAGE,
  PRO_MONTHLY_PRICE_LABEL,
} from "@/lib/billing";
import { isOpenSubscriptionConflictError } from "@/lib/api-errors";
import { fetchPersonalBillingStatus, waitForPersonalPro } from "@/lib/billing-return";
import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";
import { buildConsoleTemplateCreatePath } from "@/lib/routes";
import { readTemplateDraft } from "@/features/template-editor/templateDraftStore";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/shared/QueryListState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function BillingSection() {
  const { user } = useAuth();
  const { activeTeamId, isTeamWorkspace } = useWorkspace();
  // Both stay set until the browser leaves for Stripe, and clear when Back restores the page.
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const [isOpeningPortal, setIsOpeningPortal] = useRedirectPending();
  const [searchParams, setSearchParams] = useSearchParams();
  const billingReturn = searchParams.get("billing");
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id, activeTeamId),
    queryFn: () => api.getBillingStatus(activeTeamId ? { teamId: activeTeamId } : undefined),
    enabled: !!user,
    retry: false,
  });
  const { refetch: refetchBilling } = billing;
  const queryClient = useQueryClient();
  const userId = user?.id;
  // The plan may have changed at Stripe before the user pressed Back.
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
  // Checkout returns here, not to the editor, so point back to a template draft the
  // editor kept when the plan limit stopped it.
  const hasTemplateDraft = useMemo(
    () => Boolean(userId && readTemplateDraft({ userId, teamId: activeTeamId })),
    [userId, activeTeamId],
  );

  const plan = billing.data?.plan;
  // "unknown" (status failed to load) is not Free: offer Retry, never an upgrade.
  const planStatus = getBillingPlanStatus(billing);
  const planLabel = getBillingPlanLabel(plan) ?? (planStatus === "unknown" ? "Unavailable" : "Checking...");
  const billingEnabled = billing.data?.billingEnabled ?? true;
  const personalAction = getPersonalBillingAction(billing.data);
  const subscriptionAttention = getSubscriptionAttentionMessage(billing.data?.subscriptionStatus);
  const teamBillingMessage = plan === "team"
    ? "Paid Organization entitlements apply while this Organization is selected."
    : "Personal subscriptions are managed from Personal.";

  useEffect(() => {
    const clearBillingReturn = () => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("billing");
        return next;
      }, { replace: true });
    };

    if (billingReturn === "cancel") {
      toast.message("Upgrade canceled.");
      clearBillingReturn();
      return;
    }

    if (billingReturn !== "success" || !userId) return;

    let cancelled = false;
    toast.message("Payment received. Activating Pro…");
    // Checkout is Personal-only, so poll Personal status even if an Organization is selected.
    void waitForPersonalPro(() => fetchPersonalBillingStatus(queryClient, userId), {
      isCancelled: () => cancelled,
    }).then((result) => {
      if (result === "cancelled") return;
      if (result === "pro") toast.success("Welcome to Pro!");
      else toast.info("Your payment is processing. Pro will appear here shortly.");
      clearBillingReturn();
    });

    return () => {
      cancelled = true;
    };
  }, [billingReturn, queryClient, setSearchParams, userId]);

  const handleUpgrade = async () => {
    if (isTeamWorkspace) {
      toast.error("Switch to Personal to manage a personal subscription.");
      return;
    }

    if (!billingEnabled) {
      toast.error("Billing is temporarily unavailable. Please contact support.");
      return;
    }
    setIsStartingCheckout(true);
    try {
      const { url } = await api.createBillingCheckout();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setIsStartingCheckout(false);
      // Show the subscription checkout found, so Manage subscription replaces Upgrade.
      if (isOpenSubscriptionConflictError(err)) {
        void queryClient.invalidateQueries({ queryKey: getBillingStatusQueryKey(userId, null) });
      }
    }
  };

  const handleManage = async () => {
    if (isTeamWorkspace) {
      toast.error("Switch to Personal to manage a personal subscription.");
      return;
    }

    if (!billingEnabled) {
      toast.error("Billing is temporarily unavailable. Please contact support.");
      return;
    }
    setIsOpeningPortal(true);
    try {
      const { url } = await api.createBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
      setIsOpeningPortal(false);
    }
  };

  const manageButton = (
    <Button
      onClick={handleManage}
      variant="secondary"
      disabled={!billingEnabled || isOpeningPortal}
    >
      {isOpeningPortal ? "Opening billing..." : "Manage subscription"}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Current {isTeamWorkspace ? "Organization" : "Personal"} plan: <span className="font-medium text-foreground">{planLabel}</span>
        </div>

        {hasTemplateDraft ? (
          <div className="text-sm text-muted-foreground">
            A template you could not save is kept on this tab.{" "}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to={buildConsoleTemplateCreatePath()}
            >
              Resume template draft
            </Link>
          </div>
        ) : null}

        {billing.isError ? (
          <QueryErrorNotice
            message={planStatus === "unknown" ? "Billing status unavailable." : "Couldn't refresh billing status."}
            onRetry={() => void refetchBilling()}
          />
        ) : null}
        {!billing.isError && !billingEnabled ? (
          <div className="text-sm text-muted-foreground">Billing checkout is currently unavailable.</div>
        ) : null}

        {isTeamWorkspace ? (
          <div className="text-sm text-muted-foreground">
            {teamBillingMessage}
          </div>
        ) : planStatus === "unknown" ? null : personalAction === "support" ? (
          <>
            <div className="text-sm text-muted-foreground">{PLAN_MANAGED_BY_SUPPORT_MESSAGE}</div>
            {billing.data?.canManageBilling ? manageButton : null}
          </>
        ) : personalAction === "manage" ? (
          <>
            {subscriptionAttention ? (
              <div className="text-sm text-destructive">{subscriptionAttention}</div>
            ) : null}
            {manageButton}
          </>
        ) : (
          <Button
            onClick={handleUpgrade}
            disabled={billing.isLoading || !billingEnabled || isStartingCheckout}
          >
            {billing.isLoading
              ? "Checking plan..."
              : isStartingCheckout
                ? "Opening checkout..."
                : billingEnabled
                  ? `Upgrade to Pro — ${PRO_MONTHLY_PRICE_LABEL}`
                  : "Upgrade unavailable"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
