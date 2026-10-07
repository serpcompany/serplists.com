export type PublicTemplateSaveLabels = {
  header: string;
  footer: string;
};

const DEFAULT_LABELS: PublicTemplateSaveLabels = { header: 'Save', footer: 'Copy to Library' };

export const getPublicTemplateSaveLabels = (params: {
  isAuthenticated: boolean;
  isBillingError: boolean;
  isBillingLoading: boolean;
  isProUser: boolean;
  isSaving: boolean;
  isTeamWorkspace: boolean;
  isWorkspaceLoading: boolean;
}): PublicTemplateSaveLabels => {
  if (params.isSaving) {
    return { header: 'Saving...', footer: 'Copying...' };
  }

  if (!params.isAuthenticated || params.isTeamWorkspace || params.isWorkspaceLoading) {
    return DEFAULT_LABELS;
  }

  if (params.isBillingLoading) {
    return { ...DEFAULT_LABELS, footer: 'Checking plan...' };
  }

  if (!params.isProUser && !params.isBillingError) {
    return { header: 'Upgrade to save', footer: 'Upgrade to copy template' };
  }

  return DEFAULT_LABELS;
};
