import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  answerTheAppFromTheApiOnSqlite,
  closeTheApiDatabase,
  onTheProPlan,
  signedInAs,
  uploads,
} from '../../../support/appApiOnSqlite';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';
import { api } from '@/lib/api';

describe('the account requests the app sends, answered by the API', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await answerTheAppFromTheApiOnSqlite(['owner']);
  });

  afterEach(closeTheApiDatabase);

  it('makes a Run Key, lists it with how to connect, and revokes it', async () => {
    onTheProPlan('owner');
    signedInAs('owner');

    const created = await api.createAgentKey('Laptop agent', ['runs:read']);
    expect(created.key).toMatchObject({ name: 'Laptop agent', status: 'active' });
    expect(created.secret.startsWith(created.key.prefix)).toBe(true);
    expect((await api.getAgentKeys()).map(({ id, status }) => ({ id, status }))).toEqual([{ id: created.key.id, status: 'active' }]);
    expect(await api.getAgentMcpConnection()).toEqual({ mcpEndpoint: 'http://localhost/api/mcp', hostMismatch: false });

    const revoked = await api.revokeAgentKey(created.key.id);
    expect(revoked.id).toBe(created.key.id);
    expect((await api.getAgentKeys()).map(({ status }) => status)).toEqual(['revoked']);
  });

  it("reads a person's and an Organization's public profile by handle, and a person's by id", async () => {
    signedInAs('owner');
    await api.createTeam({ name: 'Acme Launch', slug: 'acme-launch' });
    signedInAs(null);

    expect(await api.getPublicProfileByHandle('owner')).toMatchObject({ type: 'user', id: 'owner', username: 'owner' });
    expect(await api.getPublicProfileByHandle('acme-launch')).toMatchObject({ type: 'team', handle: 'acme-launch', name: 'Acme Launch' });
    expect(await api.getProfileById('owner')).toMatchObject({ id: 'owner', username: 'owner' });
  });

  it('removes an uploaded avatar from storage', async () => {
    signedInAs('owner');
    const uploaded = await api.uploadToR2({ bucket: 'avatars', file: new File([new Uint8Array(10)], 'me.png', { type: 'image/png' }) });
    const key = new URL(uploaded.url, 'http://localhost').searchParams.get('key') ?? '';
    expect(uploads.files.has(key)).toBe(true);

    expect(await api.deleteFromR2(key)).toEqual({ success: true });
    expect(uploads.files.has(key)).toBe(false);
  });

  it('reports the plan, and turns down Upgrade and Manage billing while billing is not set up', async () => {
    signedInAs('owner');
    const organization = await api.createTeam({ name: 'Acme Launch' });

    expect(await api.getBillingStatus()).toMatchObject({ plan: 'free' });
    expect(await api.getBillingStatus({ teamId: organization.id })).toMatchObject({ plan: 'free' });
    await expect(api.createBillingCheckout()).rejects.toMatchObject({ status: 503 });
    await expect(api.createBillingPortal()).rejects.toMatchObject({ status: 503 });
  });
});
