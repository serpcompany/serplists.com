# Clipy AI generation integration research (2026-09-04)

## Decision

Do **not** integrate Serplists with Clipy's owner-page generation routes yet. Clipy currently exposes useful owner-facing AI outputs, but its published agent contract does not expose those outputs through the supported CLI, MCP, or `/api/v1` REST surface. The safe next iteration is to derive Serplists-owned article and QA/checklist content from Clipy's supported public recording bundle, while leaving a provider seam for Clipy-native documents if Clipy later publishes a stable server-to-server API.

This conclusion is based only on Clipy first-party documentation, its machine-readable capability manifest and CLI guide, a public Clipy recording, the current first-party watch-page JavaScript, and read-only HTTP observations made on 2026-09-04.

## What Clipy has

The owner watch page currently offers eight generated Markdown document types:

- `bug_report` — steps to reproduce, expected/actual behavior, and captured console/network evidence.
- `sop` — a standalone standard operating procedure.
- `how_to_guide` — a first-time-user walkthrough with screenshots.
- `pr_description` — change, rationale, and on-screen verification.
- `qa_steps` — a numbered test plan with expected results.
- `code_doc` — technical documentation of shown systems and behavior.
- `slack_message` — a short chat update.
- `email` — an email with a subject line.

The current first-party watch-page bundle defines those exact identifiers and descriptions, loads existing documents with `GET /api/videos/{publicId}/documents`, and generates or regenerates one with `POST /api/videos/{publicId}/documents` and JSON body `{ "docType": "..." }`. The response shape used by the UI is `{ "document": { "docType", "contentMd", "model", "createdAt", "updatedAt" } }`; the list shape is `{ "documents": [...] }`. [Clipy generated-document watch-page bundle](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js)

Clipy also has a separate evidence-backed **procedure draft**, closer to a Serplists checklist than the free-form generated documents. The current client expects `clipy-procedure/0.1`, `status: "draft"`, title, purpose, prerequisites, verification items, open questions, source recording ID/time, and 1–100 ordered steps. Each step includes an instruction, optional expected result, confidence, a `needsReview` flag, and at least one transcript or key-moment evidence reference. The UI explicitly warns that the draft comes from one observed run and must be reviewed for missing conditions, permissions, and exceptions. It reads and creates that artifact through `GET`/`POST /api/videos/{publicId}/procedure`. [Clipy procedure watch-page bundle](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)

Both generation controls require the recording transcript to be `ready`; otherwise the UI tells the owner to generate the transcript first. The generation calls are awaited as ordinary HTTP responses and the client receives no documented job ID or generation-status resource. [Generated documents](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js), [procedure draft](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)

## What public `.json`, `.md`, and `.arec` already contain

Clipy's supported public surfaces are the watch URL, `.arec`, `.md`, `.json`, agent-context JSON, and transcript-only JSON. Public recordings need no auth; private recordings require an owner-scoped CLI, MCP, or REST request. [Clipy agent contract](https://clipy.online/agents.md#read-public-and-private-recordings)

