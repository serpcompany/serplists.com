import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, ExternalLink, MoreVertical, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePages } from "@/hooks/usePages";
import { Page } from "@/types/page";
import { MarkdownEditor } from "@/components/markdown-editor/MarkdownEditor";
import { exportPagesAsMarkdown } from "@/lib/utils/pageBackup";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useToast } from "@/hooks/use-toast";
const Pages = () => {
  const [title, setTitle] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    pages,
    isLoading,
    createPage,
    updatePage,
    deletePage
  } = usePages();
  const handleCreatePage = async () => {
    const success = await createPage(title, "");
    if (success) {
      setTitle("");
      setIsDialogOpen(false);
    }
  };
  const handleEditClick = (page: Page) => {
    setEditingPage(page);
  };
  const handleSavePage = async (pageTitle: string, content: string) => {
    if (!editingPage) return false;
    const success = await updatePage(editingPage.id, pageTitle, content);
    return success;
  };
  const handleCancelEdit = () => {
    setEditingPage(null);
  };

  const handleDeletePage = async (pageId: string) => {
    const success = await deletePage(pageId);
    if (success && editingPage?.id === pageId) {
      setEditingPage(null);
    }
  };

  const handleViewPage = (page: Page) => {
    if (page.slug) {
      window.open(`/pages/${page.slug}`, '_blank');
    } else {
      console.error('Page has no slug');
    }
  };

  const handleExportPages = async () => {
    try {
      await exportPagesAsMarkdown(pages);
      toast({
        title: "Success",
        description: `Exported ${pages.length} pages as markdown`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export pages",
        variant: "destructive"
      });
      console.error("Export error:", error);
    }
  };
  return <div className="h-screen flex">
      {/* Left Column - Pages List */}
      <div className="w-1/4 border-r flex flex-col">
        <div className="p-6 border-b">
          <h1 className="text-3xl font-bold">Pages</h1>
          <p className="text-muted-foreground">Create and manage pages and content</p>
          
          <div className="mt-6 space-y-3">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Page
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Page</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Page Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter page title" />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreatePage} disabled={!title.trim()}>
                      Create Page
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button 
              variant="outline" 
              onClick={handleExportPages}
              disabled={pages.length === 0}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Pages ({pages.length})
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? <div className="text-center py-8 text-muted-foreground">
              <p>Loading pages...</p>
            </div> : pages.length === 0 ? <div className="text-center py-8 text-muted-foreground">
              <p>No pages created yet.</p>
              <p className="text-sm mt-2">
                Create your first page to start publishing content.
              </p>
            </div> : <div className="space-y-3">
              {pages.map((page: { id: unknown; title: unknown; description: unknown; createdAt: unknown }) => <div key={page.id} className={`border rounded-lg p-4 flex justify-between items-start cursor-pointer transition-colors ${editingPage?.id === page.id ? 'bg-muted/50 border-primary' : 'hover:bg-muted/20'}`} onClick={() => handleEditClick(page)}>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{page.title}</h3>
                    {page.description && <p className="text-muted-foreground text-sm mt-1">{page.description}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      Created: {new Date(page.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleViewPage(page);
                      }}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(page);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Page</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{page.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeletePage(page.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>)}
            </div>}
        </div>
      </div>

      {/* Right Column - Markdown Editor */}
      <div className="w-3/4">
        <MarkdownEditor page={editingPage} onSave={handleSavePage} onCancel={handleCancelEdit} />
      </div>
    </div>;
};
export default Pages;