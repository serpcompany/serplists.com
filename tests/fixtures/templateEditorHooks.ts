import { vi } from 'vitest';

export const editorAccess = (overrides: Record<string, unknown> = {}) => ({
  draft: null,
  discardDraft: vi.fn(),
  handleSaveResult: vi.fn(() => false),
  isStartingCheckout: false,
  notice: null,
  restoreDraft: vi.fn(),
  settleDraft: vi.fn(),
  signIn: vi.fn(),
  startUpgrade: vi.fn(),
  ...overrides,
});

export const editorState = () => ({
  selectedSectionIndex: 0,
  selectedItemIndex: null,
  showingSEO: false,
  showingTemplateInfo: true,
  errors: [],
  setErrors: vi.fn(),
  handleSelectSection: vi.fn(),
  handleSelectItem: vi.fn(),
  handleSelectSEO: vi.fn(),
  handleSelectTemplateInfo: vi.fn(),
});
