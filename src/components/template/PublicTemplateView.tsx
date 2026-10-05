import { useState } from 'react';
import {
  Bookmark,
  Check,
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
import { Stat } from '@/components/layout/Stat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type WorkspaceErrorActions,
  WorkspaceErrorNotice,
} from '@/components/workspace/WorkspaceErrorNotice';
import { copyTextToClipboard } from '@/lib/clipboard';
import { resolvePublicTemplateOwnerName } from '@/lib/repoTemplateCatalog';
import { buildPublicCategoryPath, buildPublicTemplatesPath } from '@/lib/routes';
import { formatLocalDate, normalizeDbTimestamp } from '@/lib/utils/dbTimestamp';
import type { ChecklistTemplate } from '@/types/checklist';

import { getPublicTemplateSaveLabels } from './publicTemplateSaveLabels';
import { TemplateSectionList } from './TemplateSectionList';

import { Link } from '@/components/navigation/Link';

interface PublicTemplateViewProps {
  template: ChecklistTemplate;
  totalItems: number;
  ownerSlug: string | null;
  ownerPath: string | null;
  isAuthenticated: boolean;
  canSaveTemplate: boolean;
  canStartRun: boolean;
  isBillingError: boolean;
  isBillingLoading: boolean;
  isProUser: boolean;
  isCreatingRun: boolean;
  isSaving: boolean;
  isTeamWorkspace: boolean;
  isWorkspaceLoading: boolean;
  workspaceError: WorkspaceErrorActions | null;
  onStartRun: () => void;
  onSaveTemplate: () => Promise<boolean>;
}

const WORKSPACE_ERROR_ID = 'public-template-workspace-error';

const getInitials = (value: string) => value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? 'U';

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
  const [isSaved, setIsSaved] = useState(false);
  const ownerName = resolvePublicTemplateOwnerName(template) || 'Template Library';
  const TypeIcon = template.type === 'recipe' ? List : FileText;
  const lastUpdated = template.updatedAt || template.createdAt;
  const updatedDate = formatLocalDate(lastUpdated);

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
      Start Run
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
        { href: buildPublicTemplatesPath(), label: 'Template Library' },
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
          {updatedDate ? (
            <p>
              Updated <time dateTime={normalizeDbTimestamp(lastUpdated) ?? undefined}>{updatedDate}</time>
            </p>
          ) : null}
          {template.categories?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {template.categories.map((category) => {
                const categoryPath = buildPublicCategoryPath(category);
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
          <Stat icon={<FileText />} label="Sections" value={template.sections.length} />
          <Stat icon={<List />} label="Tasks" value={totalItems} />
          <Stat icon={<Check />} label="Type" value={template.type ?? 'checklist'} />
        </div>
      }
    >
      <section className="flex flex-col gap-4" id="included">
        <h2 className="text-xl font-semibold tracking-tight">What&apos;s included</h2>
        <TemplateSectionList sections={template.sections} />
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

