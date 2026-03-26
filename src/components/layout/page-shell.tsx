import type { HTMLAttributes, ReactNode } from 'react';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import {
  iconBadgeVariants,
  pageContainerVariants,
  pageDescriptionClassName,
  pageEyebrowClassName,
  pageHeroVariants,
  pageSectionVariants,
  pageTitleClassName,
  surfaceVariants,
} from '@/components/layout/page-shell.styles';

type PageContainerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof pageContainerVariants>;

export function PageContainer({
  children,
  className,
  width,
  ...props
}: PageContainerProps) {
  return (
    <div className={cn(pageContainerVariants({ width }), className)} {...props}>
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

type PageHeroProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof pageHeroVariants> & {
    actions?: ReactNode;
    description?: ReactNode;
    eyebrow?: ReactNode;
    title: ReactNode;
  };

export function PageHero({
  actions,
  align,
  className,
  description,
  eyebrow,
  title,
  ...props
}: PageHeroProps) {
  const centered = align === 'center';

  return (
    <div className={cn(pageHeroVariants({ align }), className)} {...props}>
      {eyebrow ? (
        <p className={pageEyebrowClassName}>{eyebrow}</p>
      ) : null}
      <h1
        className={cn(
          pageTitleClassName,
          centered && 'mx-auto max-w-3xl',
        )}
      >
        {title}
      </h1>
      {description ? (
        <p
          className={cn(
            pageDescriptionClassName,
            centered && 'mx-auto max-w-2xl',
          )}
        >
          {description}
        </p>
      ) : null}
      {actions ? (
        <div
          className={cn(
            'flex flex-wrap gap-3',
            centered && 'justify-center',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

type SurfaceProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof surfaceVariants> & {
    as?: 'article' | 'aside' | 'div' | 'section';
  };

export function Surface({
  as: Component = 'div',
  children,
  className,
  padding,
  tone,
  ...props
}: SurfaceProps) {
  return (
    <Component className={cn(surfaceVariants({ padding, tone }), className)} {...props}>
      {children}
    </Component>
  );
}

type IconBadgeProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof iconBadgeVariants>;

export function IconBadge({
  children,
  className,
  size,
  ...props
}: IconBadgeProps) {
  return (
    <div className={cn(iconBadgeVariants({ size }), className)} {...props}>
      {children}
    </div>
  );
}
