import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';

import { PageHero, PageSection, Surface } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { buildPageTitle } from '@/lib/brand';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      '404 Error: User attempted to access non-existent route:',
      location.pathname
    );
  }, [location.pathname]);

  return (
    <PageSection
      className="flex min-h-[calc(100vh-9rem)] items-center"
      spacing="spacious"
      width="narrow"
    >
      {/* Pages serves index.html with a 200 for every unknown path, so this tag is what
          keeps a missing URL out of search results. No canonical: the address is not a page.
          Render NotFound only once a lookup has settled, never while it is loading. */}
      <Helmet>
        <title>{buildPageTitle('Page not found')}</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <Surface className="mx-auto w-full text-center" padding="xl" tone="glass">
        <PageHero
          align="center"
          eyebrow="404"
          title="That page does not exist"
          description={`The route ${location.pathname} could not be found. Use the main navigation or head back to the home page.`}
        />
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link to="/">Return to home</Link>
          </Button>
        </div>
      </Surface>
    </PageSection>
  );
};

export default NotFound;
