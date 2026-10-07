import { api } from '@/lib/api';
import type { TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

export const generateTemplateDraftFromClipy = (url: string): Promise<{ draft: TemplateEditorFormValues }> =>
  api.generateTemplateFromClipy(url);
