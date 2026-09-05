import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayMigrations, listMigrationFiles } from "./schema-contract.ts";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { captureSanitizedState, sanitizedState, verifySanitizedTransformation, validateSanitizedStateBinding, verifySanitizedRefusalPreservation, validateSanitizedCohortProof } from "./sanitized-state-lib.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;
const migration = "0024_safe_template_evolution.sql";
const ledger = listMigrationFiles().map((file) => file.name);
const artifact = generateSanitizedRehearsalArtifact({ migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sourceSchema: "0023_add_sitemap_revision_state.sql", repoRoot, rawExport: readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"), sourceDatabaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1", sourceDate: "2026-09-05", gitCommit: "a".repeat(40), issueNumber: 95, requestedApproverIdentity: "@devinschumacher", generatedAt: new Date("2026-09-05T00:00:00Z"), retentionDeadline: "2026-09-05T12:00:00Z" });
const snapshot = (db, applied) => sanitizedState({ templates: db.prepare("SELECT * FROM templates").all(), runs: db.prepare("SELECT * FROM checklist_runs").all(), ledger: applied, sourceSha256: artifact.manifest.artifact.sha256 });

function writtenSource() {
  const before = sanitizedState({
    templates: [{ id: 't', user_id: 'rehearsal-owner-1', team_id: null, items: '[]', is_public: 0, deleted_at: null, title: 'Original', version: 1 }],
    runs: [{ id: 'r', user_id: 'rehearsal-owner-1', team_id: 'team', items: '[]', retired_items: '[]', deleted_at: null, status: 'in_progress', progress: 0, revision: 1 }],
    principals: [{ id: 'rehearsal-owner-1' }], teams: [{ id: 'team', archived_at: null }],
    members: [{ id: 'm', user_id: 'rehearsal-owner-1', team_id: 'team', role: 'owner', status: 'active' }], ledger, sourceSha256: artifact.manifest.artifact.sha256,
  });
  const after = structuredClone(before);
  Object.assign(after.rows.templates[0], { title: 'Sanitized Template Handler Verified', version: 2, updated_by_user_id: 'rehearsal-owner-1', updated_at: '2026-09-05T00:00:00Z' });
  Object.assign(after.rows.runs[0], { progress: 42, revision: 2, updated_at: '2026-09-05T00:00:00Z' });
  const selection = { selectedCounts: { users: 1, templates: 1, checklistRuns: 1 }, profileExclusions: [] };
  const proof = { malformedSourceChecks: [], cohortProof: {
    cohortSha256: before.cohortSha256, requirementsSha256: before.requirementsSha256,
    ...selection, authenticatedPrincipals: ['rehearsal-owner-1'], withheldRows: [],
    cases: [
      { kind: 'templates', id: 't', principal: 'rehearsal-owner-1', action: 'read', verdict: 'pass' },
      { kind: 'templates', id: 't', principal: 'rehearsal-owner-1', action: 'browser-read', verdict: 'pass' },
      { kind: 'runs', id: 'r', principal: 'rehearsal-owner-1', action: 'read', verdict: 'pass' },
      { kind: 'runs', id: 'r', principal: 'rehearsal-owner-1', action: 'browser-read', verdict: 'pass' },
    ],
    contexts: [
      { kind: 'templates', contextId: 'user:rehearsal-owner-1', id: 't', principal: 'rehearsal-owner-1', write: 'pass', browserWriteReadback: 'pass' },
      { kind: 'runs', contextId: 'team:team', id: 'r', principal: 'rehearsal-owner-1', write: 'pass', browserWriteReadback: 'pass' },
    ], measurements: { rowReads: 2, privateDenials: 0, roleWriteDenials: 0, templateWrites: 1, runWrites: 1 },
  } };
  return { before, after, proof, selection };
}

