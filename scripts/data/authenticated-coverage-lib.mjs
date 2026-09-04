const REQUIRED_CANDIDATE_CHECKS = ["templateRead", "templateWriteReadback", "runRead", "runWriteReadback"];
const OPTIONAL_CANDIDATE_CHECKS = ["falseEmptyDetection", "apiErrorDetection"];

export function validateAuthenticatedCandidateEvidence(candidate, { requireDetectors = false } = {}) {
  if (candidate?.verdict !== "pass" || !candidate.checks || typeof candidate.checks !== "object" || Array.isArray(candidate.checks)) {
    throw new Error("Authenticated candidate evidence is missing or failed.");
  }
  const keys = Object.keys(candidate.checks);
  if (keys.some((key) => ![...REQUIRED_CANDIDATE_CHECKS, ...OPTIONAL_CANDIDATE_CHECKS].includes(key))) {
    throw new Error("Authenticated candidate evidence contains an unknown check.");
  }
  for (const key of REQUIRED_CANDIDATE_CHECKS) {
    if (candidate.checks[key] !== true) throw new Error(`Authenticated candidate check ${key} must be exactly true.`);
  }
  if (requireDetectors && (candidate.checks.falseEmptyDetection !== "pass" || candidate.checks.apiErrorDetection !== "pass")) {
    throw new Error("Authenticated candidate false-empty and API-error detection must pass.");
  }
  return candidate;
}

export function authenticatedCoverageAssertions({ candidateAuthenticated, falseEmptyVerdict, apiErrorVerdict }) {
  let validCandidate = false;
  try { validateAuthenticatedCandidateEvidence(candidateAuthenticated); validCandidate = true; } catch {}
  return [
    { name: "authenticated-owned-template-read-write", verdict: validCandidate ? "pass" : "fail" },
    { name: "authenticated-owned-run-read-write", verdict: validCandidate ? "pass" : "fail" },
    { name: "authenticated-false-empty", verdict: falseEmptyVerdict === "pass" ? "pass" : "fail" },
    { name: "authenticated-api-error", verdict: apiErrorVerdict === "pass" ? "pass" : "fail" },
  ];
}
