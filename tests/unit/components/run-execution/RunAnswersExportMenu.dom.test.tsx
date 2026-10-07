import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RunAnswersExportMenu } from '@/components/run-execution/RunAnswersExportMenu';

import { arrayContaining, objectContaining } from '../../../support/asymmetricMatchers';
import { downloadFromTheMenu } from '../../../support/downloads';
import { openTheMenu, renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { CONTRACT_URL, runWithAnsweredForms, runWithoutForms } from '../../../support/runAnswers';

theInMemoryBrowserAsTheWindow();

afterEach(cleanup);

describe('Export answers on a run', () => {
  it('is not offered for a run without a form field', async () => {
    await renderSettled(<RunAnswersExportMenu run={runWithoutForms} />);

    expect(screen.queryByRole('button', { name: 'Export answers' })).toBeNull();
  });

  it('offers a CSV and a JSON download for a run with a form', async () => {
    await renderSettled(<RunAnswersExportMenu run={runWithAnsweredForms} />);

    const items = await openTheMenu('Export answers');

    expect(items.map((item) => item.textContent.trim())).toEqual(['Download CSV', 'Download JSON']);
  });

  it("downloads the CSV, named after the run, with a byte order mark and each file's full link", async () => {
    await renderSettled(<RunAnswersExportMenu run={runWithAnsweredForms} />);

    const download = await downloadFromTheMenu('Export answers', 'Download CSV');

    expect(download.fileName).toBe('client-onboarding-acme-answers.csv');
    expect(download.type).toBe('text/csv;charset=utf-8');
    expect([...(await download.bytes()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await download.text();
    expect(text).toContain('Section,Task,Field,Type,Required,Answer,Task done\r\n');
    expect(text).toContain(`Signed contract,File,No,contract.pdf (${window.location.origin}${CONTRACT_URL}),No\r\n`);
  });

  it('downloads the JSON, named after the run, with the Template the page names', async () => {
    await renderSettled(
      <RunAnswersExportMenu run={runWithAnsweredForms} template={{ id: 'template-camping', title: 'Weekend Camping' }} />,
    );

    const download = await downloadFromTheMenu('Export answers', 'Download JSON');

    expect(download.fileName).toBe('client-onboarding-acme-answers.json');
    expect(download.type).toBe('application/json');
    const exported: unknown = JSON.parse(await download.text());
    expect(exported).toMatchObject({
      run: { id: 'run-onboarding', template: { id: 'template-camping', title: 'Weekend Camping' } },
      answers: arrayContaining([objectContaining({ answer: 'Acme, Inc.', answerText: 'Acme, Inc.' })]),
    });
  });
});
