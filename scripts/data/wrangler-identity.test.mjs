import { expect, it } from 'vitest';
import { extractD1Identity } from './wrangler-identity-lib.mjs';
import { assertLiveIdentity } from './data-command-lib.mjs';
import { runProductionIdentityBoundCommand } from './production-identity-bound-command-lib.mjs';

const name = 'serp-checklists-rehearsal-identity155';
const uuid = '11111111-1111-4111-8111-111111111111';
const secret = 'PRIVATE_IDENTITY_ERROR_155';
const expected = { databaseName: name, databaseId: uuid };
const invalid = [
  { success: true, errors: [{ message: secret }] },
  { error: secret }, { error: null }, { error: false },
  { errors: null }, { errors: {} }, { errors: secret },
  { success: false }, { success: null }, { success: 'true' }, { success: 1 },
  { database_id: '22222222-2222-4222-8222-222222222222' },
  { database_name: secret }, { database_id: null }, { database_name: null },
];
it.each(invalid)('rejects invalid identity metadata without provider detail: %j', fields => {
  for (const payload of [{ name, uuid, ...fields }, [{ name, uuid, ...fields }]]) {
    const output = JSON.stringify(payload);
    expect(() => extractD1Identity(output)).toThrow();
    try { extractD1Identity(output); } catch (error) { expect(error.message).not.toContain(secret); }
    expect(() => assertLiveIdentity({ output, expected })).toThrow();
  }
});
it.each([
  `{"name":"${name}","uuid":"${uuid}","success":false,"success":true}`,
  `{"name":"${name}","uuid":"${uuid}","errors":["${secret}"],"errors":[]}`,
  `{"name":"${secret}","name":"${name}","uuid":"${uuid}"}`,
  JSON.stringify([{ name, uuid }, { name, uuid }]), '[]', 'null', 'false',
])('rejects duplicate keys and ambiguous records: %s', output => {
  expect(() => extractD1Identity(output)).toThrow();
  expect(() => assertLiveIdentity({ output, expected })).toThrow();
});

it.each(['before', 'after'])('production identity-bound caller rejects contradictory %s observation', when => {
  const calls = [];
  let observations = 0;
  expect(() => runProductionIdentityBoundCommand({
    environment: 'production', database: expected, operation: 'export',
    commandArgs: ['d1', 'export', name, '--remote'],
    runWrangler: args => {
      calls.push(args[1]);
      if (args[1] !== 'info') return 'controlled-export';
      observations++;
      return JSON.stringify({ name, uuid, success: true, errors: observations === (when === 'before' ? 1 : 2) ? [secret] : [] });
    },
  })).toThrow();
  expect(calls).toEqual(when === 'before' ? ['info'] : ['info', 'export', 'info']);
});
it.each([
  { name, uuid }, { database_name: name, database_id: uuid },
  { name, uuid, database_name: name, database_id: uuid, success: true, errors: [], file_size: 0 },
])('preserves flat and single-record Wrangler identities: %j', payload => {
  for (const shape of [payload, [payload]]) {
    const output = JSON.stringify(shape);
    expect(extractD1Identity(output)).toEqual(expected);
    expect(() => assertLiveIdentity({ output, expected })).not.toThrow();
  }
});
