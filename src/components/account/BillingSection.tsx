import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function BillingSection() {
  const billing = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api.getBillingStatus(),
    retry: false,
  });

  const plan = billing.data?.plan ?? "free";

  const handleUpgrade = async () => {
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
          Current plan: <span className="font-medium text-foreground">{plan === "pro" ? "Pro" : "Free"}</span>
        </div>

        {billing.isError ? (
          <div className="text-sm text-muted-foreground">Billing status unavailable.</div>
        ) : null}

        {plan === "pro" ? (
          <Button onClick={handleManage} variant="secondary">
            Manage subscription
          </Button>
        ) : (
          <Button onClick={handleUpgrade}>Upgrade to Pro</Button>
        )}
      </CardContent>
    </Card>
  );
}

