'use client';

import { AccountMenu } from '@/components/layout/AccountMenu';
import { BrandLink } from '@/components/layout/BrandLink';
import { PageContainer } from '@/components/layout/page-shell';
import { PublicMobileNav } from '@/components/layout/PublicMobileNav';
import { SiteNavigationMenu } from '@/components/layout/SiteNavigationMenu';
import { Link } from '@/components/navigation/Link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { buildLoginPath, buildRegisterPath } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <PageContainer width="shell" className="flex h-14 items-center gap-4">
        <div className="flex flex-1 items-center gap-2">
          <PublicMobileNav />
          <BrandLink />
        </div>

        <SiteNavigationMenu className="hidden md:flex" />

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
