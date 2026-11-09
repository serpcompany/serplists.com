import React, { act, useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { FormProvider, useForm, type DefaultValues, type UseFormReturn } from 'react-hook-form';
import { vi } from 'vitest';

import { EditorPanels } from '@/components/template-editor/EditorPanels';
import { EDITOR_PANEL_HEADING_ID } from '@/components/template-editor/editorPanelIds';
import { TemplateEditorOutline } from '@/components/template-editor/TemplateEditorOutline';
import { useTemplateEditorState } from '@/hooks/useTemplateEditorState';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorFormSource,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

import { renderSettled } from './renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

export interface TemplateEditorPanelsOptions {
  besideForm?: boolean;
  ownerIsOrganization?: boolean;
  ownerSlug?: string | null;
}

export const renderTheTemplateEditorPanels = (template: TemplateEditorFormSource, options: TemplateEditorPanelsOptions = {}) =>
  renderTheTemplateEditorPanelsOn(buildTemplateEditorFormValues(template), options);

export async function renderTheTemplateEditorPanelsOn(
  defaultValues: DefaultValues<TemplateEditorFormValues>,
  { besideForm = true, ownerIsOrganization = false, ownerSlug = 'jane' }: TemplateEditorPanelsOptions = {},
) {
  const held: { form: UseFormReturn<TemplateEditorFormValues> | null } = { form: null };
  function Editor() {
    const form = useForm<TemplateEditorFormValues>({ defaultValues });
    held.form = form;
    const selection = useTemplateEditorState();
    const [sheetOpen, setSheetOpen] = useState(false);
    return (
      <FormProvider {...form}>
        <button type="button" onClick={() => setSheetOpen(true)}>
          Open outline
        </button>
        <TemplateEditorOutline
          besideForm={besideForm}
          locked={false}
          onSheetOpenChange={setSheetOpen}
          sheetOpen={sheetOpen}
          selectedItemIndex={selection.selectedItemIndex}
          selectedSectionIndex={selection.selectedSectionIndex}
          showingSEO={selection.showingSEO}
          showingTemplateInfo={selection.showingTemplateInfo}
          onSelectItem={selection.handleSelectItem}
          onSelectSEO={selection.handleSelectSEO}
          onSelectSection={selection.handleSelectSection}
          onSelectTemplateInfo={selection.handleSelectTemplateInfo}
        />
        <EditorPanels
          publicOwnerIsOrganization={ownerIsOrganization}
          publicOwnerSlug={ownerSlug}
          selectedItemIndex={selection.selectedItemIndex}
          selectedSectionIndex={selection.selectedSectionIndex}
          showingSEO={selection.showingSEO}
          showingTemplateInfo={selection.showingTemplateInfo}
        />
      </FormProvider>
    );
  }
  await renderSettled(<Editor />);
  const form = (): UseFormReturn<TemplateEditorFormValues> => {
    if (!held.form) throw new Error('The template editor form did not mount');
    return held.form;
  };
  return { form, values: () => form().getValues() };
}

export const clickTheButton = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

export const thePanelHeading = (): string | null | undefined => document.getElementById(EDITOR_PANEL_HEADING_ID)?.textContent;
