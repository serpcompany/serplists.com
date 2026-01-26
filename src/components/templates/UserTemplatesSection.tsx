import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { PlusCircle, Trash2 } from "lucide-react";
import type { ChecklistTemplate } from "@/types/checklist";

type HeadingLevel = "h1" | "h2";

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
  onEditTemplate?: (id: string) => void;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  onStartRun?: (templateId: string) => void;
  emptyStateLabel?: string;
};

export function UserTemplatesSection(props: Props) {
  const templates = props.maxItems ? props.templates.slice(0, props.maxItems) : props.templates;
  const headingLevel = props.headingLevel ?? "h1";

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          {headingLevel === "h2" ? (
            <h2 className="text-xl font-semibold">{props.title}</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{props.title}</h1>
          )}
          {props.description ? <p className="text-muted-foreground">{props.description}</p> : null}
        </div>

        {props.onCreateTemplate ? (
          <Button onClick={props.onCreateTemplate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {props.createLabel ?? "New Template"}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {props.loading ? (
          <Card className="p-8">
            <CardContent>
              <LoadingSpinner message="Loading templates..." />
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card className="p-8 text-center">
            <CardContent>
              <p className="mb-4 text-muted-foreground">{props.emptyStateLabel ?? "You haven't created any templates yet."}</p>
              <div className="flex justify-center gap-2">
                {props.onCreateTemplate ? (
                  <Button onClick={props.onCreateTemplate}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Your First Template
                  </Button>
                ) : null}
                {props.onBrowsePublicTemplates ? (
                  <Button variant="outline" onClick={props.onBrowsePublicTemplates}>
                    Browse Public Templates
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        {props.onEditTemplate ? (
                          <button
                            onClick={() => props.onEditTemplate?.(template.id)}
                            className="cursor-pointer text-left transition-colors hover:text-primary"
                          >
                            <h3 className="line-clamp-1 text-lg font-semibold">{template.title}</h3>
                          </button>
                        ) : (
                          <h3 className="line-clamp-1 text-lg font-semibold">{template.title}</h3>
                        )}

                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {template.description || "No description provided"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 flex items-center gap-2">
                    {props.onEditTemplate ? (
                      <Button variant="outline" size="sm" onClick={() => props.onEditTemplate?.(template.id)}>
                        Edit
                      </Button>
                    ) : null}

                    {props.onDeleteTemplate ? (
                      <AlertDialog>
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
                            <AlertDialogAction onClick={() => props.onDeleteTemplate?.(template.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}

                    {props.onStartRun ? (
                      <Button size="sm" onClick={() => props.onStartRun?.(template.id)}>
                        Start
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
