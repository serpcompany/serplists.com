import { createHash } from "node:crypto";
import { parseAppliedMigrationLedger, privacySafeDomainSnapshot, compareDomainSnapshots } from "./invariant-capture-lib.mjs";
import { parseLegacySections, validRetiredChecklistContent } from '../../src/lib/schemas/legacyChecklistSchema.ts';

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function sanitizedSourceRole(state, row, principal) {
  if (row.team_id == null) return row.user_id === principal ? 5 : 0;
  if (!state.cohort.teams.some(team => team.id === row.team_id && team.archived_at == null)) return 0;
  const member = state.cohort.members.find(member => member.team_id === row.team_id && member.user_id === principal && member.status === 'active');
  return ({ viewer: 1, runner: 2, editor: 3, admin: 4, owner: 5 })[member?.role] ?? 0;
}
export const validSanitizedSourceRow = (kind, row) => parseLegacySections(row.items).success && (kind !== 'runs' || validRetiredChecklistContent(row.retired_items));
export const sanitizedOwnershipContext = row => row.team_id == null ? `user:${row.user_id}` : `team:${row.team_id}`;

// Derived at independent D1 capture time, before any handler write. No customer
// content is emitted: cases contain only sanitized identities and operations.
export function deriveSanitizedRequirements(state) {
  const cases = [], contexts = [], withheldRows = [];
  for (const [kind, minimum] of [['templates', 3], ['runs', 2]]) {
    for (const row of state.rows[kind]) {
      const authorized = state.cohort.principals.filter(p => sanitizedSourceRole(state, row, p.id) > 0);
      const publicRead = kind === 'templates' && Boolean(row.is_public) && row.deleted_at == null;
      if (!authorized.length && !publicRead) withheldRows.push({ kind, id: row.id, reason: state.cohort.teams.some(t => t.id === row.team_id && t.archived_at != null) ? 'archived-team-api-refusal' : 'missing-authorized-source-principal', cohortSha256: state.cohortSha256 });
      const add = (principal, action) => cases.push({ kind, id: row.id, principal, action });
      for (const principal of state.cohort.principals) {
        const role = sanitizedSourceRole(state, row, principal.id);
        if (!role && !publicRead) {
          add(principal.id, 'private-denial');
          if (row.deleted_at == null) add(principal.id, 'private-write-denial');
        } else {
          add(principal.id, 'read');
          if (role < minimum && row.deleted_at == null) add(principal.id, 'role-write-denial');
          if (role && row.deleted_at == null) add(principal.id, parseLegacySections(row.items).success ? 'browser-read' : 'browser-refusal');
        }
      }
      if (authorized.length && row.deleted_at == null && !validSanitizedSourceRow(kind, row)) {
        const writer = authorized.find(p => sanitizedSourceRole(state, row, p.id) >= minimum)?.id ?? null;
        add(writer, 'malformed-refusal');
        const parsed = parseLegacySections(row.items);
        if (kind === 'runs' && row.status === 'in_progress' && parsed.success && parsed.data.some(section => section.items.length)) add(writer, 'browser-write-refusal');
      }
    }
    for (const contextId of new Set(state.rows[kind].map(sanitizedOwnershipContext))) {
      const rows = state.rows[kind].filter(row => sanitizedOwnershipContext(row) === contextId);
      const principals = state.cohort.principals.filter(p => sanitizedSourceRole(state, rows[0], p.id) >= minimum).map(p => p.id);
      const candidateIds = rows.filter(row => row.deleted_at == null && !row.is_public && validSanitizedSourceRow(kind, row) && (kind !== 'runs' || row.status === 'in_progress') && (kind !== 'templates' || state.rows.runs.filter(run => run.template_id === row.id && run.deleted_at == null && run.status === 'in_progress').every(run => validSanitizedSourceRow('runs', run)))).map(row => row.id);
      contexts.push({ kind, contextId, principals, candidateIds });
    }
  }
  return { principals: state.cohort.principals.map(p => p.id), cases, contexts, withheldRows };
}

