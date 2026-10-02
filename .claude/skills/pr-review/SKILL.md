---
name: pr-review
description: Review a pull request for real bugs and for breaches of this repository's rules (AGENTS.md and the core beliefs), post each new finding as an inline comment, and keep one summary comment up to date. Re-reviews after every push without repeating earlier findings. The CI review runs it on every pull request; run it locally with /pr-review <owner>/<repo>/pull/<number>.
allowed-tools: Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr comment:*), mcp__github_inline_comment__create_inline_comment, Task, Read, Glob, Grep
---

# Review a pull request

The argument names the pull request: `<owner>/<repo>/pull/<number>` ($ARGUMENTS). Pass
`--repo <owner>/<repo>` to every `gh` command.

## 1. Check that it needs a review

Run `gh pr view <number> --repo <owner>/<repo> --json state,isDraft,title,body,headRefOid,baseRefName`.
Stop without posting anything if the pull request is closed or a draft.

## 2. Gather what the review needs

- **The change:** `gh pr diff <number> --repo <owner>/<repo>`.
- **The rules:** AGENTS.md and docs/design-docs/core-beliefs.md. In CI they are already in
  your instructions; otherwise read them.
- **Earlier findings:** in CI, your instructions list what Claude already posted on this pull
  request (file, line and text). Otherwise read them with
  `gh pr view <number> --repo <owner>/<repo> --comments`.
- **The code around the change:** read what a changed line depends on (callers, types,
  tests) with Read, Grep and Glob. The diff alone often hides the bug.

## 3. Review in parallel

Start these three reviewers with the Task tool in one message, so they run together. Give
each the diff, the pull request's title and description, and the earlier findings:

1. **Bugs:** logic errors, missed edge cases, security holes (access checks, injection,
   secrets, personal data), data loss, races, and error handling that hides failures, in
   what this pull request adds or changes.
2. **Rules:** every AGENTS.md rule and core belief the change breaks, with the rule quoted.
3. **Tests and docs:** behavior changes without a test, and docs the change makes wrong,
   where AGENTS.md asks for them.

Each reviewer returns its findings as: file, line in the new version, what is wrong, why it
matters (quoting the rule when one applies), the fix, and its confidence (high, medium, low).

## 4. Keep only what is real and new

Check every finding yourself against the code at the head commit:

- Drop anything low-confidence, speculative, stylistic, already there before this pull
  request, or caught by lint and type checks.
- Drop anything that repeats an earlier finding: the same problem at the same place, or at
  the lines it moved to, however it is worded.
- Keep what a careful senior reviewer would ask to fix before merging.

## 5. Post

- **Each kept finding:** one inline comment with
  `mcp__github_inline_comment__create_inline_comment` on the line it concerns: a bold
  one-line title, what is wrong and why, the rule quoted when one applies, and the fix.
  Link a rule with a full URL to the base branch's copy,
  `https://github.com/<owner>/<repo>/blob/<baseRefName>/<path>`, since relative links do
  not resolve from a pull request comment.
- **Then the summary**, one comment that each review updates in place:
  `gh pr comment <number> --repo <owner>/<repo> --edit-last --create-if-none --body "<summary>"`.
  The summary reads:
  - `## Claude review` and `Reviewed <short head commit>.`
  - `<N> new finding(s), commented inline.` or `No new findings.`
  - When there are earlier findings: one line each saying whether this commit fixes it or
    it still applies, linking to its comment.

Never post a finding twice, and never add a second summary comment.
