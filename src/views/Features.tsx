'use client';

import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';

import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FEATURES, findFeature } from '@/data/publicFeatures';
import {
  buildPricingPath,
  buildPublicFeaturePath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

// /features and /features/<slug>. The route shows the 404 page for a slug with no feature.
const Features = () => {
  const { featureSlug } = useParams<{ featureSlug?: string }>();
  const feature = findFeature(featureSlug);

  if (feature) {
    const Icon = feature.icon;

    return (
      <>
        <PageSection spacing="spacious" width="narrow">
          <Button asChild className="mb-6" variant="ghost">
            <Link href={buildPublicFeaturesPath()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Features
            </Link>
          </Button>

          <Surface as="article" tone="docs">
            <CardHeader className="space-y-4">
              <IconBadge size="lg">
                <Icon className="h-7 w-7" />
              </IconBadge>
              <div className="space-y-2">
                <CardTitle className="text-3xl">{feature.title}</CardTitle>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-3 text-sm text-muted-foreground">
                {feature.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={buildPublicTemplatesPath()}>Browse Templates</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={buildPricingPath()}>See Pricing</Link>
                </Button>
              </div>
            </CardContent>
          </Surface>
        </PageSection>
      </>
    );
  }

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          actions={
            <>
              <Button asChild>
                <Link href={buildPricingPath()}>See Pricing</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={buildPublicTemplatesPath()}>Browse Templates</Link>
              </Button>
            </>
          }
          align="center"
          eyebrow="Features"
          description="Build checklists once, then run them repeatedly with confidence. SERP Lists focuses on clarity, repeatability, and simple sharing."
          title="Features that keep work consistent."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <div className="grid gap-6 md:grid-cols-2">
          {FEATURES.map((featureItem) => {
            const Icon = featureItem.icon;

            return (
              <Link
                key={featureItem.slug}
                href={buildPublicFeaturePath(featureItem.slug)}
              >
                <Surface
                  as="article"
                  className="h-full transition-transform duration-200 hover:-translate-y-0.5"
                  tone="docs"
                >
                  <CardHeader className="space-y-4">
                    <IconBadge>
                      <Icon className="h-6 w-6" />
                    </IconBadge>
                    <div className="space-y-2">
                      <CardTitle>{featureItem.title}</CardTitle>
                      <CardDescription>
                        {featureItem.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    View the feature details and related workflows.
                  </CardContent>
                </Surface>
              </Link>
            );
          })}
        </div>
      </PageSection>
    </>
  );
};

export default Features;
