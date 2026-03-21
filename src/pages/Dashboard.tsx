import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplates, ChecklistRun } from "@/contexts/TemplatesContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, CheckCircle, ArrowRight, Trash2, Edit2, Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import { UserTemplatesSection } from "@/components/templates/UserTemplatesSection";
const Dashboard = () => {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  const {
    templates,
    templatesLoading,
    runs,
    runsLoading,
    updateRun,
    deleteRun
  } = useTemplates();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeRuns, setActiveRuns] = useState<ChecklistRun[]>([]);
  const [completedRuns, setCompletedRuns] = useState<ChecklistRun[]>([]);
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Handle checkout redirect (legacy)
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      toast.success('Checkout complete.');
      // Clear the URL parameter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    if (runs) {
      setActiveRuns(runs.filter(run => run.status === "in_progress"));
      setCompletedRuns(runs.filter(run => run.status === "completed").sort((a, b) => new Date(b.completedAt || "").getTime() - new Date(a.completedAt || "").getTime()));
    }
  }, [runs]);
  const getTemplate = (templateId: string) => {
    return templates.find((t: { id: unknown }) => t.id === templateId);
  };
  const getTemplateName = (templateId: string) => {
    const template = getTemplate(templateId);
    return template ? template.title : "Unknown Template";
  };
  const handleDeleteRun = () => {
    if (runToDelete) {
      deleteRun(runToDelete);
      setRunToDelete(null);
      setIsDeleteDialogOpen(false);
    }
  };
  const handleTitleEdit = (run: ChecklistRun) => {
    setEditingRunId(run.id);
    setEditTitle(run.title);
  };
  const handleTitleSave = (runId: string) => {
    if (!editTitle.trim()) return;
    const runToUpdate = runs.find((r: { id: unknown }) => r.id === runId);
    if (runToUpdate) {
      const updatedRun = {
        ...runToUpdate,
        title: editTitle.trim()
      };
      updateRun(updatedRun);
      toast.success("Run title updated");
    }
    setEditingRunId(null);
    setEditTitle("");
  };
  const handleTitleCancel = () => {
    setEditingRunId(null);
    setEditTitle("");
  };

  const userTemplates = templates.filter((t: { userId: unknown }) => t.userId === user?.id);
  return <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div />
          <div className="flex flex-wrap gap-2">
            <Link to="/templates/new">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </Link>
            <Link to="/templates">
              <Button variant="outline">
                <Play className="mr-2 h-4 w-4" />
                New Run
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="mb-4 text-xl font-semibold">Runs</h2>
          {runsLoading ? (
            <Card className="bg-gray-50">
              <CardContent className="py-8">
                <LoadingSpinner message="Loading runs..." />
              </CardContent>
            </Card>
          ) : activeRuns.length > 0 ? <div className="space-y-2">
              {activeRuns.map((run: { id: unknown; title: unknown; templateId: unknown; progress: unknown }) => <Card key={run.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            {editingRunId === run.id ? <div className="flex items-center gap-2">
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => {
                          if (e.key === "Enter") handleTitleSave(run.id);
                          if (e.key === "Escape") handleTitleCancel();
                        }} className="text-lg font-semibold border-none p-0 h-auto bg-transparent focus-visible:ring-0" autoFocus />
                                <Button size="sm" onClick={() => handleTitleSave(run.id)}>Save</Button>
                                <Button size="sm" variant="outline" onClick={handleTitleCancel}>Cancel</Button>
                              </div> : <div className="flex items-center gap-2 group">
                                <Link to={`/run/${run.id}`} className="text-foreground hover:text-primary transition-colors cursor-pointer">
                                  <h3 className="font-semibold text-lg line-clamp-1">{run.title}</h3>
                                </Link>
                                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleTitleEdit(run)}>
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>}
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                              From template: <Link to={`/templates/${run.templateId}`} className="text-primary hover:underline">
                                {getTemplateName(run.templateId)}
                              </Link>
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary">In Progress</Badge>
                              <span className="text-sm text-muted-foreground">{run.progress}%</span>
                            </div>
                            <Progress value={run.progress} className="h-2 mt-2" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button variant="destructive" size="sm" onClick={() => {
                    setRunToDelete(run.id);
                    setIsDeleteDialogOpen(true);
                  }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" asChild>
                          <Link to={`/run/${run.id}`}>
                            Continue <ArrowRight className="ml-1.5 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
            </div> : <Card className="bg-gray-50">
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-3">
                    <CheckCircle className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium">No active runs</h3>
                  <p className="mt-1 max-w-md text-sm text-gray-500">
                    Start a new run from one of your templates to track your progress
                  </p>
                  <Link to="/templates" className="mt-4">
                    <Button variant="outline">
                      View My Templates
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>}
        </div>

        <div>
          <h2 className="mb-4 text-xl font-semibold">Completed</h2>
          {runsLoading ? (
            <Card className="bg-gray-50">
              <CardContent className="py-8">
                <LoadingSpinner message="Loading completed runs..." />
              </CardContent>
            </Card>
          ) : completedRuns.length > 0 ? <div className="space-y-2">
              {completedRuns.slice(0, 6).map((run: { id: unknown; title: unknown; templateId: unknown; completedAt: unknown }) => <Card key={run.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            {editingRunId === run.id ? <div className="flex items-center gap-2">
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => {
                          if (e.key === "Enter") handleTitleSave(run.id);
                          if (e.key === "Escape") handleTitleCancel();
                        }} className="text-lg font-semibold border-none p-0 h-auto bg-transparent focus-visible:ring-0" autoFocus />
                                <Button size="sm" onClick={() => handleTitleSave(run.id)}>Save</Button>
                                <Button size="sm" variant="outline" onClick={handleTitleCancel}>Cancel</Button>
                              </div> : <div className="flex items-center gap-2 group">
                                <Link to={`/run/${run.id}`} className="text-foreground hover:text-primary transition-colors cursor-pointer">
                                  <h3 className="font-semibold text-lg line-clamp-1">{run.title}</h3>
                                </Link>
                                <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleTitleEdit(run)}>
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>}
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                              From template: <Link to={`/templates/${run.templateId}`} className="text-primary hover:underline">
                                {getTemplateName(run.templateId)}
                              </Link>
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="success">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {new Date(run.completedAt || "").toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button variant="destructive" size="sm" onClick={() => {
                    setRunToDelete(run.id);
                    setIsDeleteDialogOpen(true);
                  }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/run/${run.id}`}>
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
            </div> : <Card className="bg-gray-50">
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="mb-3 rounded-full bg-gray-100 p-3">
                    <CheckCircle className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium">No completed runs yet</h3>
                  <p className="mt-1 max-w-md text-sm text-gray-500">
                    Complete your active runs and they will appear here
                  </p>
                </div>
              </CardContent>
            </Card>}
        </div>

        <div className="mt-10">
          <UserTemplatesSection
            title="My Templates"
            description="Quick access to your templates"
            headingLevel="h2"
            templates={userTemplates}
            loading={templatesLoading}
            maxItems={3}
            onEditTemplate={(id) => navigate(`/templates/${id}/edit`)}
          />
          {userTemplates.length > 3 ? (
            <div className="mt-4">
              <Link to="/templates">
                <Button variant="outline">View all templates</Button>
              </Link>
            </div>
          ) : null}
        </div>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Run</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this run? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteRun}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>;
};
export default Dashboard;
