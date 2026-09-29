'use client';

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { PageHero, PageSection, Surface } from '@/components/layout/page-shell';
import { NotFoundHead } from '@/components/shared/NotFoundHead';
import { Button } from '@/components/ui/button';

import { Link } from '@/components/navigation/Link';

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
      {/* Render NotFound only once a lookup has settled, never while it is loading. */}
      <NotFoundHead title="Page not found" />
      <Surface className="mx-auto w-full text-center" padding="xl" tone="glass">
        <PageHero
          align="center"
          eyebrow="404"
          title="That page does not exist"
          description={`The route ${location.pathname} could not be found. Use the main navigation or head back to the home page.`}
        />
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link href="/">Return to home</Link>
          </Button>
        </div>
      </Surface>
    </PageSection>
  );
};

export default NotFound;
