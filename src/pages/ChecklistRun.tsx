
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTemplates, ChecklistRun as RunType, ChecklistSection, ChecklistItem } from "@/contexts/TemplatesContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle, Loader2, ChevronDown, ChevronUp, FileText, Image, Video, File, Code, ListCheck, Edit2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";

const ChecklistRunPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getRun, updateRun } = useTemplates();
  const [run, setRun] = useState<RunType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (id) {
      const foundRun = getRun(id);
      if (foundRun) {
        setRun(foundRun);
        // Auto-select the first incomplete item
        if (!selectedItemId) {
          for (const section of foundRun.sections) {
            for (const item of section.items) {
              if (!item.isCompleted) {
                setSelectedItemId(item.id);
                return;
              }
            }
          }
          // If all items are complete, select the first item
          if (foundRun.sections[0]?.items[0]) {
            setSelectedItemId(foundRun.sections[0].items[0].id);
          }
        }
      } else {
        // Give it a moment for the query to refresh after creation
        setTimeout(() => {
          const retryRun = getRun(id);
          if (retryRun) {
            setRun(retryRun);
          } else {
            toast.error("Run not found");
            navigate("/dashboard");
          }
        }, 1000);
      }
    }
    setIsLoading(false);
  }, [id, getRun, navigate, selectedItemId]);

  const handleItemToggle = (sectionIndex: number, itemIndex: number) => {
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
    
    updateRun(updatedRun);
    setRun(updatedRun);
    
    // If this was the last item, check if run is now complete
    const allCompleted = updatedRun.sections.every(section =>
      section.items.every(item => item.isCompleted)
    );
    
    if (allCompleted && updatedRun.status !== "completed") {
      setIsCompleteDialogOpen(true);
    }
  };

  const handleSubItemToggle = (sectionIndex: number, itemIndex: number, contentIndex: number, subItemIndex: number) => {
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
      
      updateRun(updatedRun);
      setRun(updatedRun);
      
      // Check if the entire run is now complete
      const allCompleted = updatedRun.sections.every(section =>
        section.items.every(item => item.isCompleted)
      );
      
      if (allCompleted && updatedRun.status !== "completed") {
        setIsCompleteDialogOpen(true);
      }
    }
  };

  const toggleItemExpand = (itemId: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleTitleEdit = () => {
    if (!run) return;
    setEditTitle(run.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
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

  const renderVideoEmbed = (url: string) => {
    // Simple YouTube embed
    if (url.includes("youtube.com/") || url.includes("youtu.be/")) {
      let videoId: string | null = null;
      
      if (url.includes("youtube.com/watch")) {
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get("v");
      } else if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1].split("?")[0];
      }
      
      if (videoId) {
        return (
          <div className="relative overflow-hidden pt-[56.25%]">
            <iframe
              className="absolute left-0 top-0 h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title="YouTube video player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
    }
    
    // Vimeo embed
    if (url.includes("vimeo.com/")) {
      const vimeoId = url.split("vimeo.com/")[1].split("?")[0];
      return (
        <div className="relative overflow-hidden pt-[56.25%]">
          <iframe
            className="absolute left-0 top-0 h-full w-full"
            src={`https://player.vimeo.com/video/${vimeoId}`}
            title="Vimeo video player"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    
    // Fallback to just show the URL
    return (
      <div className="rounded-md border bg-gray-50 p-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
          {url}
        </a>
      </div>
    );
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
        <Button className="mt-4" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
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
                <div className="flex items-center gap-2 group">
                  <h1 className="text-2xl font-bold cursor-pointer" onClick={handleTitleEdit}>
                    {run.title}
                  </h1>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleTitleEdit}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
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
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
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
                        </button>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-2">
            {selectedData ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedData.item.isCompleted}
                        onCheckedChange={() => {
                          const { sectionIndex, itemIndex } = getItemPosition(selectedData.item.id);
                          handleItemToggle(sectionIndex, itemIndex);
                        }}
                      />
                      <div>
                        <CardTitle className={selectedData.item.isCompleted ? "line-through text-muted-foreground" : ""}>
                          {selectedData.item.title}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          From section: {selectedData.section.title}
                        </p>
                      </div>
                    </div>
                  </div>
                  {selectedData.item.description && (
                    <p className={`text-muted-foreground ${selectedData.item.isCompleted ? "text-muted-foreground/60" : ""}`}>
                      {selectedData.item.description}
                    </p>
                  )}
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {selectedData.item.contents && selectedData.item.contents.length > 0 ? (
                    selectedData.item.contents.map((content, contentIndex: number) => (
                      <div key={contentIndex} className="space-y-3">
                        {content.type === "text" && content.value && (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{content.value}</ReactMarkdown>
                          </div>
                        )}
                        
                        {content.type === "image" && content.value && (
                          <div className="rounded-lg border overflow-hidden">
                            <img 
                              src={content.value} 
                              alt="Task content" 
                              className="w-full max-h-96 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://placehold.co/400x200?text=Invalid+Image";
                              }}
                            />
                          </div>
                        )}
                        
                        {content.type === "video" && content.value && (
                          <div className="rounded-lg border overflow-hidden">
                            {renderVideoEmbed(content.value)}
                          </div>
                        )}
                        
                        {content.type === "file" && content.value && (
                          <div className="border rounded-lg p-4">
                            <div className="flex items-center gap-3">
                              <File className="h-8 w-8 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{content.fileName || "File"}</p>
                                <a 
                                  href={content.value} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-sm text-primary hover:underline"
                                >
                                  Download File
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {content.type === "embed" && content.value && (
                          <div className="border rounded-lg p-4 bg-muted/20">
                            {content.value.startsWith('http') ? (
                              <a 
                                href={content.value} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-primary hover:underline"
                              >
                                <Code className="h-4 w-4" />
                                Open Embedded Content
                              </a>
                            ) : (
                              <div dangerouslySetInnerHTML={{ __html: content.value }} />
                            )}
                          </div>
                        )}
                        
                        {content.type === "subItems" && content.subItems && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <ListCheck className="h-5 w-5 text-muted-foreground" />
                              <h4 className="font-medium">Sub-tasks</h4>
                            </div>
                            <div className="space-y-2 pl-7">
                              {content.subItems.map((subItem: { id: string; isCompleted?: boolean; title: string }, subItemIndex: number) => {
                                const { sectionIndex, itemIndex } = getItemPosition(selectedData.item.id);
                                return (
                                  <div key={subItem.id} className="flex items-center gap-3">
                                    <Checkbox
                                      checked={subItem.isCompleted}
                                      onCheckedChange={() => handleSubItemToggle(
                                        sectionIndex,
                                        itemIndex,
                                        contentIndex,
                                        subItemIndex
                                      )}
                                    />
                                    <span className={subItem.isCompleted ? "line-through text-muted-foreground" : ""}>
                                      {subItem.title}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No additional content for this task</p>
                    </div>
                  )}
                 </CardContent>
                 <div className="p-4 border-t flex justify-end">
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
                 </div>
               </Card>
             ) : (
               <Card>
                 <CardContent className="py-16 text-center">
                   <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                   <p className="text-muted-foreground">Select a task from the sidebar to view details</p>
                 </CardContent>
               </Card>
             )}
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
            <Button onClick={() => {
              if (run) {
                const completedRun = { 
                  ...run, 
                  status: "completed" as const, 
                  completedAt: new Date().toISOString(),
                  progress: 100
                };
                updateRun(completedRun);
                setRun(completedRun);
                toast.success("Checklist completed! 🎉");
              }
              setIsCompleteDialogOpen(false);
              navigate("/dashboard");
            }}>
              <Check className="mr-2 h-4 w-4" />
              Return to Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChecklistRunPage;
