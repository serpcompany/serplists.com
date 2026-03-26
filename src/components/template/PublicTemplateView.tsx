import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Copy,
  Layers3,
  ListChecks,
  PlayCircle,
} from 'lucide-react';

import {
  PublicTemplateContent,
} from '@/components/template/PublicTemplateContent';
import {
  PublicPageBackLink,
  PublicPageContainer,
  PublicPageSplitLayout,
  PublicSidebarSection,
} from '@/components/layout/PublicPageLayout';
import { PublicPill } from '@/components/shared/PublicPill';
import { buildPublicTemplateSectionId } from '@/components/template/publicTemplateSectionId';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

interface PublicTemplateViewProps {
  template: ChecklistTemplate;
  totalItems: number;
  ownerSlug: string | null;
  ownerPath: string | null;
  isAuthenticated: boolean;
  isBillingLoading: boolean;
  isProUser: boolean;
  isCreatingRun: boolean;
  isSaving: boolean;
  onStartRun: () => void;
  onSaveTemplate: () => void;
}

const formatCreatedDate = (createdAt: string) =>
  new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const getCopyButtonLabel = ({
  isAuthenticated,
  isBillingLoading,
  isProUser,
  isSaving,
}: Pick<
  PublicTemplateViewProps,
  'isAuthenticated' | 'isBillingLoading' | 'isProUser' | 'isSaving'
>) => {
  if (isSaving) {
    return 'Copying…';
  }

  if (!isAuthenticated) {
    return 'Log in to copy template';
  }

  if (isBillingLoading) {
    return 'Checking plan…';
  }

  if (!isProUser) {
    return 'Upgrade to copy template';
  }

  return 'Copy to my templates';
};

export function PublicTemplateView({
  template,
  totalItems,
  ownerSlug,
  ownerPath,
  isAuthenticated,
  isBillingLoading,
  isProUser,
  isCreatingRun,
  isSaving,
  onStartRun,
  onSaveTemplate,
}: PublicTemplateViewProps) {
  const copyButtonLabel = getCopyButtonLabel({
    isAuthenticated,
    isBillingLoading,
    isProUser,
    isSaving,
  });
  const sectionLinks = template.sections.map((section, sectionIndex) => ({
    href: `#${buildPublicTemplateSectionId(section, sectionIndex)}`,
    id: buildPublicTemplateSectionId(section, sectionIndex),
    title: section.title,
  }));
  const templateSlugLabel = template.slug || template.id;
  const templateType = template.type || 'checklist';
  const createdLabel = formatCreatedDate(template.createdAt);

  return (
    <>
      <PublicPageContainer className="pb-10 pt-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <PublicPageBackLink to={buildPublicTemplatesPath()}>
            Back to checklists
          </PublicPageBackLink>

          <div className="hidden items-center gap-3 lg:flex">
            <Button
              type="button"
              onClick={onStartRun}
              disabled={isCreatingRun}
              className="h-9 px-4 text-sm"
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {isCreatingRun ? 'Starting…' : 'Start checklist'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSaveTemplate}
              disabled={isSaving || isBillingLoading}
              className="h-9 border-border bg-background px-4 text-sm text-foreground hover:bg-muted/30 hover:text-foreground"
            >
              <Copy className="mr-2 h-4 w-4" />
              {copyButtonLabel}
            </Button>
          </div>
        </div>

        <div className="border-b border-border/70 pb-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {ownerPath ? (
              <Link
                to={ownerPath}
                className="font-medium text-foreground transition hover:text-primary"
              >
                @{ownerSlug}
              </Link>
            ) : (
              <span>Checklist library</span>
            )}
            <span className="text-muted-foreground/60">/</span>
            <span className="font-medium text-foreground">
              {templateSlugLabel}
            </span>
            <Badge
              variant="outline"
              className="ml-1 rounded-md border-border/70 bg-muted/20 px-2 py-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"
            >
              Public template
            </Badge>
          </div>

          <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-foreground">
            {template.title}
          </h1>

          {template.description ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              {template.description}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Layers3 className="h-4 w-4" />
              {template.sections.length} sections
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="h-4 w-4" />
              {totalItems} tasks
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Created {createdLabel}
            </span>
            <span className="capitalize">Type {templateType}</span>
            <span>Version {template.version ?? 1}</span>
          </div>

          <details className="mt-4 rounded-xl border border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground lg:hidden">
            <summary className="cursor-pointer list-none font-medium text-foreground">
              More details
            </summary>
            <div className="mt-4 space-y-3">
              {ownerPath ? (
                <div className="flex items-center justify-between gap-3">
                  <span>Creator</span>
                  <Link
                    to={ownerPath}
                    className="inline-flex items-center gap-1 font-medium text-foreground"
                  >
                    @{ownerSlug}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
              {template.categories?.length ? (
                <div>
                  <div className="mb-2 font-medium text-foreground">
                    Categories
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {template.categories.map((category) => (
                      <PublicPill key={category} asChild>
                        <Link to={buildPublicCategoryPath(category)}>
                          {category}
                        </Link>
                      </PublicPill>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>

        <PublicPageSplitLayout
          className="mt-6"
          main={
            <section className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-none">
              <div className="px-5 py-2 sm:px-6">
                <PublicTemplateContent sections={template.sections || []} />
              </div>
            </section>
          }
          aside={
            <div className="hidden lg:block">
              {sectionLinks.length ? (
                <PublicSidebarSection title="On this page">
                  <div className="space-y-2 text-sm">
                    {sectionLinks.map((sectionLink) => (
                      <a
                        key={sectionLink.id}
                        href={sectionLink.href}
                        className="block text-muted-foreground transition hover:text-foreground"
                      >
                        {sectionLink.title}
                      </a>
                    ))}
                  </div>
                </PublicSidebarSection>
              ) : null}

              <PublicSidebarSection title="Template details">
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Sections</dt>
                    <dd className="font-medium text-foreground">
                      {template.sections.length}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Tasks</dt>
                    <dd className="font-medium text-foreground">{totalItems}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium capitalize text-foreground">
                      {templateType}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-medium text-foreground">
                      {createdLabel}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-medium text-foreground">
                      {template.version ?? 1}
                    </dd>
                  </div>
                </dl>
              </PublicSidebarSection>

              {ownerPath ? (
                <PublicSidebarSection divider title="Creator">
                  <Link
                    to={ownerPath}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
                  >
                    @{ownerSlug}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </PublicSidebarSection>
              ) : null}

              {template.categories?.length ? (
                <PublicSidebarSection divider title="Categories">
                  <div className="flex flex-wrap gap-2">
                    {template.categories.map((category) => (
                      <PublicPill key={category} asChild>
                        <Link to={buildPublicCategoryPath(category)}>
                          {category}
                        </Link>
                      </PublicPill>
                    ))}
                  </div>
                </PublicSidebarSection>
              ) : null}
            </div>
          }
        />
      </PublicPageContainer>

      <div className="fixed inset-x-4 bottom-24 z-30 lg:hidden">
        <div className="rounded-xl border border-border/80 bg-background/95 p-3 shadow-[0_20px_60px_-36px_rgba(15,23,42,0.22)] backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onSaveTemplate}
              disabled={isSaving || isBillingLoading}
            >
              <Copy className="mr-2 h-4 w-4" />
              {isSaving ? 'Copying…' : 'Copy'}
            </Button>
            <Button
              type="button"
              onClick={onStartRun}
              disabled={isCreatingRun}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {isCreatingRun ? 'Starting…' : 'Start'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
