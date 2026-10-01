# Agent Access

Agents (Claude Code, Codex and other MCP clients) work with a User's Personal Templates and
Runs through Run Keys, over the MCP endpoint `POST /api/mcp`. What an agent can do is
specified in [features](../product-specs/features.md) (the Run Keys bullet, and the release
notes in [MCP Changes For Agents](../product-specs/features.md#mcp-changes-for-agents)). The
security rules are in [SECURITY.md](../SECURITY.md#model): Run Key permissions, the host
check and logging under Model, and the MCP limits under
[rate limits](../SECURITY.md#rate-limits). This page is how it is built, and why.

## Where it lives

| Module (`functions/api/`) | Holds |
| --- | --- |
| `handlers/agent-keys.ts` | Run Key management (`/api/agent-keys`) and the endpoint Agent Access shows |
| `handlers/agentMcp.ts` | The transport: request checks, authentication, JSON-RPC, dispatch to the tools |
| `handlers/agentMcpTools.ts` | The run tools' argument schemas, the advertised tool list, the permission each tool needs |
| `handlers/agentMcpTemplateTools.ts` | The template tools' argument schemas and definitions |
| `handlers/agentMcpPages.ts` | The result bound, how results are measured, cursors, and the outline, section and task pages |
| `handlers/agentMcpLists.ts` | `list_templates` and `list_runs` |
| `handlers/agentMcpTemplates.ts`, `handlers/agentMcpTemplatePages.ts`, `handlers/agentMcpTemplateEdits.ts` | The template tools, their reads and results, and `update_template`'s operations |
| `handlers/agentMcpRunTools.ts`, `handlers/agentMcpRunPages.ts`, `handlers/agentMcpRuns.ts` | The run tools, their reads and results, and the run as an agent sees it |
| `utils/personal-run-key.ts`, `utils/mcp-limits.ts`, `utils/agent-mcp-host.ts` | Key secrets and authentication, the MCP rate limits, the host and origin checks |

`agentMcpTemplateTools.ts` imports no MCP handler, so every other module can import its
schemas without a circular import (`pnpm run deps:check` refuses one).

## Run Keys

A key is a bearer secret (`Authorization: Bearer slrk_...`); only its hash is stored. The
management routes need a browser session:

- `POST /api/agent-keys` returns the secret once, with `Cache-Control: no-store`.
- `GET /api/agent-keys` returns at most 50 keys, active ones first, then newest. A user
  holds at most 10 active keys, so that is every active key and the most recent revoked
  ones (listing still scans every revoked key: TD-25).
- `DELETE /api/agent-keys/:id` revokes a key.
- `GET /api/agent-keys/connection` names the MCP endpoint Agent Access shows. The
  `connection` segment sits where a key id would; key ids are UUIDs, so it never names one.

Each tool needs one permission, and the key holds a fixed set of them
(`src/lib/schemas/runKeyPermissions.ts`):

| Permission | Tools |
| --- | --- |
| `templates:read` | `list_templates`, `get_template` |
| `templates:write` | `create_template`, `update_template` |
| `runs:read` | `list_runs`, `get_run` |
| `runs:write` | `start_run`, `update_run` |

`tools/list` advertises only the tools a key's permissions cover, and a call to any other
tool is refused with `permission_denied` before the tool reads anything.

Every authenticated request logs `mcp_request` with the key id, even one that turns out
malformed, so an abused key can be found and revoked. After a tool call succeeds, the key's
`last_used_at` is written at most once every 15 minutes. That write is best effort: a failure
logs `mcp_key_usage_error`, and the tool's result is still returned.

## Transport

The endpoint speaks MCP protocol version `2025-06-18`: JSON-RPC 2.0, one message per `POST`,
answered with JSON rather than an event stream. Before reading the body it checks, in order:
the method (`405`), `Content-Type: application/json` (`415`), an `Accept` header naming both
`application/json` and `text/event-stream` (`406`), the host and origin (`403`), a declared
`Content-Length` within 1MB (`413`, measured again once the body is read), repeated failed
authentication from the IP (`429`), the key (`401`) and the key's rate limit (`429` with
`Retry-After`). Every request other than `initialize` must send `MCP-Protocol-Version`
(`400` otherwise), and a notification (a message without an `id`) gets an empty `202`.

Every string in a response is made well formed: a lone UTF-16 surrogate becomes U+FFFD.
Stored text can hold one, because JSON request bodies accept them, and `JSON.stringify`
writes it as an escape such as `\ud83d`, which strict parsers (serde_json in Codex's MCP
client) reject along with the whole response. Results are measured and cut on that same
well-formed JSON, and text is never cut between the two halves of a surrogate pair, such as
an emoji.

Failures keep HTTP `200`, because a `5xx` can make a client retry a write that already
committed:

- Invalid arguments (`details.issues` names each field) and unknown tools are JSON-RPC
  errors (`-32602`).
- A tool's other refusals (`permission_denied`, `edit_conflict`, `template_is_public`,
  `limit_reached`, ...) are tool results with `isError` and `{ error, message, details }`.
- Anything unexpected is `-32603 Internal error`, logged as `mcp_tool_error` without the
  arguments, which carry notes and titles.

A tool result carries `structuredContent`, and a text content for clients that show only
text: a one-line summary (`Loaded tasks 41-80 of the 120 in a section too large for one
result.`) followed by the JSON.

## Tool arguments

Arguments are parsed with strict Zod objects, so a field a tool does not take is refused:
template writes cannot set visibility, an Organization or a slug, which keeps every template
a key writes private and Personal.

A `null` field counts as absent. Models often send the fields a call does not use as `null`
(OpenAI's strict mode does so for every optional field). Every other value is validated, and
each message names its field (`notes: Required`), up to five of them, so an agent can correct
its call.

`update_run` and `update_template` advertise one flat object, describing in prose which
fields each operation takes. Model APIs reject a `oneOf`, `anyOf` or `allOf` at the root of a
tool schema, and many clients read only top-level properties. A Zod discriminated union then
enforces each operation's fields.

## Result bounds

No result is larger than 32KB (`MAX_RESULT_BYTES`), counted in bytes of the JSON the client
receives, so every client takes every result whole. Claude Code sets a result over
`MAX_MCP_OUTPUT_TOKENS` (25,000 tokens by default) aside in a file, and Codex cuts the middle
out of one over its model's budget: 10,000 tokens plus 20%, which it counts at 4 bytes each,
or 48,000 bytes. 32KB is 8,192 of Codex's tokens, and about 16,000 real ones even at 2 bytes
a token (JSON dense with ids, or text in other scripts). The tool descriptions name the bound.

Every page is built to fit and checked again, so a mistake can only fail a read. The
dispatcher checks each result once more. A read over the bound fails with
`result_too_large`. A write over it is logged (`mcp_result_too_large`) and returned anyway:
it has already committed, and an agent retries a failure (a retried `start_run` makes a
second run).

So a write never reports failure after it commits. Its result shrinks instead: the whole run
or template when it fits, otherwise its fields with `sectionsOmitted` (`taskOmitted` from
`update_run`), down to its id, title, and version or revision. `start_run` builds its result
before it writes. A template write reads the template back, and when that read fails
(archived since, or a D1 error) it returns the write's own summary and logs
`mcp_template_reload_error`.

`update_run` writes notes of at most 20,000 characters and 30KB of UTF-8. 20,000 characters
of three-byte text (Chinese, Japanese) is about 60KB, more than one result holds; 30KB leaves
room for the task and run around the notes, so an agent reads back what it wrote in one call.

Run writes keep the web app's run content limit ([SECURITY.md](../SECURITY.md#request-size-limits)),
checked before the write so an oversized one never commits. The limit counts every task and
Sub-task as unticked, so of `update_run`'s operations only `set_task_notes` can change the
size, and content no larger than what it replaces is allowed: a run already over the limit
can still take shorter notes.

## Reading large templates and runs

`get_template` and `get_run` return a template or run whole when it fits. A larger one comes
back as an outline: its fields with `sectionCount`, `taskCount` and `bytes` (the size its
sections would take in a whole result), then each section's id, title, `taskCount` and
`bytes`; a run's outline adds `retiredCount` and `retiredBytes`. `sectionId` or `taskId`
reads one section or task, whole when it fits. A larger section comes back a page of whole
tasks at a time after its fields (`firstTask`, `taskCount`), and anything too large for a
result on its own (a very long task or note, a template's or section's fields) comes back as
`part`s: consecutive slices of its JSON text with their `from`, `to` and `length`, to join in
order.

Each read is a list of units: fields, outline entries, a section's fields, tasks, or retired
entries. A page takes whole units while they fit, and otherwise the next part of the unit it
starts at. It keeps 512 bytes for `nextCursor` and a part's offsets. The fixed part of a page
leaves out an id longer than 1KB (ids the app makes are under 50 characters), so no id can
push it past the bound; the page holding that section or task carries it. A page whose fixed
part leaves no room for even a part of a unit fails the read rather than return the same page
forever.

`retired: true` reads a run's retired work the same way, whole entries first: all of it, or
one section's or task's, where a retired section is narrowed to that task. Ids can repeat in
older data, so every match is returned. Its pages reserve room for the longest cursor they
could hold, because the scope's ids travel in it. An id that neither live nor retired work
holds is not found, a live one with no retired work reads as no entries, and a live read of
an id only retired work holds says to pass `retired: true`.

A cursor is base64url JSON, read only for the position it holds:

| Key | Holds |
| --- | --- |
| `t` | The template's or run's id |
| `v` | The template version or run revision the read started from |
| `m` | The read: `outline`, `section`, `task` or `retired` |
| `s`, `k` | The section index, and the task index in a task read |
| `rs`, `rt` | The `sectionId` and `taskId` a read of retired work names |
| `u`, `o` | The next unit, and how far into its JSON text a part has reached |

It is checked before use. A cursor another tool made, or made for another template or run,
or passed with a `sectionId`, `taskId` or `retired` that differs from the read it continues,
is `invalid_arguments`. One from an older version or revision fails with `edit_conflict`, so
a read never mixes two versions.

## Lists

`list_templates` and `list_runs` page with a keyset cursor, never `OFFSET`
([D1 cost](d1-cost.md#rules-for-d1-queries)). Templates sort by their last change,
`coalesce(updated_at, created_at)`, because `updated_at` stays `NULL` until the first edit
and SQLite sorts `NULL` last; runs sort by `created_at`; the id breaks ties. A page reads at
most 100 rows, and one more to know whether more follow, through the owner index, then keeps
as many summaries as fit, reserving 512 bytes for its cursor. That cursor holds the list
(`l`), `list_runs`' status filter (`st`), and the sort key (`k`) and id (`i`) of the last row
the page used; a status passed with it must match the one it carries.

Every MCP read checks again, on the rows its query returned, that they are the key owner's
active Personal templates or runs, although the query already filters on them.

## Writes

Template writes go through the web editor's code (`createTemplateForUser`,
`updateTemplateForUser`) with `privatePersonalOnly` set and audit metadata naming the key, so
they get its validation, limits, version check, history and run sync. Those functions answer
with HTTP responses, which the MCP maps back to tool errors (TD-26).

An `update_template` operation changes one section or task of the version the agent read.
It first refuses a public template and a stale `expectedVersion`, then applies the operation
to that version's sections and saves the whole checklist as the editor does, against the same
version, so a change made in between fails with `edit_conflict`. New sections, tasks and
Sub-tasks get ids in the web editor's format, a prefix and a UUID
(`src/lib/forms/templateEditorForm.ts`): a save would number them by position, which can
repeat an id the template already holds elsewhere.

`start_run` counts active runs first only to give a friendly `limit_reached`; the guarded
insert enforces the limit ([system overview](system-overview.md#authorization-and-entitlements)).

`update_run` inserts its audit row only while the run still has the expected revision, and
updates the run only when that audit row exists. If one lands without the other, it logs
`mcp_tool_invariant` and refuses with `internal_invariant`. `set_run_status` rewrites no
content and matches the web app's status save: progress stays, reopening keeps the
completion stamps, and completing a run that is already completed does not stamp it again.
What MCP run events record is in [data persistence](data-persistence.md#json-columns).
