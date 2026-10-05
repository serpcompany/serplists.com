import { useState } from 'react';
import { toast } from 'sonner';

import { ORGANIZATION_UPGRADE_MESSAGE } from '@/lib/access-flow';
import type { PageVisit } from '@/lib/navigation/pageVisit';
import { getOrganizationPermissions } from '@/lib/organizationPermissions';
import type { TeamSummary } from '@/lib/schemas/teamResponses';
import type { ChecklistTemplate } from '@/types/checklist';

import { buildCopiedTemplatePath } from './templateActionOutcome';
import type { TemplateDetailActionResult } from './templateDetailApi';

type TransferableTemplate = Pick<ChecklistTemplate, 'isPublic' | 'ownerType' | 'teamId' | 'title' | 'userId'>;

export const transferTargetsFor = (organizations: readonly TeamSummary[]): TeamSummary[] =>
  organizations.filter(
    (organization) =>
      organization.membershipStatus === 'active' && getOrganizationPermissions(organization.role).canEditTemplates,
  );

export function useTemplateTransfer(params: {
  beginVisit: () => PageVisit;
  loginRequired: () => void;
  navigate: (path: string) => void;
  organizations: readonly TeamSummary[];
  template: TransferableTemplate | null;
  transfer: (teamId: string) => Promise<TemplateDetailActionResult>;
  userId: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { template } = params;
  const targets = transferTargetsFor(params.organizations);
  const ownsPersonally = Boolean(
    template && params.userId && template.userId === params.userId && template.ownerType !== 'team' && !template.teamId,
  );

  const confirm = async (teamId: string) => {
    const organization = targets.find((target) => target.id === teamId);
    if (!organization || pending) return;

    const visit = params.beginVisit();
    setPending(true);
    try {
      const result = await params.transfer(teamId);
      if (result.kind === 'ok') {
        setOpen(false);
        toast.success(`Template transferred to ${organization.name}`);
        if (visit.isCurrent()) params.navigate(buildCopiedTemplatePath(result));
      } else if (result.kind === 'login_required') {
        if (visit.isCurrent()) params.loginRequired();
      } else {
        toast.error(result.kind === 'error' ? result.message : ORGANIZATION_UPGRADE_MESSAGE);
      }
    } finally {
      setPending(false);
    }
  };

  return {
    canTransfer: ownsPersonally && targets.length > 0,
    openDialog: () => setOpen(true),
    dialog: {
      isPublic: Boolean(template?.isPublic),
      onConfirm: (teamId: string) => void confirm(teamId),
      onOpenChange: setOpen,
      open,
      organizations: targets,
      pending,
      templateTitle: template?.title ?? '',
    },
  };
}
