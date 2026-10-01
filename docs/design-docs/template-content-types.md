# Template Content Types

Checklist items hold typed content blocks (text, image, video, file, embed,
sub-items). This doc shows how to add a content type and how editor tabs work.

## Video blocks

A video block holds a URL or pasted `<iframe>` code. `getVideoEmbedSource`
(`src/utils/urlHelpers.ts`) decides how `VideoEmbed` shows it:

- YouTube links on youtu.be, youtube.com and its subdomains (www, m, music) or
  youtube-nocookie.com, in watch, share, Shorts, live or embed form, become a
  `https://www.youtube.com/embed/<id>` iframe (`www.youtube-nocookie.com` for a
  nocookie link), keeping a `t` or `start` time. A YouTube link with no video id (a
  channel or playlist) is shown as an "Open video" link, never in the native player.
- Clipy watch and embed links become a Clipy iframe.
- Pasted `<iframe>` code is framed only when its origin is in `EMBED_FRAME_ORIGINS`
  (`src/lib/utils/embedOrigins.ts`), compared as a parsed origin so a look-alike host
  never matches; any other origin is shown as a link. An `http:` src is checked and
  framed as `https:`, since the policy's `upgrade-insecure-requests` loads it over https.
- Any other http(s) URL plays in the native `<video>` player. The URL is the player's
  own `src` and its key, so a new URL (the next task's video, a URL being typed in the
  editor) always gets a new player: a player reads a `<source>` child only once. The run
  page also keys each task's blocks on the task, so no block carries over to the next task.
  When the player cannot load the URL at all (a video page such as Vimeo or Loom, or
  a missing file), the block shows the "Open video" link instead; an error after the
  video loaded keeps the player. `tests/e2e/run-task-videos.spec.ts` checks this.

Every iframe origin the helper can produce must be listed in `frame-src` in
`src/lib/http/securityHeaders.ts` (the policy `next.config.ts` and `public/_headers` send);
`tests/unit/security/headers.test.ts` checks this.

## Image blocks

`ContentRenderer` shows an image block through `TaskImage`
(`src/components/shared/TaskImage.tsx`). Only an absolute http(s) URL or an app path
such as `/api/uploads/...` is loaded (`safeImageUrl` in `src/lib/utils/safeUrl.ts`).
Anything else, or an image that fails to load, shows a local "Image unavailable" box.
The error handler only records the failure: it never sets `src`, and there is no
remote placeholder, so a broken image makes one request and stops.
`tests/unit/components/TaskImage.test.tsx` checks this.

