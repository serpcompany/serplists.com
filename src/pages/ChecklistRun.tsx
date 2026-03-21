
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTemplates, ChecklistRun as RunType } from "@/contexts/TemplatesContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle, Edit2, Loader2, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { calculateSectionsProgress, isSectionsShape, normalizeSections } from "@/lib/utils/checklistSections";
import { ChecklistContent } from "@/components/checklist/ChecklistContent";

const ChecklistRunPage = () => {
  const { id, shareToken } = useParams<{ id?: string; shareToken?: string }>();
  const isSharedRun = Boolean(shareToken);
  const navigate = useNavigate();
  const { getRun, updateRun } = useTemplates();
  const [run, setRun] = useState<RunType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  const mapChecklistToRun = (checklist: Record<string, unknown>, fallbackId: string): RunType => {
    const rawItemsValue = checklist.items;
    const rawItems = typeof rawItemsValue === 'string'
      ? JSON.parse(rawItemsValue)
      : (rawItemsValue || []);

    const rawSections = isSectionsShape(rawItems)
      ? rawItems
      : [{ id: '1', title: 'Checklist', items: rawItems }];

    const sections = normalizeSections(rawSections);
    const computedProgress = calculateSectionsProgress(sections);

    return {
      id: typeof checklist.id === 'string' ? checklist.id : fallbackId,
      templateId: typeof checklist.template_id === 'string' ? checklist.template_id : '',
      title: typeof checklist.title === 'string' ? checklist.title : 'Checklist Run',
      status: (typeof checklist.status === 'string' ? checklist.status : 'in_progress') as "in_progress" | "completed",
      progress: computedProgress,
      sections,
      startedAt:
        (typeof checklist.started_at === 'string' && checklist.started_at)
          ? checklist.started_at
          : (typeof checklist.created_at === 'string' ? checklist.created_at : new Date().toISOString()),
      completedAt: typeof checklist.completed_at === 'string' ? checklist.completed_at : undefined,
      userId: typeof checklist.user_id === 'string' ? checklist.user_id : '',
      templateVersion: typeof checklist.template_version === 'number' ? checklist.template_version : 1,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const activeRunId = id ?? shareToken;
      if (!activeRunId) return;

      setIsLoading(true);
      setRun(null);

      const foundRun = id ? getRun(id) : null;
      if (foundRun) {
        setRun(foundRun);
        setIsLoading(false);
        return;
      }

      try {
        const checklist = isSharedRun
          ? (await api.getSharedChecklist(shareToken)) as Record<string, unknown>
          : (await api.getChecklistById(activeRunId)) as Record<string, unknown>;
        if (cancelled) return;

        setRun(mapChecklistToRun(checklist, activeRunId));
      } catch (error) {
        if (cancelled) return;
        toast.error("Run not found");
        if (isSharedRun) {
          navigate("/checklists");
        } else {
          navigate("/dashboard");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, shareToken, isSharedRun, getRun, navigate]);

  useEffect(() => {
    if (!run || selectedItemId) return;

    for (const section of run.sections) {
      for (const item of section.items) {
        if (!item.isCompleted) {
          setSelectedItemId(item.id);
          return;
        }
      }
    }

    if (run.sections[0]?.items[0]) {
      setSelectedItemId(run.sections[0].items[0].id);
    }
  }, [run, selectedItemId]);

  const persistRun = async (updatedRun: RunType) => {
    const progress = calculateSectionsProgress(updatedRun.sections);
    if (isSharedRun) {
      if (!shareToken) throw new Error("Share token is required");
      await api.updateSharedChecklist(shareToken, {
        sections: updatedRun.sections,
        status: updatedRun.status,
        progress,
        completed_at: updatedRun.completedAt,
      });
      return;
    }

    updateRun({
      ...updatedRun,
      progress,
    });
  };

  const handleItemToggle = async (sectionIndex: number, itemIndex: number) => {
    if (!run) return;
    
    const updatedRun = { ...run };
    const isCompleted = !updatedRun.sections[sectionIndex].items[itemIndex].isCompleted;
    updatedRun.sections[sectionIndex].items[itemIndex].isCompleted = isCompleted;
    
    // Also toggle all sub-items if present
    const item = updatedRun.sections[sectionIndex].items[itemIndex];
    if (item.contents) {
      item.contents.forEach(content => {
        if (content.type === "subItems" && content.subItems) {
          content.subItems.forEach(subItem => {
            subItem.isCompleted = isCompleted;
          });
        }
      });
    }

    try {
      await persistRun(updatedRun);
      setRun(updatedRun);
    } catch (error) {
      console.error("Failed to update run:", error);
      toast.error("Unable to save your progress. Please try again.");
    }
    
    // If this was the last item, check if run is now complete
    const allCompleted = updatedRun.sections.every(section =>
      section.items.every(item => item.isCompleted)
    );
    
    if (allCompleted && updatedRun.status !== "completed") {
      setIsCompleteDialogOpen(true);
    }
  };

  const handleSubItemToggle = async (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number) => {
    if (!run) return;
    
    const updatedRun = { ...run };
    const item = updatedRun.sections[sectionIndex].items[itemIndex];
    
    if (
      item.contents &&
      item.contents[contentIndex]?.type === "subItems" &&
      item.contents[contentIndex].subItems
    ) {
      const subItem = item.contents[contentIndex].subItems[subItemIndex];
      subItem.isCompleted = !subItem.isCompleted;
      
      // Check if all sub-items are completed
      const allSubItemsCompleted = item.contents[contentIndex].subItems.every(si => si.isCompleted);
      
      // If all sub-items are completed and item is not yet marked as completed, update it
      if (allSubItemsCompleted && !item.isCompleted) {
        item.isCompleted = true;
      } else if (!allSubItemsCompleted && item.isCompleted) {
        // If not all sub-items are completed but item is marked as completed, update it
        item.isCompleted = false;
      }
      try {
        await persistRun(updatedRun);
        setRun(updatedRun);
      } catch (error) {
        console.error("Failed to update run:", error);
        toast.error("Unable to save your progress. Please try again.");
      }
      
      // Check if the entire run is now complete
      const allCompleted = updatedRun.sections.every(section =>
        section.items.every(item => item.isCompleted)
      );
      
      if (allCompleted && updatedRun.status !== "completed") {
        setIsCompleteDialogOpen(true);
      }
    }
  };

  const handleTitleEdit = () => {
    if (isSharedRun) return;
    if (!run) return;
    setEditTitle(run.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (isSharedRun) return;
    if (!run || !editTitle.trim()) return;
    
    const updatedRun = { ...run, title: editTitle.trim() };
    updateRun(updatedRun);
    setRun(updatedRun);
    setIsEditingTitle(false);
    toast.success("Run title updated");
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditTitle("");
  };

  const handleBack = () => navigate(isSharedRun ? "/checklists" : "/dashboard");

  const handleCreateShare = async () => {
    if (!run) return;

    setIsCreatingShare(true);
    try {
      const { shareToken } = await api.createChecklistRunShare(run.id);
      const shareUrl = `${window.location.origin}/run/shared/${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create share link for this run.";
      toast.error(message || "Failed to create share link for this run.");
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCompleteRun = async () => {
    if (!run) return;

    const completedRun = {
      ...run,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      progress: 100,
    };

    try {
      await persistRun(completedRun);
      setRun(completedRun);
      toast.success("Checklist completed! 🎉");
    } catch (error) {
      console.error("Failed to complete run:", error);
      toast.error("Unable to save completion. Please try again.");
    }

    setIsCompleteDialogOpen(false);
    handleBack();
  };

  const countCompletedItems = () => {
    if (!run) return { completed: 0, total: 0 };
    
    let completed = 0;
    let total = 0;
    
    run.sections.forEach(section => {
      section.items.forEach(item => {
        total++;
        if (item.isCompleted) {
          completed++;
        }
        // Count sub-items if they exist
        item.contents?.forEach((content) => {
          if (content.type === "subItems" && content.subItems) {
            content.subItems.forEach((subItem) => {
              total++;
              if (subItem.isCompleted) {
                completed++;
              }
            });
          }
        });
      });
    });
    
    return { completed, total };
  };

  const getSelectedItem = () => {
    if (!run || !selectedItemId) return null;
    for (const section of run.sections) {
      for (const item of section.items) {
        if (item.id === selectedItemId) {
          return { item, section };
        }
      }
    }
    return null;
  };

  const getItemPosition = (itemId: string) => {
    if (!run) return { sectionIndex: -1, itemIndex: -1 };
    for (let sectionIndex = 0; sectionIndex < run.sections.length; sectionIndex++) {
      for (let itemIndex = 0; itemIndex < run.sections[sectionIndex].items.length; itemIndex++) {
        if (run.sections[sectionIndex].items[itemIndex].id === itemId) {
          return { sectionIndex, itemIndex };
        }
      }
    }
    return { sectionIndex: -1, itemIndex: -1 };
  };

  if (isLoading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!run) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold">Run not found</h2>
        <Button className="mt-4" onClick={handleBack}>
          Back
        </Button>
      </div>
    );
  }

  const { completed, total } = countCompletedItems();
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const selectedData = getSelectedItem();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-grow flex-wrap items-center justify-between gap-4">
            <div className="flex-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleTitleSave();
                      if (e.key === "Escape") handleTitleCancel();
                    }}
                    className="text-2xl font-bold border-none p-0 h-auto bg-transparent focus-visible:ring-0"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleTitleSave}>Save</Button>
                  <Button size="sm" variant="outline" onClick={handleTitleCancel}>Cancel</Button>
                </div>
              ) : (
                <div className={`flex items-center gap-2 ${isSharedRun ? "" : "group"}`}>
                  <h1
                    className={isSharedRun ? "text-2xl font-bold" : "text-2xl font-bold cursor-pointer"}
                    onClick={handleTitleEdit}
                  >
                    {run.title}
                  </h1>
                  {!isSharedRun && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handleTitleEdit}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={run.status === "completed" ? "success" : "secondary"}>
                  {run.status === "completed" ? "Completed" : "In Progress"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{completed}/{total} items</div>
                <div className="text-lg font-medium">{progress}%</div>
              </div>
              {!isSharedRun ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isCreatingShare}
                  onClick={handleCreateShare}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  {isCreatingShare ? "Creating link..." : "Share"}
                </Button>
              ) : null}
              <Progress value={progress} className="h-2 w-32" />
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Sidebar - Task List */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4 max-h-[calc(100vh-8rem)] overflow-auto">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-0">
                {run.sections.map((section: { id: unknown; title: unknown; items: unknown }) => (
                  <div key={section.id}>
                    <div className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted/30">
                      {section.title}
                    </div>
                    {section.items.map((item: { id: unknown; isCompleted: unknown; title: unknown; contents: unknown }) => {
                      const isSelected = selectedItemId === item.id;
                      const { sectionIndex, itemIndex } = getItemPosition(item.id);
                      
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedItemId(item.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`w-full text-left px-4 py-3 border-l-2 transition-colors hover:bg-muted/50 ${
                            isSelected 
                              ? 'border-l-primary bg-muted/70 text-primary' 
                              : 'border-l-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={item.isCompleted}
                              onCheckedChange={() => handleItemToggle(sectionIndex, itemIndex)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium text-sm truncate ${
                                item.isCompleted ? "line-through text-muted-foreground" : ""
                              }`}>
                                {item.title}
                              </div>
                              {item.contents && item.contents.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {item.contents.length} content item{item.contents.length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-2">
            <ChecklistContent
              selectedData={selectedData}
              disabled={false}
              onItemToggle={(itemId) => {
                const { sectionIndex, itemIndex } = getItemPosition(itemId);
                handleItemToggle(sectionIndex, itemIndex);
              }}
              onSubItemToggle={(itemId, contentIndex, subItemIndex) => {
                const { sectionIndex, itemIndex } = getItemPosition(itemId);
                handleSubItemToggle(sectionIndex, itemIndex, contentIndex, subItemIndex);
              }}
              actions={
                selectedData ? (
                  <Button
                    size="lg"
                    variant={selectedData.item.isCompleted ? "outline" : "default"}
                    onClick={() => {
                      const { sectionIndex, itemIndex } = getItemPosition(selectedData.item.id);
                      handleItemToggle(sectionIndex, itemIndex);
                    }}
                  >
                    {selectedData.item.isCompleted ? "Mark as Incomplete" : "Mark as Complete"}
                  </Button>
                ) : null
              }
            />
          </div>
        </div>
      </div>

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
            <Button onClick={handleCompleteRun}>
              <Check className="mr-2 h-4 w-4" />
              {isSharedRun ? "Return to Public Runs" : "Return to Dashboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistRunPage;
