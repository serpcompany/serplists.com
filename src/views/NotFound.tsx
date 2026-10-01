'use client';

import { usePathname } from 'next/navigation';

import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { buttonVariants } from '@/components/ui/button';
import { useIsClient } from '@/hooks/useIsClient';

import { Link } from '@/components/navigation/Link';
import { buildHomePath } from '@/lib/routes';

const NotFound = () => {
  const pathname = usePathname();
  const route = useIsClient() ? `The route ${pathname}` : 'This route';

  return (
    <PageSection spacing="hero">
      <PageHero
        actions={
          <Link href={buildHomePath()} className={buttonVariants()}>
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