// Only for already sanitized rehearsal data. This public digest is never a
// substitute for the protected HMAC used to inspect production/customer rows.
export function sanitizedState({ templates, runs, principals = [], teams = [], members = [], ledger, sourceSha256 }) {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? "")) throw new Error("Sanitized source digest is required.");
  const ordered = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
  const rows = { templates: ordered(templates), runs: ordered(runs) };
  const cohort = { principals: ordered(principals), teams: ordered(teams), members: ordered(members) };
  const state = { sourceSha256, domainSha256: hash(canonical(rows)), cohortSha256: hash(canonical(cohort)), cohort, ledger, ledgerSha256: hash(ledger), rows };
  const requirements = deriveSanitizedRequirements(state);
  return { ...state, requirements, requirementsSha256: hash(canonical(requirements)) };
}

export function captureSanitizedState({ query, sourceSha256 }) {
  const rows = (sql) => {
    const parsed = JSON.parse(query(sql));
    if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0]?.results)) throw new Error("Incomplete sanitized state query.");
    return parsed[0].results;
  };
  const domainRows = (table) => {
    const columns = rows(`PRAGMA table_info(${table})`).map((row) => row.name);
    if (!columns.length || columns.some((name) => !/^[a-z_][a-z0-9_]*$/.test(name))) throw new Error("Sanitized domain columns are missing or unsupported.");
    // Wrangler's display serializer changes SQL NULL into the text "null".
    // Serialize inside SQLite so null, text, numbers and every column survive
    // identically across local and remote execution without lossy coercion.
    return rows(`SELECT json_object(${columns.map((name) => `'${name}',"${name}"`).join(",")}) AS row_json FROM ${table} ORDER BY id`).map((row) => JSON.parse(row.row_json));
  };
  return sanitizedState({ templates: domainRows("templates"), runs: domainRows("checklist_runs"), principals: domainRows('users').map(({ id }) => ({ id })), teams: domainRows('teams'), members: domainRows('team_members'), ledger: parseAppliedMigrationLedger(query("SELECT id,name FROM d1_migrations ORDER BY id")), sourceSha256 });
}

export function verifySanitizedTransformation({ before, after, expectedLedger }) {
  if (!before.cohortSha256 || before.cohortSha256 !== after.cohortSha256) throw new Error('Sanitized transformation changed the selected authorization cohort.');
  if (before.sourceSha256 !== after.sourceSha256 || JSON.stringify(after.ledger) !== JSON.stringify(expectedLedger)) throw new Error("Sanitized state source or exact migration ledger mismatch.");
  const domain = (state) => privacySafeDomainSnapshot({ templateRows: state.rows.templates, runRows: state.rows.runs, key: state.sourceSha256, hasEvolution: state.ledger.includes("0024_safe_template_evolution.sql") });
  const result = compareDomainSnapshots({ pre: domain(before), post: domain(after), preHasEvolution: before.ledger.includes("0024_safe_template_evolution.sql"), postHasEvolution: after.ledger.includes("0024_safe_template_evolution.sql") });
  if (result.verdict !== "pass") throw new Error(`Sanitized transformation failed: ${result.failures.join("; ")}`);
  return result;
}

export function validateSanitizedStateBinding(local, remote) {
  for (const state of [local, remote]) if (!state?.requirements || hash(canonical(state.requirements)) !== state.requirementsSha256) throw new Error('Authenticated source requirements digest mismatch.');
  for (const state of [local, remote]) if (state?.cohort && hash(canonical(state.cohort)) !== state.cohortSha256) throw new Error('Authenticated selected cohort digest mismatch.');
  for (const field of ["sourceSha256", "domainSha256", "cohortSha256", "ledgerSha256", "requirementsSha256"]) {
    if (!/^[a-f0-9]{64}$/.test(local?.[field] ?? "") || local[field] !== remote?.[field]) throw new Error(`Authenticated post-migration sanitized ${field} mismatch.`);
  }
  if (!Array.isArray(local.ledger) || !local.ledger.length || JSON.stringify(local.ledger) !== JSON.stringify(remote?.ledger) || hash(local.ledger) !== local.ledgerSha256) throw new Error("Authenticated post-migration exact ledger mismatch.");
  return true;
}

