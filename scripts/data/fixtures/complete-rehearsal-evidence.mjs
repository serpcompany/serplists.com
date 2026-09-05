import { sanitizedState } from '../sanitized-state-lib.mjs';

// In-memory evidence-envelope fixture, following finalize-rehearsal-report's
// output: independent remote comparison, row-free state, and manifest selection.
// Successful handler outcomes here are synthetic, never runtime approval.
export function completeRehearsalEvidence({ commit, migrationRange, ledger, coverage }) {
  const principal = 'rehearsal-owner-1';
  const sourceSha256 = 'b'.repeat(64);
  const target = { environment: 'rehearsal', binding: 'DB', databaseName: 'source-rehearsal', databaseId: '11111111-1111-4111-8111-111111111111' };
  const { rows: _rows, ...state } = sanitizedState({
    templates: [{ id: 'rehearsal-template-1', user_id: principal, items: '[]', is_public: 0, deleted_at: null }],
    runs: [{ id: 'rehearsal-run-1', user_id: principal, items: '[]', retired_items: '[]', status: 'in_progress', deleted_at: null }],
    principals: [{ id: principal }], teams: [], members: [], ledger, sourceSha256,
  });
  const selection = { selectedCounts: { users: 1, templates: 1, checklistRuns: 1, teams: 0, teamMembers: 0 }, profileExclusions: [] };
  const sourceProfile = { profile: 'synthetic-envelope', sourceSchema: ledger.at(-2) };
  const manifestIntegritySha256 = 'c'.repeat(64);
  const authenticatedRehearsal = {
    verdict: 'pass', commit, target: { environment: 'local' }, migrationRange,
    sanitizerArtifactSha256: sourceSha256, sourceProfile, manifestIntegritySha256,
    checks: { templateRead: true, runRead: true, templateWriteReadback: true, runWriteReadback: true, falseEmptyDetection: 'pass', apiErrorDetection: 'pass' },
    postMigrationState: structuredClone(state), transformation: { verdict: 'pass' }, handlerStateReadback: true,
    cohortProof: {
      cohortSha256: state.cohortSha256, requirementsSha256: state.requirementsSha256,
      selectedCounts: structuredClone(selection.selectedCounts), profileExclusions: [], authenticatedPrincipals: [principal],
      cases: ['templates', 'runs'].flatMap(kind => ['read', 'browser-read'].map(action => ({ kind, id: kind === 'templates' ? 'rehearsal-template-1' : 'rehearsal-run-1', principal, action, verdict: 'pass' }))),
      contexts: ['templates', 'runs'].map(kind => ({ kind, contextId: `user:${principal}`, id: kind === 'templates' ? 'rehearsal-template-1' : 'rehearsal-run-1', principal, write: 'pass', browserWriteReadback: 'pass' })),
      withheldRows: [], measurements: { rowReads: 2, privateDenials: 0, roleWriteDenials: 0, templateWrites: 1, runWrites: 1 },
      postHandlerPreservation: { verdict: 'pass', cohortSha256: state.cohortSha256, withheldRows: 0, malformedRows: 0, untouchedRows: 0, writtenRows: 2 },
    },
  };
  const invariants = { verdict: 'pass', commit, target, migrationRange, comparisonKind: 'migration', sanitizedState: state,
    ledger: { verdict: 'pass', before: migrationRange.from == null ? ledger : ledger.slice(0, ledger.indexOf(migrationRange.from)), after: ledger, afterSha256: state.ledgerSha256 } };
  return { check: 'production-shaped-rehearsal', verdict: 'pass', commit, target, migrationRange, coverage,
    authenticatedRehearsal, remoteRehearsal: { target, migrationRange, invariants },
    sanitizedSource: { verdict: 'pass', attestation: { verdict: 'pass', verifier: 'github-cli-before-import' }, artifactSha256: sourceSha256, sourceProfile, manifestIntegritySha256, selection, selectedCounts: structuredClone(selection.selectedCounts) },
    recovery: { verdict: 'pass' }, teardown: { verdict: 'pass' },
  };
}
