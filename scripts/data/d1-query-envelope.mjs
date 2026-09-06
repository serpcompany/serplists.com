import { parseExactJson } from './strict-json-lib.mjs';

/** @typedef {{ success: true, meta: Record<string, unknown>, results: Record<string, unknown>[] }} SuccessfulD1QueryEnvelope */

/**
 * Validate every statement before callers project rows. Raw transport uses exact
 * JSON parsing; already parsed inputs must retain their caller's strict parser.
 * Result counts and domain row semantics belong to each query's caller.
 * @param {unknown} input
 * @param {string} label A static, privacy-safe diagnostic label.
 * @returns {SuccessfulD1QueryEnvelope[]}
 */
export function validateQueryResultEnvelopes(input, label) {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = parseExactJson(input); }
    catch { throw new Error(`${label} result transport evidence is missing or malformed.`); }
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!entries.length || entries.some(entry => !object(entry) || entry.success !== true ||
      Object.hasOwn(entry, 'error') ||
      (Object.hasOwn(entry, 'errors') && (!Array.isArray(entry.errors) || entry.errors.length !== 0)) ||
      !object(entry.meta) || !Array.isArray(entry.results) || entry.results.some(row => !object(row)))) {
    throw new Error(`${label} result envelope is failed or malformed.`);
  }
  return entries;
}
