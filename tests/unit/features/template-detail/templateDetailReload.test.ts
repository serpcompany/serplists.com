import { describe, expect, it, vi } from 'vitest';

import {
  createTemplateDetailLoader,
  type TemplateDetailSource,
  type TemplateDetailViewState,
} from '@/features/template-detail/templateDetailLoader';
import type { ChecklistTemplate } from '@/types/checklist';

// After a 409 edit conflict the detail page reloads its template from the server. The load
// must skip the list cache: its copy is the stale one that caused the conflict, and a
// template from another context is not in the list at all.

const buildTemplate = (version: number): ChecklistTemplate => ({
  id: 'template-1',
  title: `Launch Checklist v${version}`,
  description: '',
  sections: [],
  userId: 'owner-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isPublic: false,
  slug: 'launch-checklist',
  categories: [],
  tags: [],
  version,
});

const source = (cached: ChecklistTemplate[]): TemplateDetailSource => ({
  mode: 'private',
  identifier: 'template-1',
  getCachedTemplate: (id: string) => cached.find((template) => template.id === id),
});

// The loader's load: the list copy first, then the server (as loadTemplateDetailData does).
function setup(server: { template: ChecklistTemplate }) {
  const states: TemplateDetailViewState[] = [];
  const fetchById = vi.fn(async () => server.template);
  const load = vi.fn(async (detailSource: TemplateDetailSource) => {
    const cached = detailSource.mode === 'private' ? detailSource.getCachedTemplate('template-1') : undefined;
    return { template: cached ?? (await fetchById()), notFound: false };
  });
  const loader = createTemplateDetailLoader({ load, onChange: (state) => states.push(state) });
  const latest = () => states[states.length - 1];
  return { loader, fetchById, latest, states };
}

describe('template detail reload after a conflict', () => {
  it('loads the stored template from the server in place, skipping the stale list copy', async () => {
    const stale = buildTemplate(3);
    const server = { template: stale };
    const { loader, fetchById, latest, states } = setup(server);
    loader.sync(source([stale]), 'owner-1');
    await vi.waitFor(() => expect(latest().template?.version).toBe(3));
    expect(fetchById).not.toHaveBeenCalled();

    // Another member saved the template; the visibility switch got a 409.
    server.template = buildTemplate(4);
    const shownBefore = states.length;
    await loader.reload();

    expect(fetchById).toHaveBeenCalledTimes(1);
    expect(latest()).toMatchObject({ loading: false, notFound: false, template: { version: 4, title: 'Launch Checklist v4' } });
    // No spinner: the page and its dialogs stay mounted.
    expect(states.slice(shownBefore).some((state) => state.loading)).toBe(false);

    // The stale list copy does not undo the reload on the next render.
    loader.sync(source([stale]), 'owner-1');
    expect(latest().template?.version).toBe(4);
  });

  it('does nothing before anything was shown', async () => {
    const { loader, fetchById } = setup({ template: buildTemplate(1) });

    await loader.reload();

    expect(fetchById).not.toHaveBeenCalled();
  });
});
