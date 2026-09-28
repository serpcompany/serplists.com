import { describe, expect, it } from 'vitest';

import {
  MAX_RUN_TITLE_LENGTH,
  buildDefaultRunName,
  resolveRunName,
} from '@/lib/runName';

const now = new Date('2026-09-28T10:15:00.000Z');
const stamp = now.toLocaleString();

describe('buildDefaultRunName', () => {
  it('names the run after the template and the start time', () => {
    expect(buildDefaultRunName('Moving Checklist', now)).toBe(`Moving Checklist - ${stamp}`);
  });

  it('shortens a long template title so the name fits the run title limit', () => {
    const name = buildDefaultRunName('T'.repeat(MAX_RUN_TITLE_LENGTH), now);

    expect(MAX_RUN_TITLE_LENGTH).toBe(160);
    expect(name.length).toBeLessThanOrEqual(MAX_RUN_TITLE_LENGTH);
    expect(name.endsWith(` - ${stamp}`)).toBe(true);
    expect(name.startsWith('TTT')).toBe(true);
  });

  it('never builds a name that starts with a dangling separator', () => {
    expect(buildDefaultRunName('   ', now)).toBe(stamp);
  });
});

describe('resolveRunName', () => {
  it('uses the default name for an empty or whitespace-only input', () => {
    expect(resolveRunName('', 'Moving Checklist', now)).toBe(`Moving Checklist - ${stamp}`);
    expect(resolveRunName('   ', 'Moving Checklist', now)).toBe(`Moving Checklist - ${stamp}`);
  });

  it('keeps a typed name, trimmed', () => {
    expect(resolveRunName('  Spring move  ', 'Moving Checklist', now)).toBe('Spring move');
  });
});
