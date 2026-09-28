export type PublicTemplateSaveLabels = {
  // The compact bookmark button in the sticky header.
  header: string;
  // The "Ready to use this template?" call to action.
  footer: string;
};

const DEFAULT_LABELS: PublicTemplateSaveLabels = { header: 'Save', footer: 'Copy to Library' };

/**
 * Labels for the public template page's two save buttons, so a click never leads
 * somewhere the label did not say. Copying into Personal is a Pro feature: a signed-in
 * Free user's click starts checkout, so the labels say so. An Organization's Template
 * limit is checked by the API, so an Organization never sees an upgrade label here.
 * Signed-out visitors are sent to log in and keep the plain labels.
 */
export const getPublicTemplateSaveLabels = (params: {
  isAuthenticated: boolean;
  isBillingLoading: boolean;
  isProUser: boolean;
  isSaving: boolean;
  isTeamWorkspace: boolean;
}): PublicTemplateSaveLabels => {
  if (params.isSaving) {
    return { header: 'Saving...', footer: 'Copying...' };
  }

  if (!params.isAuthenticated || params.isTeamWorkspace) {
    return DEFAULT_LABELS;
  }

  if (params.isBillingLoading) {
    return { ...DEFAULT_LABELS, footer: 'Checking plan...' };
  }

  if (!params.isProUser) {
    return { header: 'Upgrade to save', footer: 'Upgrade to copy template' };
  }

  return DEFAULT_LABELS;
};