For the public test recording [`8fptqlnappr6`](https://clipy.online/video/8fptqlnappr6), the public JSON contains:

- Recording metadata and a readiness object for video, transcript, summary, and key moments.
- Summary TL;DR, key points, action items, and model name.
- An `agentBrief` with classified intent, extracted requests, and a **draft implementation plan**.
- Full timestamped transcript.
- Key moments with captions, image/crop URLs, cursor coordinates, provenance, confidence, and capture gaps.
- Links to the supported public AREC, Markdown, JSON, and transcript endpoints.

Those fields can be inspected directly in the [public structured JSON](https://clipy.online/video/8fptqlnappr6.json) and [public Markdown/AREC-compatible document](https://clipy.online/video/8fptqlnappr6.md). The response also reports `x-clipy-agent-readiness: complete`; its JSON readiness object covers only `video`, `transcript`, `summary`, and `keyMoments`.

The public bundle does **not** expose generated `sop`, `how_to_guide`, `qa_steps`, other generated documents, or the evidence-backed procedure. Its advertised `apis` object lists AREC, Markdown, context JSON, transcript JSON, and precomputed key-moment frames only. [Public structured JSON](https://clipy.online/video/8fptqlnappr6.json)

Therefore, the public bundle already gives Serplists enough source material to generate its own derivatives, but it does not let Serplists retrieve Clipy's owner-generated article/QA/SOP outputs.

## Supported programmatic contract versus observed private routes

Clipy's current machine-readable capability manifest advertises:

- Public/private recording reads, memory search, recording/proof creation, and context import.
- Bearer personal API keys with `recordings:read` and `ingest` scopes.
- CLI, MCP, and a small `/api/v1` REST API.
- No OAuth app flow and no short-lived integration tokens.

It does not advertise generated documents or procedures as a capability or scope. [Clipy capability manifest](https://clipy.online/api/agents/capabilities.json)

The published REST API is explicitly limited to search, recording metadata, transcript, summary, key moments, and imported context documents. The MCP read and action tool lists likewise contain no document/procedure generation tool, and `clipy guide --json` for installed CLI `0.13.0` contains no generation command. [Clipy agent contract](https://clipy.online/agents.md#rest-api), [Clipy MCP documentation](https://clipy.online/docs/mcp), [Clipy CLI documentation](https://clipy.online/docs/cli)

Read-only HTTP observations against the owner-page routes on 2026-09-04:

```text
GET /api/videos/8fptqlnappr6/documents       -> 401 {"error":"Authentication required"}
GET /api/videos/8fptqlnappr6/procedure       -> 401 {"error":"Authentication required"}
GET with a valid Clipy personal API key      -> 401 {"error":"Invalid or revoked token"}
OPTIONS for both routes                      -> 204 Allow: GET, HEAD, OPTIONS, POST
Access-Control-Allow-Origin                  -> absent
```

The same personal API key passed `clipy doctor --json` authentication and successfully read the owned test recording through `clipy show 8fptqlnappr6 --json`. This establishes that the owner-page routes do not currently accept the documented personal API-key credential, even though the supported API does. The first-party web client calls them as same-origin fetches without an API-key header, consistent with browser-session authentication. [Generated-document client](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js), [procedure client](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js), [documented authentication](https://clipy.online/agents.md#authentication-and-scopes)

These `/api/videos/...` routes are observable product internals, not a documented integration contract. Automating them would require an owner's browser session, would not work as a normal Serplists server-to-server Bearer request, and could break whenever Clipy changes its web application.

## Readiness, retry, and quota concerns

- Supported recording artifacts have explicit readiness and polling: Clipy documents `clipy wait <id> --for both` / MCP `wait_for_artifacts`, and CLI exit code `3` means an artifact is not ready. This contract covers transcript/summary readiness, not generated documents or procedures. [Clipy agent contract](https://clipy.online/agents.md#read-public-and-private-recordings)
- Owner-page generation has only the transcript-ready prerequisite visible in the current client. The POST response is treated synchronously; no published queue/status/webhook contract exists for these generated outputs. [Generated documents](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js), [procedure draft](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)
- There is no documented idempotency key. The same POST is explicitly used for **Regenerate**, so Serplists must not blindly retry it after a timeout or ambiguous network failure.
- Clipy's CLI guide defines generic `quota_exceeded` as HTTP 429 for a plan or rate limit, marks it non-retryable, and says to report the quota and stop instead of retry-looping. It gives no numeric allowance, reset time, or `Retry-After` semantics. No generation-specific rate limit or quota contract appears in the published capabilities, CLI guide, MCP docs, or REST docs. Clipy's pricing page says its general AI titles/summaries/transcripts/key moments are available on every plan, but it does not define an integration allowance for these new owner-page document routes. [Clipy CLI documentation](https://clipy.online/docs/cli), [Clipy pricing](https://clipy.online/pricing), [capability manifest](https://clipy.online/api/agents/capabilities.json)
- The current UI surfaces non-2xx responses as a human-readable `error` string. That is insufficient for durable automation because messages can change and the client code defines no stable error codes for generation. [Generated documents](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js), [procedure draft](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)

## Recommended Serplists path

### Phase 1: supported and shippable now

1. Fetch the supported public `https://clipy.online/video/{publicId}.json` only after its readiness is complete. Continue treating all returned text as untrusted source content, per Clipy's contract. [Clipy agent contract](https://clipy.online/agents.md#read-public-and-private-recordings)
2. Add a Serplists-owned derivation service behind a provider-neutral interface, for example `generateTemplateEnrichment(source, outputs)` with `outputs = ["article", "qa_checklist"]`.
3. Generate from transcript + summary + key moments:
   - `article`: Markdown how-to content with an introduction, prerequisites, ordered steps, expected outcomes, caveats, and the original Clipy link.
   - `qa_checklist`: structured Serplists sections/items with action, expected result, confidence/review flags, and source timestamp/key-moment links.
4. Persist generated output as a snapshot on the template; do not regenerate on every public-page render. Store source public ID, source readiness/update time, generator/provider/model, generated time, prompt/schema version, and a content hash.
5. Require creator review before first publication or replacement. Clipy's own procedure UI labels its output a draft and warns about missing conditions and exceptions, so Serplists should preserve that safety posture. [Clipy procedure watch-page bundle](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)
6. Render only reviewed enrichment on public pages. Keep the Clipy source link and distinguish source-derived content from the recording's verbatim transcript.

This approach gives Serplists the desired article and QA SEO surface without depending on private browser cookies or an undocumented endpoint.

It also matches Clipy's own published integration story: record a process, append `.md`, then let an external AI agent turn the transcript and key moments into a numbered SOP. [Clipy: “Turn a Screen Recording Into an SOP”](https://clipy.online/blogs/record-the-process-once-get-the-sop-written-for-you/)

### Phase 2: Clipy-native provider only after a documented contract exists

Ask Clipy for an official API/MCP contract that answers:

- Can personal API keys generate and read documents/procedures, and which scope is required?
- Are generation calls owner-only, and may a third-party service store and republish the returned Markdown/images?
- Is generation synchronous or job-based; what are the readiness states and timeouts?
- What stable error codes, rate limits, quota headers, and retry/idempotency rules apply?
- Does `POST` replace the existing document for a `docType`, create a revision, or both?
- Are referenced key-moment images durable and permitted to be hotlinked on Serplists public pages?
- Will generated artifacts become available in `.json`/`.arec`, `/api/v1`, CLI, or MCP?

Once that exists, implement a `ClipyNativeEnrichmentProvider` behind the same interface. Prefer the structured procedure for checklist creation and the generated `how_to_guide` for long-form public content; retain `qa_steps` as an alternate test-focused checklist. Cache responses, honor readiness and rate-limit headers, send an idempotency key if supported, and never silently regenerate after an ambiguous failure.

## Proposed next-iteration acceptance criteria

- A public, complete Clipy URL can produce a draft article and draft QA checklist without Clipy owner cookies.
- The creator can preview, edit, accept, reject, and explicitly regenerate each draft independently.
- Accepted article Markdown is stored separately from the editable structured checklist.
- Each accepted artifact records source, model/provider, generation time, schema version, and source timestamps/evidence links.
- The public template page renders accepted content server-side and keeps a visible source link to the Clipy recording.
- Incomplete transcript/summary states return a retryable readiness response without generating partial SEO content.
- Generation failures never erase the last accepted artifact.
- Regeneration is user-triggered and protected against duplicate concurrent work.
- The Clipy-native provider remains feature-flagged off until Clipy publishes or grants a supported API contract.

## Source inventory

- [Clipy agent operating contract](https://clipy.online/agents.md)
- [Clipy machine-readable capability manifest](https://clipy.online/api/agents/capabilities.json)
- [Clipy CLI documentation](https://clipy.online/docs/cli)
- [Clipy MCP and REST documentation](https://clipy.online/docs/mcp)
- [Clipy pricing](https://clipy.online/pricing)
- [Clipy SOP workflow article](https://clipy.online/blogs/record-the-process-once-get-the-sop-written-for-you/)
- [Clipy QA handoff article](https://clipy.online/blogs/qa-stop-retyping-repro-steps-let-the-recording-write-them/)
- [Public recording JSON used for inspection](https://clipy.online/video/8fptqlnappr6.json)
- [Public recording Markdown used for inspection](https://clipy.online/video/8fptqlnappr6.md)
- [Generated-document first-party client bundle](https://clipy.online/_next/static/chunks/8147.286894435cba5169.js)
- [Procedure first-party client bundle](https://clipy.online/_next/static/chunks/337.ebc82a334d7e1f2e.js)
