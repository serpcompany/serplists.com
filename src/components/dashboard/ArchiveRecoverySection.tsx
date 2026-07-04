import type { ReactNode } from 'react';
import { ArchiveRestore, FileText, ListChecks, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

type ArchiveKind = 'template' | 'run';

type ArchiveItem = {
  id: string;
  kind: ArchiveKind;
  title: string;
  archivedAt: string;
};

function toArchiveItem(record: Record<string, unknown>, kind: ArchiveKind): ArchiveItem {
  return {
    id: String(record.id),
    kind,
    title: String(record.title || (kind === 'template' ? 'Untitled template' : 'Untitled run')),
    archivedAt: typeof record.deleted_at === 'string'
      ? record.deleted_at
      : typeof record.updated_at === 'string'
        ? record.updated_at
        : '',
  };
}

function formatArchiveDate(dateString: string): string {
  if (!dateString) return 'Unknown date';

  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type ArchiveListProps = {
  emptyLabel: string;
  icon: ReactNode;
  isRestoring: boolean;
  items: ArchiveItem[];
  onRestore: (id: string) => void;
  title: string;
};

function ArchiveList({
  emptyLabel,
  icon,
  isRestoring,
  items,
  onRestore,
  title,
}: ArchiveListProps) {
  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {item.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Archived {formatArchiveDate(item.archivedAt)}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRestoring}
                onClick={() => onRestore(item.id)}
                className="rounded-md"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchiveRecoverySection() {
  const { user } = useAuth();
  const { activeTeamId, workspaceScopeId } = useWorkspace();
  const queryClient = useQueryClient();
  const queryParams = activeTeamId ? { teamId: activeTeamId } : undefined;
  const enabled = Boolean(user);

  const archivedTemplatesQuery = useQuery({
    queryKey: ['archived-templates', workspaceScopeId],
    queryFn: async () => {
      const templates = await api.getArchivedTemplates(queryParams);
      return templates.map((template: Record<string, unknown>) =>
        toArchiveItem(template, 'template'),
      );
    },
    enabled,
    staleTime: 60 * 1000,
  });

  const archivedRunsQuery = useQuery({
    queryKey: ['archived-runs', workspaceScopeId],
    queryFn: async () => {
      const runs = await api.getArchivedChecklists(queryParams);
      return runs.map((run: Record<string, unknown>) => toArchiveItem(run, 'run'));
    },
    enabled,
    staleTime: 60 * 1000,
  });

  const restoreTemplateMutation = useMutation({
    mutationFn: (templateId: string) => api.restoreTemplate(templateId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archived-templates'] }),
        queryClient.invalidateQueries({ queryKey: ['templates'] }),
        queryClient.invalidateQueries({ queryKey: ['runs'] }),
      ]);
      toast.success('Template restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore template.');
    },
  });

  const restoreRunMutation = useMutation({
    mutationFn: (runId: string) => api.restoreChecklist(runId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['archived-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['runs'] }),
      ]);
      toast.success('Run restored');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore run.');
    },
  });

  const archivedTemplates = archivedTemplatesQuery.data ?? [];
  const archivedRuns = archivedRunsQuery.data ?? [];
  const isLoading = archivedTemplatesQuery.isLoading || archivedRunsQuery.isLoading;
  const archiveCount = archivedTemplates.length + archivedRuns.length;

  return (
    <section className="space-y-4" data-archive-recovery-section="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ArchiveRestore className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-semibold text-foreground">Archive</h2>
        </div>
        <span className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {isLoading ? 'Loading' : `${archiveCount} archived`}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ArchiveList
          title="Archived templates"
          emptyLabel="No archived templates"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          items={archivedTemplates}
          isRestoring={restoreTemplateMutation.isPending}
          onRestore={(id) => restoreTemplateMutation.mutate(id)}
        />
        <ArchiveList
          title="Archived runs"
          emptyLabel="No archived runs"
          icon={<ListChecks className="h-4 w-4 text-muted-foreground" />}
          items={archivedRuns}
          isRestoring={restoreRunMutation.isPending}
          onRestore={(id) => restoreRunMutation.mutate(id)}
        />
      </div>
    </section>
  );
}
