import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../../../scripts/lib/run-tool';
import { runModuleCodeProcess } from '../../support/scriptProcess';

const importedFromAnotherProgram = (script: string) =>
  runModuleCodeProcess(`console.log(Object.keys(await import(${JSON.stringify(pathToFileURL(path.join(REPO_ROOT, script)).href)})).join(','));`);

describe.each([
  ['scripts/check-site-standards.ts', 'SMOKE_TEST_HEADER,checkSiteStandards,checkSiteStandardsUntilItPasses,getWithoutFollowingRedirects'],
  ['scripts/verify-deployment.ts', 'SIGN_IN_PATH,verifyDeployment'],
  ['scripts/promote-prepare.ts', 'PROMOTION_BODY_FILE,issuesClosedBy,promotionBody,pullRequestOf,stagingSubjectsSinceTheLastPromotion'],
])('%s, imported by another program', (script, exported) => {
  it('runs nothing of its own, and gives the importer what it exports', { timeout: 120_000 }, async () => {
    const run = await importedFromAnotherProgram(script);

    expect(run).toEqual({ status: 0, stdout: `${exported}\n`, stderr: '' });
  });
});
