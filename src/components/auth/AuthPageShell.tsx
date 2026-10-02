import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { AuthCard } from '@/components/auth/AuthCard';
import { APP_BRAND_NAME } from '@/lib/brand';

const POINTS = [
  'Reusable templates for SOPs, audits, launches, and operations.',
  'Focused run views with progress saved separately from the source template.',
  'Clean sharing when someone needs visibility without dashboard access.',
];

function AuthAside() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-muted-foreground">Built for repeatable work</p>
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          Create the template once. Run it cleanly every time.
        </h2>
        <p className="text-sm text-muted-foreground">
          Use SERP Lists to turn checklists into reusable templates, focused runs, and shareable
          proof without rebuilding the same process in docs.
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
        {POINTS.map((point) => (
          <li key={point} className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthPageShell(props: {
  title: string;
  description?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <AuthCard
      aside={<AuthAside />}
      description={props.description}
      eyebrow={APP_BRAND_NAME}
      footer={props.footer}
      icon={<CheckCircle2 />}
      title={props.title}
    >
      {props.children}
    </AuthCard>
  );
}
