import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { answerTheAppFromTheApiOnSqlite, closeTheApiDatabase, signedInAs } from '../../../support/appApiOnSqlite';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

const PACKING = [{ id: 's1', title: 'Pack', items: [{ id: 'i1', title: 'Passport' }, { id: 'i2', title: 'Charger' }] }];

const withTheFirstTaskDone = [
  { ...PACKING[0], items: [{ id: 'i1', title: 'Passport', completed: true }, { id: 'i2', title: 'Charger' }] },
];

async function aRunOfANewTemplate() {
  signedInAs('owner');
  const template = await api.createTemplate({ title: 'Trip packing', sections: PACKING });
  const run = await api.createChecklist({ template_id: template.id, title: 'Lisbon trip', sections: PACKING });
  return { template, run };
}

describe('the Run requests the app sends, answered by the API', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await answerTheAppFromTheApiOnSqlite(['owner', 'stranger']);
  });

  afterEach(closeTheApiDatabase);

  it('starts a Run, lists it, opens it, and saves progress on it', async () => {
    const { run } = await aRunOfANewTemplate();

    expect((await api.getChecklists()).map(({ id, title }) => ({ id, title }))).toEqual([{ id: run.id, title: 'Lisbon trip' }]);
    const opened = await api.getChecklistById(run.id);
    expect(opened).toMatchObject({ id: run.id, title: 'Lisbon trip' });

    const saved = await api.updateChecklist(run.id, {
      sections: withTheFirstTaskDone,
      progress: 50,
      expected_revision: opened.revision ?? undefined,
    });
    expect(saved.success).toBe(true);
    expect(await api.getChecklistById(run.id)).toMatchObject({ progress: 50, revision: saved.revision });
  });

  it('brings a Run up to its Template, and refuses when the Run changed since it was read', async () => {
    const { run } = await aRunOfANewTemplate();
    const before = await api.getChecklistById(run.id);
    const loadedRevision = before.revision ?? 0;

    const revalidated = await api.revalidateChecklist(run.id, loadedRevision);
    expect(revalidated).toMatchObject({ success: true, revision: loadedRevision + 1, template_version: before.current_template_version });

    await expect(api.revalidateChecklist(run.id, loadedRevision)).rejects.toMatchObject({ status: 409, code: 'edit_conflict' });
    expect(await api.revalidateChecklist(run.id)).toMatchObject({ revision: loadedRevision + 2 });
  });

  it('shares a Run by link, saves through the link, and stops the link working once the share is revoked', async () => {
    const { run } = await aRunOfANewTemplate();
    const share = await api.createChecklistRunShare(run.id);

    signedInAs(null);
    const shared = await api.getSharedChecklist(share.shareToken);
    const savedThroughTheLink = await api.updateSharedChecklist(share.shareToken, {
      sections: withTheFirstTaskDone,
      expected_revision: shared.revision ?? undefined,
    });
    expect(shared).toMatchObject({ id: run.id, title: 'Lisbon trip' });
    expect(savedThroughTheLink.progress).toBe(50);

    signedInAs('owner');
    expect(await api.revokeChecklistRunShare(run.id)).toEqual({ id: run.id, isPublic: false });
    signedInAs(null);
    await expect(api.getSharedChecklist(share.shareToken)).rejects.toBeInstanceOf(ApiError);
  });

  it('deletes a Run into the archive and restores it from there', async () => {
    const { run } = await aRunOfANewTemplate();

    expect(await api.deleteChecklist(run.id)).toEqual({ success: true });
    expect(await api.getChecklists()).toEqual([]);
    expect((await api.getArchivedChecklists()).map(({ id }) => id)).toEqual([run.id]);

    expect(await api.restoreChecklist(run.id)).toEqual({ success: true });
    expect(await api.getArchivedChecklists()).toEqual([]);
    expect((await api.getChecklists()).map(({ id }) => id)).toEqual([run.id]);
  });

  it("lists an Organization's Runs apart from personal ones, and keeps a stranger out of them", async () => {
    signedInAs('owner');
    const organization = await api.createTeam({ name: 'Acme Launch' });
    const run = await api.createChecklist({ teamId: organization.id, title: 'Launch day', sections: PACKING });
    await api.deleteChecklist(run.id);

    expect(await api.getChecklists()).toEqual([]);
    expect((await api.getArchivedChecklists({ teamId: organization.id })).map(({ id }) => id)).toEqual([run.id]);
    await api.restoreChecklist(run.id);
    expect((await api.getChecklists({ teamId: organization.id })).map(({ id }) => id)).toEqual([run.id]);

    signedInAs('stranger');
    await expect(api.getChecklists({ teamId: organization.id })).rejects.toMatchObject({ status: 404 });
  });
});
