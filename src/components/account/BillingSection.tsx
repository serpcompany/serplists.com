import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
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
import { isBillingCustomerMissingError, isOpenSubscriptionConflictError } from "@/lib/api-errors";
import { fetchPersonalBillingStatus, waitForPersonalPro } from "@/lib/billing-return";
import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";
import { replaceCurrentUrl } from "@/lib/navigation/replaceCurrentUrl";
import { buildConsoleTemplateCreatePath } from "@/lib/routes";
import { readTemplateDraft } from "@/features/template-editor/templateDraftStore";
import { createBillingPortalUrl, fetchBillingStatus } from "@/features/billing/billingSettings";
import { createPersonalCheckoutUrl } from "@/features/billing/pricingBilling";
import { Button } from "@/components/ui/button";
import { QueryErrorNotice } from "@/components/shared/QueryListState";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

import { Link } from '@/components/navigation/Link';

export function BillingSection() {
  const { user } = useAuth();
  const { activeTeamId, activeWorkspace, consoleContext, isTeamWorkspace } = useWorkspace();
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const [isOpeningPortal, setIsOpeningPortal] = useRedirectPending();
  const billingReturn = useSearchParams().get("billing");
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id, activeTeamId),
    queryFn: () => fetchBillingStatus(activeTeamId),
    enabled: !!user,
    retry: false,
  });
  const { refetch: refetchBilling } = billing;
  const queryClient = useQueryClient();
  const userId = user?.id;
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
  const hasTemplateDraft = useMemo(
    () => Boolean(userId && readTemplateDraft({ userId, teamId: activeTeamId })),
    [userId, activeTeamId],
  );

  const plan = billing.data?.plan;
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
      const next = new URLSearchParams(window.location.search);
      next.delete("billing");
      const search = next.toString();
      replaceCurrentUrl(`${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
    };

    if (billingReturn === "cancel") {
      toast.message("Upgrade canceled.");
      clearBillingReturn();
      return;
    }

    if (billingReturn !== "success" || !userId) return;

    let cancelled = false;
    toast.message("Payment received. Activating Pro…");
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
  }, [billingReturn, queryClient, userId]);

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
      window.location.href = await createPersonalCheckoutUrl();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setIsStartingCheckout(false);
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
      window.location.href = await createBillingPortalUrl();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
      setIsOpeningPortal(false);
      if (isBillingCustomerMissingError(err)) {
        void queryClient.invalidateQueries({ queryKey: getBillingStatusQueryKey(userId, null) });
      }
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

  let planNote: string | null = null;
  let planAction: ReactNode = null;
  if (isTeamWorkspace) {
    planNote = teamBillingMessage;
  } else if (planStatus !== "unknown") {
    if (personalAction === "support") {
      planNote = PLAN_MANAGED_BY_SUPPORT_MESSAGE;
      planAction = billing.data?.canManageBilling ? manageButton : null;
    } else if (personalAction === "manage") {
      planAction = manageButton;
    } else {
      planAction = (
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
      );
    }
  }
  const attention = !isTeamWorkspace && planStatus !== "unknown" && personalAction === "manage"
    ? subscriptionAttention
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="wrap-anywhere">
          {activeWorkspace.type === "team" ? `${activeWorkspace.name} billing` : "Personal billing"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Current plan: <span className="font-medium text-foreground">{planLabel}</span>
        </p>

        {hasTemplateDraft ? (
          <p>
            A template you could not save is kept on this tab.{" "}
            <Link
              className="font-medium text-primary underline underline-offset-4"
              href={buildConsoleTemplateCreatePath(consoleContext)}
            >
              Resume template draft
            </Link>
          </p>
        ) : null}

        {billing.isError ? (
          <QueryErrorNotice
            message={planStatus === "unknown" ? "Billing status unavailable." : "Couldn't refresh billing status."}
            onRetry={() => void refetchBilling()}
          />
        ) : null}
        {!billing.isError && !billingEnabled ? (
          <p>Billing checkout is currently unavailable.</p>
        ) : null}

        {planNote ? <p>{planNote}</p> : null}
        {attention ? <p className="text-destructive">{attention}</p> : null}
      </CardContent>
      {planAction ? <CardFooter>{planAction}</CardFooter> : null}
    </Card>
  );
}
