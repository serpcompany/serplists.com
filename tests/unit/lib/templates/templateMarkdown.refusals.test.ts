import { describe, expect, it } from 'vitest';

import {
  detectTemplateSourceExtension,
  isMarkdownTemplateExtension,
  isYamlTemplateExtension,
  parseTemplateMarkdown,
  parseTemplateYaml,
  renderTemplateMarkdown,
} from '@/lib/templates/templateMarkdown';
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';

const FRONTMATTER = ['---', 'title: Camping', '---'];

const withTask = (...lines: string[]) => [...FRONTMATTER, '## Shelter', '', '### Pack the tent', '', ...lines].join('\n');

const block = (type: string, ...body: string[]) => ['```serplists:' + type, ...body, '```'];

describe('a Markdown Template the import refuses, with the reason it shows', () => {
  it.each([
    ['no frontmatter', '# Camping\n\n## Shelter', 'Markdown template must start with YAML frontmatter'],
    ['frontmatter that never closes', '---\ntitle: Camping\n## Shelter', 'Markdown template is missing a closing YAML frontmatter delimiter'],
    ['frontmatter that is not an object', '---\n- Camping\n---\n## Shelter', 'Markdown template frontmatter must be a YAML object'],
    ['a template with only its title', [...FRONTMATTER, '# Camping'].join('\n'), 'Array must contain at least 1 element(s)'],
    ['a section with no task', [...FRONTMATTER, '## Shelter'].join('\n'), 'Section "Shelter" must include at least one item'],
    ['a media block that is not an object', withTask(...block('image', '- https://example.com/a.png')), 'Expected a YAML object block'],
    ['a sub-task block that is not a list', withTask(...block('subItems', 'title: Poles')), 'Sub-items block must be a YAML array'],
    ['a sub-task that has no title', withTask(...block('subItems', '- count: 2')), 'Sub-items block entries must be strings or objects with a title'],
    ['a form block that is not a list', withTask(...block('form', 'label: Name')), 'Form block must be a YAML array of fields'],
    ['a form field without a kind', withTask(...block('form', '- 7')), 'Form block entries must be objects with a label and a kind'],
    ['a form option that has no label', withTask(...block('form', '- label: Size', '  kind: select', '  options:', '    - value: 2')), 'Form options must be strings or objects with a label'],
    ['a media block whose address is not text', withTask(...block('image', 'value: 7')), 'image content requires a value'],
    ['a block of a type the format does not have', withTask(...block('audio', 'https://example.com/a.mp3')), 'Unsupported content block type "audio"'],
  ])('refuses %s', (_label, markdown, reason) => {
    expect(() => parseTemplateMarkdown(markdown)).toThrow(reason);
  });
});

describe('a Markdown Template the import reads', () => {
  it('reads sub-tasks and form options written as objects, and a title heading with nothing after it', () => {
    const template = parseTemplateMarkdown(
      [...FRONTMATTER, '# Camping'].join('\n') +
        '\n\n' +
        [
          '## Shelter',
          '',
          '### Pack the tent',
          '',
          ...block('subItems', '- title: Poles', '- Stakes'),
          '',
          ...block('form', '- label: Size', '  kind: select', '  options:', '    - label: Two', '    - Four'),
        ].join('\n'),
    );

    const contents = template.sections[0]?.items[0]?.contents ?? [];
    expect(contents[0]).toMatchObject({ type: 'subItems', subItems: [{ title: 'Poles' }, { title: 'Stakes' }] });
    expect(contents[1]).toMatchObject({ type: 'form', fields: [{ label: 'Size', kind: 'select', options: [{ label: 'Two' }, { label: 'Four' }] }] });
    expect(parseTemplateMarkdown([...FRONTMATTER, '# Camping'].join('\n').concat('\n## Shelter\n\n### Pack the tent'))).toMatchObject({
      title: 'Camping',
    });
  });

  it('reads a media block whose other fields are not ones it knows as a linked file of no known size', () => {
    const template = parseTemplateMarkdown(
      withTask(...block('image', 'value: https://example.com/tent.png', 'uploadType: ftp', 'fileName: 3', 'fileSize: big')),
    );

    expect(template.sections[0]?.items[0]?.contents?.[0]).toEqual({ type: 'image', value: 'https://example.com/tent.png' });
  });

  it('writes an uploaded file with its name and size, and reads it back the same', () => {
    const upload = { type: 'file' as const, value: '/api/uploads/file?key=k', uploadType: 'upload' as const, fileName: 'gear.pdf', fileSize: 2048 };
    const markdown = renderTemplateMarkdown({ title: 'Camping', sections: [{ title: 'Shelter', items: [{ title: 'Pack the tent', contents: [upload] }] }] });

    expect(markdown).toContain(['```serplists:file', 'value: /api/uploads/file?key=k', 'uploadType: upload', 'fileName: gear.pdf', 'fileSize: 2048', '```'].join('\n'));
    expect(parseTemplateMarkdown(markdown).sections[0]?.items[0]?.contents).toEqual([upload]);
  });

  it('writes a linked image with no upload details, and reads it back the same', () => {
    const template = {
      title: 'Camping',
      sections: [
        {
          title: 'Shelter',
          items: [
            {
              title: 'Pack the tent',
              contents: [{ type: 'image' as const, value: 'https://example.com/tent.png' }],
            },
          ],
        },
      ],
    };

    const markdown = renderTemplateMarkdown(template);

    expect(markdown).toContain(['```serplists:image', 'value: https://example.com/tent.png', '```'].join('\n'));
    expect(parseTemplateMarkdown(markdown).sections[0]?.items[0]?.contents).toEqual([{ type: 'image', value: 'https://example.com/tent.png' }]);
  });
});

