'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { publicHeaderLinks } from '@/components/layout/publicSiteLinks';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { APP_BRAND_NAME } from '@/lib/brand';
import { buildConsoleHomePath } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { Link } from '@/components/navigation/Link';

const isActiveLink = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

// The menu body: the same header links as the desktop nav (so a new header link shows up
// on phones too), the theme switch, and the account actions.
export const PublicMobileMenu = ({
  onNavigate,
  pathname,
  signedIn,
}: {
  onNavigate: () => void;
  pathname: string;
  signedIn: boolean;
}) => (
  <div className="flex flex-col gap-4 p-4">
    <nav aria-label="Site" className="flex flex-col gap-1">
      {publicHeaderLinks.map((item) => {
        const active = isActiveLink(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>

    <div className="border-t border-border pt-4">
      <ThemeToggle showLabel />
    </div>

    <div className="flex flex-col gap-2">
      {signedIn ? (
        <Button asChild onClick={onNavigate}>
          <Link href={buildConsoleHomePath()}>Dashboard</Link>
        </Button>
      ) : (
        <>
          <Button asChild onClick={onNavigate} variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild onClick={onNavigate}>
            <Link href="/register">Get started</Link>
          </Button>
        </>
      )}
    </div>
  </div>
);

// Below md the public header hides its nav and Log in, so this is how phone visitors
// reach them. The console shell has its own MobileNav and never renders this.
export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  // Close on any navigation, including browser back and forward.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          className="md:hidden"
          data-public-mobile-nav="trigger"
          size="icon"
          variant="ghost"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-left">{APP_BRAND_NAME}</SheetTitle>
        </SheetHeader>
        <PublicMobileMenu
          onNavigate={() => setOpen(false)}
          pathname={pathname}
          signedIn={Boolean(user)}
        />
      </SheetContent>
    </Sheet>
  );
}
