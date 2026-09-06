import { fileURLToPath } from 'node:url';
import { resolveDirectCheckIdentity } from './environment-identity-lib.mjs';
import { parseStrictJson } from './strict-json-lib.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export function validateCanaryObservation(output, expected) {
  const parsed = parseStrictJson(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const entry = entries[0];
  if (entries.length !== 1 || !entry || typeof entry !== 'object' || Array.isArray(entry)
      || (Object.hasOwn(entry, 'success') && entry.success !== true)
      || Object.hasOwn(entry, 'error')
      || (Object.hasOwn(entry, 'errors') && (!Array.isArray(entry.errors) || entry.errors.length))) {
    throw new Error('Canary identity response is failed or ambiguous.');
  }
  for (const [aliases, value] of [
    [['name', 'database_name'], expected.databaseName],
    [['uuid', 'database_id'], expected.databaseId],
  ]) {
    const present = aliases.filter(alias => Object.hasOwn(entry, alias));
    if (!present.length || present.some(alias => entry[alias] !== value)) throw new Error('Canary observed identity does not match configuration.');
  }
  if ((Object.hasOwn(entry, 'binding') && entry.binding !== 'DB')
      || (Object.hasOwn(entry, 'environment') && entry.environment !== expected.environment)) {
    throw new Error('Canary observed target does not match configuration.');
  }
}

// .github/workflows/cloudflare-pages-deploy.yml deploys serplists-com:
// staging uses the fixed branch alias; production consumes the protected
// --branch main deploy output (deployment URL, or the final Pages alias).
// A hash-shaped URL is not proof of branch/commit: that authority remains the
// protected production deploy artifact, not this offline destination check.
export function validateCanaryDestinations({ environment, deploymentUrl, customDomain }) {
  const origin = value => {
    if (typeof value !== 'string' || !/^https:\/\/[a-z0-9.-]+\/?$/.test(value)) throw new Error('Canary destination must be an unambiguous HTTPS origin.');
    const url = new URL(value);
    if (value !== url.origin && value !== `${url.origin}/`) throw new Error('Canary destination must be a canonical origin.');
    return url.origin;
  };
  const deployment = origin(deploymentUrl);
  const custom = origin(customDomain);
  const allowed = environment === 'staging'
    ? deployment === 'https://staging.serplists-com.pages.dev' && custom === 'https://staging.serplists.com'
    : environment === 'production'
      && /^https:\/\/(?:(?:[a-f0-9]{8}|main)\.)?serplists-com\.pages\.dev$/.test(deployment)
      && custom === 'https://serplists.com';
  if (!allowed) throw new Error('Canary destination is outside the configured environment.');
}

export function validateCanaryTarget({ argv, environment, binding, databaseName, databaseId }) {
  const options = new Set(['--environment', '--binding', '--database-name', '--database-id', '--deployment-url', '--custom-domain', '--migration-from', '--migration-to', '--report-dir']);
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--' && !seen.has(option)) { seen.add(option); continue; }
    if (!options.has(option) || seen.has(option)) throw new Error('Unknown or ambiguous canary option.');
    seen.add(option);
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error('Missing canary option value.');
  }
  if (![...options].filter(option => option !== '--report-dir').every(option => seen.has(option)) || !['staging', 'production'].includes(environment)) {
    throw new Error('Canary requires an explicit supported remote target.');
  }
  return resolveDirectCheckIdentity({ repoRoot, environment, binding, databaseName, databaseId, local: false, remote: true, argv: [] });
}
