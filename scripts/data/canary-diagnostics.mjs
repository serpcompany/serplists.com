const STAGES = Object.freeze({
  configuration: 'Protected canary configuration is incomplete or invalid.',
  identity: 'Canary database identity verification failed.',
  'd1-query': 'Canary database query failed; check schema compatibility and the scoped database credential.',
  'database-result': 'Canary database result could not be validated.',
  'api-read': 'Authenticated canary or domain health request failed.',
  'canary-records': 'Designated canary records are not visible to the authenticated owner.',
  'canary-mutation': 'Controlled canary mutation or restoration failed.',
  reporting: 'Canary result evaluation or reporting failed.',
  'production-configuration': 'Protected production configuration or evidence validation failed.',
  'production-identity': 'Production database identity verification failed.',
  'production-recovery-bookmark': 'Production recovery bookmark capture failed.',
  'production-recovery-export': 'Production durable recovery export failed.',
  'production-reviewed-pending-range': 'Production applied prefix or reviewed pending range validation failed.',
  'production-pre-invariants': 'Production pre-mutation invariant or ledger validation failed.',
  'production-source-schema': 'Production source catalog verification failed before migration writes.',
  'production-migration-apply': 'Production migration operation failed; stop further mutations.',
  'production-ledger-clean': 'Production post-migration ledger verification failed.',
  'production-schema-contract': 'Production schema verification failed.',
  'production-post-invariants': 'Production post-mutation invariant verification failed.',
  'production-recovery-freshness': 'Recovery freshness failed; capture a new durable bundle and obtain fresh receipt-bound approval.',
  'invariant-configuration': 'Remote invariant verification configuration is incomplete or invalid.',
  'invariant-identity': 'Remote invariant database identity verification failed.',
  'invariant-query': 'Remote invariant query or result validation failed.',
  'invariant-state': 'Remote invariant comparison state is missing, invalid, or mismatched.',
  'invariant-comparison': 'Remote invariant comparison or evidence reporting failed.',
  'schema-configuration': 'Usage: check-d1-schema --database NAME --label ENV [--preview] [--database-id ID]. Schema verification configuration is incomplete or invalid.',
  'schema-identity': 'Remote schema database identity verification failed.',
  'schema-query': 'Remote schema query or catalog result validation failed.',
  'schema-comparison': 'Remote schema comparison or evidence reporting failed.',
});
const wrappedFailures = new WeakMap();
const CHECKS = Object.freeze({ configuration: 'canary_configuration', identity: 'canary_database_identity', 'd1-query': 'canary_d1_query', 'database-result': 'canary_database_result', 'api-read': 'authenticated_canary_requests', 'canary-records': 'authenticated_canary_visibility', 'canary-mutation': 'controlled_canary_mutation', reporting: 'canary_reporting' });

// External Error messages, command arguments, stdout/stderr and causes can
// contain record identifiers, cookies or provider secrets. Retain only codes
// selected here; never attach the original error as a cause or serialize it.
export function safeCanaryFailure(stage, error) {
  if (error && typeof error === 'object' && wrappedFailures.has(error)) return wrappedFailures.get(error);
  const safeStage = Object.hasOwn(STAGES, stage) ? stage : 'reporting';
  const exitStatus = Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : null;
  return {
    stage: safeStage,
    check: CHECKS[safeStage] ?? safeStage.replaceAll('-', '_'),
    code: exitStatus !== null ? 'CANARY_SUBPROCESS_FAILED' : 'CANARY_STAGE_FAILED',
    message: STAGES[safeStage],
    ...(exitStatus !== null ? { exitStatus } : {}),
  };
}

export function wrapCanarySubprocessFailure(stage, error) {
  const failure = safeCanaryFailure(stage, error);
  const wrapped = new Error(failure.message);
  wrappedFailures.set(wrapped, failure);
  return wrapped;
}
