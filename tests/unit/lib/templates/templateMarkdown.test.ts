import { describe, expect, it } from 'vitest';
import {
  normalizePortableTemplate,
  parseTemplateMarkdown,
  parseTemplateYaml,
  renderTemplateMarkdown,
  renderTemplatePreviewHtml,
  renderTemplateReadme,
} from '@/lib/templates/templateMarkdown';

describe('templateMarkdown', () => {
  const template = normalizePortableTemplate({
    title: 'Launch Checklist',
    description: 'Plan the release before launch day.',
    visibility: 'public',
    categories: ['ops'],
    tags: ['release'],
    rules: [
      {
        id: 'rule-1',
        type: 'required-field',
        path: 'sections[].items[].title',
        severity: 'error',
      },
    ],
    sections: [
      {
        title: 'Preparation',
        items: [
          {
            title: 'Review content',
            description: 'Confirm all content is final.',
            contents: [
              {
                type: 'text',
                value: 'Publish the final **release notes**.',
              },
              {
                type: 'image',
                value: 'https://example.com/image.png',
                uploadType: 'url',
              },
              {
                type: 'subItems',
                value: '',
                subItems: [
                  { title: 'Check title' },
                  { title: 'Check CTA' },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

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

  it('renders a readable markdown preview document', () => {
    const readme = renderTemplateReadme(template);

    expect(readme).toContain('# Launch Checklist');
    expect(readme).toContain('## Preparation');
    expect(readme).toContain('- [ ] **Review content**');
    expect(readme).toContain('Categories: ops');
  });

  it('renders an html preview with card-like media blocks', () => {
    const html = renderTemplatePreviewHtml(template);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('class="content-block card media-card"');
    expect(html).toContain('class="content-block card"');
    expect(html).toContain('Launch Checklist');
  });

  it('links an embed to its URL or iframe src in the html preview, and shows other code as text', () => {
    const embedTemplate = normalizePortableTemplate({
      title: 'Embeds',
      sections: [{
        title: 'Watch',
        items: [{
          title: 'Walkthrough',
          contents: [
            { type: 'embed', value: 'https://status.example.com' },
            { type: 'embed', value: `<iframe src='https://www.youtube.com/embed/abc'></iframe>` },
            { type: 'embed', value: '<script src="https://example.com/widget.js"></script>' },
          ],
        }],
      }],
    });

    const html = renderTemplatePreviewHtml(embedTemplate);
    const hrefs = Array.from(html.matchAll(/href="([^"]*)"/g), (match) => match[1]);

    expect(hrefs).toEqual(['https://status.example.com', 'https://www.youtube.com/embed/abc']);
    expect(html).toContain('&lt;script src=&quot;https://example.com/widget.js&quot;&gt;&lt;/script&gt;</pre>');
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('<iframe');
  });
});
