import { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  FileText,
  List,
  Play,
  Share2,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';

import { CtaBanner } from '@/components/layout/CtaBanner';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { IconTile } from '@/components/layout/IconTile';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import {
  type WorkspaceErrorActions,
  WorkspaceErrorNotice,
} from '@/components/workspace/WorkspaceErrorNotice';
import { copyTextToClipboard } from '@/lib/clipboard';
import { buildPublicCategoryPath, buildPublicTemplatesPath } from '@/lib/routes';
import { getSectionDisplayTitle } from '@/lib/utils/checklistSections';
import type { ChecklistItem, ChecklistSection, ChecklistTemplate } from '@/types/checklist';

import { getPublicTemplateSaveLabels } from './publicTemplateSaveLabels';

import { Link } from '@/components/navigation/Link';

interface PublicTemplateViewProps {
  template: ChecklistTemplate;
  totalItems: number;
  ownerSlug: string | null;
  ownerPath: string | null;
  isAuthenticated: boolean;
  // Save adds a Template and Start Run adds a Run to the active context, so in an
  // Organization they follow the viewer's Organization Role (always true in Personal).
  canSaveTemplate: boolean;
  canStartRun: boolean;
  // The plan check failed: no plan is known, so nothing reads as an upgrade.
  isBillingError: boolean;
  isBillingLoading: boolean;
  isProUser: boolean;
  isCreatingRun: boolean;
  isSaving: boolean;
  // Save copies into the active context; only Personal copying needs a Pro plan.
  isTeamWorkspace: boolean;
  // Save and Start Run wait until the active ownership context is known.
  isWorkspaceLoading: boolean;
  // Set when the teams request failed for a signed-in user: this page has no WorkspaceGate,
  // so it says why Save and Start Run wait and offers the gate's Retry and Personal.
  workspaceError: WorkspaceErrorActions | null;
  onStartRun: () => void;
  // Resolves true only when the template was saved.
  onSaveTemplate: () => Promise<boolean>;
}

const WORKSPACE_ERROR_ID = 'public-template-workspace-error';

const getInitials = (value: string) => value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? 'U';

// The call to action says why an action is missing instead of leaving a silent gap.
const getCallToActionText = (canSaveTemplate: boolean, canStartRun: boolean): string => {
  if (canSaveTemplate && canStartRun) {
    return 'Start a run to work through this checklist, or save it to your library for later.';
  }

  if (canStartRun) {
    return 'Start a run to work through this checklist. Your role in this Organization cannot add Templates.';
  }

  if (canSaveTemplate) {
    return 'Save it to your library for later. Your role in this Organization cannot start runs.';
  }

  return 'Your role in this Organization can view Templates only, so it cannot copy this one or start a run.';
};

// The public template page's content: a detail page with the template's facts and actions,
// its sections, and the call to action.
export function PublicTemplateView({
  template,
  totalItems,
  ownerPath,
  isAuthenticated,
  canSaveTemplate,
  canStartRun,
  isBillingError,
  isBillingLoading,
  isProUser,
  isCreatingRun,
  isSaving,
  isTeamWorkspace,
  isWorkspaceLoading,
  workspaceError,
  onStartRun,
  onSaveTemplate,
}: PublicTemplateViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(template.sections.map((section) => section.id)),
  );
  const [isSaved, setIsSaved] = useState(false);
  const ownerName =
    template.ownerProfile?.full_name || template.ownerProfile?.username || 'Template Library';
  const TypeIcon = template.type === 'recipe' ? List : FileText;

  const setSectionOpen = (sectionId: string, open: boolean) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (open) {
        next.add(sectionId);
      } else {
        next.delete(sectionId);
      }
      return next;
    });
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (await copyTextToClipboard(window.location.href)) {
      toast.success('Link copied to clipboard');
      return;
    }
    toast.error("Couldn't copy the link. Copy it from the address bar.");
  };

  const handleSave = async () => {
    const saved = await onSaveTemplate().catch(() => false);
    if (saved) {
      setIsSaved(true);
    }
  };
  // Signed-out visitors are never loading a plan, so they can still click Save to sign in.
  const isSaveDisabled = isSaving || isBillingLoading || isWorkspaceLoading;
  const saveLabels = getPublicTemplateSaveLabels({
    isAuthenticated,
    isBillingError,
    isBillingLoading,
    isProUser,
    isSaving,
    isTeamWorkspace,
    isWorkspaceLoading,
  });
  const actionDescribedBy = workspaceError ? WORKSPACE_ERROR_ID : undefined;
  const startRunButton = (
    <Button
      onClick={onStartRun}
      type="button"
      disabled={isCreatingRun || isWorkspaceLoading}
      aria-describedby={actionDescribedBy}
    >
      <Play data-icon="inline-start" />
      {isCreatingRun ? 'Starting...' : 'Start Run'}
    </Button>
  );

  const owner = (
    <>
      <Avatar size="sm">
        <AvatarFallback>{getInitials(ownerName)}</AvatarFallback>
      </Avatar>
      <span>{ownerName}</span>
    </>
  );

  return (
    <DetailPageLayout
      breadcrumbs={[
        { href: buildPublicTemplatesPath(), label: 'Templates' },
        { label: template.title },
      ]}
      notice={
        workspaceError ? (
          <WorkspaceErrorNotice
            {...workspaceError}
            id={WORKSPACE_ERROR_ID}
            message="Start Run and Save wait until they load. Check your connection and try again, or continue in Personal."
          />
        ) : undefined
      }
      icon={<TypeIcon />}
      title={template.title}
      description={template.description || undefined}
      meta={
        <>
          {ownerPath ? (
            <Link href={ownerPath} className="flex items-center gap-2 transition-colors hover:text-foreground">
              {owner}
            </Link>
          ) : (
            <div className="flex items-center gap-2">{owner}</div>
          )}
          {template.categories?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {template.categories.map((category) => {
                const categoryPath = buildPublicCategoryPath(category);
                // A category with no letters or digits has no page to link to.
                return categoryPath ? (
                  <Badge key={category} variant="secondary" render={<Link href={categoryPath} />}>
                    {category}
                  </Badge>
                ) : (
                  <Badge key={category} variant="secondary">
                    {category}
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </>
      }
      actions={
        <>
          <Button variant="outline" onClick={() => void handleShare()} type="button">
            <Share2 data-icon="inline-start" />
            Share
          </Button>
          {canSaveTemplate ? (
            <Button
              variant={isSaved ? 'secondary' : 'outline'}
              onClick={() => void handleSave()}
              type="button"
              disabled={isSaveDisabled}
              aria-describedby={actionDescribedBy}
            >
              {isSaved ? (
                <>
                  <Check data-icon="inline-start" />
                  Saved
                </>
              ) : (
                <>
                  <Bookmark data-icon="inline-start" />
                  {saveLabels.header}
                </>
              )}
            </Button>
          ) : null}
          {canStartRun ? startRunButton : null}
        </>
      }
      aside={
        <div className="grid grid-cols-3 gap-4">
          <TemplateStat icon={<FileText />} label="Sections" value={template.sections.length} />
          <TemplateStat icon={<List />} label="Tasks" value={totalItems} />
          <TemplateStat icon={<Check />} label="Type" value={template.type ?? 'checklist'} />
        </div>
      }
    >
      <section className="flex flex-col gap-4" id="included">
        <h2 className="text-xl font-semibold tracking-tight">What&apos;s included</h2>

        {template.sections.map((section, sectionIndex) => (
          <SectionPreview
            key={section.id}
            section={section}
            index={sectionIndex}
            isExpanded={expandedSections.has(section.id)}
            onOpenChange={(open) => setSectionOpen(section.id, open)}
          />
        ))}
      </section>

      {template.tags?.length ? (
        <div className="mt-8 flex items-center gap-2 border-t pt-6 text-sm">
          <Tag className="size-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            {template.tags.map((tag) => (
              <span key={tag} className="text-muted-foreground">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <CtaBanner
        className="mt-12"
        titleAs="h3"
        title="Ready to use this template?"
        description={getCallToActionText(canSaveTemplate, canStartRun)}
        actions={
          <>
            {canSaveTemplate ? (
              <Button
                variant="outline"
                onClick={() => void handleSave()}
                disabled={isSaveDisabled}
                aria-describedby={actionDescribedBy}
                type="button"
              >
                <Copy data-icon="inline-start" />
                {saveLabels.footer}
              </Button>
            ) : null}
            {canStartRun ? startRunButton : null}
          </>
        }
      />
    </DetailPageLayout>
  );
}

function TemplateStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <IconTile size="sm" tone="card">
        {icon}
      </IconTile>
      <div>
        <p className="text-2xl font-semibold capitalize">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SectionPreview({
  section,
  index,
  isExpanded,
  onOpenChange,
}: {
  section: ChecklistSection;
  index: number;
  isExpanded: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {index + 1}
          </span>
          <span className="truncate font-medium">{getSectionDisplayTitle(section, index)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{section.items.length} tasks</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t px-4 py-3">
        <ul className="flex flex-col gap-2">
          {section.items.map((item, itemIndex) => (
            <TaskPreviewItem key={item.id} item={item} index={itemIndex} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TaskPreviewItem({ item, index }: { item: ChecklistItem; index: number }) {
  return (
    <li className="flex items-start gap-3 py-1">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-xs text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs leading-5 whitespace-pre-line text-muted-foreground">
            {item.description}
          </p>
        ) : null}
        {item.contents?.length ? (
          <div className="mt-3 text-sm">
            <ContentRenderer contents={item.contents} disabled />
          </div>
        ) : null}
      </div>
    </li>
  );
}
