import React, { useState } from "react";
import { TemplateBackup } from "@/components/TemplateBackup";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RunNameDialog } from "@/components/ui/run-name-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
const Templates = () => {
  const {
    templates,
    templatesLoading,
    createRun,
    deleteTemplate
  } = useTemplates();
  const {
    user,
    isAuthenticated
  } = useAuth();
  
  // Filter templates to only show user's own templates
  const userTemplates = templates.filter(t => t.userId === user?.id);
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<unknown>(null);
  const [isCreatingRun, setIsCreatingRun] = useState(false);
  const handleCreateTemplate = () => {
    navigate("/templates/new");
  };
  const handleBrowsePublicTemplates = () => {
    navigate("/checklists");
  };
  const handleEditTemplate = (id: string) => {
    navigate(`/templates/${id}/edit`);
  };
  const handleStartRun = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplateId(templateId);
      setSelectedTemplate(template);
      setDialogOpen(true);
    }
  };
  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await deleteTemplate(templateId);
      toast.success('Template deleted successfully');
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    }
  };
  const handleConfirmRun = async (runName: string) => {
    console.log('handleConfirmRun called with runName:', runName, 'templateId:', selectedTemplateId);
    console.log('Current user:', user);
    console.log('User authenticated:', isAuthenticated);
    setIsCreatingRun(true);
    try {
      const newRun = await createRun({
        templateId: selectedTemplateId,
        runName
      });
      console.log('Run created successfully:', newRun);
      if (newRun) {
        setDialogOpen(false);
        navigate(`/run/${newRun.id}`);
      }
    } catch (error) {
      console.error('Failed to create run:', error);
      toast.error('Failed to create checklist run. Please try again.');
    } finally {
      setIsCreatingRun(false);
    }
  };
  return <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Templates</h1>
            <p className="text-muted-foreground">Manage your personal checklist templates</p>
          </div>
          <Button onClick={handleCreateTemplate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>

      <div className="space-y-2">
        {templatesLoading ? (
          <Card className="p-8">
            <CardContent>
              <LoadingSpinner message="Loading templates..." />
            </CardContent>
          </Card>
        ) : userTemplates.length === 0 ? (
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-muted-foreground mb-4">You haven't created any templates yet.</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={handleCreateTemplate}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Your First Template
                </Button>
                <Button variant="outline" onClick={handleBrowsePublicTemplates}>
                  Browse Public Templates
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          userTemplates.map((template: { id: unknown; title: unknown; description: unknown; userId: unknown; ownerProfile: unknown }) => <Card key={template.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <button onClick={() => navigate(`/templates/${template.id}/edit`)} className="text-left hover:text-primary transition-colors cursor-pointer">
                        <h3 className="font-semibold text-lg line-clamp-1">{template.title}</h3>
                      </button>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                        {template.description || "No description provided"}
                      </p>
                      {/* Show owner info for templates not owned by current user */}
                      {user?.id !== template.userId && template.ownerProfile && <p className="text-xs text-muted-foreground mt-1">
                          Created by {template.ownerProfile.full_name || template.ownerProfile.username || 'Unknown User'}
                        </p>}
                    </div>
                    
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template.id)}>
                    Edit
                  </Button>
                  {/* Only show delete button for templates owned by current user */}
                  {user?.id === template.userId && <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{template.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}
                  
                  <Button size="sm" onClick={() => handleStartRun(template.id)}>Start</Button>
                </div>
              </div>
            </CardContent>
          </Card>)
        )}
      </div>

        <TemplateBackup className="mt-8" />
      </div>

      <RunNameDialog open={dialogOpen} onOpenChange={setDialogOpen} templateTitle={selectedTemplate?.title || ""} onConfirm={handleConfirmRun} loading={isCreatingRun} />
    </div>;
};
export default Templates;