An image uploaded into an Image block is shrunk in the browser first, without changing
what it shows (`optimizeImage` in `src/lib/imageOptimization.ts`; a File block keeps the
file's own bytes). One larger than 1920x1080 is scaled to fit; one within those bounds and
under 1MB is uploaded as it is, and so is the original when a re-encoded copy would not be
smaller. PNG, JPEG and WebP are re-encoded in their own format, so transparency survives;
other types the browser can decode (SVG, AVIF, BMP, HEIC where supported) become PNG, never
JPEG, which would turn transparent pixels black; a GIF is uploaded untouched, since drawing
it to a canvas keeps one frame. A browser that cannot encode the requested type returns PNG,
so the file is named and typed after the bytes it actually holds.

## Embed blocks

An embed block holds a URL, pasted `<iframe>` code or plain text, and viewers never get it
as HTML. `getEmbedLinkUrl` (`src/lib/utils/embedLink.ts`) finds the address to link: the
value itself, or the `src` of its iframe code, when that is an absolute http(s) URL.
`ContentRenderer` links that address ("Open embedded content") and shows any other value as
text, so markup, scripts and relative addresses never become a link or run. The editor's
`EmbedField` (`src/components/ui/embed-field.tsx`) previews the same address ("Embed URL:
...") or says viewers will see the value as text, and never offers script embeds. It renders
one `<textarea>` whatever the value: React remounts a control whose element type changes,
which would drop focus and the caret as someone types past `https://`.

## Text blocks and descriptions

Text blocks are Markdown, rendered by `MarkdownBlock`; item and template descriptions
are plain text. Both are shown exactly as saved, so a backslash followed by `n` (in
code or a Windows path) stays as typed. Seeds and bundled packs store real line breaks;
`tests/unit/db/officialTemplatesSeed.test.ts` checks the official seed.

The one exception is legacy data: the official seed once stored text blocks as a single
line with a literal backslash-n for each line break. `expandLegacyEscapedNewlines`
(`src/lib/utils/markdownDisplay.ts`) still lays those out: for a text block with no real
line break, it turns each literal backslash-n into a line break, except inside inline
code and after an escaping backslash. It goes away once the stored rows are migrated
(TD-22 in the [tech debt tracker](../exec-plans/tech-debt-tracker.md)).

### Migrating the legacy seed rows (proposal, needs human approval)

The fixed seed uses `INSERT OR IGNORE`, so re-running it does not repair rows that
already exist. This data change writes to staging and production D1, so a human
approves and applies it; nothing below exists as a migration file. Run it on
`serp-checklists-staging-db` first, then `serp-checklists-db`, after recording a
restore point with `npx wrangler d1 time-travel info <database>`.

1. **Read** (a one-off Node script, read-only queries). All three use an index:
   the primary key, `idx_template_versions_template_version_unique` and
   `idx_checklist_runs_template_owner`.

   ```sql
   -- The five official templates the seed created.
   SELECT id, items FROM templates
   WHERE user_id = 'serp-user'
     AND id IN ('serp-template-technical-seo-audit', 'serp-template-keyword-research-mapping',
                'serp-template-content-refresh', 'serp-template-local-seo-gbp',
                'serp-template-serp-features');
   SELECT id, snapshot_json FROM template_versions WHERE template_id IN (<the five ids>);
   SELECT id, items, retired_items FROM checklist_runs WHERE template_id IN (<the five ids>);
   ```

2. **Rewrite in Node, not with SQL `REPLACE`.** `JSON.parse` each column. A
   `snapshot_json` is a template row, so also parse its `items` string. Walk every
   `sections[].items[].contents[]` entry whose `type` is `text` and whose `value` is a
   string, then `JSON.stringify` the result and skip rows that did not change.
   - Templates and version snapshots: `value = expandLegacyEscapedNewlines(value)`.
     Because this is the display shim itself, what people see does not change. Record
     each changed pair as a legacy-to-fixed map.
   - Runs: replace a value only when it is byte-identical to a key of that map. Any
     other text stays exactly as stored.

3. **Write**: the script emits `tmp/legacy-newlines/<database>.sql` for review. It has
   one guarded statement per changed row, with values inlined as SQL string literals
   (single quotes doubled). The `WHERE` on the old value skips a row that changed after
   the read.

   ```sql
   UPDATE templates SET items = '<new items>'
   WHERE id = '<id>' AND user_id = 'serp-user' AND items = '<old items>';
   UPDATE template_versions
   SET snapshot_json = '<new snapshot>', content_hash = '<sha256 hex of new snapshot>'
   WHERE id = '<id>' AND snapshot_json = '<old snapshot>';
   UPDATE checklist_runs
   SET items = '<new items>', retired_items = '<new retired>', revision = revision + 1
   WHERE id = '<id>' AND items = '<old items>' AND retired_items = '<old retired>';
   ```

   A human applies the file with
   `npx wrangler d1 execute <database> --remote --file tmp/legacy-newlines/<database>.sql`.
   `content_hash` is recomputed the way `buildTemplateVersionValues` computes it. Runs
   get `revision + 1`, so a run page opened before the change gets `409 edit_conflict`
   and reloads instead of saving the old text back. Template `version` is left alone,
   because nobody can sign in as `serp-user`, so no editor holds a stale copy.

4. **Verify**: run steps 1 and 2 again. They must produce no changes.

The script must not touch user-authored rows: templates not owned by `serp-user`,
version snapshots and runs of other templates, and any text in a matched run that is
not byte-identical to a seeded block. Copies saved to an account ("Save to my
account") are user-owned rows that no column links to their source, so they keep the
legacy shape. Remove the shim only after a human decides what happens to those copies:
either approve the same exact-match rewrite for them (a full scan of `templates`), or
accept that they show a literal backslash-n.

## Adding a content type

Example: a "link" type.

### Files involved
- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`
- `src/lib/forms/templateEditorForm.ts`
- `src/components/template-editor/content-types/`
- `src/components/template-editor/ContentAddPanel.tsx`
- `src/components/template-editor/ContentEditor.tsx`
- `src/components/shared/ContentRenderer.tsx`

### Steps

#### 1. Extend the TypeScript types
Add the new type to `ChecklistItemContent` and define any extra fields.

```ts
// src/types/checklist.ts
export type ChecklistItemContent = {
  type: "text" | "image" | "video" | "file" | "embed" | "subItems" | "link";
  value: string;
  linkTitle?: string;
};
```

#### 2. Update the Zod schema
Keep the Zod schema in sync with the type definition.

```ts
// src/lib/schemas/checklistSchema.ts
export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems", "link"]),
  value: z.string(),
  linkTitle: z.string().optional(),
  uploadType: z.enum(["url", "upload"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  subItems: z.array(checklistSubItemSchema).optional(),
});
```

Also add the type to `templateEditorContentSchema` in
`src/lib/forms/templateEditorForm.ts`; the editor's form types are inferred from it.

#### 3. Create an editor component
Add a new component under `src/components/template-editor/content-types/`.

```tsx
// src/components/template-editor/content-types/LinkContentEditor.tsx
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface LinkContentEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  linkTitle?: string;
  onLinkTitleChange: (value: string) => void;
}

export function LinkContentEditor({ value, onValueChange, linkTitle, onLinkTitleChange }: LinkContentEditorProps) {
  return (
    <div className="space-y-2">
      <Label>Link</Label>
      <Input value={linkTitle || ""} onChange={(e) => onLinkTitleChange(e.target.value)} placeholder="Link title" />
      <Input value={value} onChange={(e) => onValueChange(e.target.value)} placeholder="https://..." />
    </div>
  );
}
```

#### 4. Add to the content picker
Add a button in `ContentAddPanel` and allow the new type in `onAddContent`.

#### 5. Render the editor
Update `ContentEditor` to render the new editor in the `switch` block.

#### 6. Render in view mode
Update `ContentRenderer` to display the new content type in the checklist view.

#### 7. Consider uploads
If the type needs file uploads, reuse the existing buckets in `functions/api/handlers/uploads.ts` and the helpers in `src/lib/utils/fileUpload.ts`.
An upload finishes after the render that started it, so apply its result as one write
built from the current form values: find the block with `findTemplateEditorContentPath`
(by id, since blocks can move or be removed meanwhile) and never spread the
render-time `useWatch` snapshot, which still holds the old value (see
`handleFileChange` in `ContentEditor`). Never delete the previous file: templates,
runs, and copies may still use it ([R2 uploads](database-operations.md#r2-uploads)).
Report each upload to the editor as it starts (`FileUpload`'s `onUploadStart`, bound to
`useTrackTemplateEditorUpload` from `src/features/template-editor/pendingUploads.ts`):
until it finishes the file is not in the form, so the editor disables Save and asks
before leaving.

## Editor tabs

Tabs use shadcn/ui `src/components/ui/tabs.tsx`; see
`src/components/template-editor/content-types/TextContentEditor.tsx` for real usage.
Each `TabsTrigger` value needs a matching `TabsContent` value:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="activity">...</TabsContent>
</Tabs>;
```