export function verifySanitizedRefusalPreservation({ before, after, proof }) {
  // The harness also has explicitly synthetic route fixtures. Scope this check
  // to imported principals/teams, including every current member of those teams
  // so an injected privilege grant cannot hide outside the original member IDs.
  const principalIds = new Set(before.cohort.principals.map(row => row.id));
  const teamIds = new Set(before.cohort.teams.map(row => row.id));
  after = sanitizedState({ templates: after.rows.templates, runs: after.rows.runs, principals: after.cohort.principals.filter(row => principalIds.has(row.id)), teams: after.cohort.teams.filter(row => teamIds.has(row.id)), members: after.cohort.members.filter(row => teamIds.has(row.team_id)), ledger: after.ledger, sourceSha256: after.sourceSha256 });
  if (before.cohortSha256 !== after.cohortSha256 || before.sourceSha256 !== after.sourceSha256 || before.ledgerSha256 !== after.ledgerSha256) throw new Error('Handler refusal changed the selected cohort or ledger.');
  for (const [kind, originals] of Object.entries(before.rows)) {
    const originalIds = new Set(originals.map(row => row.id));
    const scoped = after.rows[kind].filter(row => originalIds.has(row.id) || (row.team_id == null ? principalIds.has(row.user_id) : teamIds.has(row.team_id)));
    const identities = rows => rows.map(row => JSON.stringify([row.id, sanitizedOwnershipContext(row)])).sort();
    if (originalIds.size !== originals.length || new Set(scoped.map(row => row.id)).size !== scoped.length || JSON.stringify(identities(originals)) !== JSON.stringify(identities(scoped))) throw new Error('Handler changed imported source row identities or ownership scopes.');
  }
  const archived = new Set(before.cohort.teams.filter(team => team.archived_at != null).map(team => team.id));
  const withheld = Object.entries(before.rows).flatMap(([kind, rows]) => rows.filter(row => archived.has(row.team_id) && !(kind === 'templates' && row.is_public && row.deleted_at == null)).map(row => ({ kind, id: row.id })));
  const key = row => `${row.kind}:${row.id}`;
  if (JSON.stringify(withheld.map(key).sort()) !== JSON.stringify(proof.cohortProof.withheldRows.map(key).sort())) throw new Error('Archived source refusal coverage mismatch.');
  const preserved = [...withheld, ...proof.malformedSourceChecks];
  for (const reference of preserved) {
    const original = before.rows[reference.kind]?.find(row => row.id === reference.id);
    const actual = after.rows[reference.kind]?.find(row => row.id === reference.id);
    if (!original || !actual || hash(canonical(original)) !== hash(canonical(actual))) throw new Error('Handler refusal changed or lost a source row.');
  }
  let untouchedRows = 0, writtenRows = 0;
  for (const [kind, rows] of Object.entries(before.rows)) for (const original of rows) {
    const actual = after.rows[kind].find(row => row.id === original.id);
    if (!actual) throw new Error('Handler lost an imported source row.');
    const write = proof.cohortProof.contexts.find(row => row.kind === kind && row.id === original.id && row.write === 'pass');
    const expected = { ...original };
    if (write) {
      if (typeof actual.updated_at !== 'string' || !Number.isFinite(Date.parse(actual.updated_at))) throw new Error('Handler canary timestamp is invalid.');
      expected.updated_at = actual.updated_at;
      if (kind === 'templates') Object.assign(expected, { title: 'Sanitized Template Handler Verified', version: original.version + 1, updated_by_user_id: write.principal });
      else Object.assign(expected, { progress: 42, revision: original.revision + 1 });
      writtenRows++;
    } else untouchedRows++;
    if (hash(canonical(expected)) !== hash(canonical(actual))) throw new Error('Handler changed an unapproved source field or untouched row.');
  }
  return { verdict: 'pass', cohortSha256: after.cohortSha256, withheldRows: withheld.length, malformedRows: proof.malformedSourceChecks.length, untouchedRows, writtenRows };
}

