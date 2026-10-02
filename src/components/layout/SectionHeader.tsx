import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/components/navigation/Link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  action?: { href: string; label: string };
  as?: 'h2' | 'h3';
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  id?: string;
  title: ReactNode;
};

export function SectionHeader({
  action,
  as: Heading = 'h2',
  className,
  description,
  eyebrow,
  id,
  title,
}: SectionHeaderProps) {
  return (
    <div
      className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}
      data-slot="section-header"
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p> : null}
        <Heading className="text-xl font-semibold tracking-tight text-balance sm:text-2xl" id={id}>
          {title}
        </Heading>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-mr-2 text-muted-foreground')}
        >
          {action.label}
          <ArrowRight data-icon="inline-end" />
        </Link>
      ) : null}
    </div>
  );
}
