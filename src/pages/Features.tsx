import {
  ArrowLeft,
  CheckCircle,
  ListChecks,
  Share2,
  UploadCloud,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildPublicFeaturePath, buildPublicTemplatesPath } from '@/lib/routes';
import NotFound from './NotFound';

const FEATURES = [
  {
    slug: "template-builder",
    title: "Template Builder",
    description: "Create reusable checklists with sections, instructions, and structured steps.",
    icon: ListChecks,
    bullets: [
      "Build reusable SOPs with sections and tasks.",
      "Add instructions, media, and structured sub-items.",
      "Keep one source template for repeated execution.",
    ],
  },
  {
    slug: "checklist-runs",
    title: "Checklist Runs",
    description: "Run checklists, track progress, and keep work moving across items.",
    icon: CheckCircle,
    bullets: [
      "Launch a new run from any saved template.",
      "Track progress at the run level.",
      "Keep execution separate from the reusable template.",
    ],
  },
  {
    slug: "public-sharing",
    title: "Public Sharing",
    description: "Publish templates to the community library and share links with anyone.",
    icon: Share2,
    bullets: [
      "Publish templates to a public profile.",
      "Share public template URLs with a stable structure.",
      "Keep run-sharing separate from public template publishing.",
    ],
  },
  {
    slug: "import-export",
    title: "Import + Export",
    description: "Backup templates and move them between accounts (Pro).",
    icon: UploadCloud,
    bullets: [
      "Export templates as portable JSON packs.",
      "Import portable packs back into the app.",
      "Keep reusable SOP content versionable in the repo.",
    ],
  },
] as const;

const Features = () => {
  const { featureSlug } = useParams<{ featureSlug?: string }>();
  const feature = featureSlug
    ? FEATURES.find((entry) => entry.slug === featureSlug)
    : null;

  if (featureSlug && !feature) {
    return <NotFound />;
  }

  if (feature) {
    const Icon = feature.icon;

    return (
      <>
        <PageSection spacing="spacious" width="narrow">
          <Button asChild className="mb-6" variant="ghost">
            <Link to="/features">
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
                  <Link to={buildPublicTemplatesPath()}>Browse Templates</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pricing">See Pricing</Link>
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
                <Link to="/pricing">See Pricing</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={buildPublicTemplatesPath()}>Browse Templates</Link>
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
                to={buildPublicFeaturePath(featureItem.slug)}
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
