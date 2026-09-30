import { describe, expect, it } from 'vitest';
import {
  parseTemplateMarkdown,
  parseTemplateYaml,
  renderTemplateMarkdown,
} from '@/lib/templates/templateMarkdown';
import { launchChecklistTemplate as template } from '../../../fixtures/launchChecklistTemplate';

describe('templateMarkdown', () => {
  it('renders markdown and parses it back to the same normalized template', () => {
    const markdown = renderTemplateMarkdown(template);
    const parsed = parseTemplateMarkdown(markdown);

    expect(parsed).toEqual(template);
  });

  it('parses yaml templates into the canonical template shape', () => {
    const yaml = [
      'title: YAML Checklist',
      'visibility: public',
      'sections:',
      '  - title: Preparation',
      '    items:',
      '      - title: Review content',
      '        contents:',
      '          - type: text',
      '            value: Publish the final release notes.',
    ].join('\n');

    const parsed = parseTemplateYaml(yaml);

    expect('kind' in parsed).toBe(false);
    expect(!('kind' in parsed) && parsed.title).toBe('YAML Checklist');
  });

  it('rejects markdown title/frontmatter mismatches', () => {
    const markdown = [
      '---',
      'title: Canonical Title',
      '---',
      '# Other Title',
      '',
      '## Preparation',
      '',
      '### Review content',
      '',
      '```serplists:text',
      'hello',
      '```',
    ].join('\n');

    expect(() => parseTemplateMarkdown(markdown)).toThrow('Markdown title heading must match frontmatter title');
  });
});
