import { BrandLink } from '@/components/layout/BrandLink';
import { PageContainer } from '@/components/layout/page-shell';
import { publicFooterGroups } from '@/components/layout/publicSiteLinks';
import { Link } from '@/components/navigation/Link';
import { cn } from '@/lib/utils';

const footerLinkClassName = 'text-sm text-muted-foreground transition-colors hover:text-foreground';

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
