'use client';

import { useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

import { CardGrid } from '@/components/layout/CardGrid';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { QueryErrorNotice } from '@/components/shared/QueryListState';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

const FREE_FEATURES = [
  'Create templates with sections and items',
  'Run checklists and track progress',
  'Browse public checklists',
];
const PRO_FEATURES = [
  'Import and export template backups',
  'Save public templates to your account',
  'Manage billing from account settings',
];

type PlanCardProps = {
  action: ReactNode;
  description: ReactNode;
  features: string[];
  title: string;
};

function PlanCard({ action, description, features, title }: PlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>{action}</CardFooter>
    </Card>
  );
}

const Pricing = () => {
  const { user } = useAuth();
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id),
    queryFn: fetchPersonalBillingStatus,
    enabled: Boolean(user),
    retry: shouldRetryBillingStatus,
  });
  const queryClient = useQueryClient();
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
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

      <PageSection className="pt-0" spacing="spacious" width="narrow">
        <CardGrid columns={2}>
          <PlanCard
            action={
              <Link href={buildRegisterPath()} className={buttonVariants({ variant: 'outline' })}>
                Start Free
              </Link>
            }
            description="Core checklist building and runs."
            features={FREE_FEATURES}
            title="Free"
          />

          <PlanCard
            action={
              !user ? (
                <Link href={buildRegisterPath()} className={buttonVariants()}>Get Started</Link>
              ) : planStatus === 'unknown' ? (
                <QueryErrorNotice
                  message={PLAN_UNKNOWN_MESSAGE}
                  onRetry={() => void billing.refetch()}
                />
              ) : personalAction === 'support' ? (
                <p className="text-sm text-muted-foreground">{PLAN_MANAGED_BY_SUPPORT_MESSAGE}</p>
              ) : personalAction === 'manage' ? (
                <Link href={buildConsoleSettingsPath()} className={buttonVariants()}>
                  {billing.data?.plan === 'pro' ? 'Manage Pro' : 'Manage subscription'}
                </Link>
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
              )
            }
            description={`${PRO_MONTHLY_PRICE_LABEL}. Cancel anytime.`}
            features={PRO_FEATURES}
            title="Pro"
          />
        </CardGrid>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Payments and subscription management are securely handled by Stripe.
        </p>
      </PageSection>
    </>
  );
};

export default Pricing;
