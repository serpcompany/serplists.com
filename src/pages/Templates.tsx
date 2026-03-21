import React, { useState } from "react";
import { TemplateBackup } from "@/components/TemplateBackup";
import { useNavigate } from "react-router-dom";
import { RunNameDialog } from "@/components/ui/run-name-dialog";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { UserTemplatesSection } from "@/components/templates/UserTemplatesSection";
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
  const handleViewTemplate = (id: string) => {
    navigate(`/templates/${id}`);
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
        <UserTemplatesSection
          title="My Templates"
          description="Manage your personal checklist templates"
          templates={userTemplates}
          loading={templatesLoading}
          onCreateTemplate={handleCreateTemplate}
          onBrowsePublicTemplates={handleBrowsePublicTemplates}
          onViewTemplate={handleViewTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onStartRun={handleStartRun}
        />

        <TemplateBackup className="mt-8" />
      </div>

      <RunNameDialog open={dialogOpen} onOpenChange={setDialogOpen} templateTitle={selectedTemplate?.title || ""} onConfirm={handleConfirmRun} loading={isCreatingRun} />
    </div>;
};
export default Templates;
