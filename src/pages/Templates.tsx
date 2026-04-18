import { useMemo, useState } from 'react';
import {
  Grid3X3,
  List,
  PlusCircle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDashboardTemplatesModel } from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { TemplateCard } from '@/components/dashboard/TemplateCard';

const Templates = () => {
  const model = useDashboardTemplatesModel();
  const [runName, setRunName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('most-recent');

  const defaultRunName = model.selectedTemplate
    ? `${model.selectedTemplate.title} - ${new Date().toLocaleString()}`
    : '';

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const nextTemplates = normalizedQuery
      ? model.templates.filter((template) =>
          [template.title, template.description, ...(template.categories ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : model.templates.slice();

    if (sortOrder === 'a-z') {
      nextTemplates.sort((left, right) => left.title.localeCompare(right.title));
    }

    return nextTemplates;
  }, [model.templates, searchQuery, sortOrder]);

  const handleRunDialogChange = (open: boolean) => {
    if (open) {
      return;
    }

    setRunName('');
    model.closeRunLauncher();
  };

  const handleRunSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await model.createRunFromTemplate(runName.trim() || undefined);

    if (result.kind === 'error') {
      toast.error(result.message);
      return;
    }

    setRunName('');
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await model.removeTemplate(templateId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete template.',
      );
    }
  };

  return (
    <div className="min-h-full">
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold text-foreground">
              My Templates
            </h1>
            <p className="text-muted-foreground">
              {filteredTemplates.length} templates in your library
            </p>
          </div>
          <Button
            type="button"
            onClick={model.openCreateTemplate}
            className="rounded-md"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>
      </div>

      <div className="space-y-6 px-6 py-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search templates..."
              className="h-10 rounded-md border-border bg-card pl-11"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 justify-between rounded-md border-border bg-card xl:w-[130px]"
          >
            All
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setSortOrder((current) =>
                current === 'most-recent' ? 'a-z' : 'most-recent',
              )
            }
            className="h-10 justify-between rounded-md border-border bg-card xl:w-[150px]"
          >
            {sortOrder === 'most-recent' ? 'Most Recent' : 'A-Z'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" className="rounded-md border-border bg-card">
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="rounded-md border-border bg-card">
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {model.loading ? (
          <div className="text-sm text-muted-foreground">Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-6 py-10 text-sm text-muted-foreground">
            No templates matched this view.
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                onDelete={() => void handleDeleteTemplate(template.id)}
                onStartRun={model.openRunLauncher}
                template={template}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={model.runLauncherOpen} onOpenChange={handleRunDialogChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Start Run</DialogTitle>
            <DialogDescription>
              Pick one of your templates and launch a new run.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRunSubmit} className="space-y-6">
            <div className="space-y-2">
              <Select
                value={model.selectedTemplateId}
                onValueChange={model.selectRunTemplate}
              >
                <SelectTrigger id="run-template" className="rounded-md">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {model.templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Input
                id="run-name"
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
                placeholder={defaultRunName}
                className="rounded-md"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleRunDialogChange(false)}
                disabled={model.isCreatingRun}
                className="rounded-md"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!model.selectedTemplateId || model.isCreatingRun}
                className="rounded-md"
              >
                {model.isCreatingRun ? 'Creating...' : 'Start Run'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Templates;
