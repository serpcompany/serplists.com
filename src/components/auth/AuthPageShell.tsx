import type { JSX } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

import {
  IconBadge,
  PageSection,
} from '@/components/layout/page-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { APP_BRAND_NAME } from '@/lib/brand';

export function AuthPageShell(props: {
  title: string;
  description?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <PageSection
      as="section"
      className="flex min-h-[calc(100vh-3.5rem)] items-center"
      containerClassName="flex justify-center"
      spacing="compact"
      width="shell"
    >
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[calc(var(--layout-card-radius)+0.5rem)] border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.8fr)]">
        <Card className="rounded-none border-0 shadow-none">
          <CardHeader className="items-center space-y-3 px-6 py-8 text-center sm:px-8">
            <IconBadge size="md">
              <CheckCircle2 className="h-6 w-6" />
            </IconBadge>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {APP_BRAND_NAME}
              </p>
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
                {props.title}
              </h1>
              {props.description ? (
                <CardDescription className="mx-auto max-w-sm text-base leading-6">
                  {props.description}
                </CardDescription>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="mx-auto w-full max-w-md space-y-6 px-6 pb-8 sm:px-8">
            {props.children}
          </CardContent>
          <CardFooter className="block border-t border-border/70 px-6 py-5 text-center text-sm text-muted-foreground">
            {props.footer}
          </CardFooter>
        </Card>

        <aside className="hidden border-l border-border bg-muted/35 p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Built for repeatable work
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              Create the template once. Run it cleanly every time.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Use SERP Lists to turn checklists into reusable templates,
              focused runs, and shareable proof without rebuilding the same
              process in docs.
            </p>
          </div>

          <div className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
            {[
              'Reusable templates for SOPs, audits, launches, and operations.',
              'Focused run views with progress saved separately from the source template.',
              'Clean sharing when someone needs visibility without dashboard access.',
            ].map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{point}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </PageSection>
  );
}