export function validateSanitizedCohortProof(proof, { state, selection }) {
  const fail = () => { throw new Error('Authenticated selected cohort evidence is missing or inconsistent.'); };
  if (!proof || proof.cohortSha256 !== state.cohortSha256 || JSON.stringify(proof.selectedCounts) !== JSON.stringify(selection.selectedCounts) || JSON.stringify(proof.profileExclusions) !== JSON.stringify(selection.profileExclusions)) fail();
  const requirements = state.requirements;
  if (!requirements || hash(canonical(requirements)) !== state.requirementsSha256 || proof.requirementsSha256 !== state.requirementsSha256) fail();
  if (state.rows && hash(canonical(deriveSanitizedRequirements(state))) !== state.requirementsSha256) fail();
  const caseKey = row => JSON.stringify([row.kind, row.id, row.principal, row.action]);
  if (!Array.isArray(proof.cases) || proof.cases.length !== requirements.cases.length || new Set(proof.cases.map(caseKey)).size !== proof.cases.length) fail();
  const actualCases = new Map(proof.cases.map(row => [caseKey(row), row]));
  if (requirements.cases.some(row => !row.principal || actualCases.get(caseKey(row))?.verdict !== 'pass')) fail();
  if (JSON.stringify(canonical(proof.withheldRows)) !== JSON.stringify(canonical(requirements.withheldRows)) || requirements.withheldRows.some(row => row.reason !== 'archived-team-api-refusal')) fail();
  if (!Array.isArray(proof.contexts) || proof.contexts.length !== requirements.contexts.length || new Set(proof.contexts.map(row => `${row.kind}:${row.contextId}`)).size !== proof.contexts.length) fail();
  for (const expected of requirements.contexts) {
    const actual = proof.contexts.find(row => row.kind === expected.kind && row.contextId === expected.contextId);
    if (!actual) fail();
    if (!expected.principals.length) { if (actual.write !== 'no-authorized-source-writer' || actual.id != null || actual.principal != null) fail(); }
    else if (actual.write !== 'pass' || !expected.principals.includes(actual.principal) || !expected.candidateIds.includes(actual.id) || actual.browserWriteReadback !== 'pass') fail();
  }
  for (const [key, action] of [['rowReads','read'], ['privateDenials','private-denial'], ['roleWriteDenials','role-write-denial']]) if (proof.measurements?.[key] !== requirements.cases.filter(row => row.action === action).length) fail();
  if (proof.postHandlerPreservation?.verdict !== 'pass' || proof.postHandlerPreservation.cohortSha256 !== state.cohortSha256 || proof.postHandlerPreservation.withheldRows !== proof.withheldRows?.length) fail();
  const preserved = proof.postHandlerPreservation;
  if (!Number.isSafeInteger(preserved.untouchedRows) || preserved.untouchedRows < 0 || !Number.isSafeInteger(preserved.writtenRows) || preserved.writtenRows < 1 || preserved.untouchedRows + preserved.writtenRows !== selection.selectedCounts.templates + selection.selectedCounts.checklistRuns) fail();
  const principals = proof.authenticatedPrincipals;
  if (!Array.isArray(principals) || principals.length !== selection.selectedCounts.users || new Set(principals).size !== principals.length || principals.some(id => !/^rehearsal-owner-[1-9][0-9]*$/.test(id))) fail();
  if (state.cohort && JSON.stringify([...principals].sort()) !== JSON.stringify(state.cohort.principals.map(row => row.id).sort())) fail();
  if (JSON.stringify([...principals].sort()) !== JSON.stringify([...requirements.principals].sort())) fail();
  if (preserved.malformedRows !== requirements.cases.filter(row => row.action === 'malformed-refusal').length) fail();
  const measured = proof.measurements;
  if (!measured || ['rowReads','privateDenials','roleWriteDenials','templateWrites','runWrites'].some(key => !Number.isSafeInteger(measured[key]) || measured[key] < 0)) fail();
  if (!Array.isArray(proof.withheldRows) || proof.withheldRows.some(row => row.reason !== 'archived-team-api-refusal' || row.cohortSha256 !== state.cohortSha256)) fail();
  if (new Set(proof.withheldRows.map(row => `${row.kind}:${row.id}`)).size !== proof.withheldRows.length) fail();
  if (measured.rowReads + proof.withheldRows.length < selection.selectedCounts.templates + selection.selectedCounts.checklistRuns || measured.templateWrites < 1 || measured.runWrites < 1) fail();
  if (preserved.writtenRows !== measured.templateWrites + measured.runWrites) fail();
  if (!Array.isArray(proof.contexts) || !proof.contexts.length || proof.contexts.some(row => !['pass','no-authorized-source-writer'].includes(row.write))) fail();
  for (const [kind, key] of [['templates','templateWrites'], ['runs','runWrites']]) if (proof.contexts.filter(row => row.kind === kind && row.write === 'pass').length !== measured[key]) fail();
  return true;
}
