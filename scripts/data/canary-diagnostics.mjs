const STAGES = Object.freeze({
  configuration: 'Protected canary configuration is incomplete or invalid.',
  identity: 'Canary database identity verification failed.',
  'd1-query': 'Canary database query failed; check schema compatibility and the scoped database credential.',
  'database-result': 'Canary database result could not be validated.',
  'api-read': 'Authenticated canary or domain health request failed.',
  'canary-records': 'Designated canary records are not visible to the authenticated owner.',
  'canary-mutation': 'Controlled canary mutation or restoration failed.',
  reporting: 'Canary result evaluation or reporting failed.',
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
    check: CHECKS[safeStage],
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
