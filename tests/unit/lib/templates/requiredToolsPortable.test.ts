import { describe, expect, it } from 'vitest';

import {
  buildTemplateCopyPayload,
  mapApiTemplateToChecklistTemplate,
} from '@/features/template-detail/templateDetailMappers';
import { buildRepoTemplateCreatePayload, normalizeRepoTemplateSources } from '@/lib/repoTemplateCatalog';
import { apiTemplateSchema } from '@/lib/schemas/apiTemplates';
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from '@/lib/schemas/checklistSchema';
import { parseTemplateMarkdown, parseTemplateYaml, renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import { exportPortableTemplatesToJSON, parseTemplatesFromData } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';
import { firstOf, onlyElement } from '../../../support/elements';

const TOOLS = [
  { name: 'Time tracker', url: 'https://example.com/track', required: true },
  { name: 'Slideshow app', url: 'https://example.com/slides', required: false },
];
const SECTIONS = [{ id: 's1', title: 'Prepare', items: [{ id: 'i1', title: 'Open the tracker' }] }];

const loaded = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 't1',
  title: 'Launch',
  description: '',
  sections: SECTIONS,
  userId: 'u1',
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
  isPublic: false,
  ...overrides,
});

const packOf = (templates: unknown[]) => ({
  kind: 'serplists-template-pack',
  schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  exportedAt: '2026-10-05T00:00:00.000Z',
  templates,
});

describe('Required tools in the app\'s own export and import', () => {
  it('exports them in a portable pack, and leaves the key out for a Template without them', () => {
    const exported = exportPortableTemplatesToJSON([loaded({ requiredTools: TOOLS }), loaded({ id: 't2', title: 'Plain', requiredTools: [] })]);

    expect(exported.templates.map((template) => template.requiredTools)).toEqual([TOOLS, undefined]);
    expect(JSON.stringify(exported.templates[1])).not.toContain('requiredTools');
  });

  it('reads them back from a pack the app exported, which it sends to the API on import', () => {
    const pack: unknown = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON([loaded({ requiredTools: TOOLS })])));

    expect(onlyElement(parseTemplatesFromData(pack).templates).requiredTools).toEqual(TOOLS);
  });

  it('reads a tool written without its required flag as required, in a pack and in a plain list of Templates', () => {
    const timer = { name: 'Timer', url: 'https://example.com/timer' };

    expect(onlyElement(parseTemplatesFromData(packOf([{ title: 'Pack', sections: SECTIONS, requiredTools: [timer] }])).templates).requiredTools)
      .toEqual([{ ...timer, required: true }]);
    expect(onlyElement(parseTemplatesFromData([{ title: 'List', sections: SECTIONS, requiredTools: [timer] }]).templates).requiredTools)
      .toEqual([{ ...timer, required: true }]);
  });

  it('refuses a file whose tool links somewhere that is not a web page, before anything is sent', () => {
    expect(() => parseTemplatesFromData([{ title: 'Unsafe', sections: SECTIONS, requiredTools: [{ name: 'X', url: 'javascript:alert(1)' }] }]))
      .toThrow('Template validation failed');
  });

  it('keeps them through the Markdown and YAML template formats', () => {
    const portable = firstOf(exportPortableTemplatesToJSON([loaded({ requiredTools: TOOLS })]).templates);
    const markdown = renderTemplateMarkdown(portable);

    expect(markdown).toContain('requiredTools:');
    expect(parseTemplateMarkdown(markdown).requiredTools).toEqual(TOOLS);
    expect(parseTemplateYaml(`title: YAML\nrequiredTools:\n  - name: Timer\n    url: https://example.com/timer\nsections:\n  - title: S\n    items:\n      - title: I\n`))
      .toMatchObject({ requiredTools: [{ name: 'Timer', url: 'https://example.com/timer', required: true }] });
  });
});

describe('Required tools on a Template the app loads or copies', () => {
  it('reads them from a Template loaded by id, and drops an unreadable list rather than the Template', () => {
    const fromTheApi = (requiredTools: unknown) =>
      mapApiTemplateToChecklistTemplate(apiTemplateSchema.parse({ id: 't1', title: 'Launch', requiredTools }), 'launch').requiredTools;

    expect(fromTheApi(TOOLS)).toEqual(TOOLS);
    expect(fromTheApi([{ name: 'Unsafe', url: 'javascript:alert(1)', required: true }])).toBeUndefined();
  });

  it('copies them with a Duplicate and with a library Template saved to an account', () => {
    expect(buildTemplateCopyPayload(loaded({ requiredTools: TOOLS }), undefined).requiredTools).toEqual(TOOLS);

    const libraryTemplate = onlyElement(normalizeRepoTemplateSources({
      'pack.json': packOf([{ title: 'Library', slug: 'library-tools', sections: SECTIONS, requiredTools: TOOLS }]),
    }));
    expect(libraryTemplate.requiredTools).toEqual(TOOLS);
    expect(buildRepoTemplateCreatePayload(libraryTemplate, undefined).requiredTools).toEqual(TOOLS);
  });
});
