import { expect, it } from 'vitest';
import { assertPre0024Compatibility } from './pre0024-compatibility-lib.mjs';

const repoRoot = new URL('../..', import.meta.url).pathname;
const check = (items, family) => assertPre0024Compatibility({ repoRoot, templates: [], runs: [], [family]: [{ id: 'PRIVATE_ROW', items: JSON.stringify(items) }] });

it.each(['templates', 'runs'])('checks every generated identity scope on raw %s without disclosing identities', family => {
  const examples = [
    [{ id: 'legacy-section-2', items: [] }, { items: [] }],
    [{ id: 'PRIVATE_SECTION', items: [{ id: 'legacy-item-1-2' }, {}] }],
    [{ id: 'PRIVATE_SECTION', items: [{ id: 'PRIVATE_ITEM', subItems: [{ id: 'legacy-subitem-1-1-2' }, {}] }] }],
    [{ id: 'PRIVATE_SECTION', items: [{ id: 'PRIVATE_ITEM', subItems: [{ id: 'legacy-subitem-1-1-2' }], contents: [{ type: 'subItems', subItems: [{}] }] }] }],
    [{ id: 'legacy-item-1-2', title: 'PRIVATE_TITLE' }, {}],
  ];
  for (const items of examples) {
    expect(() => check(items, family)).toThrow('Production-shaped source is incompatible with immutable 0024 (GENERATED_ID_COLLISION).');
    const safe = JSON.parse(JSON.stringify(items).replaceAll('legacy-', 'PRIVATE_SAFE_').replace('"id":"1"', '"id":"PRIVATE_ONE"'));
    expect(() => check(safe, family)).not.toThrow();
  }
});

it('accepts preexisting duplicates unchanged by backfill, independent rows and empty families', () => {
  const items = [{ id: 'section', items: [{ id: 'duplicate' }, { id: 'duplicate' }, {}] }];
  expect(() => check(items, 'templates')).not.toThrow();
  const row = { items: JSON.stringify([{ id: 'section', items: [{}] }]) };
  expect(() => assertPre0024Compatibility({ repoRoot, templates: [row, row], runs: [row] })).not.toThrow();
  expect(() => assertPre0024Compatibility({ repoRoot, templates: [], runs: [] })).not.toThrow();
});

it('allows equal IDs across distinct section, item and subitem namespaces', () => {
  expect(() => check([{ id: '1' }], 'templates')).not.toThrow();
  expect(() => check([{ id: 'legacy-item-1-1', items: [{ subItems: [{ id: 'legacy-item-1-1' }] }] }], 'templates')).not.toThrow();
});

it.each(['templates', 'runs'])('accepts opaque content and extension IDs on raw %s while rejecting structural collisions', family => {
  const items = [{ id: 'section-safe', items: [
    { id: 'item-safe', title: 'A', contents: [{ id: 'legacy-item-1-2', type: 'text', value: 'synthetic' }] },
    { title: 'B' },
  ] }];
  expect(() => check(items, family)).not.toThrow();
  items[0].extension = { id: 'legacy-item-1-2', items: [{ id: 'legacy-item-1-2' }] };
  expect(() => check(items, family)).not.toThrow();
  items[0].items[0].id = 'legacy-item-1-2';
  expect(() => check(items, family)).toThrow('Production-shaped source is incompatible with immutable 0024 (GENERATED_ID_COLLISION).');
});

it('fails closed with fixed diagnostics for unverifiable raw input', () => {
  for (const items of ['PRIVATE_INVALID', '{"PRIVATE_KEY":1}', '[{"id":1,"id":2}]']) {
    expect(() => assertPre0024Compatibility({ repoRoot, templates: [{ items }], runs: [] })).toThrow('Production-shaped source compatibility with immutable 0024 could not be verified (PRE0024_COMPATIBILITY).');
  }
});
