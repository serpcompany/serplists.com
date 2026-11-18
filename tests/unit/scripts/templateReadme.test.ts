import { describe, expect, it } from 'vitest';
import { renderTemplateReadme } from '@/../scripts/lib/templateReadme';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { launchChecklistTemplate as template } from '../../fixtures/launchChecklistTemplate';
import { mediaTemplate } from '../../fixtures/mediaTemplate';

describe('templateReadme', () => {
  it('renders a readable markdown preview document', () => {
    const readme = renderTemplateReadme(template);

    expect(readme).toContain('# Launch Checklist');
    expect(readme).toContain('## Preparation');
    expect(readme).toContain('- [ ] **Review content**');
    expect(readme).toContain('Categories: ops');
  });

  it('lists the fields of a form block with their kind, required mark, help text and options', () => {
    const readme = renderTemplateReadme(normalizePortableTemplate({
      title: 'Intake',
      sections: [{ title: 'Kickoff', items: [{ title: 'Brief', contents: [{ type: 'form', value: '', fields: [
        { label: 'Client name', kind: 'text', required: true, description: 'As on the contract' },
        { label: 'Plan', kind: 'multiSelect', options: [{ label: 'Basic' }, { label: 'Pro' }] },
        { label: 'Seats', kind: 'number', min: 1 },
      ] }] }] }],
    }));

    expect(readme).toContain([
      '**Form**',
      '',
      '- Client name (Short text, required): As on the contract',
      '- Plan (Multiple choice, optional)',
      '  - Options: Basic, Pro',
      '- Seats (Number, optional, at least 1)',
    ].join('\n'));
  });
});

describe('templateReadme media blocks', () => {
  it('names each image, video, file and embed, with the file name and size when the template has them', () => {
    const readme = renderTemplateReadme(mediaTemplate);

    expect(readme).toContain('Tags: press');
    expect(readme).not.toContain('Categories:');
    expect(readme).toContain('**Image**\n\n![Image preview](https://example.com/logo.png)\n\nSource: https://example.com/logo.png');
    expect(readme).toContain('**Video**\n\nFile: intro.mp4\n\nWatch: https://example.com/intro.mp4');
    expect(readme).toContain('**Video**\n\nWatch: https://example.com/teaser.mp4');
    expect(readme).toContain('**File**\n\n[kit.zip](https://example.com/kit.zip)\n\nSize: 2.5 MB');
    expect(readme).toContain('**File**\n\n[https://example.com/notes.txt](https://example.com/notes.txt)\n\n**YouTube**');
    expect(readme).toContain('**YouTube**\n\nhttps://www.youtube.com/watch?v=abc');
  });
});
