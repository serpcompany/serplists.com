import { describe, expect, it, vi } from 'vitest';

import {
  createTemplateDetailLoader,
  getTemplateDetailLoadKey,
  resolveTemplateDetailRefresh,
  type TemplateDetailSource,
  type TemplateDetailViewState,
} from '@/features/template-detail/templateDetailLoader';
import type { ChecklistTemplate } from '@/types/checklist';

const buildTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Launch Checklist',
  description: '',
  sections: [],
  userId: 'owner-1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  isPublic: true,
  slug: 'launch-checklist',
  categories: [],
  tags: [],
  version: 1,
  ...overrides,
});

// A new function identity on every call, as TemplatesProvider hands out on every render.
const privateSource = (identifier: string, cached: ChecklistTemplate[] = []): TemplateDetailSource => ({
  mode: 'private',
  identifier,
  getCachedTemplate: (id: string) => cached.find((template) => template.id === id),
});

const publicSource = (identifier: string, cached: ChecklistTemplate[] = []): TemplateDetailSource => ({
  mode: 'public',
  identifier,
  ownerUsername: 'admin',
  cachedTemplates: [...cached],
});

function setup(result: (source: TemplateDetailSource) => ChecklistTemplate | null = () => buildTemplate()) {
  const states: TemplateDetailViewState[] = [];
  const load = vi.fn(async (source: TemplateDetailSource) => {
    const template = result(source);
    return { template, notFound: !template };
  });
  const loader = createTemplateDetailLoader({ load, onChange: (state) => states.push(state) });
  const latest = () => states[states.length - 1];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { load, loader, states, latest, settle };
}

describe('template detail loader', () => {
  it('loads once when the provider re-renders with new list and callback identities', async () => {
    const { load, loader, states, latest, settle } = setup();

    loader.sync(privateSource('template-1'), 'user-1');
    await settle();
    for (let render = 0; render < 5; render += 1) {
      loader.sync(privateSource('template-1'), 'user-1');
      await settle();
    }

    expect(load).toHaveBeenCalledTimes(1);
    expect(latest()).toMatchObject({ loading: false, notFound: false, template: { id: 'template-1' } });
    expect(states.filter((state) => state.loading)).toEqual([]);
  });

  it('loads a public template once while the viewer\'s session resolves', async () => {
    const { load, loader, settle } = setup();

    loader.sync(publicSource('launch-checklist'), undefined);
    loader.sync(publicSource('launch-checklist'), 'user-1');
    await settle();
    loader.sync(publicSource('launch-checklist'), 'user-1');

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state and loads again for a different template', async () => {
    const { load, loader, states, latest, settle } = setup((source) => buildTemplate({ id: source.identifier }));
    loader.sync(privateSource('template-1'), 'user-1');
    await settle();

    loader.sync(privateSource('template-2'), 'user-1');
    expect(latest().loading).toBe(true);
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(latest()).toMatchObject({ loading: false, template: { id: 'template-2' } });
    expect(states.filter((state) => state.loading)).toHaveLength(1);
  });

  it('ignores a late response for a template the page no longer shows', async () => {
    let releaseFirst: () => void = () => {};
    const load = vi.fn((source: TemplateDetailSource) =>
      source.identifier === 'template-1'
        ? new Promise<{ template: ChecklistTemplate; notFound: boolean }>((resolve) => {
            releaseFirst = () => resolve({ template: buildTemplate({ id: 'template-1' }), notFound: false });
          })
        : Promise.resolve({ template: buildTemplate({ id: 'template-2' }), notFound: false }),
    );
    const states: TemplateDetailViewState[] = [];
    const loader = createTemplateDetailLoader({ load, onChange: (state) => states.push(state) });

    loader.sync(privateSource('template-1'), 'user-1');
    loader.sync(privateSource('template-2'), 'user-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(states[states.length - 1].template?.id).toBe('template-2');
  });

  it('re-checks a private template without a spinner when the viewer changes', async () => {
    const { load, loader, states, latest, settle } = setup((source) =>
      source.mode === 'private' && load.mock.calls.length > 1 ? null : buildTemplate(),
    );
    loader.sync(privateSource('template-1'), 'user-1');
    await settle();

    loader.sync(privateSource('template-1'), undefined);
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(states.filter((state) => state.loading)).toEqual([]);
    expect(latest()).toMatchObject({ notFound: true, template: null });
  });

  it('picks up a newer copy from the list cache without reloading', async () => {
    const { load, loader, states, latest, settle } = setup(() => buildTemplate({ version: 1 }));
    loader.sync(privateSource('template-1'), 'user-1');
    await settle();

    loader.sync(privateSource('template-1', [buildTemplate({ version: 2, isPublic: false })]), 'user-1');

    expect(load).toHaveBeenCalledTimes(1);
    expect(latest().template).toMatchObject({ version: 2, isPublic: false });
    expect(states.filter((state) => state.loading)).toEqual([]);
  });

  it('keeps a change the page made when the cached copy is not newer', async () => {
    const { loader, latest, settle } = setup(() => buildTemplate({ isPublic: false }));
    loader.sync(privateSource('template-1'), 'user-1');
    await settle();

    const shared = buildTemplate({ isPublic: true, ownerProfile: { username: 'owner' } });
    loader.setTemplate(shared);
    loader.sync(privateSource('template-1', [buildTemplate({ isPublic: false })]), 'user-1');

    expect(latest().template).toBe(shared);
  });
});

describe('template detail load key', () => {
  it('ignores list and callback identities', () => {
    expect(getTemplateDetailLoadKey(privateSource('template-1'), 'user-1')).toBe(
      getTemplateDetailLoadKey(privateSource('template-1', [buildTemplate()]), 'user-1'),
    );
    expect(getTemplateDetailLoadKey(publicSource('launch-checklist'), undefined)).toBe(
      getTemplateDetailLoadKey(publicSource('launch-checklist', [buildTemplate()]), 'user-1'),
    );
  });

  it('changes with the template, the public owner, and the private viewer', () => {
    const base = getTemplateDetailLoadKey(privateSource('template-1'), 'user-1');
    expect(getTemplateDetailLoadKey(privateSource('template-2'), 'user-1')).not.toBe(base);
    expect(getTemplateDetailLoadKey(privateSource('template-1'), 'user-2')).not.toBe(base);
    expect(getTemplateDetailLoadKey({ ...publicSource('launch-checklist'), ownerUsername: 'someone' }, undefined)).not.toBe(
      getTemplateDetailLoadKey(publicSource('launch-checklist'), undefined),
    );
  });
});

describe('resolveTemplateDetailRefresh', () => {
  it('uses a newer cached copy and keeps the shown one otherwise', () => {
    const shown = buildTemplate({ version: 2 });
    expect(resolveTemplateDetailRefresh(shown, buildTemplate({ version: 3 }))?.version).toBe(3);
    expect(resolveTemplateDetailRefresh(shown, buildTemplate({ version: 2 }))).toBe(shown);
    expect(resolveTemplateDetailRefresh(shown, buildTemplate({ version: 1 }))).toBe(shown);
    expect(resolveTemplateDetailRefresh(shown, buildTemplate({ id: 'other', version: 9 }))).toBe(shown);
    expect(resolveTemplateDetailRefresh(shown, undefined)).toBe(shown);
  });
});
