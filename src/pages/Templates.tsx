import { useState } from 'react';
import { ArrowUpRight, Layers3, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { TemplateBackup } from '@/components/TemplateBackup';
import { UserTemplatesSection } from '@/components/templates/UserTemplatesSection';
import { RunNameDialog } from '@/components/ui/run-name-dialog';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import {
  buildConsoleRunPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplatePath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

const Templates = () => {
  const { allTemplates, templatesLoading, createRun, deleteTemplate } =
    useTemplates();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<{
    title: string;
  } | null>(null);
  const [isCreatingRun, setIsCreatingRun] = useState(false);

  const userTemplates = allTemplates.filter(
    (template) => template.userId === user?.id,
  );
  const totalTemplateItems = userTemplates.reduce(
    (total, template) =>
      total +
      template.sections.reduce(
        (sectionTotal, section) => sectionTotal + section.items.length,
        0,
      ),
    0,
  );

  const handleCreateTemplate = () => {
    navigate(buildConsoleTemplateCreatePath());
  };

  const handleBrowsePublicTemplates = () => {
    navigate(buildPublicTemplatesPath());
  };

  const handleViewTemplate = (id: string) => {
    navigate(buildConsoleTemplatePath(id));
  };

  const handleStartRun = (templateId: string) => {
    const template = allTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setSelectedTemplateId(templateId);
    setSelectedTemplate({ title: template.title });
    setDialogOpen(true);
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
    setIsCreatingRun(true);
    try {
      const newRun = await createRun({
        templateId: selectedTemplateId,
        runName,
      });

      if (newRun) {
        setDialogOpen(false);
        navigate(buildConsoleRunPath(newRun.id));
      }
    } catch (error) {
      console.error('Failed to create run:', error);
      toast.error('Failed to create checklist run. Please try again.');
    } finally {
      setIsCreatingRun(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="console-card">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
            <Sparkles className="h-4 w-4" />
            Template operations
          </div>
          <h1 className="mt-6 text-4xl font-semibold text-foreground">
            Your template inventory
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Create private templates, clone public packs into your workspace,
            and launch new runs from the console.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="marketing-metric">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Templates
            </div>
            <div className="mt-4 text-3xl font-semibold text-foreground">
              {userTemplates.length}
            </div>
          </div>
          <div className="marketing-metric">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Layers3 className="h-4 w-4" />
              Documented items
            </div>
            <div className="mt-4 text-3xl font-semibold text-foreground">
              {totalTemplateItems}
            </div>
          </div>
        </div>
      </section>

      <UserTemplatesSection
        title="My Templates"
        description="Manage the template packs inside your private workspace."
        templates={userTemplates}
        loading={templatesLoading}
        onCreateTemplate={handleCreateTemplate}
        onBrowsePublicTemplates={handleBrowsePublicTemplates}
        onViewTemplate={handleViewTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onStartRun={handleStartRun}
      />

      <div className="console-card">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">
              Portable import and export
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Move template packs between environments or bootstrap your
              workspace from a known sample.
            </p>
          </div>
          <div className="hidden rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground sm:flex sm:items-center sm:gap-2">
            JSON packs
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
        <TemplateBackup />
      </div>

      <RunNameDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        templateTitle={selectedTemplate?.title || ''}
        onConfirm={handleConfirmRun}
        loading={isCreatingRun}
      />
    </div>
  );
};

export default Templates;
