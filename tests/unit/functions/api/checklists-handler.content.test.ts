import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  describe('malformed checklist content', () => {
    const malformedSections = [{
      id: 's1',
      title: 'Launch',
      items: [{ id: 'i1', title: 'Task', contents: [{ type: 'subItems', value: '', subItems: 'x' }] }],
    }];
    const path = 'sections[0].items[0].contents[0].subItems: Expected array, received string';

    it('POST rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(new Request('http://localhost/api/checklists', {
        method: 'POST',
        body: JSON.stringify({ title: 'Run', sections: malformedSections }),
      }), mockEnv);

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    });

    it('PUT rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1', {
        method: 'PUT',
        body: JSON.stringify({ sections: malformedSections, expected_revision: 1 }),
      }), mockEnv);

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('the shared-run PUT never stores it, taking the structure from the stored run since a guest changes only completion and notes', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue(null);
      const storedSections = [{
        id: 's1',
        title: 'Launch',
        items: [{ id: 'i1', title: 'Task', contents: [{ type: 'subItems', value: '', subItems: [] }] }],
      }];
      dbMocks.selectChain.limit.mockResolvedValueOnce([{
        id: 'shared-run',
        user_id: 'owner-123',
        team_id: null,
        status: 'in_progress',
        items: JSON.stringify(storedSections),
        share_token: 'token-1',
        is_public: true,
        revision: 1,
      }]);

      const response = await handleChecklists(new Request('http://localhost/api/checklists/shared/token-1', {
        method: 'PUT',
        body: JSON.stringify({ sections: malformedSections, expected_revision: 1 }),
      }), mockEnv);

      expect(response.status).toBe(200);
      expect(JSON.parse(dbMocks.updateChain.set.mock.calls[0][0].items)).toEqual(storedSections);
    });

    it('starts a run from a Template stored before the check with the content made safe', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([{
          id: 'template-1',
          user_id: 'user-123',
          owner_type: 'user',
          team_id: null,
          title: 'Stored before the check',
          items: JSON.stringify([{
            id: 's1',
            title: 'Launch',
            items: [{ id: 'i1', title: 'Task', contents: [
              { type: 'subItems', value: '', subItems: 'x' },
              { type: 'text', value: {} },
            ] }],
          }]),
          is_public: false,
          version: 2,
        }])
        .mockResolvedValueOnce([{ count: 0 }]);

      const response = await handleChecklists(new Request('http://localhost/api/checklists', {
        method: 'POST',
        body: JSON.stringify({ template_id: 'template-1', title: 'Run' }),
      }), mockEnv);

      expect(response.status).toBe(200);
      const stored = JSON.parse(dbMocks.insertChain.values.mock.calls[0][0].items);
      expect(stored[0].items[0].contents).toEqual([
        { type: 'subItems', value: '', subItems: [] },
        { type: 'text', value: '' },
      ]);
    });
  });
});
