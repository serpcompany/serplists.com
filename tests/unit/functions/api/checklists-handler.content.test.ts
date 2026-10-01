import { describe, it, expect, beforeEach, vi } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, resetChecklistsHandlerMocks } from '../../../support/checklistsHandler';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { getSessionUserId } from '@functions/api/utils/session';
import { personalTemplateRow } from '../../../fixtures/handlerRows';
import {
  MALFORMED_CONTENTS_A_TEMPLATE_STORED,
  sectionsWithContents,
  THE_SAME_CONTENTS_MADE_SAFE,
} from '../../../fixtures/malformedSections';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, readJson } from '../../../support/readJson';

describe('Checklists Handlers', () => {
  beforeEach(resetChecklistsHandlerMocks);

  describe('malformed checklist content', () => {
    const malformedSections = sectionsWithContents({ type: 'subItems', value: '', subItems: 'x' });
    const path = 'sections[0].items[0].contents[0].subItems: Expected array, received string';

    it('POST rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(apiRequest('checklists', 'POST', { title: 'Run', sections: malformedSections }), mockEnv);

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    });

    it('PUT rejects it, naming the field', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');

      const response = await handleChecklists(
        apiRequest('checklists/run-1', 'PUT', { sections: malformedSections, expected_revision: 1 }),
        mockEnv,
      );

      expect(response.status).toBe(400);
      expect((await readJson(response, apiErrorBody)).error).toBe(path);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it('the shared-run PUT never stores it, taking the structure from the stored run since a guest changes only completion and notes', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue(null);
      const storedSections = sectionsWithContents({ type: 'subItems', value: '', subItems: [] });
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

      const response = await handleChecklists(
        apiRequest('checklists/shared/token-1', 'PUT', { sections: malformedSections, expected_revision: 1 }),
        mockEnv,
      );

      expect(response.status).toBe(200);
      expect(JSON.parse(firstOf(dbMocks.updateChain.set.mock.calls)[0].items)).toEqual(storedSections);
    });

    it('starts a run from a Template stored before the check with the content made safe', async () => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([
          personalTemplateRow({
            title: 'Stored before the check',
            items: JSON.stringify(sectionsWithContents(...MALFORMED_CONTENTS_A_TEMPLATE_STORED)),
            is_public: false,
            version: 2,
          }),
        ])
        .mockResolvedValueOnce([{ count: 0 }]);

      const response = await handleChecklists(apiRequest('checklists', 'POST', { template_id: 'template-1', title: 'Run' }), mockEnv);

      expect(response.status).toBe(200);
      const stored = JSON.parse(firstOf(dbMocks.insertChain.values.mock.calls)[0].items);
      expect(stored[0].items[0].contents).toEqual(THE_SAME_CONTENTS_MADE_SAFE);
    });
  });
});
