'use client';

import { ShieldCheck, Target, Users } from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { MediaCard } from '@/components/layout/MediaCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { buttonVariants } from '@/components/ui/button-variants';
import { buildContactPath, buildPublicFeaturesPath } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

const VALUES = [
  {
    title: "Clarity",
    description: "Make every step explicit so teams run work the same way every time.",
    icon: Target,
  },
  {
    title: "Consistency",
    description: "Standardize repeatable processes without slowing down day-to-day work.",
    icon: ShieldCheck,
  },
  {
    title: "Community",
    description: "Share public checklists to help others move faster with proven workflows.",
    icon: Users,
  },
] as const;

const About = () => {
  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          actions={
            <>
              <Link
                href={buildPublicFeaturesPath()}
                className={buttonVariants()}
              >Explore Features</Link>
              <Link
                href={buildContactPath()}
                className={buttonVariants({ variant: 'outline' })}
              >Contact Us</Link>
            </>
          }
          align="center"
          eyebrow="About"
          description="SERP Lists helps teams and solo operators turn repeatable work into checklists that are easy to run, track, and share."
          title="Build repeatable work that feels easy to discover and execute."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <CardGrid>
          {VALUES.map((value) => {
            const Icon = value.icon;

            return (
              <MediaCard
                key={value.title}
                description={value.description}
                icon={<Icon />}
                title={value.title}
                titleAs="h2"
              />
            );
          })}
        </CardGrid>
      </PageSection>
    </>
  );
};

export default About;