describe('a YAML Template source', () => {
  it('refuses a document that is not an object', () => {
    expect(() => parseTemplateYaml('Camping')).toThrow('YAML template source must be an object');
    expect(() => parseTemplateYaml('')).toThrow('YAML template source must be an object');
  });

  const campingTemplateLines = ['  - title: Camping', '    sections:', '      - title: Shelter', '        items:', '          - title: Pack the tent'];

  const packOf = (...manifest: string[]) =>
    parseTemplateYaml(
      [
        'kind: serplists-template-pack',
        `schemaVersion: ${PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION}`,
        'exportedAt: "2026-03-22T00:00:00.000Z"',
        'exportedBy: "  Alice  "',
        ...manifest,
        'templates:',
        ...campingTemplateLines,
      ].join('\n'),
    );

  it('reads a template pack, trimming who exported it', () => {
    const pack = packOf();

    expect(pack).toMatchObject({ kind: 'serplists-template-pack', exportedBy: 'Alice', templates: [{ title: 'Camping' }] });
    expect('manifest' in pack && pack.manifest).toBeFalsy();
  });

  it("keeps what a pack's manifest says about the export", () => {
    const pack = packOf('manifest:', '  totalTemplates: 1', '  format: portable', '  includesVisibility: true', '  includesRules: false', '  assetWarnings: 0');

    expect(pack).toMatchObject({
      manifest: { totalTemplates: 1, format: 'portable', includesVisibility: true, includesRules: false, assetWarnings: 0 },
    });
    expect(packOf('manifest:', '  totalTemplates: 1')).toMatchObject({ manifest: { totalTemplates: 1 } });
  });

  it('reads template rules with their ids trimmed, a blank id included, and a value only where one is named', () => {
    const template = parseTemplateYaml(
      [
        'title: Camping',
        'rules:',
        '  - id: " tent-first "',
        '    type: required',
        '    path: sections.0',
        '  - id: "  "',
        '    type: minItems',
        '    path: sections.0.items',
        '    value: 3',
        'sections:',
        ...campingTemplateLines.slice(2).map((line) => line.slice(4)),
      ].join('\n'),
    );

    expect('rules' in template && template.rules).toEqual([
      { id: 'tent-first', type: 'required', path: 'sections.0', severity: 'error' },
      { id: '', type: 'minItems', path: 'sections.0.items', value: 3, severity: 'error' },
    ]);
  });
});

describe('the kind of Template file a name says it is', () => {
  it.each([
    ['launch.JSON', '.json', false, false],
    ['launch.md', '.md', true, false],
    ['launch.markdown', '.markdown', true, false],
    ['launch.yaml', '.yaml', false, true],
    ['launch.YML', '.yml', false, true],
    ['launch.txt', null, false, false],
  ])('reads %s as %s', (fileName, extension, markdown, yaml) => {
    const detected = detectTemplateSourceExtension(fileName);

    expect(detected).toBe(extension);
    expect(isMarkdownTemplateExtension(detected)).toBe(markdown);
    expect(isYamlTemplateExtension(detected)).toBe(yaml);
  });
});
