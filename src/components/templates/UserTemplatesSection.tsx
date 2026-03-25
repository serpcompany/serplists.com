import { PlusCircle, Play, Trash2 } from 'lucide-react';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ChecklistTemplate } from '@/types/checklist';

type HeadingLevel = 'h1' | 'h2';

type Props = {
  title: string;
  description?: string;
  headingLevel?: HeadingLevel;
  templates: ChecklistTemplate[];
  loading?: boolean;
  maxItems?: number;
  createLabel?: string;
  onCreateTemplate?: () => void;
  onBrowsePublicTemplates?: () => void;
  onViewTemplate?: (id: string) => void;
  onEditTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  onStartRun?: (templateId: string) => void;
  emptyStateLabel?: string;
};

const countTemplateItems = (template: ChecklistTemplate) =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

export function UserTemplatesSection(props: Props) {
  const templates = props.maxItems
    ? props.templates.slice(0, props.maxItems)
    : props.templates;
  const headingLevel = props.headingLevel ?? 'h1';

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {headingLevel === 'h2' ? (
            <h2 className="text-2xl font-semibold text-foreground">
              {props.title}
            </h2>
          ) : (
            <h1 className="text-4xl font-semibold text-foreground">
              {props.title}
            </h1>
          )}
          {props.description ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {props.description}
            </p>
          ) : null}
        </div>

        {props.onCreateTemplate ? (
          <Button onClick={props.onCreateTemplate} className="rounded-xl">
            <PlusCircle className="mr-2 h-4 w-4" />
            {props.createLabel ?? 'New template'}
          </Button>
        ) : null}
      </div>

      {props.loading ? (
        <Card className="console-card">
          <CardContent>
            <LoadingSpinner message="Loading templates..." />
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card className="console-card">
          <CardContent className="py-14 text-center">
            <p className="text-lg font-medium text-foreground">
              {props.emptyStateLabel ??
                'You have not created any templates yet.'}
            </p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Start a new internal template or open the public library and clone
              an existing pack.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              {props.onCreateTemplate ? (
                <Button onClick={props.onCreateTemplate} className="rounded-xl">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create your first template
                </Button>
              ) : null}
              {props.onBrowsePublicTemplates ? (
                <Button
                  variant="outline"
                  onClick={props.onBrowsePublicTemplates}
                  className="rounded-2xl"
                >
                  Browse public templates
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="docs-panel overflow-hidden">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border-b border-border/70 last:border-b-0"
            >
              <div className="flex flex-col gap-6 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-foreground">
                      Internal template
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {template.type || 'checklist'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          props.onViewTemplate?.(template.id) ??
                          props.onEditTemplate?.(template.id)
                        }
                        className="text-left text-2xl font-semibold text-foreground transition hover:text-foreground/80"
                      >
                        {template.title}
                      </button>
                      <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                        {template.description || 'No description provided yet.'}
                      </p>
                    </div>

                    <div className="grid shrink-0 gap-3 sm:grid-cols-3">
                      {[
                        { label: 'Sections', value: template.sections.length },
                        { label: 'Items', value: countTemplateItems(template) },
                        {
                          label: 'Categories',
                          value: template.categories?.length ?? 0,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-border/80 bg-muted/25 px-4 py-3 text-center"
                        >
                          <div className="text-lg font-semibold text-foreground">
                            {item.value}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                            {item.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {props.onStartRun ? (
                    <Button
                      type="button"
                      onClick={() => props.onStartRun?.(template.id)}
                      className="rounded-xl"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Run
                    </Button>
                  ) : null}

                  {props.onEditTemplate ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onEditTemplate?.(template.id)}
                      className="rounded-2xl"
                    >
                      Edit
                    </Button>
                  ) : null}

                  {props.onViewTemplate ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => props.onViewTemplate?.(template.id)}
                      className="rounded-2xl"
                    >
                      View
                    </Button>
                  ) : null}

                  {props.onDeleteTemplate ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete template</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{template.title}"?
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              props.onDeleteTemplate?.(template.id)
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
