import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTemplateEditorState } from '@/hooks/useTemplateEditorState';

const shownPanel = (state: ReturnType<typeof useTemplateEditorState>) => ({
  section: state.selectedSectionIndex,
  item: state.selectedItemIndex,
  seo: state.showingSEO,
  info: state.showingTemplateInfo,
});

describe('useTemplateEditorState', () => {
  it('opens on the Template info panel', () => {
    const { result } = renderHook(() => useTemplateEditorState());

    expect(shownPanel(result.current)).toEqual({ section: 0, item: null, seo: false, info: true });
  });

  it('shows one panel at a time as the editor moves between a section, a task, SEO and Template info', () => {
    const { result } = renderHook(() => useTemplateEditorState());

    act(() => result.current.handleSelectItem(1, 2));
    expect(shownPanel(result.current)).toEqual({ section: 1, item: 2, seo: false, info: false });

    act(() => result.current.handleSelectSEO());
    expect(shownPanel(result.current)).toEqual({ section: 1, item: null, seo: true, info: false });

    act(() => result.current.handleSelectTemplateInfo());
    expect(shownPanel(result.current)).toEqual({ section: 1, item: null, seo: false, info: true });

    act(() => result.current.handleSelectSection(0));
    expect(shownPanel(result.current)).toEqual({ section: 0, item: null, seo: false, info: false });
  });
});
