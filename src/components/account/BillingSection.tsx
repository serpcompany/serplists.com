import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getBillingPlanLabel, getBillingStatusQueryKey } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function BillingSection() {
  const { user } = useAuth();
  const { activeTeamId, isTeamWorkspace } = useWorkspace();
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id, activeTeamId),
    queryFn: () => api.getBillingStatus(activeTeamId ? { teamId: activeTeamId } : undefined),
    enabled: !!user,
    retry: false,
  });

  const plan = billing.data?.plan;
  const planLabel = getBillingPlanLabel(plan);
  const billingEnabled = billing.data?.billingEnabled ?? true;
  const teamBillingMessage = plan === "team"
    ? "Team entitlements apply while this workspace is selected."
    : "Personal subscriptions are managed from your Personal workspace.";

  const handleUpgrade = async () => {
    if (isTeamWorkspace) {
      toast.error("Switch to your Personal workspace to manage a personal subscription.");
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
    }
  };

  const handleManage = async () => {
    if (isTeamWorkspace) {
      toast.error("Switch to your Personal workspace to manage a personal subscription.");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Current {isTeamWorkspace ? "workspace" : "personal"} plan: <span className="font-medium text-foreground">{planLabel ?? "Checking..."}</span>
        </div>

        {billing.isError ? (
          <div className="text-sm text-muted-foreground">Billing status unavailable.</div>
        ) : null}
        {!billing.isError && !billingEnabled ? (
          <div className="text-sm text-muted-foreground">Billing checkout is currently unavailable.</div>
        ) : null}

        {isTeamWorkspace ? (
          <div className="text-sm text-muted-foreground">
            {teamBillingMessage}
          </div>
        ) : plan === "pro" ? (
          <Button
            onClick={handleManage}
            variant="secondary"
            disabled={!billingEnabled || isOpeningPortal}
          >
            {isOpeningPortal ? "Opening billing..." : "Manage subscription"}
          </Button>
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
                  ? "Upgrade to Pro"
                  : "Upgrade unavailable"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
