import { describe, expect, it } from 'vitest';
import { assertApprovalMatchesRequest } from './production-executor-lib.mjs';

describe('protected approval retained risk evidence', () => {
  const commit = 'a'.repeat(40);
  const request = {commit,classification:'destructive',changeProvenance:{changeAuthors:['author']}};
  const approval = {environment:'production',source:'github-environment-review',approver:'independent-reviewer',changeAuthors:['author'],classification:'destructive',reviewReference:{repository:'serpcompany/serplists.com',runId:'1',runAttempt:'1',commit,environment:'production'},riskDecision:{policy:'meaningful-written-risk-reason-v1',sha256:'a'.repeat(64),characterCount:30,wordCount:5},decisionSha256:'a'.repeat(64)};
  it('accepts complete retained evidence and rejects missing or non-numeric counts', () => {
    expect(() => assertApprovalMatchesRequest({approval,request})).not.toThrow();
    const missingCommits = structuredClone(approval);
    delete missingCommits.reviewReference.commit;
    expect(() => assertApprovalMatchesRequest({approval:missingCommits,request:{...request,commit:undefined}})).toThrow();
    for (const field of ['characterCount','wordCount']) {
      for (const value of [undefined, null, '30', 30.5, -1]) {
        const changed = structuredClone(approval);
        changed.riskDecision[field] = value;
        expect(() => assertApprovalMatchesRequest({approval:changed,request})).toThrow();
      }
    }
  });
});
