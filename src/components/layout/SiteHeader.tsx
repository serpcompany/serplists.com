'use client';

import { usePathname } from 'next/navigation';

import { AccountMenu } from '@/components/layout/AccountMenu';
import { BrandLink } from '@/components/layout/BrandLink';
import { PageContainer } from '@/components/layout/page-shell';
import { PublicMobileNav } from '@/components/layout/PublicMobileNav';
import { publicHeaderLinks } from '@/components/layout/publicSiteLinks';
import { Link } from '@/components/navigation/Link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { buildLoginPath, buildRegisterPath, isPathWithin } from '@/lib/routes';
import { cn } from '@/lib/utils';

// The public site's header: the brand on the left, the site links in a navigation menu in
// the middle, and the theme switch with the account actions on the right. Below md the
// links, Log in and the theme switch move into the menu sheet (PublicMobileNav), whose
// button sits before the brand.
export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <PageContainer width="shell" className="flex h-14 items-center gap-4">
        <div className="flex flex-1 items-center gap-2">
          <PublicMobileNav />
          <BrandLink />
        </div>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {publicHeaderLinks.map((item) => {
              const active = isPathWithin(pathname, item.href);
              return (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    active={active}
                    aria-current={active ? 'page' : undefined}
                    className={navigationMenuTriggerStyle()}
                    render={<Link href={item.href} />}
                  >
                    {item.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex flex-1 items-center justify-end gap-2">
          <ThemeToggle className="hidden md:inline-flex" />
          {user ? (
            <AccountMenu />
          ) : (
            <>
              <Link
                href={buildLoginPath()}
                className={cn(buttonVariants({ variant: 'ghost' }), 'hidden md:inline-flex')}
              >
                Log in
              </Link>
              <Link href={buildRegisterPath()} className={buttonVariants()}>
                Get started
              </Link>
            </>
          )}
        </div>
      </PageContainer>
    </header>
  );
}
