import type { ReactNode } from 'react';
import { CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  IconBadge,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AuthPageShell(props: {
  title: string;
  description?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <PageSection spacing="compact" width="narrow">
      <div className="mx-auto grid w-full max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-3 text-inherit transition hover:text-foreground/80"
            >
              <IconBadge size="sm">
                <CheckCircle className="h-5 w-5" />
              </IconBadge>
              <span className="text-xl font-semibold tracking-tight">
                SERP Lists
              </span>
            </Link>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Sign in
            </p>
          </div>

          <Surface as="section" padding="none" tone="docs" className="overflow-hidden">
            <CardHeader className="space-y-2 border-b border-border/70 px-5 py-5">
              <CardTitle>{props.title}</CardTitle>
              {props.description ? (
                <CardDescription>{props.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-6 px-5 py-5">{props.children}</CardContent>
            <div className="border-t border-border/70 px-5 py-4 text-sm text-muted-foreground">
              {props.footer}
            </div>
          </Surface>
        </div>

        <Surface
          as="aside"
          tone="flat"
          padding="md"
          className="hidden lg:block"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            What happens after sign in
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
            Get into the SOP flow fast.
          </h2>
          <div className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
            {[
              'Create or edit the template structure without a marketing-heavy shell getting in the way.',
              'Start a run with the exact SOP version you want humans or AI to follow.',
              'Publish the SOP later if it deserves a public page, not before the workflow is solid.',
            ].map((point) => (
              <div key={point} className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{point}</p>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </PageSection>
  );
}
