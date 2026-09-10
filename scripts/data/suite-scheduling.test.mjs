import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import quality, { dataRegressionFiles } from '../../vitest.config';
import data from '../../vitest.data.config';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const leaves = ['lint', 'typecheck', 'typecheck:env', 'test:unit', 'check:data:migration-provenance', 'test:data:migration-provenance', 'check:data:schema-contract', 'db:schema:snapshot:check', 'test:database:fast', 'test:process', 'test:data:integration'];
function execute(fail) {
  const directory = mkdtempSync(path.join(tmpdir(), 'serplists-scheduling-'));
  try {
    const scripts = { ...manifest.scripts };
    for (const name of leaves) scripts[name] = `node probe.mjs ${name}`;
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts }));
    writeFileSync(path.join(directory, 'probe.mjs'), `import {appendFileSync} from 'node:fs';\nappendFileSync('calls', process.argv[2]+'\\n');\nif(process.argv[2]===process.env.FAIL_SUITE)process.exit(42);`);
    const result = spawnSync('pnpm', ['run', 'test:data-regressions', '--', '--report-dir', 'tmp/data-reports/probe'], { cwd: directory, env: { ...process.env, FAIL_SUITE: fail ?? '' }, encoding: 'utf8' });
    return { status: result.status, calls: readFileSync(path.join(directory, 'calls'), 'utf8').trim().split('\n'), output: result.stdout + result.stderr };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
describe('suite scheduling', () => {
  it('runs every standalone prerequisite exactly once and forwards integration options', () => {
    const result = execute();
    expect(result.status, result.output).toBe(0);
    expect(result.calls).toEqual(leaves);
    expect(result.output).toContain('"--report-dir" "tmp/data-reports/probe"');
  }, 30_000);
  it.each(['typecheck', 'test:unit', 'check:data:migration-provenance', 'db:schema:snapshot:check'])('blocks later suites after %s fails', (fail) => {
    const result = execute(fail);
    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual(leaves.slice(0, leaves.indexOf(fail) + 1));
  }, 30_000);
  it('partitions whole test files without losing required data assertions or duplicating them', () => {
    expect(new Set(dataRegressionFiles).size).toBe(dataRegressionFiles.length);
    expect(data.test.include).toEqual(dataRegressionFiles);
    for (const file of dataRegressionFiles) {
      expect(quality.test.exclude).toContain(file);
      expect(data.test.exclude).not.toContain(file);
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(0);
    }
  });
  it('gives CI Quality the unit suite and range jobs only focused integration after database success', () => {
    const jobs = yaml.load(readFileSync('.github/workflows/ci.yml', 'utf8')).jobs;
    expect(jobs.quality.steps.filter(step => step.run?.includes('vitest.unit.config.ts') && step.run.includes('reporter=junit'))).toHaveLength(1);
    expect(jobs.database.steps.filter(step => step.run?.includes('vitest.fast-database.config.ts') && step.run.includes('reporter=junit'))).toHaveLength(1);
    expect(jobs.database.steps.filter(step => step.run?.includes('vitest.process.config.ts') && step.run.includes('reporter=junit'))).toHaveLength(1);
    expect(jobs['data-regressions'].needs).toContain('quality');
    expect(jobs['data-regressions'].needs).toContain('database');
    const runner = readFileSync('scripts/data/run-reviewed-range-suites.mjs', 'utf8');
    expect(runner).toContain('"test:data:integration"');
    expect(runner).not.toContain('"test:data-regressions"');
    const aggregate = readFileSync('scripts/data/run-data-regression-suite.ts', 'utf8');
    expect(aggregate).toContain('"test:data:assertions"');
    expect(aggregate).not.toContain('"vitest", "run"');
  });
});
