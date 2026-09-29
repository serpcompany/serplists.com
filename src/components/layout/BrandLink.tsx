import { LayoutGrid } from 'lucide-react';

import { Link } from '@/components/navigation/Link';
import { APP_BRAND_NAME } from '@/lib/brand';
import { buildHomePath } from '@/lib/routes';
import { cn } from '@/lib/utils';

// The app's mark: its icon on the primary color.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
    >
      <LayoutGrid className="size-4" />
    </span>
  );
}

// The mark and the name, linking home: the site header and footer.
export function BrandLink({ className }: { className?: string }) {
  return (
    <Link
      href={buildHomePath()}
      className={cn('flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground', className)}
    >
      <BrandMark />
      <span>{APP_BRAND_NAME}</span>
    </Link>
  );
}
