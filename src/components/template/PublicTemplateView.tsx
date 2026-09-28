import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  List,
  Play,
  Share2,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { copyTextToClipboard } from '@/lib/clipboard';
import { buildPublicCategoryPath, buildPublicTemplatesPath } from '@/lib/routes';
import type { ChecklistItem, ChecklistSection, ChecklistTemplate } from '@/types/checklist';

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

const getInitials = (value: string) => value.match(/[A-Za-z0-9]/)?.[0]?.toUpperCase() ?? 'U';

export function PublicTemplateView({
  template,
  totalItems,
  ownerPath,
  isCreatingRun,
  isSaving,
  onStartRun,
  onSaveTemplate,
}: PublicTemplateViewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(template.sections.map((section) => section.id)),
  );
  const [isSaved, setIsSaved] = useState(false);
  const ownerName =
    template.ownerProfile?.full_name || template.ownerProfile?.username || 'Template Library';

  const handleToggleSection = (sectionId: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
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
    await Promise.resolve(onSaveTemplate());
    setIsSaved(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-14 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to={buildPublicTemplatesPath()}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleShare()}
              className="gap-2"
              type="button"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
            <Button
              variant={isSaved ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => void handleSave()}
              className="gap-2"
              type="button"
              disabled={isSaving}
            >
              {isSaved ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  {isSaving ? 'Saving...' : 'Save'}
                </>
              )}
            </Button>
            <Button size="sm" onClick={onStartRun} className="gap-2" type="button">
              <Play className="h-3.5 w-3.5" />
              {isCreatingRun ? 'Starting...' : 'Start Run'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          {template.categories?.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {template.categories.map((category) => {
                const categoryPath = buildPublicCategoryPath(category);
                // A category with no letters or digits has no page to link to.
                return categoryPath ? (
                  <Link
                    key={category}
                    to={categoryPath}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {category}
                  </Link>
                ) : (
                  <span
                    key={category}
                    className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {category}
                  </span>
                );
              })}
            </div>
          ) : null}

          <h1 className="mb-3 text-balance text-3xl font-bold text-foreground">
            {template.title}
          </h1>

          {template.description ? (
            <p className="mb-6 whitespace-pre-line text-pretty text-base leading-relaxed text-muted-foreground">
              {template.description}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {ownerPath ? (
              <Link
                to={ownerPath}
                className="flex items-center gap-2 transition-colors hover:text-foreground"
              >
                <Avatar className="h-6 w-6">
                  <AvatarImage src="" />
                  <AvatarFallback className="text-xs">
                    {getInitials(ownerName)}
                  </AvatarFallback>
                </Avatar>
                <span>{ownerName}</span>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(ownerName)}
                  </AvatarFallback>
                </Avatar>
                <span>{ownerName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mb-8 rounded-lg border border-border bg-card p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {template.sections.length}
                </p>
                <p className="text-xs text-muted-foreground">Sections</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <List className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalItems}</p>
                <p className="text-xs text-muted-foreground">Tasks</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Check className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold capitalize text-foreground">
                  {template.type ?? 'checklist'}
                </p>
                <p className="text-xs text-muted-foreground">Type</p>
              </div>
            </div>
          </div>
        </div>

        <section className="space-y-4" id="included">
          <h2 className="text-lg font-semibold text-foreground">What&apos;s included</h2>

          {template.sections.map((section, sectionIndex) => (
            <SectionPreview
              key={section.id}
              section={section}
              index={sectionIndex}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => handleToggleSection(section.id)}
            />
          ))}
        </section>

        {template.tags?.length ? (
          <div className="mt-8 border-t border-border pt-6">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-wrap gap-2">
                {template.tags.map((tag) => (
                  <span key={tag} className="text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-12 rounded-lg border border-border bg-card p-6 text-center">
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            Ready to use this template?
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Start a run to work through this checklist, or save it to your library for later.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => void handleSave()}
              disabled={isSaving}
              type="button"
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy to Library
            </Button>
            <Button
              onClick={onStartRun}
              disabled={isCreatingRun}
              type="button"
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              {isCreatingRun ? 'Starting...' : 'Start Run'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionPreview({
  section,
  index,
  isExpanded,
  onToggle,
}: {
  section: ChecklistSection;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
            {index + 1}
          </span>
          <span className="truncate font-medium text-foreground">{section.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {section.items.length} tasks
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {isExpanded ? (
        <div className="border-t border-border px-4 py-3">
          <ul className="space-y-2">
            {section.items.map((item, itemIndex) => (
              <TaskPreviewItem key={item.id} item={item} index={itemIndex} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TaskPreviewItem({ item, index }: { item: ChecklistItem; index: number }) {
  return (
    <li className="flex items-start gap-3 py-1">
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-xs text-muted-foreground">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 whitespace-pre-line text-xs leading-5 text-muted-foreground">
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
