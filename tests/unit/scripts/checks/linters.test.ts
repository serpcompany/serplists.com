import { describe, expect, it } from 'vitest';

import { actionlintImage, linterReport, type Runner, runActionlint } from '../../../../scripts/checks/linters';
import type { Ran } from '../../../../scripts/checks/tools';

const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/deploy-staging.yml'];
const FILES = [...WORKFLOWS, '.github/pull_request_template.md', 'src/app.ts'];
const ran = (status: number | null, output = '', missing = false): Ran => ({ status, output, missing });

function runnerAnswering(answers: Readonly<Record<string, Ran>>) {
  const calls: string[][] = [];
  const runner: Runner = (command, args) => {
    calls.push([command, ...args]);
    return answers[command] ?? ran(null, '', true);
  };
  return { runner, calls };
}

describe('actionlint', () => {
  it('runs at the pinned version in Docker, on the workflows only', () => {
    const { runner, calls } = runnerAnswering({ docker: ran(0) });
    expect(runActionlint('/repository', FILES, runner)).toEqual({ status: 'passed', ranIn: 'docker', output: '' });
    expect(calls).toEqual([
      ['docker', 'run', '--rm', '--mount', 'type=bind,source=/repository,target=/repository', '--workdir', '/repository', actionlintImage, ...WORKFLOWS],
    ]);
  });

  it('fails with what actionlint reports', () => {
    const { runner } = runnerAnswering({ docker: ran(1, '.github/workflows/ci.yml:3:5: unexpected key "job" [syntax-check]') });
    const result = runActionlint('/repository', FILES, runner);
    expect(linterReport(result, false)).toEqual({
      passed: false,
      findings: [`actionlint (${actionlintImage} in Docker):`, '.github/workflows/ci.yml:3:5: unexpected key "job" [syntax-check]'],
    });
  });

  it('falls back to an installed copy when Docker is missing or its daemon is down', () => {
    const daemonDown = ran(1, 'failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine');
    for (const docker of [ran(null, '', true), daemonDown, ran(125, 'Unable to find image')]) {
      const { runner } = runnerAnswering({ docker, actionlint: ran(0) });
      expect(runActionlint('/repository', FILES, runner)).toEqual({ status: 'passed', ranIn: 'installed', output: '' });
    }
  });

  it('says it did not run where neither can, passing on this machine and failing in CI', () => {
    const { runner } = runnerAnswering({});
    const result = runActionlint('/repository', FILES, runner);
    expect(result).toEqual({ status: 'not available', ranIn: null, output: '' });
    expect(linterReport(result, false).passed).toBe(true);
    expect(linterReport(result, false).findings[0]).toMatch(/^actionlint didn't run: /);
    expect(linterReport(result, true).passed).toBe(false);
  });

  it('runs nothing when the run holds no workflow', () => {
    const { runner, calls } = runnerAnswering({ docker: ran(0) });
    expect(runActionlint('/repository', ['src/app.ts'], runner)).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
