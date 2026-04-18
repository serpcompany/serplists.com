import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Copy,
  Edit2,
  Loader2,
  MoreHorizontal,
  Share2,
} from 'lucide-react';

import { PageContainer } from '@/components/layout/page-shell';
import { SEOHead } from '@/components/shared/SEOHead';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RunProgressSidebar } from '@/components/run-execution/RunProgressSidebar';
import { TaskExecutionPanel } from '@/components/run-execution/TaskExecutionPanel';
import { useTemplates } from '@/contexts/TemplatesContext';
import { V0_DEMO_RUN_IDS, buildV0DemoRun } from '@/features/parity/v0DemoFixtures';
import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';
import { cn } from '@/lib/utils';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const navigate = useNavigate();
  const { getRun, updateRun } = useTemplates();
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  const {
    counts,
    createShare,
    isSharedRun,
    loadError,
    loading,
    notFound,
    progress,
    run,
    saveTitle,
    selectedData,
    selectedItemId,
    setSelectedItemId,
    completeRun,
    toggleItem,
    toggleSubItem,
  } = useRunExecutionModel({
    getCachedRun: getRun,
    runId: id,
    shareToken,
    updateRun,
  });
  const isV0DemoRun = Boolean(id && V0_DEMO_RUN_IDS.has(id));
  const demoRun = isV0DemoRun ? buildV0DemoRun() : null;
  const displayRun = run ?? demoRun;
  const displayProgress = displayRun?.progress ?? progress;

  useEffect(() => {
    if (isV0DemoRun || !notFound || loading) {
      return;
    }

    toast.error('Run not found');
    navigate(
      isSharedRun ? buildPublicTemplatesPath() : buildConsoleHomePath(),
      { replace: true },
    );
  }, [isSharedRun, isV0DemoRun, loading, navigate, notFound]);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    toast.error(loadError);
  }, [loadError]);

  const handleBack = () =>
    navigate(isSharedRun ? buildPublicTemplatesPath() : buildConsoleRunsPath());

  const handleItemToggle = async (itemId: string) => {
    const result = await toggleItem(itemId);

    if (result.kind === 'ok') {
      if (result.shouldPromptComplete) {
        setIsCompleteDialogOpen(true);
      }
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save your progress. Please try again.');
    }
  };

  const handleSubItemToggle = async (
    itemId: string,
    contentIndex: number,
    subItemIndex: number,
  ) => {
    const result = await toggleSubItem(itemId, contentIndex, subItemIndex);

    if (result.kind === 'ok') {
      if (result.shouldPromptComplete) {
        setIsCompleteDialogOpen(true);
      }
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save your progress. Please try again.');
    }
  };

  const handleTitleEdit = () => {
    if (isSharedRun || !displayRun) {
      return;
    }

    setEditTitle(displayRun.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    if (isSharedRun || !run) {
      return;
    }

    const result = await saveTitle(editTitle);

    if (result.kind === 'ok') {
      setIsEditingTitle(false);
      setEditTitle('');
      toast.success('Run title updated');
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message);
    }
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditTitle('');
  };

  const handleCreateShare = async () => {
    if (!displayRun) {
      return;
    }

    setIsCreatingShare(true);

    try {
      const result = await createShare();

      if (result.kind === 'ok' && result.shareUrl) {
        await navigator.clipboard.writeText(result.shareUrl);
        toast.success('Share link copied to clipboard');
        return;
      }

      if (result.kind === 'error') {
        toast.error(result.message || 'Failed to create share link for this run.');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create share link for this run.';
      toast.error(message);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyCurrentLink = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard');
  };

  const handleCompleteRun = async () => {
    const result = await completeRun();

    if (result.kind === 'ok') {
      setIsCompleteDialogOpen(false);
      toast.success('Checklist completed! 🎉');
      handleBack();
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message || 'Unable to save completion. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!displayRun) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {loadError ? 'Unable to load run' : 'Run not found'}
        </h2>
        {loadError ? (
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        ) : null}
        <Button className="mt-4" onClick={handleBack}>
          Back
        </Button>
      </div>
    );
  }

  const activeItemId = selectedItemId ?? displayRun.sections[0]?.items[0]?.id ?? null;
  const flatItems = displayRun.sections.flatMap((section) =>
    section.items.map((item, itemIndex) => ({
      item,
      itemIndex,
      section,
      totalItemsInSection: section.items.length,
    })),
  );
  const selectedIndex = flatItems.findIndex(
    (entry) => entry.item.id === activeItemId,
  );
  const selectedEntry = selectedIndex >= 0 ? flatItems[selectedIndex] : null;
  const previousEntry = selectedIndex > 0 ? flatItems[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < flatItems.length - 1
      ? flatItems[selectedIndex + 1]
      : null;

  const sectionProgress = displayRun.sections.map((section, index) => {
    const completed = section.items.filter((item) => item.isCompleted).length;
    return {
      completed,
      index,
      total: section.items.length,
      section,
    };
  });

  return (
    <div className="min-h-screen bg-background">
      {isSharedRun ? (
        <SEOHead
          title={displayRun.title}
          description={`Shared checklist run for ${displayRun.title}`}
          keywords={['shared checklist', 'checklist run']}
          robots="noindex, nofollow"
        />
      ) : null}

      {isSharedRun ? (
        <>
          <div className="border-b border-border">
            <PageContainer
              className="flex items-center justify-between gap-4 py-3"
              width="shell"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold text-foreground">
                    {displayRun.title}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Shared checklist run
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void handleCopyCurrentLink()}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
            </PageContainer>
          </div>

          <PageContainer className="py-6" width="shell">
            <div className="mb-8 space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{progress}% Complete</span>
                <span>
                  {counts.completed} of {counts.total} tasks
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-6">
              {sectionProgress.map(({ completed, section, total }) => (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="flex items-center justify-between border-b border-border px-6 py-6">
                    <h2 className="text-3xl font-semibold text-foreground">
                      {section.title}
                    </h2>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                      {completed === total ? 'Complete' : `${completed}/${total}`}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border bg-background"
                      >
                        <div className="flex items-start gap-4 px-4 py-4">
                          <Checkbox
                            checked={item.isCompleted}
                            onCheckedChange={() => void handleItemToggle(item.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <h3
                              className={cn(
                                'text-2xl font-medium text-foreground',
                                item.isCompleted &&
                                  'line-through text-muted-foreground',
                              )}
                            >
                              {item.title}
                            </h3>
                            {item.description ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                {item.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {item.contents && item.contents.length > 0 ? (
                          <div className="border-t border-border px-4 py-4">
                            <ContentRenderer
                              contents={item.contents}
                              disabled={false}
                              onSubItemToggle={(contentIndex, subItemIndex) =>
                                void handleSubItemToggle(
                                  item.id,
                                  contentIndex,
                                  subItemIndex,
                                )
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
                <h3 className="text-3xl font-semibold text-foreground">
                  Want to use this checklist?
                </h3>
                <p className="mt-4 text-base text-muted-foreground">
                  Create your own copy and track your progress independently.
                </p>
                <Button className="mt-6">Create Your Own Copy</Button>
              </section>
            </div>
          </PageContainer>
        </>
      ) : (
        <PageContainer className="py-0" width="shell">
          <div className="sticky top-0 z-20 -mx-4 mb-0 flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  {isEditingTitle ? (
                    <Input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handleTitleSave();
                        }
                        if (event.key === 'Escape') {
                          handleTitleCancel();
                        }
                      }}
                      className="h-auto max-w-md border-none bg-transparent p-0 text-2xl font-bold focus-visible:ring-0"
                      autoFocus
                    />
                  ) : (
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-bold">{displayRun.title}</h1>
                      {displayRun.templateOwner?.username ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          by @{displayRun.templateOwner.username}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {!isEditingTitle ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={handleTitleEdit}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant={displayRun.status === 'completed' ? 'success' : 'secondary'}
                  >
                    {displayRun.status === 'completed' ? 'Completed' : 'In Progress'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-[120px]">
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-success transition-all duration-300"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
                <div className="text-right text-sm font-medium">{displayProgress}%</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isCreatingShare}
                onClick={() => void handleCreateShare()}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {isCreatingShare ? 'Creating link...' : 'Share'}
              </Button>
              <Button variant="ghost" size="icon" aria-label="More options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 gap-0 xl:grid-cols-[320px_minmax(0,1fr)]">
            <RunProgressSidebar
              sections={displayRun.sections}
              currentSectionId={selectedEntry?.section.id ?? selectedData?.section.id ?? null}
              currentTaskId={activeItemId}
              onSelectTask={(_, taskId) => setSelectedItemId(taskId)}
            />

            <main className="min-h-full min-w-0">
              {selectedEntry ? (
                <TaskExecutionPanel
                  section={selectedEntry.section}
                  task={selectedEntry.item}
                  taskIndex={selectedEntry.itemIndex}
                  totalTasks={selectedEntry.totalItemsInSection}
                  onNavigateNext={() => {
                    if (nextEntry) {
                      setSelectedItemId(nextEntry.item.id);
                    }
                  }}
                  onNavigatePrev={() => {
                    if (previousEntry) {
                      setSelectedItemId(previousEntry.item.id);
                    }
                  }}
                  onToggleSubItem={(contentIndex, subItemIndex) =>
                    void handleSubItemToggle(
                      selectedEntry.item.id,
                      contentIndex,
                      subItemIndex,
                    )
                  }
                  onToggleTask={() => void handleItemToggle(selectedEntry.item.id)}
                  hasNext={Boolean(nextEntry)}
                  hasPrev={Boolean(previousEntry)}
                />
              ) : (
                <div className="py-16 text-center text-muted-foreground">
                  Select a task to continue.
                </div>
              )}
            </main>
          </div>
        </PageContainer>
      )}

      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checklist Completed!</DialogTitle>
            <DialogDescription>
              Congratulations! You have completed all items in this checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCompleteRun()}>
              <Check className="mr-2 h-4 w-4" />
              {isSharedRun ? 'Return to Public Runs' : 'Return to Dashboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistRunPage;
