'use client';

import { usePathname } from 'next/navigation';

import { PageSection, Surface } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { buttonVariants } from '@/components/ui/button';
import { useIsClient } from '@/hooks/useIsClient';

import { Link } from '@/components/navigation/Link';

// The 404 page. src/app/not-found.tsx renders it for unknown paths and notFound(), with its
// title and noindex; a page that finds out in the browser that its record does not exist
// renders it with <NoIndexMeta> (src/components/seo/NoIndexMeta.tsx).
const NotFound = () => {
  const pathname = usePathname();
  // Next.js prerenders this page once, for its own /_not-found/ path, and serves that HTML for
  // every missing address. So the address is named only in the browser: the server's HTML
  // never names a wrong one, and matches the first client render.
  const route = useIsClient() ? `The route ${pathname}` : 'This route';

  return (
    <PageSection
      className="flex min-h-[calc(100vh-9rem)] items-center"
      spacing="spacious"
      width="narrow"
    >
      {/* Render NotFound only once a lookup has settled, never while it is loading. */}
      <Surface className="mx-auto w-full text-center" padding="xl" tone="glass">
        <PageHero
          align="center"
          eyebrow="404"
          title="That page does not exist"
          description={`${route} could not be found. Use the main navigation or head back to the home page.`}
        />
        <div className="mt-8 flex justify-center">
          <Link href="/" className={buttonVariants()}>Return to home</Link>
        </div>
      </Surface>
    </PageSection>
  );
};

export default NotFound;
