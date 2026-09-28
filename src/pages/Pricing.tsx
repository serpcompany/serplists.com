import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHero, PageSection, Surface } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { api } from '@/lib/api';
import { getBillingStatusQueryKey, getPersonalBillingAction, PRO_MONTHLY_PRICE_LABEL } from '@/lib/billing';

const Pricing = () => {
  const { user } = useAuth();
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id),
    queryFn: () => api.getBillingStatus(),
    enabled: Boolean(user),
    retry: false,
  });

  const handleUpgrade = async () => {
    setIsStartingCheckout(true);
    try {
      const { url } = await api.createBillingCheckout();
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout');
      setIsStartingCheckout(false);
    }
  };

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          align="center"
          eyebrow="Pricing"
          description="Start with the free plan and upgrade when you need advanced template management."
          title="Simple pricing for checklist workflows."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <div className="grid gap-6 md:grid-cols-2">
          <Surface as="article" tone="docs">
            <CardHeader className="space-y-2">
              <CardTitle>Free</CardTitle>
              <CardDescription>
                Core checklist building and runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Create templates with sections and items
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Run checklists and track progress
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Browse public checklists
                </li>
              </ul>
              <div className="mt-6">
                <Button asChild variant="outline">
                  <Link to="/register">Start Free</Link>
                </Button>
              </div>
            </CardContent>
          </Surface>

          <Surface as="article" tone="glass">
            <CardHeader className="space-y-2">
              <CardTitle>Pro</CardTitle>
              <CardDescription>
                {PRO_MONTHLY_PRICE_LABEL}. Cancel anytime.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Import and export template backups
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Save public templates to your account
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  Manage billing from account settings
                </li>
              </ul>
              <div className="mt-6">
                {!user ? (
                  <Button asChild>
                    <Link to="/register">Get Started</Link>
                  </Button>
                ) : getPersonalBillingAction(billing.data) === 'manage' ? (
                  <Button asChild>
                    <Link to="/account">{billing.data?.plan === 'pro' ? 'Manage Pro' : 'Manage subscription'}</Link>
                  </Button>
                ) : (
                  <Button
                    onClick={handleUpgrade}
                    disabled={billing.isLoading || billing.data?.billingEnabled === false || isStartingCheckout}
                  >
                    {billing.isLoading
                      ? 'Checking plan...'
                      : isStartingCheckout
                        ? 'Opening checkout...'
                        : billing.data?.billingEnabled === false
                          ? 'Upgrade unavailable'
                          : `Upgrade — ${PRO_MONTHLY_PRICE_LABEL}`}
                  </Button>
                )}
              </div>
            </CardContent>
          </Surface>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Payments and subscription management are securely handled by Stripe.
        </p>
      </PageSection>
    </>
  );
};

export default Pricing;
