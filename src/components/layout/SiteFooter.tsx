import { BrandLink } from '@/components/layout/BrandLink';
import { PageContainer } from '@/components/layout/page-shell';
import { publicFooterGroups, publicSocialLinks } from '@/components/layout/publicSiteLinks';
import { SOCIAL_NETWORK_ICON_PATHS } from '@/components/layout/socialNetworkIcons';
import { Link } from '@/components/navigation/Link';
import { buttonVariants } from '@/components/ui/button-variants';
import { APP_BRAND_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';

const footerLinkClassName = 'text-sm text-muted-foreground transition-colors hover:text-foreground';

const socialLinkClassName = cn(
  buttonVariants({ variant: 'ghost', size: 'icon-lg' }),
  'text-muted-foreground hover:text-foreground',
);

function SocialLinks() {
  return (
    <ul aria-label={`${APP_BRAND_NAME} on social media`} className="-ml-2 flex flex-wrap gap-1">
      {publicSocialLinks.map((link) => (
        <li key={link.network}>
          <a
            aria-label={`${APP_BRAND_NAME} on ${link.label}`}
            className={socialLinkClassName}
            href={link.href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <svg aria-hidden="true" className="size-5" fill="currentColor" focusable="false" viewBox="0 0 24 24">
              <path d={SOCIAL_NETWORK_ICON_PATHS[link.network]} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t bg-background', className)}>
      <PageContainer
        width="shell"
        className="flex flex-col gap-10 py-12 md:flex-row md:justify-between"
      >
        <div className="flex max-w-sm flex-col gap-4">
          <BrandLink />
          <p className="text-sm text-muted-foreground">
            Build repeatable checklists, publish them cleanly, and run them like operations.
          </p>
          <SocialLinks />
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {publicFooterGroups.map((column) => (
            <div key={column.title} className="flex flex-col gap-4">
              <h2 className="text-sm font-medium text-foreground">{column.title}</h2>
              <ul className="flex flex-col gap-3">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={footerLinkClassName}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link href={item.href} className={footerLinkClassName}>
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PageContainer>
    </footer>
  );
}
