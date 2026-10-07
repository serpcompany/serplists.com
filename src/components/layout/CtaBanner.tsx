import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type CtaBannerProps = {
  actions: ReactNode;
  className?: string;
  description?: ReactNode;
  titleAs?: 'h2' | 'h3';
  title: ReactNode;
};

export function CtaBanner({ actions, className, description, title, titleAs: Title = 'h2' }: CtaBannerProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-xl bg-muted p-6 ring-1 ring-foreground/10 sm:p-8 md:flex-row md:items-center md:justify-between',
        className,
      )}
      data-slot="cta-banner"
    >
      <div className="flex max-w-2xl flex-col gap-2">
        <Title className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</Title>
        {description ? <p className="text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </div>
  );
}
