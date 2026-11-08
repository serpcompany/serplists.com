import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  answerTheAppFromTheApiOnSqlite,
  closeTheApiDatabase,
  onTheProPlan,
  signedInAs,
} from '../../../support/appApiOnSqlite';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

const SECTIONS = [{ id: 's1', title: 'Prepare', items: [{ id: 'i1', title: 'Open the tracker' }] }];
const TIME_TRACKER = { name: 'Time tracker', url: 'https://example.com/track', required: true };

const idsOf = (templates: readonly { id: string }[]) => templates.map(({ id }) => id);

async function aPublicTemplateOf(owner: string) {
  signedInAs(owner);
  return api.createTemplate({
    title: 'Launch day',
    slug: 'launch-day',
    is_public: true,
    sections: SECTIONS,
    requiredTools: [TIME_TRACKER],
  });
}

describe('the Template requests the app sends, answered by the API', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await answerTheAppFromTheApiOnSqlite(['owner', 'visitor']);
    onTheProPlan('owner');
  });

  afterEach(closeTheApiDatabase);

  it('finds a public Template by its address, on its owner\'s profile, and with the tools it needs', async () => {
    const template = await aPublicTemplateOf('owner');

    signedInAs(null);
    expect(await api.getTemplateBySlug('launch-day')).toMatchObject({ id: template.id, title: 'Launch day' });
    expect(idsOf(await api.getPublicTemplatesForUser('owner'))).toEqual([template.id]);
    expect(await api.getPublicRequiredTools([template.id])).toEqual([{ id: template.id, requiredTools: [TIME_TRACKER] }]);
  });

  it('deletes a Template into the archive and restores it', async () => {
    const template = await aPublicTemplateOf('owner');

    expect(await api.deleteTemplate(template.id)).toEqual({ success: true });
    expect(idsOf(await api.getArchivedTemplates())).toEqual([template.id]);
    await expect(api.getTemplateById(template.id)).rejects.toMatchObject({ status: 404 });

    expect(await api.restoreTemplate(template.id)).toEqual({ success: true });
    expect(await api.getArchivedTemplates()).toEqual([]);
    expect(await api.getTemplateById(template.id)).toMatchObject({ id: template.id, title: 'Launch day' });
  });

  it('refuses a save made from an old copy with the API\'s own conflict error', async () => {
    const template = await aPublicTemplateOf('owner');
    const loaded = await api.getTemplateById(template.id);
    await api.updateTemplate(template.id, { title: 'Launch day, revised', expected_version: loaded.version ?? undefined });

    const stale = api.updateTemplate(template.id, { title: 'Launch day, again', expected_version: loaded.version ?? undefined });
    await expect(stale).rejects.toBeInstanceOf(ApiError);
    await expect(stale).rejects.toMatchObject({ status: 409 });
  });

  it('exports the Templates as a pack and imports the pack back as new copies', async () => {
    await aPublicTemplateOf('owner');

    const pack = await api.exportTemplateBackup();
    expect(pack.templates).toHaveLength(1);
    const summary = await api.importTemplateBackup({ templates: pack.templates, options: { visibility: 'private' } });
    expect(summary).toMatchObject({ total: 1, imported: 1, failed: [] });

    const titles = (await api.getTemplates()).map(({ title }) => title);
    expect(titles).toEqual(['Launch day', 'Launch day']);
  });

  it("moves a Template into an Organization, where it shows on the Organization's profile and its backup waits for the Organization's plan", async () => {
    const template = await aPublicTemplateOf('owner');
    const organization = await api.createTeam({ name: 'Acme Launch', slug: 'acme-launch' });
    const loaded = await api.getTemplateById(template.id);

    const moved = await api.transferTemplate(template.id, { teamId: organization.id, expectedVersion: loaded.version ?? 0 });
    expect(moved).toMatchObject({ success: true, id: template.id, teamId: organization.id });
    expect(await api.getTemplates({ scope: 'personal' })).toEqual([]);
    expect(idsOf(await api.getTemplates({ teamId: organization.id }))).toEqual([template.id]);
    await expect(api.exportTemplateBackup({ teamId: organization.id })).rejects.toThrow(
      'Upgrade this Organization to use template import/export.',
    );

    signedInAs(null);
    expect(idsOf(await api.getPublicTemplatesForOrganization('acme-launch'))).toEqual([template.id]);
  });

  it('copies a public Template into the Personal Templates of a visitor on Pro, and asks others to upgrade', async () => {
    const template = await aPublicTemplateOf('owner');

    signedInAs('visitor');
    await expect(api.clonePublicTemplate(template.id)).rejects.toThrow('Upgrade to Pro to copy public templates into Personal.');
    onTheProPlan('visitor');
    const copy = await api.clonePublicTemplate(template.id);
    expect(copy.id).not.toBe(template.id);
    expect(await api.getTemplateById(copy.id)).toMatchObject({ title: 'Launch day', user_id: 'visitor' });
  });

  it('turns down a link that is not a Clipy recording, and one Clipy cannot find', async () => {
    signedInAs('owner');

    await expect(api.generateTemplateFromClipy('https://example.com/video/abc')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_clipy_url',
    });
    await expect(api.generateTemplateFromClipy('https://clipy.online/video/8fptqlnappr6')).rejects.toMatchObject({
      status: 404,
      code: 'clipy_not_found',
    });
  });
});
