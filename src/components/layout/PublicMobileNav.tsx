'use client';

import { useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { publicHeaderItems, type PublicSiteLink } from '@/components/layout/publicSiteLinks';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { APP_BRAND_NAME } from '@/lib/brand';
import { buildConsoleHomePath, buildLoginPath, buildRegisterPath, isPathWithin } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { Link } from '@/components/navigation/Link';

type MenuLinkProps = { link: PublicSiteLink; onNavigate: () => void; pathname: string };

function MobileMenuLink({ link, onNavigate, pathname }: MenuLinkProps) {
  const active = isPathWithin(pathname, link.href);
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(buttonVariants({ variant: active ? 'secondary' : 'ghost' }), 'justify-start')}
    >
      {link.label}
    </Link>
  );
}

// A header menu's links under its label, as a named group.
function MobileMenuGroup({
  label,
  links,
  ...linkProps
}: { label: string; links: readonly PublicSiteLink[] } & Omit<MenuLinkProps, 'link'>) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1">
      <p id={labelId} className="px-2.5 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      {links.map((link) => (
        <MobileMenuLink key={link.href} link={link} {...linkProps} />
      ))}
    </div>
  );
}

// The menu body: the desktop header's navigation, its menus as groups (so a new header link
// shows up on phones too), the theme switch, and the account actions.
export const PublicMobileMenu = ({
  onNavigate,
  pathname,
  signedIn,
}: {
  onNavigate: () => void;
  pathname: string;
  signedIn: boolean;
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
    <nav aria-label="Site" className="flex flex-col gap-4">
      {publicHeaderItems.map((item) =>
        item.kind === 'menu' ? (
          <MobileMenuGroup
            key={item.label}
            label={item.label}
            links={item.links}
            onNavigate={onNavigate}
            pathname={pathname}
          />
        ) : (
          <MobileMenuLink key={item.link.href} link={item.link} onNavigate={onNavigate} pathname={pathname} />
        ),
      )}
    </nav>

    <Separator />
    <ThemeToggle showLabel />

    <div className="flex flex-col gap-2">
      {signedIn ? (
        <Link href={buildConsoleHomePath()} onClick={onNavigate} className={buttonVariants()}>
          Dashboard
        </Link>
      ) : (
        <>
          <Link
            href={buildLoginPath()}
            onClick={onNavigate}
            className={buttonVariants({ variant: 'outline' })}
          >
            Log in
          </Link>
          <Link href={buildRegisterPath()} onClick={onNavigate} className={buttonVariants()}>
            Get started
          </Link>
        </>
      )}
    </div>
  </div>
);

// Below md the public header hides its nav and Log in, so this is how phone visitors
// reach them. The console shell has its own sidebar sheet and never renders this.
export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  // Close on any navigation, including browser back and forward.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            className="-ml-2 md:hidden"
            data-public-mobile-nav="trigger"
            size="icon"
            variant="ghost"
          />
        }
      >
        <Menu />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>{APP_BRAND_NAME}</SheetTitle>
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
