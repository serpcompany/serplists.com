# Template Examples

Copy these assets when authoring templates outside the editor UI.

- `minimal/` contains the smallest valid single-template examples.
- `full/` contains a fuller example with metadata, rules, and multiple content types.

Each example directory includes:

- `template.yaml` - primary YAML authoring source
- `template.json` - generated normalized portable JSON template
- `README.md` - generated human-readable checklist preview
- `preview.html` - generated richer visual preview
- `template.md` - optional generated strict Markdown compatibility artifact

The generated artifacts are intended to stay in sync with `template.yaml` and pass `pnpm templates:check`.

Edit `template.yaml` directly. Treat `template.json`, `template.md`, `README.md`, and `preview.html` as generated outputs.
