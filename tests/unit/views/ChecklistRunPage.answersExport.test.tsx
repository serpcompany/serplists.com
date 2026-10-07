import { describe, expect, it } from 'vitest';

import { renderRunPage, workspaceRoles } from '../../support/checklistRunPage';
import { runWithAnsweredForms, runWithoutForms } from '../../support/runAnswers';

const EXPORT_ANSWERS = />Export answers</;

describe('Export answers on the Run page', () => {
  it('is in the header of a run with a form', async () => {
    const html = await renderRunPage(runWithAnsweredForms, { selectedItemId: 'task-details' });

    expect(html).toMatch(EXPORT_ANSWERS);
  });

  it('is offered to a viewer of an Organization run too, who can read the answers but not change them', async () => {
    workspaceRoles.roles = { acme: 'viewer' };
    const html = await renderRunPage({ ...runWithAnsweredForms, teamId: 'acme' }, { selectedItemId: 'task-details' });

    expect(html).toContain('View only');
    expect(html).toMatch(EXPORT_ANSWERS);
  });

  it('is not offered on a run without a form', async () => {
    const html = await renderRunPage(runWithoutForms, { selectedItemId: 'task-plain' });

    expect(html).not.toMatch(EXPORT_ANSWERS);
  });

  it('is not offered on the shared run link, which shows the answers read-only', async () => {
    const html = await renderRunPage(runWithAnsweredForms, { selectedItemId: 'task-details', shared: true });

    expect(html).toContain('Acme, Inc.');
    expect(html).not.toMatch(EXPORT_ANSWERS);
  });
});
