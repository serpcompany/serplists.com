'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

import { PageSection, Surface } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { QueryErrorNotice } from '@/components/shared/QueryListState';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { usePageRestoredFromCache, useRedirectPending } from '@/hooks/useRedirectPending';
import {
  createPersonalCheckoutUrl,
  fetchPersonalBillingStatus,
} from '@/features/billing/pricingBilling';
import { isApiError, isOpenSubscriptionConflictError } from '@/lib/api-errors';
import {
  BILLING_STATUS_QUERY_PREFIX,
  getBillingPlanStatus,
  getBillingStatusQueryKey,
  getPersonalBillingAction,
  PLAN_MANAGED_BY_SUPPORT_MESSAGE,
  PLAN_UNKNOWN_MESSAGE,
  PRO_MONTHLY_PRICE_LABEL,
  shouldRetryBillingStatus,
} from '@/lib/billing';
import { buildConsoleSettingsPath, buildRegisterPath } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

const Pricing = () => {
  const { user } = useAuth();
  // Stays set until the browser leaves for Stripe, and clears when Back restores the page.
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id),
    queryFn: fetchPersonalBillingStatus,
    enabled: Boolean(user),
    retry: shouldRetryBillingStatus,
  });
  const queryClient = useQueryClient();
  // The plan may have changed at Stripe before the user pressed Back.
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
  // A failed status is unknown, not Free: offer a retry, never the upgrade.
  const planStatus = getBillingPlanStatus(billing);
  const isCheckingPlan = planStatus === 'loading';
  const personalAction = getPersonalBillingAction(billing.data);

  const handleUpgrade = async () => {
    setIsStartingCheckout(true);
    try {
      window.location.href = await createPersonalCheckoutUrl();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout');
      setIsStartingCheckout(false);
      // Checkout found an open subscription or a support override: reload the plan so
      // Manage or the support message replaces Upgrade.
      if (
        isOpenSubscriptionConflictError(error)
        || (isApiError(error) && error.code === 'plan_managed_by_support')
      ) {
        void queryClient.invalidateQueries({ queryKey: getBillingStatusQueryKey(user?.id) });
      }
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
                <Link
                  href={buildRegisterPath()}
                  className={buttonVariants({ variant: 'outline' })}
                >Start Free</Link>
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
                  <Link href={buildRegisterPath()} className={buttonVariants()}>Get Started</Link>
                ) : planStatus === 'unknown' ? (
                  <QueryErrorNotice
                    message={PLAN_UNKNOWN_MESSAGE}
                    onRetry={() => void billing.refetch()}
                  />
                ) : personalAction === 'support' ? (
                  <p className="text-sm text-muted-foreground">{PLAN_MANAGED_BY_SUPPORT_MESSAGE}</p>
                ) : personalAction === 'manage' ? (
                  <Link
                    href={buildConsoleSettingsPath()}
                    className={buttonVariants()}
                  >{billing.data?.plan === 'pro' ? 'Manage Pro' : 'Manage subscription'}</Link>
                ) : (
                  <Button
                    onClick={handleUpgrade}
                    disabled={isCheckingPlan || billing.data?.billingEnabled === false || isStartingCheckout}
                  >
                    {isCheckingPlan
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
