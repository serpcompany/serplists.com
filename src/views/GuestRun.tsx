'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  DashboardContentShell,
  DashboardLoadingState,
} from '@/components/dashboard/DashboardContentShell';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { GuestRunHeader } from '@/components/run-execution/GuestRunHeader';
import { SaveToAccountButton, SignInToSaveLinks } from '@/components/run-execution/GuestRunSaveActions';
import { CompleteRunButton } from '@/components/run-execution/CompleteRunButton';
import { RunAnswersExportMenu } from '@/components/run-execution/RunAnswersExportMenu';
import { RunCompleteDialog } from '@/components/run-execution/RunCompleteDialog';
import { RunWorkspace } from '@/components/run-execution/RunWorkspace';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PublicTemplateRecordStates } from '@/components/template/PublicTemplateRecordStates';
import { RequiredToolsList } from '@/components/template/RequiredToolsList';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { removeGuestRun, startGuestRun } from '@/features/guest-runs/guestRunStore';
import { useGuestRunModel } from '@/features/guest-runs/useGuestRunModel';
import { useGuestRunStatus } from '@/features/guest-runs/useGuestRunStatus';
import { useSaveGuestRunToAccount } from '@/features/guest-runs/useSaveGuestRunToAccount';
import { RUN_NOTES_UNSAVED_MESSAGE } from '@/features/run-execution/noteDrafts';
import { canFinishRun } from '@/features/run-execution/primaryTaskAction';
import { describeRunTaskCounts } from '@/features/run-execution/runExecutionMappers';
import { useRunPageActions } from '@/features/run-execution/useRunPageActions';
import { useTemplateDetailRecord } from '@/features/template-detail/useTemplateDetailRecord';
import { withReturnPath } from '@/lib/auth/returnPath';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import {
  buildCanonicalPublicTemplatePath,
  buildCanonicalPublicTemplateRunPath,
  buildLoginPath,
  buildPublicTemplatesPath,
  buildRegisterPath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const RunLoadingState = () => (
  <DashboardContentShell>
    <DashboardLoadingState />
  </DashboardContentShell>
);

function GuestRunWorkspace({ template, templatePath }: { template: ChecklistTemplate; templatePath: string }) {
  const router = useAppRouter();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth();
  const { canRunTemplates, isWorkspaceLoading } = useWorkspace();
  const model = useGuestRunModel(template.id);
  const { counts, hasUnsavedNotes, loading, notFound, noteDrafts, progress, run, selectedItemId } = model;
  const { allowLeave } = useUnsavedChangesGuard(hasUnsavedNotes, RUN_NOTES_UNSAVED_MESSAGE);
  const actions = useRunPageActions(model);
  const saving = useSaveGuestRunToAccount(template, allowLeave);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const runPath = buildCanonicalPublicTemplateRunPath(template);
  const loginPath = withReturnPath(buildLoginPath(), runPath);

  useEffect(() => {
    if (!notFound || loading) {
      return;
    }

    toast.error('Run not found');
    allowLeave();
    router.replace(templatePath);
  }, [allowLeave, loading, notFound, router, templatePath]);

  if (loading || !run) {
    return <RunLoadingState />;
  }

  const deleteRun = () => {
    allowLeave();
    removeGuestRun(template.id);
    setIsDeleteDialogOpen(false);
    toast.success('Run deleted');
    router.push(templatePath);
  };

  return (
    <>
      <DashboardContentShell className="overflow-clip">
        <PageBreadcrumb
          className="mb-0"
          items={[
            { href: buildPublicTemplatesPath(), label: 'Template Library' },
            { href: templatePath, label: template.title },
            { label: run.title },
          ]}
        />
        <GuestRunHeader
          accountAction={
            isAuthenticated && canRunTemplates ? (
              <SaveToAccountButton
                isSaving={saving.isSaving || isWorkspaceLoading}
                onSave={() => void saving.save(noteDrafts)}
              />
            ) : null
          }
          answersExport={<RunAnswersExportMenu run={run} template={template} />}
          description={describeRunTaskCounts(counts)}
          finishRunButton={canFinishRun(run) ? <CompleteRunButton onClick={actions.openCompleteDialog} /> : null}
          isCompleted={run.status === 'completed'}
          onDelete={() => setIsDeleteDialogOpen(true)}
          progress={progress}
          savePrompt={
            isAuthenticated || isSessionLoading ? null : (
              <SignInToSaveLinks
                loginPath={loginPath}
                registerPath={withReturnPath(buildRegisterPath(), runPath)}
              />
            )
          }
          title={run.title}
        />
        <RequiredToolsList compact tools={template.requiredTools} />
        <RunWorkspace
          canUpdateRun
          completedTasks={counts.tasksCompleted}
          formAttempt={actions.formAttempt}
          noteDrafts={noteDrafts}
          onFinishRun={actions.openCompleteDialog}
          onFormAnswerChange={actions.saveFormAnswer}
          onNoteDraftChange={model.setNoteDraft}
          onSaveNotes={actions.saveNotes}
          onSelectTask={model.setSelectedItemId}
          onToggleSubItem={actions.toggleSubItem}
          onToggleTask={actions.toggleTask}
          progress={progress}
          run={run}
          selectedItemId={selectedItemId}
          totalTasks={counts.tasksTotal}
          uploadLoginPath={isAuthenticated ? undefined : loginPath}
        />
      </DashboardContentShell>

      <RunCompleteDialog {...actions.completeDialog} />
      <ConfirmDialog
        confirmLabel="Delete"
        description="Are you sure you want to delete this run?"
        onConfirm={deleteRun}
        onOpenChange={setIsDeleteDialogOpen}
        open={isDeleteDialogOpen}
        title="Delete run"
      />
    </>
  );
}

function GuestRunOfTemplate({ template }: { template: ChecklistTemplate }) {
  const router = useAppRouter();
  const { isAuthenticated, isLoading: isSessionLoading } = useAuth();
  const status = useGuestRunStatus(template.id);
  const [opened, setOpened] = useState(false);
  const templatePath = buildCanonicalPublicTemplatePath(template) ?? buildPublicTemplatesPath();

  if (!opened && (status === 'in_progress' || status === 'completed')) {
    setOpened(true);
  }

  useEffect(() => {
    if (opened || status !== 'none' || isSessionLoading) {
      return;
    }

    if (isAuthenticated) {
      router.replace(templatePath);
      return;
    }

    startGuestRun(template);
  }, [isAuthenticated, isSessionLoading, opened, router, status, template, templatePath]);

  return opened ? <GuestRunWorkspace template={template} templatePath={templatePath} /> : <RunLoadingState />;
}

const GuestRun = () => {
  const { username, templateSlug } = useParams<{ username: string; templateSlug: string }>();
  const { loadError, loading, notFound, reload, template } = useTemplateDetailRecord({
    identifier: templateSlug,
    mode: 'public',
    ownerUsername: username,
  });

  return (
    <PublicTemplateRecordStates
      loadError={loadError}
      loading={loading}
      notFound={notFound}
      onRetry={reload}
      template={template}
    >
      {(shownTemplate) => <GuestRunOfTemplate key={shownTemplate.id} template={shownTemplate} />}
    </PublicTemplateRecordStates>
  );
};

export default GuestRun;
