import { toast } from 'sonner';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { applyNoteDrafts, type NoteDrafts } from '@/features/run-execution/noteDrafts';
import { loadRunExecutionData } from '@/features/run-execution/runExecutionLoad';
import {
  followTemplateActionResult,
  startTemplateRun,
  type CreateRun,
} from '@/features/template-detail/templateActionOutcome';
import { mapActionFailure, type TemplateDetailActionResult } from '@/features/template-detail/templateDetailApi';
import { useBillingStatus } from '@/hooks/useBillingStatus';
import { usePageVisit } from '@/hooks/usePageVisit';
import { useRedirectPending } from '@/hooks/useRedirectPending';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { handleUpgradeRequiredForContext, navigateToLoginWithReturnPath } from '@/lib/access-flow';
import { ownerConsoleContext } from '@/lib/consoleRoutes';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { buildConsoleRunPath } from '@/lib/routes';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

import { carryGuestRunProgress } from './guestRunProgress';
import { readGuestRun, removeGuestRun } from './guestRunStore';

type AccountRuns = {
  createRun: CreateRun;
  updateRun: (run: ChecklistRun) => Promise<ChecklistRun>;
};

export const saveGuestRunToAccount = async (
  template: ChecklistTemplate,
  guestRun: ChecklistRun,
  { createRun, updateRun }: AccountRuns,
): Promise<TemplateDetailActionResult> => {
  const started = await startTemplateRun({ createRun, isAuthenticated: true, runName: guestRun.title, template });
  if (started.kind !== 'ok' || !started.runId) return started;

  const created = await loadRunExecutionData({ runId: started.runId }, { updateRun });
  if (created.kind !== 'ok') {
    return { kind: 'error', message: created.kind === 'error' ? created.message : 'Run not found' };
  }

  try {
    await updateRun(carryGuestRunProgress(created.run, guestRun));
  } catch (error) {
    return mapActionFailure(error, 'Unable to save your progress.');
  }
  removeGuestRun(template.id);
  return started;
};

export const useSaveGuestRunToAccount = (template: ChecklistTemplate, beforeLeaving: () => void = () => undefined) => {
  const router = useAppRouter();
  const beginVisit = usePageVisit();
  const { user } = useAuth();
  const { activeTeamId, isTeamWorkspace } = useWorkspace();
  const { createRun, updateRun } = useTemplates();
  const billing = useBillingStatus({ enabled: Boolean(user), teamId: activeTeamId, userId: user?.id });
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const flight = useSingleFlight();

  const save = (noteDrafts: NoteDrafts = {}) =>
    flight.run(async () => {
      const guestRun = readGuestRun(template.id);
      if (!guestRun) return;

      const visit = beginVisit();
      const result = await saveGuestRunToAccount(template, applyNoteDrafts(guestRun, noteDrafts), { createRun, updateRun });
      await followTemplateActionResult(result, visit, {
        loginRequired: () => navigateToLoginWithReturnPath(router.push),
        upgradeRequired: async () => {
          setIsStartingCheckout(true);
          const redirecting = await handleUpgradeRequiredForContext({
            billingEnabled: billing.status === 'known' ? billing.billingEnabled : true,
            isTeamWorkspace,
          });
          if (!redirecting) setIsStartingCheckout(false);
        },
        succeeded: ({ runId, teamId }) => {
          toast.success('Run saved to your account');
          beforeLeaving();
          if (runId) router.push(buildConsoleRunPath(runId, ownerConsoleContext(teamId)));
        },
      });
    });

  return { isSaving: flight.isRunning || isStartingCheckout, save };
};
