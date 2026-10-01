import { describe, it, expect } from 'vitest';
import { firstOf, sectionAt, taskAt } from '../../../support/elements';
import { parseTemplatesFromFile } from '@/lib/utils/templateBackup';
import { renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import { jsonFile } from '../../../fixtures/jsonFile';

describe('Template Backup Utilities', () => {
  describe('parseTemplatesFromFile', () => {
    it('should parse strict markdown template files', async () => {
      const markdown = [
        '---',
        'title: Markdown Template',
        'visibility: public',
        'categories:',
        '  - ops',
        'tags:',
        '  - markdown',
        '---',
        '# Markdown Template',
        '',
        'Top-level description.',
        '',
        '## Prep',
        '',
        '### Review content',
        '',
        'Item description.',
        '',
        '```serplists:text',
        'This is **markdown** content.',
        '```',
        '',
        '```serplists:subItems',
        '- Step one',
        '- Step two',
        '```',
      ].join('\n');

      const file = new File([markdown], 'template.md', {
        type: 'text/markdown',
      });

      const result = await parseTemplatesFromFile(file);

      expect(result.templates).toHaveLength(1);
      expect(firstOf(result.templates).title).toBe('Markdown Template');
      expect(firstOf(result.templates).isPublic).toBe(true);
      expect(taskAt(firstOf(result.templates), 0, 0).contents).toHaveLength(2);
    });

    it('imports a Markdown file whose text block holds a heading and a code fence', async () => {
      const value = ['### Tips', 'Run:', '```bash', 'npm i', '```'].join('\n');
      const markdown = renderTemplateMarkdown({
        title: 'Setup Guide',
        sections: [
          {
            title: 'Install',
            items: [{ title: 'Run the installer', description: 'Do X', contents: [{ type: 'text', value }] }],
          },
        ],
      });

      const result = await parseTemplatesFromFile(
        new File([markdown], 'template.md', { type: 'text/markdown' }),
      );

      const item = taskAt(firstOf(result.templates), 0, 0);
      expect(item.description).toBe('Do X');
      expect(item.contents?.map((content) => content.value)).toEqual([value]);
    });

    it('imports a blank task title in a portable JSON pack as "Task N", as the editor shows it, instead of rejecting the pack', async () => {
      const pack = {
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-22T00:00:00.000Z',
        templates: [{ title: 'Pack Template', sections: [{ title: 'Prep', items: [{ title: 'Weigh' }, { title: '' }] }] }],
      };

      const result = await parseTemplatesFromFile(
        jsonFile(pack, 'pack.json'),
      );

      expect(sectionAt(firstOf(result.templates), 0).items.map((item) => item.title)).toEqual(['Weigh', 'Task 2']);
    });

    describe('readable validation errors', () => {
      const expectReadableRejection = async (file: File, pathPattern: RegExp) => {
        const error = await parseTemplatesFromFile(file).then(
          () => { throw new Error('expected the file to be rejected'); },
          (reason: Error) => reason,
        );
        expect(error.message).toMatch(/^Template validation failed: /);
        expect(error.message).toMatch(pathPattern);
        expect(error.message).not.toMatch(/"code"\s*:/);
        expect(error.message).not.toMatch(/"path"/);
        expect(error.message).not.toMatch(/:\s*\[/);
        expect(error.message).not.toContain('\n');
      };

      it('names the section for a YAML template with a blank section title', async () => {
        const source = ['title: YAML Template', 'sections:', '  - title: ""', '    items:', '      - title: Task'].join('\n');

        await expectReadableRejection(
          new File([source], 'template.yaml', { type: 'application/x-yaml' }),
          /Section 1 > title: String must contain at least 1 character/,
        );
      });

      it('names the field for a Markdown template with no title', async () => {
        const markdown = ['---', 'visibility: private', '---', '## Prep', '', '### Task'].join('\n');

        await expectReadableRejection(new File([markdown], 'template.md', { type: 'text/markdown' }), /title: String must contain/);
      });

      it('names the template and item for a portable JSON pack with an invalid item id', async () => {
        const pack = {
          kind: 'serplists-template-pack',
          schemaVersion: '2.0.0',
          exportedAt: '2026-03-22T00:00:00.000Z',
          templates: [{ title: 'Pack Template', sections: [{ title: 'Prep', items: [{ id: 42, title: 'Weigh' }] }] }],
        };

        await expectReadableRejection(
          jsonFile(pack, 'pack.json'),
          /Pack Template: Skipped: Section 1 > Item 1 > id: Expected string, received number/,
        );
      });

      it('names the template for a JSON array entry with no title', async () => {
        await expectReadableRejection(
          new File([JSON.stringify([{ sections: [] }])], 'templates.json', { type: 'application/json' }),
          /Template 1 > title: Required/,
        );
      });
    });

    it('should parse single-template YAML files', async () => {
      const source = [
        'title: YAML Template',
        'visibility: private',
        'sections:',
        '  - title: Prep',
        '    items:',
        '      - title: Review content',
        '        description: Item description',
        '        contents:',
        '          - type: text',
        '            value: Plain text content',
      ].join('\n');

      const file = new File([source], 'template.yaml', {
        type: 'application/x-yaml',
      });

      const result = await parseTemplatesFromFile(file);

      expect(result.templates).toHaveLength(1);
      expect(firstOf(result.templates).title).toBe('YAML Template');
      expect(firstOf(result.templates).isPublic).toBe(false);
    });
  });
});
