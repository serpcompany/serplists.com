import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  FilePenLine,
  PlaySquare,
  Share2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { isRepoTemplate } from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { PageSection } from '@/components/layout/page-shell';

const countTemplateItems = (sectionCountable: {
  sections: Array<{ items: unknown[] }>;
}) =>
  sectionCountable.sections.reduce(
    (total, section) => total + section.items.length,
    0,
  );

const Index = () => {
  const { user } = useAuth();
  const { templates, templatesLoading } = useTemplates();

  const publicTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.isPublic &&
          template.userId !== 'system' &&
          !isRepoTemplate(template),
      ),
    [templates],
  );

  const featuredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.isPublic &&
          (template.userId === 'system' || isRepoTemplate(template)),
      ),
    [templates],
  );

  const templateStats = useMemo(() => {
    const creatorIds = new Set(
      [...featuredTemplates, ...publicTemplates]
        .map((template) => template.userId)
        .filter(Boolean),
    );

    return [
      {
        label: 'Public templates',
        value: String(featuredTemplates.length + publicTemplates.length),
      },
      {
        label: 'Documented steps',
        value: String(
          [...featuredTemplates, ...publicTemplates].reduce(
            (total, template) => total + countTemplateItems(template),
            0,
          ),
        ),
      },
      {
        label: 'Template creators',
        value: String(creatorIds.size),
      },
    ];
  }, [featuredTemplates, publicTemplates]);
  const showcaseTemplates = useMemo(
    () => [...featuredTemplates, ...publicTemplates].slice(0, 6),
    [featuredTemplates, publicTemplates],
  );

  return (
    <div className="pb-16">
      <PageSection spacing="hero" width="shell">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="docs-panel p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-sm font-medium text-muted-foreground">
              <Compass className="h-4 w-4" />
              SOP workspace
            </div>

            <div className="mt-5 max-w-3xl space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Build the template once. Run it every time.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Serplists should feel like a fast form system for SOPs, process
                templates, and repeatable runs. Start with the structure, keep
                the inputs dense, and publish later if the workflow deserves a
                public page.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link
                  to={
                    user
                      ? buildConsoleTemplatesPath()
                      : buildPublicTemplatesPath()
                  }
                >
                  {user ? 'Open template workspace' : 'Browse templates'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {!user ? (
                <Button asChild variant="outline">
                  <Link to="/register">Create an account</Link>
                </Button>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {templateStats.map((item) => (
                <div key={item.label} className="rounded-lg border border-border/80 bg-card px-4 py-4">
                  <div className="text-2xl font-semibold text-foreground">
                    {item.value}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="docs-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Start here
            </p>
            <div className="mt-4 space-y-3">
              {[
                {
                  title: 'Template editing',
                  description:
                    'Define the JSON-backed SOP structure, metadata, and step content.',
                  icon: FilePenLine,
                },
                {
                  title: 'Run execution',
                  description:
                    'Launch a concrete run for a human or AI operator and track progress separately from the source template.',
                  icon: PlaySquare,
                },
                {
                  title: 'Public publishing',
                  description:
                    'Share the SOP only after the workflow is solid enough to be a reusable public asset.',
                  icon: Share2,
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="rounded-lg border border-border/80 bg-card px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-md border border-border/80 bg-muted/50 p-2 text-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          {item.title}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection className="pt-0" width="shell">
        <div className="docs-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Template library
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">
                Start from a template or open an existing run.
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The product should lead users toward structure and execution, not padded marketing sections.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to={buildPublicTemplatesPath()}>Open the library</Link>
            </Button>
          </div>

          <div className="divide-y divide-border/70">
            {templatesLoading ? (
              <div className="px-5 py-5 text-sm text-muted-foreground">
                Loading templates…
              </div>
            ) : showcaseTemplates.length > 0 ? (
              showcaseTemplates.map((template, index) => {
                const templatePath =
                  buildCanonicalPublicTemplatePath(template);

                return (
                  <Link
                    key={template.id}
                    to={templatePath ?? buildPublicTemplatesPath()}
                    className="block px-5 py-4 transition hover:bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {index < featuredTemplates.length ? 'Official template' : 'Community template'}
                        </div>
                        <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
                          {template.title}
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                          {template.description ||
                            'Reusable workflow template ready to copy into your account.'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>{template.sections.length} sections</div>
                        <div className="mt-1">{countTemplateItems(template)} items</div>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="px-5 py-5 text-sm text-muted-foreground">
                No public templates yet.
              </div>
            )}
          </div>
        </div>
      </PageSection>
    </div>
  );
};

export default Index;
