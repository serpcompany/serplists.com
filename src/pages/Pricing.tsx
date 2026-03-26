import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHero, PageSection, Surface } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';

const Pricing = () => {
  const { user } = useAuth();
  const primaryCta = user
    ? { label: 'Manage Plan', href: '/account' }
    : { label: 'Get Started', href: '/register' };

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
                Advanced template portability and account tools.
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
                <Button asChild>
                  <Link to={primaryCta.href}>{primaryCta.label}</Link>
                </Button>
              </div>
            </CardContent>
          </Surface>
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Billing details and current pricing are shown during checkout.
        </p>
      </PageSection>
    </>
  );
};

export default Pricing;