describe("sanitized candidate state", () => {
  it('rejects an extra imported-personal template after valid canaries before cohort proof can pass', () => {
    const { before, after, proof, selection } = writtenSource();
    proof.cohortProof.postHandlerPreservation = verifySanitizedRefusalPreservation({ before, after, proof });
    expect(validateSanitizedCohortProof(proof.cohortProof, { state: before, selection })).toBe(true);
    after.rows.templates.push({ ...after.rows.templates[0], id: 'extra' });
    expect(() => {
      proof.cohortProof.postHandlerPreservation = verifySanitizedRefusalPreservation({ before, after, proof });
      validateSanitizedCohortProof(proof.cohortProof, { state: before, selection });
    }).toThrow(/identit/);
  });
  it.each(['templates', 'runs'])('rejects added, lost, moved and duplicate %s across imported ownership scopes', kind => {
    for (const mutation of [
      rows => rows.push({ ...rows[0], id: 'extra-personal', team_id: null }),
      rows => rows.push({ ...rows[0], id: 'extra-team', team_id: 'team', user_id: 'unrelated' }),
      rows => rows.pop(),
      rows => { rows[0].team_id = 'unrelated-team'; },
      rows => { rows[0].team_id = null; rows[0].user_id = 'unrelated'; },
      rows => rows.push({ ...rows[0] }),
      rows => rows.push({ ...rows[0], team_id: 'unrelated-team', user_id: 'unrelated' }),
    ]) {
      const { before, after, proof } = writtenSource();
      mutation(after.rows[kind]);
      expect(() => verifySanitizedRefusalPreservation({ before, after, proof })).toThrow(/identit/);
    }
  });
  it('allows unrelated synthetic fixtures while preserving the complete imported cohort and canaries', () => {
    const { before, after, proof, selection } = writtenSource();
    after.cohort.principals.push({ id: 'route-owner' });
    after.cohort.teams.push({ id: 'route-team', archived_at: null });
    after.cohort.members.push({ id: 'route-member', team_id: 'route-team', user_id: 'route-owner', role: 'owner', status: 'active' });
    for (const kind of ['templates', 'runs']) after.rows[kind].push(
      { ...after.rows[kind][0], id: 'route-personal', user_id: 'route-owner', team_id: null },
      { ...after.rows[kind][0], id: 'route-team-row', user_id: 'route-owner', team_id: 'route-team' },
    );
    proof.cohortProof.postHandlerPreservation = verifySanitizedRefusalPreservation({ before, after, proof });
    expect(proof.cohortProof.postHandlerPreservation).toEqual({ verdict: 'pass', cohortSha256: before.cohortSha256, withheldRows: 0, malformedRows: 0, untouchedRows: 0, writtenRows: 2 });
    expect(validateSanitizedCohortProof(proof.cohortProof, { state: before, selection })).toBe(true);
    after.cohort.members.push({ id: 'injected', team_id: 'team', user_id: 'route-owner', role: 'owner', status: 'active' });
    expect(() => verifySanitizedRefusalPreservation({ before, after, proof })).toThrow(/cohort/);
  });
  it('requires archived-team PUT refusals without a GET reader and retains public-template and deleted-row semantics', () => {
    const row = { user_id: 'rehearsal-owner-1', team_id: 'archived', items: '[]', retired_items: '[]', deleted_at: null, is_public: 0, status: 'in_progress' };
    const before = sanitizedState({
      templates: [{ ...row, id: 'private-template' }, { ...row, id: 'public-template', is_public: 1 }, { ...row, id: 'deleted-template', deleted_at: '2026-09-05' }],
      runs: [{ ...row, id: 'private-run' }, { ...row, id: 'public-run', is_public: 1 }, { ...row, id: 'deleted-run', deleted_at: '2026-09-05' }],
      principals: [{ id: 'rehearsal-owner-1' }], teams: [{ id: 'archived', archived_at: '2026-09-05' }],
      members: [{ id: 'former-owner', team_id: 'archived', user_id: 'rehearsal-owner-1', role: 'owner', status: 'active' }], ledger, sourceSha256: artifact.manifest.artifact.sha256,
    });
    expect(before.requirements.cases.map(({ kind, id, principal, action }) => [kind, id, principal, action])).toEqual([
      ['templates', 'deleted-template', 'rehearsal-owner-1', 'private-denial'],
      ['templates', 'private-template', 'rehearsal-owner-1', 'private-denial'],
      ['templates', 'private-template', 'rehearsal-owner-1', 'private-write-denial'],
      ['templates', 'public-template', 'rehearsal-owner-1', 'read'],
      ['templates', 'public-template', 'rehearsal-owner-1', 'role-write-denial'],
      ['runs', 'deleted-run', 'rehearsal-owner-1', 'private-denial'],
      ['runs', 'private-run', 'rehearsal-owner-1', 'private-denial'],
      ['runs', 'private-run', 'rehearsal-owner-1', 'private-write-denial'],
      ['runs', 'public-run', 'rehearsal-owner-1', 'private-denial'],
      ['runs', 'public-run', 'rehearsal-owner-1', 'private-write-denial'],
    ]);
    expect(before.requirements.contexts).toEqual([
      { kind: 'templates', contextId: 'team:archived', principals: [], candidateIds: ['private-template'] },
      { kind: 'runs', contextId: 'team:archived', principals: [], candidateIds: ['private-run'] },
    ]);
    const proof = { malformedSourceChecks: [], cohortProof: { withheldRows: before.requirements.withheldRows, contexts: [] } };
    expect(verifySanitizedRefusalPreservation({ before, after: structuredClone(before), proof })).toMatchObject({ verdict: 'pass', withheldRows: 5, untouchedRows: 6, writtenRows: 0 });
    for (const kind of ['templates', 'runs']) {
      const after = structuredClone(before);
      after.rows[kind].find(row => row.id === (kind === 'templates' ? 'private-template' : 'private-run')).title = 'Denied PUT still wrote';
      expect(() => verifySanitizedRefusalPreservation({ before, after, proof })).toThrow(/refusal changed/);
    }
  });
  it('retains malformed-page and invalid-retired write refusals for actual authorized source writers', () => {
    const owner = { user_id: 'rehearsal-owner-1', team_id: null, deleted_at: null, is_public: 0 };
    const state = sanitizedState({
      templates: [{ ...owner, id: 'malformed-template', items: '{}' }],
      runs: [{ ...owner, id: 'malformed-run', items: '[{"id":"s","title":"Section","items":[{"id":"i","title":"Task","contents":[]}]}]', retired_items: '{}', status: 'in_progress' }],
      principals: [{ id: 'rehearsal-owner-1' }], ledger, sourceSha256: artifact.manifest.artifact.sha256,
    });
    expect(state.requirements.cases).toEqual([
      { kind: 'templates', id: 'malformed-template', principal: 'rehearsal-owner-1', action: 'read' },
      { kind: 'templates', id: 'malformed-template', principal: 'rehearsal-owner-1', action: 'browser-refusal' },
      { kind: 'templates', id: 'malformed-template', principal: 'rehearsal-owner-1', action: 'malformed-refusal' },
      { kind: 'runs', id: 'malformed-run', principal: 'rehearsal-owner-1', action: 'read' },
      { kind: 'runs', id: 'malformed-run', principal: 'rehearsal-owner-1', action: 'browser-read' },
      { kind: 'runs', id: 'malformed-run', principal: 'rehearsal-owner-1', action: 'malformed-refusal' },
      { kind: 'runs', id: 'malformed-run', principal: 'rehearsal-owner-1', action: 'browser-write-refusal' },
    ]);
    expect(state.requirements.contexts).toEqual([
      { kind: 'templates', contextId: 'user:rehearsal-owner-1', principals: ['rehearsal-owner-1'], candidateIds: [] },
      { kind: 'runs', contextId: 'user:rehearsal-owner-1', principals: ['rehearsal-owner-1'], candidateIds: [] },
    ]);
  });
  it('requires every source-derived principal, denial, browser journey and ownership write context', () => {
    const principals = [1, 2, 3].map(id => ({ id: `rehearsal-owner-${id}` }));
    const templates = [1, 2].map(id => ({ id: `t${id}`, user_id: principals[id - 1].id, items: '[]', deleted_at: null, is_public: 0 }));
    templates.push({ ...templates[0], id: 'team', team_id: 'team' });
    const runs = templates.map(row => ({ ...row, id: `r${row.id}`, status: 'in_progress', retired_items: '[]' }));
    const state = sanitizedState({ templates, runs, principals, teams: [{ id: 'team', archived_at: null }], members: [{ id: 'm1', team_id: 'team', user_id: principals[0].id, role: 'owner', status: 'active' }, { id: 'm2', team_id: 'team', user_id: principals[2].id, role: 'viewer', status: 'active' }], ledger, sourceSha256: artifact.manifest.artifact.sha256 });
    const selection = { selectedCounts: { users: 3, templates: 3, checklistRuns: 3 }, profileExclusions: [] };
    expect(state.requirements.cases).toHaveLength(38);
    for (const kind of ['templates','runs']) {
      expect(state.requirements.cases.filter(row => row.kind === kind && row.action === 'read')).toHaveLength(4);
      expect(state.requirements.cases.filter(row => row.kind === kind && row.action === 'private-denial')).toHaveLength(5);
      expect(state.requirements.cases.filter(row => row.kind === kind && row.action === 'private-write-denial')).toHaveLength(5);
      expect(state.requirements.cases.filter(row => row.kind === kind && row.action === 'role-write-denial')).toEqual([{ kind, id: kind === 'templates' ? 'team' : 'rteam', principal: 'rehearsal-owner-3', action: 'role-write-denial' }]);
      expect(state.requirements.cases.filter(row => row.kind === kind && row.action === 'browser-read')).toHaveLength(4);
    }
    expect(state.requirements.contexts).toEqual(['templates','runs'].flatMap(kind => [
      { kind, contextId: 'user:rehearsal-owner-1', principals: ['rehearsal-owner-1'], candidateIds: [kind === 'templates' ? 't1' : 'rt1'] },
      { kind, contextId: 'user:rehearsal-owner-2', principals: ['rehearsal-owner-2'], candidateIds: [kind === 'templates' ? 't2' : 'rt2'] },
      { kind, contextId: 'team:team', principals: ['rehearsal-owner-1'], candidateIds: [kind === 'templates' ? 'team' : 'rteam'] },
    ]));
    const proof = { cohortSha256: state.cohortSha256, requirementsSha256: state.requirementsSha256, selectedCounts: selection.selectedCounts, profileExclusions: [], authenticatedPrincipals: principals.map(p => p.id), cases: state.requirements.cases.map(row => ({ ...row, verdict: 'pass' })), withheldRows: [], contexts: state.requirements.contexts.map(row => ({ kind: row.kind, contextId: row.contextId, id: row.candidateIds[0], principal: row.principals[0], write: 'pass', browserWriteReadback: 'pass' })), measurements: { rowReads: state.requirements.cases.filter(row => row.action === 'read').length, privateDenials: state.requirements.cases.filter(row => row.action === 'private-denial').length, roleWriteDenials: state.requirements.cases.filter(row => row.action === 'role-write-denial').length, templateWrites: 3, runWrites: 3 }, postHandlerPreservation: { verdict: 'pass', cohortSha256: state.cohortSha256, withheldRows: 0, malformedRows: 0, untouchedRows: 0, writtenRows: 6 } };
    expect(validateSanitizedCohortProof(proof, { state, selection })).toBe(true);
    for (const mutate of [
      p => { p.measurements.privateDenials = 0; p.measurements.roleWriteDenials = 0; },
      p => { p.contexts.splice(1, 1); p.measurements.templateWrites--; p.postHandlerPreservation.writtenRows--; p.postHandlerPreservation.untouchedRows++; },
      p => { p.cases.pop(); },
      p => { p.cases[1] = p.cases[0]; },
      p => { p.cases[0].id = 'invented'; },
      p => { p.cases[0].principal = 'rehearsal-owner-99'; },
      p => { p.contexts[0].principal = principals[2].id; },
      p => { p.contexts[0].id = 'team'; },
      p => { p.contexts[0].write = 'no-authorized-source-writer'; },
      p => { p.contexts[0].browserWriteReadback = undefined; },
      p => { p.authenticatedPrincipals[0] = 'rehearsal-owner-99'; },
    ]) { const bad = structuredClone(proof); mutate(bad); expect(() => validateSanitizedCohortProof(bad, { state, selection })).toThrow(); }
  });
  it('rejects untouched row damage and limits write effects to the explicit canary fields', () => {
    const before = sanitizedState({ templates: [{ id: 't', title: 'Original', version: 1, updated_at: null, updated_by_user_id: null, items: '[]' }, { id: 'untouched', title: 'Keep' }], runs: [], ledger, sourceSha256: artifact.manifest.artifact.sha256 });
    const after = structuredClone(before);
    Object.assign(after.rows.templates[0], { title: 'Sanitized Template Handler Verified', version: 2, updated_at: '2026-09-05T00:00:00Z', updated_by_user_id: 'rehearsal-owner-1' });
    const proof = { malformedSourceChecks: [], cohortProof: { withheldRows: [], contexts: [{kind: 'templates', id: 't', principal: 'rehearsal-owner-1', write: 'pass'}] } };
    expect(verifySanitizedRefusalPreservation({ before, after, proof })).toMatchObject({ verdict: 'pass', untouchedRows: 1, writtenRows: 1 });
    after.rows.templates[1].title = 'Hidden damage';
    expect(() => verifySanitizedRefusalPreservation({ before, after, proof })).toThrow(/unapproved/);
    after.rows.templates[1].title = 'Keep'; after.rows.templates[0].items = '["Unexpected"]';
    expect(() => verifySanitizedRefusalPreservation({ before, after, proof })).toThrow(/unapproved/);
  });
  it('rejects membership-only migration corruption and binds the selected principals', () => {
    const state = sanitizedState({ templates: [], runs: [], principals: [{ id: 'rehearsal-owner-1' }], teams: [{ id: 'rehearsal-team-1' }], members: [{ id: 'rehearsal-member-1', role: 'viewer' }], ledger, sourceSha256: artifact.manifest.artifact.sha256 });
    const changed = sanitizedState({ templates: [], runs: [], principals: [{ id: 'rehearsal-owner-1' }], teams: [{ id: 'rehearsal-team-1' }], members: [{ id: 'rehearsal-member-1', role: 'owner' }], ledger, sourceSha256: state.sourceSha256 });
    expect(() => validateSanitizedStateBinding(state, changed)).toThrow();
    expect(() => verifySanitizedTransformation({ before: state, after: changed, expectedLedger: ledger })).toThrow(/cohort/);
  });
  it("preserves SQL null separately from literal null text across Wrangler display serialization", () => {
    const db = replayMigrations();
    try {
      db.exec(artifact.sql);
      db.exec("CREATE TABLE d1_migrations(id INTEGER, name TEXT)");
      ledger.forEach((name, index) => db.prepare("INSERT INTO d1_migrations VALUES (?,?)").run(index + 1, name));
      db.exec("UPDATE templates SET description='null'");
      const capture = captureSanitizedState({ sourceSha256: artifact.manifest.artifact.sha256, query: (sql) => JSON.stringify([{ results: db.prepare(sql).all().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "null" : value]))) }]) });
      expect(capture.rows.templates[0].deleted_at).toBeNull();
      expect(capture.rows.templates[0].description).toBe("null");
      expect(capture.domainSha256).toBe(snapshot(db, ledger).domainSha256);
    } finally { db.close(); }
  });
  it("rejects a corrupted transformation with a valid final schema before authenticated rehearsal can pass", () => {
    const db = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });
    try {
      db.exec(artifact.sql);
      const before = snapshot(db, ledger.slice(0, -1));
      db.exec(readFileSync(path.join(repoRoot, "db/migrations", migration), "utf8"));
      const after = snapshot(db, ledger);
      expect(() => verifySanitizedTransformation({ before, after, expectedLedger: ledger })).not.toThrow();
      // Same schema, row counts, owner, and valid JSON; only the data transform is wrong.
      db.exec("UPDATE templates SET version=version-1, content_version=content_version-1");
      expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(() => verifySanitizedTransformation({ before, after: snapshot(db, ledger), expectedLedger: ledger })).toThrow(/version transition/);
    } finally { db.close(); }
  });

  it("binds every stored domain field and exact ledger and rejects alternate remote state", () => {
    const state = sanitizedState({ templates: [{ id: "rehearsal-template-1", title: "safe", version: 2, content_version: 2 }], runs: [], ledger, sourceSha256: artifact.manifest.artifact.sha256 });
    expect(validateSanitizedStateBinding(state, structuredClone(state))).toBe(true);
    for (const field of ["sourceSha256", "domainSha256", "ledgerSha256"]) expect(() => validateSanitizedStateBinding(state, { ...state, [field]: "f".repeat(64) })).toThrow();
    expect(() => validateSanitizedStateBinding(state, { ...state, ledger: ledger.slice(0, -1) })).toThrow();
    for (const field of ["title", "version", "content_version"]) {
      const changed = structuredClone(state.rows.templates); changed[0][field] = "changed";
      expect(sanitizedState({ templates: changed, runs: [], ledger, sourceSha256: state.sourceSha256 }).domainSha256).not.toBe(state.domainSha256);
    }
  });
});
