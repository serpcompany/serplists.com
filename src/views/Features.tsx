'use client';

import { Check } from 'lucide-react';
import { useParams } from 'next/navigation';

import { CardGrid } from '@/components/layout/CardGrid';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { MediaCard } from '@/components/layout/MediaCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { Link } from '@/components/navigation/Link';
import { buttonVariants } from '@/components/ui/button';
import { FEATURES, findFeature } from '@/data/publicFeatures';
import {
  buildPricingPath,
  buildPublicFeaturePath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

// /features and /features/<slug>. The route shows the 404 page for a slug with no feature.
const Features = () => {
  const { featureSlug } = useParams<{ featureSlug?: string }>();
  const feature = findFeature(featureSlug);

  // A feature page: a detail page with its points in the panel beside the header.
  if (feature) {
    const Icon = feature.icon;

    return (
      <DetailPageLayout
        actions={
          <>
            <Link href={buildPublicTemplatesPath()} className={buttonVariants()}>
              Browse the Template Library
            </Link>
            <Link href={buildPricingPath()} className={buttonVariants({ variant: 'outline' })}>
              See Pricing
            </Link>
          </>
        }
        aside={
          <ul className="flex flex-col gap-4 text-sm">
            {feature.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {bullet}
              </li>
            ))}
          </ul>
        }
        breadcrumbs={[{ href: buildPublicFeaturesPath(), label: 'Features' }, { label: feature.title }]}
        description={feature.description}
        icon={<Icon />}
        title={feature.title}
      />
    );
  }

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          actions={
            <>
              <Link href={buildPricingPath()} className={buttonVariants()}>
                See Pricing
              </Link>
              <Link
                href={buildPublicTemplatesPath()}
                className={buttonVariants({ variant: 'outline' })}
              >
                Browse the Template Library
              </Link>
            </>
          }
          align="center"
          eyebrow="Features"
          description="Build checklists once, then run them repeatedly with confidence. SERP Lists focuses on clarity, repeatability, and simple sharing."
          title="Features that keep work consistent."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <CardGrid columns={2}>
          {FEATURES.map((featureItem) => {
            const Icon = featureItem.icon;

            return (
              <MediaCard
                key={featureItem.slug}
                description={featureItem.description}
                href={buildPublicFeaturePath(featureItem.slug)}
                icon={<Icon />}
                title={featureItem.title}
                titleAs="h2"
              >
                <p className="text-sm text-muted-foreground">
                  View the feature details and related workflows.
                </p>
              </MediaCard>
            );
          })}
        </CardGrid>
      </PageSection>
    </>
  );
};

export default Features;
