'use client';

import { useMemo } from 'react';
import {
  ArrowRight,
  ClipboardList,
  Eye,
  FileText,
  Globe,
  Library,
  List,
  ListChecks,
  PlayCircle,
  Share2,
} from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { CtaBanner } from '@/components/layout/CtaBanner';
import { ListCard } from '@/components/layout/ListCard';
import { MediaCard } from '@/components/layout/MediaCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
  buildRegisterPath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import { Link } from '@/components/navigation/Link';

const workflowSteps = [
  {
    step: '1',
    title: 'Make a template',
    description:
      'Capture the repeatable process once with sections, tasks, rich instructions, and ownership context.',
    icon: ClipboardList,
  },
  {
    step: '2',
    title: 'Run the workflow',
    description:
      'Start a fresh run, move task by task, and keep progress separate from the source template.',
    icon: PlayCircle,
  },
  {
    step: '3',
    title: 'Share the result',
    description:
      "Share a Run's link so anyone can tick tasks, add notes and complete it, or publish the template so others can trust and reuse the work.",
    icon: Share2,
  },
] as const;

const productSurfaces = [
  {
    title: 'Template Library',
    description:
      'Reusable SOPs, audits, launches, onboarding flows, and field checklists live in one browsable library.',
    icon: Library,
  },
  {
    title: 'Live run tracking',
    description:
      'Every execution gets its own progress, task focus, completion states, and continuation link.',
    icon: ListChecks,
  },
  {
    title: 'Shareable proof',
    description:
      'Public share pages show what was done without exposing private dashboard controls.',
    icon: Eye,
  },
] as const;

function countTemplateItems(template: ChecklistTemplate): number {
  return template.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );
}

// The home page (/): the hero, how the product works, and the starter templates.
const Index = () => {
  const { user } = useAuth();
  const { templates, templatesLoading } = useTemplates();

  const featuredTemplates = useMemo(
    () => templates.filter((template) => isRepoTemplate(template)).slice(0, 3),
    [templates],
  );

  const primaryCta = user
    ? { href: buildConsoleTemplatesPath(), label: 'Open Dashboard' }
    : { href: buildRegisterPath(), label: 'Get Started' };

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          align="center"
          actions={
            <>
              <Link href={primaryCta.href} className={buttonVariants({ size: 'lg' })}>
                {primaryCta.label}
                <ArrowRight data-icon="inline-end" />
              </Link>
              <Link
                href={buildPublicTemplatesPath()}
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                <Globe data-icon="inline-start" />
                Browse the Template Library
              </Link>
            </>
          }
          description="SERP Lists turns repeatable work into a reusable template, a focused execution run, and a shareable record. It is for teams that need the same process done cleanly more than once."
          eyebrow="Operations checklists that actually run"
          title="Build the checklist once. Run it every time."
        />
      </PageSection>

      <PageSection spacing="compact">
        <CardGrid>
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <MediaCard
                key={step.title}
                badge={<Badge variant="secondary">{step.step}</Badge>}
                description={step.description}
                icon={<Icon />}
                title={step.title}
              />
            );
          })}
        </CardGrid>
      </PageSection>

      <PageSection spacing="compact">
        <CardGrid>
          {productSurfaces.map((surface) => {
            const Icon = surface.icon;
            return (
              <ListCard
                key={surface.title}
                description={surface.description}
                icon={<Icon />}
                title={surface.title}
              />
            );
          })}
        </CardGrid>
      </PageSection>

      <PageSection spacing="spacious">
        <SectionHeader
          action={{ href: buildPublicTemplatesPath(), label: 'View all templates' }}
          eyebrow="Starter library"
          title="Start with a real checklist, then make it yours."
        />

        {templatesLoading ? (
          <Card>
            <CardContent className="text-muted-foreground">Loading templates...</CardContent>
          </Card>
        ) : (
          <CardGrid>
            {featuredTemplates.map((template) => {
              const TypeIcon = template.type === 'recipe' ? List : FileText;
              return (
                <MediaCard
                  key={template.id}
                  description={template.description || 'No description yet.'}
                  href={buildCanonicalPublicTemplatePath(template) ?? buildPublicTemplatesPath()}
                  icon={<TypeIcon />}
                  title={template.title}
                >
                  <p className="text-sm text-muted-foreground">
                    {countTemplateItems(template)} items in {template.sections.length} sections
                  </p>
                  {template.categories?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {template.categories.slice(0, 3).map((category) => (
                        <Badge key={category} variant="secondary">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </MediaCard>
              );
            })}
          </CardGrid>
        )}
      </PageSection>

      <PageSection spacing="spacious">
        <CtaBanner
          actions={
            <>
              <Link href={primaryCta.href} className={buttonVariants()}>
                {primaryCta.label}
              </Link>
              <Link href={buildPublicFeaturesPath()} className={buttonVariants({ variant: 'outline' })}>
                Explore Features
              </Link>
            </>
          }
          description="SERP Lists gives your repeatable work a home: one source template, many tracked runs, and clean share links when someone needs proof."
          title="Stop rebuilding the same checklist in docs and spreadsheets."
        />
      </PageSection>
    </>
  );
};

export default Index;
