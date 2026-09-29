export type PublicTemplateSaveLabels = {
  // The bookmark button in the page header.
  header: string;
  // The "Ready to use this template?" call to action.
  footer: string;
};

const DEFAULT_LABELS: PublicTemplateSaveLabels = { header: 'Save', footer: 'Copy to Library' };

/**
 * Labels for the public template page's two save buttons, so a click never leads
 * somewhere the label did not say. Copying into Personal is a Pro feature: a signed-in
 * Free user's click starts checkout, so the labels say so. Only a known Free plan does:
 * when the plan check failed, the click asks for a retry instead. An Organization's Template
 * limit is checked by the API, so an Organization never sees an upgrade label here.
 * Neither does a context still being confirmed: the plan loaded so far is Personal's, and
 * the tab may be in an Organization. Signed-out visitors are sent to log in and keep the
 * plain labels.
 */
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
