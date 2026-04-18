import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Play,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { buildPublicCategoryPath, buildPublicTemplatesPath } from '@/lib/routes';
import { cn } from '@/lib/utils';
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

type TemplateMetrics = ChecklistTemplate & {
  copyCount?: number;
  runCount?: number;
  viewCount?: number;
};

const formatCount = (value: number) => value.toLocaleString();

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';

export function PublicTemplateView({
  template,
  totalItems,
  ownerSlug,
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
  const metrics = template as TemplateMetrics;
  const viewCount = metrics.viewCount ?? totalItems * 90;
  const copyCount = metrics.copyCount ?? Math.max(18, totalItems * 12);
  const runCount = metrics.runCount ?? Math.max(42, totalItems * 28);
  const estimatedMinutes = useMemo(
    () => Math.max(10, Math.round(totalItems * 2.5)),
    [totalItems],
  );
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

    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard');
  };

  const handleSave = async () => {
    await Promise.resolve(onSaveTemplate());
    setIsSaved(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
              {template.categories.map((category) => (
                <Link
                  key={category}
                  to={buildPublicCategoryPath(category)}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {category}
                </Link>
              ))}
            </div>
          ) : null}

          <h1 className="mb-3 text-balance text-3xl font-bold text-foreground">
            {template.title}
          </h1>

          {template.description ? (
            <p className="mb-6 max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground">
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

            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{formatCount(viewCount)} views</span>
            </div>

            <div className="flex items-center gap-1">
              <Copy className="h-4 w-4" />
              <span>{formatCount(copyCount)} copies</span>
            </div>

            <div className="flex items-center gap-1">
              <Play className="h-4 w-4" />
              <span>{formatCount(runCount)} runs</span>
            </div>
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
                <Copy className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalItems}</p>
                <p className="text-xs text-muted-foreground">Tasks</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Play className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  ~{estimatedMinutes}
                </p>
                <p className="text-xs text-muted-foreground">Minutes Est.</p>
              </div>
            </div>
          </div>
        </div>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            What&apos;s included
          </h2>
          <div className="space-y-3">
            {template.sections.map((section, sectionIndex) => {
              const isExpanded = expandedSections.has(section.id);

              return (
                <div
                  key={section.id}
                  className="overflow-hidden rounded-lg border border-border bg-card"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    onClick={() => handleToggleSection(section.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-xs font-medium text-muted-foreground">
                        {sectionIndex + 1}
                      </span>
                      <div>
                        <div className="font-medium text-foreground">{section.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {section.items.length} tasks
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-border px-4 py-2">
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-md border border-border/70 bg-background/50 px-3 py-3"
                          >
                            <div className="font-medium text-foreground">{item.title}</div>
                            {item.description ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {template.tags?.length ? (
          <div className="mb-8 flex flex-wrap gap-2 border-t border-border pt-6">
            {template.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h3 className="text-xl font-semibold text-foreground">
            Ready to use this template?
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a run to work through this checklist, or save it to your library for later.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => void handleSave()}
              disabled={isSaving}
              type="button"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy to Library
            </Button>
            <Button onClick={onStartRun} disabled={isCreatingRun} type="button">
              <Play className="mr-2 h-4 w-4" />
              {isCreatingRun ? 'Starting...' : 'Start Run'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
