import type { HTMLAttributes } from 'react';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import {
  pageContainerVariants,
  pageSectionVariants,
} from '@/components/layout/page-shell.styles';

type PageContainerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof pageContainerVariants>;

// The page width (page-shell.styles.ts). Shells and page sections line up to it.
export function PageContainer({
  children,
  className,
  width,
  ...props
}: PageContainerProps) {
  const resolvedWidth = width ?? 'content';

  return (
    <div
      className={cn(pageContainerVariants({ width: resolvedWidth }), className)}
      data-page-container={resolvedWidth}
      {...props}
    >
      {children}
    </div>
  );
}

type PageSectionProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof pageSectionVariants> &
  VariantProps<typeof pageContainerVariants> & {
    as?: 'div' | 'main' | 'section';
    containerClassName?: string;
  };

// A band of the page: vertical spacing around a PageContainer.
export function PageSection({
  as: Component = 'section',
  children,
  className,
  containerClassName,
  spacing,
  width,
  ...props
}: PageSectionProps) {
  return (
    <Component className={cn(pageSectionVariants({ spacing }), className)} {...props}>
      <PageContainer className={containerClassName} width={width}>
        {children}
      </PageContainer>
    </Component>
  );
}
