import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { getBillingPlanLabel, getBillingStatusQueryKey } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function BillingSection() {
  const { user } = useAuth();
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id),
    queryFn: () => api.getBillingStatus(),
    enabled: !!user,
    retry: false,
  });

  const plan = billing.data?.plan;
  const planLabel = getBillingPlanLabel(plan);
  const billingEnabled = billing.data?.billingEnabled ?? true;

  const handleUpgrade = async () => {
    if (!billingEnabled) {
      toast.error("Billing is temporarily unavailable. Please contact support.");
      return;
    }
    try {
      const { url } = await api.createBillingCheckout();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    }
  };

  const handleManage = async () => {
    try {
      const { url } = await api.createBillingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Current plan: <span className="font-medium text-foreground">{planLabel ?? "Checking..."}</span>
        </div>

        {billing.isError ? (
          <div className="text-sm text-muted-foreground">Billing status unavailable.</div>
        ) : null}
        {!billing.isError && !billingEnabled ? (
          <div className="text-sm text-muted-foreground">Billing checkout is currently unavailable.</div>
        ) : null}

        {plan === "pro" ? (
          <Button onClick={handleManage} variant="secondary" disabled={!billingEnabled}>
            Manage subscription
          </Button>
        ) : (
          <Button onClick={handleUpgrade} disabled={billing.isLoading || !billingEnabled}>
            {billing.isLoading ? "Checking plan..." : billingEnabled ? "Upgrade to Pro" : "Upgrade unavailable"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
