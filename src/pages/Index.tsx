import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  Eye,
  Globe,
  Library,
  ListChecks,
  PlayCircle,
  Share2,
} from 'lucide-react';

import { IconBadge, PageHero, PageSection, Surface } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

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
      'Send a clean read-only run or publish the template so others can trust and reuse the work.',
    icon: Share2,
  },
] as const;

const productSurfaces = [
  {
    title: 'Template library',
    description:
      'Reusable SOPs, audits, launches, onboarding flows, and field checklists live in one browsable library.',
    icon: Library,
  },
  {
    title: 'Live run workspace',
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

const Index = () => {
  const { user } = useAuth();
  const { templates, templatesLoading } = useTemplates();

  const featuredTemplates = useMemo(
    () => templates.filter((template) => isRepoTemplate(template)).slice(0, 3),
    [templates],
  );

  const primaryCta = user
    ? { href: buildConsoleTemplatesPath(), label: 'Open Dashboard' }
    : { href: '/register', label: 'Get Started' };

  return (
    <>
      <PageSection spacing="hero" width="wide">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)] lg:items-center">
          <PageHero
            actions={
              <>
                <Button asChild>
                  <Link to={primaryCta.href}>
                    {primaryCta.label}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={buildPublicTemplatesPath()}>
                    <Globe className="mr-2 h-4 w-4" />
                    Browse Templates
                  </Link>
                </Button>
              </>
            }
            description="Serplists turns repeatable work into a reusable template, a focused execution run, and a shareable record. It is for teams that need the same process done cleanly more than once."
            eyebrow="Operations checklists that actually run"
            title="Build the checklist once. Run it every time."
          />

          <Surface className="overflow-hidden" padding="none" tone="glass">
            <div className="border-b border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Template library
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    Launch QA checklist
                  </h2>
                </div>
                <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  72% complete
                </span>
              </div>
            </div>
            <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3 p-5">
                {[
                  'Confirm final content and links',
                  'Run technical QA',
                  'Publish launch notes',
                ].map((task, index) => (
                  <div
                    key={task}
                    className="flex items-center gap-3 rounded-[var(--layout-card-radius)] border border-border bg-background p-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {task}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border bg-muted/40 p-5 md:border-l md:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Run state
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Open tasks</span>
                    <span className="font-medium text-foreground">4</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Done</span>
                    <span className="font-medium text-foreground">9</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Share status</span>
                    <span className="font-medium text-foreground">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </Surface>
        </div>
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <div className="grid gap-6 md:grid-cols-3">
          {workflowSteps.map((step) => {
            const Icon = step.icon;

            return (
              <Surface key={step.title} as="article" tone="docs">
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between">
                    <IconBadge>
                      <Icon className="h-5 w-5" />
                    </IconBadge>
                    <span className="text-4xl font-semibold tracking-tight text-muted-foreground/30">
                      {step.step}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </div>
                </CardHeader>
              </Surface>
            );
          })}
        </div>
      </PageSection>

      <PageSection spacing="spacious">
        <div className="grid gap-6 lg:grid-cols-3">
          {productSurfaces.map((surface) => {
            const Icon = surface.icon;

            return (
              <Surface key={surface.title} as="article" tone="console">
                <CardHeader className="space-y-4">
                  <IconBadge>
                    <Icon className="h-5 w-5" />
                  </IconBadge>
                  <div className="space-y-2">
                    <CardTitle>{surface.title}</CardTitle>
                    <CardDescription>{surface.description}</CardDescription>
                  </div>
                </CardHeader>
              </Surface>
            );
          })}
        </div>
      </PageSection>

      <PageSection spacing="spacious">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Starter library
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">
              Start with a real checklist, then make it yours.
            </h2>
          </div>
          <Button asChild variant="ghost" className="w-fit">
            <Link to={buildPublicTemplatesPath()}>
              View all templates
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {templatesLoading ? (
          <Surface tone="docs">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading templates...
            </CardContent>
          </Surface>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {featuredTemplates.map((template) => {
              const href =
                buildCanonicalPublicTemplatePath(template) ??
                buildPublicTemplatesPath();

              return (
                <Link key={template.id} to={href}>
                  <Surface
                    as="article"
                    className="h-full transition-transform duration-200 hover:-translate-y-0.5"
                    tone="glass"
                  >
                    <CardHeader className="space-y-3">
                      <CardTitle>{template.title}</CardTitle>
                      <CardDescription>
                        {template.description || 'No description yet.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
                      <p>
                        {countTemplateItems(template)} items in {template.sections.length}{' '}
                        sections
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(template.categories || []).slice(0, 3).map((category) => (
                          <span
                            key={category}
                            className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                          >
                            {category}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Surface>
                </Link>
              );
            })}
          </div>
        )}
      </PageSection>

      <PageSection spacing="spacious">
        <Surface tone="glass">
          <CardHeader className="space-y-3">
            <CardTitle className="text-3xl">
              Stop rebuilding the same checklist in docs and spreadsheets.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Serplists gives your repeatable work a home: one source template,
              many tracked runs, and clean share links when someone needs proof.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 pt-0">
            <Button asChild>
              <Link to={primaryCta.href}>{primaryCta.label}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={buildPublicFeaturesPath()}>Explore Features</Link>
            </Button>
          </CardContent>
        </Surface>
      </PageSection>
    </>
  );
};

export default Index;
