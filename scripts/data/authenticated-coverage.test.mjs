import { describe, expect, it } from "vitest";
import { authenticatedCoverageAssertions, validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
const passing = { verdict: "pass", checks: { templateRead: true, templateWriteReadback: true, runRead: true, runWriteReadback: true } };
describe("authenticated coverage assertions", () => {
  it("requires four independent candidate browser API booleans", () => {
    expect(authenticatedCoverageAssertions({ candidateAuthenticated: passing, falseEmptyVerdict: "pass", apiErrorVerdict: "pass" }).every((check) => check.verdict === "pass")).toBe(true);
    for (const name of Object.keys(passing.checks)) expect(authenticatedCoverageAssertions({ candidateAuthenticated: { ...passing, checks: { ...passing.checks, [name]: false } }, falseEmptyVerdict: "pass", apiErrorVerdict: "pass" })).toContainEqual(expect.objectContaining({ verdict: "fail" }));
  });
  it("does not accept template visibility or unit concurrency as read-write proof", () => {
    const assertions = authenticatedCoverageAssertions({ candidateAuthenticated: { verdict: "fail", checks: {}, actualApplicationVisibilityPassed: true, runOptimisticConcurrency: "pass" }, falseEmptyVerdict: "pass", apiErrorVerdict: "pass" });
    expect(assertions.find((check) => check.name.includes("template-read-write"))?.verdict).toBe("fail");
    expect(assertions.find((check) => check.name.includes("run-read-write"))?.verdict).toBe("fail");
  });
  it("rejects truthy non-booleans and unknown checks at the shared evidence boundary", () => {
    for (const invalid of ["true", 1, {}, []]) {
      expect(() => validateAuthenticatedCandidateEvidence({ ...passing, checks: { ...passing.checks, templateRead: invalid } })).toThrow(/exactly true/i);
    }
    expect(() => validateAuthenticatedCandidateEvidence({ ...passing, checks: { ...passing.checks, misleadingExtra: true } })).toThrow(/unknown check/i);
  });
});
