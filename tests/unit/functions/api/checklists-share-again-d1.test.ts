import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { insertOwnedRun, openRunOwnerDatabase } from '../../../support/runOwnerOnSqlite';

import { handleChecklists } from '@functions/api/handlers/checklists';
import { apiEnvOn } from '../../../support/apiEnv';
import { apiRequest } from '../../../support/apiRequest';
import { readJson } from '../../../support/readJson';
import type { SqliteD1 } from '../../../support/sqlite-d1';

const RUN_ITEMS = JSON.stringify([{ id: 's1', title: 'Release', items: [{ id: 'ship', title: 'Ship', isCompleted: false }] }]);
const shareLink = z.object({ shareToken: z.string(), sharePath: z.string() }).passthrough();

let database: SqliteD1;

const send = (path: string, method?: string, body?: unknown) => handleChecklists(apiRequest(path, method, body), apiEnvOn(database));

const shareTheRun = async () => readJson(await send('checklists/run/run-1/share', 'POST'), shareLink);

const statusesThrough = async (shareToken: string) => [
  (await send(`checklists/shared/${shareToken}`)).status,
  (await send(`checklists/shared/${shareToken}`, 'PUT', { status: 'in_progress', expected_revision: 1 })).status,
];

beforeEach(() => {
  database = openRunOwnerDatabase(RUN_ITEMS);
  insertOwnedRun(database, { id: 'run-1', status: 'in_progress', items: RUN_ITEMS });
});

afterEach(() => {
  database.close();
});

describe('sharing a Run that is already shared', () => {
  it('mints a new link, and the previous one stops working for reads and saves', async () => {
    const first = await shareTheRun();
    expect((await send(`checklists/shared/${first.shareToken}`)).status).toBe(200);

    const second = await shareTheRun();

    expect(second.shareToken).not.toBe(first.shareToken);
    expect(second.sharePath).toBe(`/share/${second.shareToken}/`);
    expect(await statusesThrough(first.shareToken)).toEqual([404, 404]);
    expect(await statusesThrough(second.shareToken)).toEqual([200, 200]);
  });
});
