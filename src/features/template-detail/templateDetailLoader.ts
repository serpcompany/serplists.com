import { findPublicTemplateByIdentifier } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

// What a template detail page asks for. The cache fields hold the page's current list data
// and callbacks, whose identities change on unrelated re-renders.
export type TemplateDetailSource =
  | { mode: 'public'; identifier?: string; ownerUsername?: string; cachedTemplates: ChecklistTemplate[] }
  | { mode: 'private'; identifier?: string; getCachedTemplate: (identifier: string) => ChecklistTemplate | undefined };

export type TemplateDetailViewState = {
  loading: boolean;
  notFound: boolean;
  template: ChecklistTemplate | null;
};

type LoadResult = { notFound: boolean; template: ChecklistTemplate | null };

export const initialTemplateDetailViewState: TemplateDetailViewState = {
  loading: true,
  notFound: false,
  template: null,
};

// Which template the page shows: a change swaps the page to its loading state.
export const getTemplateDetailDisplayKey = (source: TemplateDetailSource): string =>
  JSON.stringify([
    source.mode,
    source.identifier ?? '',
    source.mode === 'public' ? (source.ownerUsername ?? '').toLowerCase() : '',
  ]);

// When to load again. A private template is fetched with the viewer's session, so signing in
// or out re-checks access; a public page does not depend on the viewer. List data and callback
// identities are deliberately not part of the key.
export const getTemplateDetailLoadKey = (source: TemplateDetailSource, viewerUserId?: string): string =>
  JSON.stringify([getTemplateDetailDisplayKey(source), source.mode === 'private' ? viewerUserId ?? '' : '']);

const findCachedCopy = (source: TemplateDetailSource, template: ChecklistTemplate | null) => {
  if (!template) return undefined;
  return source.mode === 'private'
    ? source.getCachedTemplate(template.id)
    : findPublicTemplateByIdentifier(source.cachedTemplates, template.id);
};

// A newer copy of the shown template from the list cache (after an edit or a visibility change
// bumped its version) replaces it. An equal or older copy keeps the shown object, so a stale
// list cannot undo a local change and page effects keyed on the template do not re-run.
export const resolveTemplateDetailRefresh = (
  current: ChecklistTemplate | null,
  cached: ChecklistTemplate | undefined,
): ChecklistTemplate | null =>
  current && cached && cached.id === current.id && (cached.version ?? 1) > (current.version ?? 1)
    ? cached
    : current;

// Loads the template a detail page shows and keeps it current. Call sync() after every render
// with the latest source. It loads only when the page shows a different template or the viewer
// changes, never because the provider re-rendered, and shows the loading state only for a
// different template, so a background reload never unmounts the page or its dialogs.
export function createTemplateDetailLoader(params: {
  load: (source: TemplateDetailSource) => Promise<LoadResult>;
  onChange: (state: TemplateDetailViewState) => void;
}) {
  let state = initialTemplateDetailViewState;
  let shownKey: string | null = null;
  let loadKey: string | null = null;
  let request = 0;

  const update = (next: Partial<TemplateDetailViewState>) => {
    state = { ...state, ...next };
    params.onChange(state);
  };

  return {
    sync(source: TemplateDetailSource, viewerUserId?: string) {
      const nextLoadKey = getTemplateDetailLoadKey(source, viewerUserId);
      if (nextLoadKey === loadKey) {
        const refreshed = resolveTemplateDetailRefresh(state.template, findCachedCopy(source, state.template));
        if (refreshed !== state.template) update({ template: refreshed });
        return;
      }

      loadKey = nextLoadKey;
      const displayKey = getTemplateDetailDisplayKey(source);
      const current = ++request;
      if (displayKey !== shownKey && !state.loading) update({ loading: true, notFound: false });
      void params
        .load(source)
        .catch((): LoadResult => ({ notFound: true, template: null }))
        .then((result) => {
          if (current !== request) return;
          shownKey = displayKey;
          update({ loading: false, notFound: result.notFound, template: result.template });
        });
    },
    // For a change the page made itself, such as sharing the template.
    setTemplate(template: ChecklistTemplate) {
      update({ template });
    },
    // Ignore responses still in flight; the next sync() loads again.
    cancel() {
      request += 1;
      loadKey = null;
    },
  };
}
