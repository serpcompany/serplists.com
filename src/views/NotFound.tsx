'use client';

import { usePathname } from 'next/navigation';

import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { buttonVariants } from '@/components/ui/button';
import { useIsClient } from '@/hooks/useIsClient';

import { Link } from '@/components/navigation/Link';

// The 404 page. src/app/not-found.tsx renders it for unknown paths and notFound(), with its
// title and noindex; a page that finds out in the browser that its record does not exist
// renders it with <NoIndexMeta> (src/components/seo/NoIndexMeta.tsx), and only once its lookup
// has settled, never while it is loading. A page hero: the eyebrow, the title, what happened
// and the way home.
const NotFound = () => {
  const pathname = usePathname();
  // Next.js prerenders this page once, for its own /_not-found/ path, and serves that HTML for
  // every missing address. So the address is named only in the browser: the server's HTML
  // never names a wrong one, and matches the first client render.
  const route = useIsClient() ? `The route ${pathname}` : 'This route';

  return (
    <PageSection spacing="hero">
      <PageHero
        actions={
          <Link href="/" className={buttonVariants()}>
            Return to home
          </Link>
        }
        align="center"
        description={`${route} could not be found. Use the main navigation or head back to the home page.`}
        eyebrow="404"
        title="That page does not exist"
      />
    </PageSection>
  );
};

export default NotFound;
