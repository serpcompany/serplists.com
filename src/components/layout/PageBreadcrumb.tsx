import { Fragment, type ReactNode } from 'react';
import { House } from 'lucide-react';

import { Link } from '@/components/navigation/Link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { buildHomePath } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type BreadcrumbTrailItem = { href?: string; label: ReactNode };

type PageBreadcrumbProps = {
  className?: string;
  home?: boolean;
  items: BreadcrumbTrailItem[];
};

export function PageBreadcrumb({ className, home = true, items }: PageBreadcrumbProps) {
  return (
    <Breadcrumb className={cn('mb-8', className)}>
      <BreadcrumbList>
        {home ? (
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={buildHomePath()} />}>
              <House className="size-4" aria-hidden="true" />
              <span className="sr-only">Home</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
        ) : null}
        {items.map((item, index) => (
          <Fragment key={index}>
            {home || index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {item.href ? (
                <BreadcrumbLink render={<Link href={item.href} />}>{item.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="line-clamp-1">{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
