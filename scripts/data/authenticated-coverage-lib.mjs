export function authenticatedCoverageAssertions({ candidateAuthenticated, falseEmptyVerdict, apiErrorVerdict }) {
  const checks = candidateAuthenticated?.checks ?? {};
  const templatePass = candidateAuthenticated?.verdict === "pass" && checks.templateRead === true && checks.templateWriteReadback === true;
  const runPass = candidateAuthenticated?.verdict === "pass" && checks.runRead === true && checks.runWriteReadback === true;
  return [
    { name: "authenticated-owned-template-read-write", verdict: templatePass ? "pass" : "fail" },
    { name: "authenticated-owned-run-read-write", verdict: runPass ? "pass" : "fail" },
    { name: "authenticated-false-empty", verdict: falseEmptyVerdict === "pass" ? "pass" : "fail" },
    { name: "authenticated-api-error", verdict: apiErrorVerdict === "pass" ? "pass" : "fail" },
  ];
}
