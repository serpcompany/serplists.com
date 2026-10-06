import { describe, expect, it } from 'vitest';
import { renderTemplateReadme } from '@/../scripts/lib/templateReadme';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { launchChecklistTemplate as template } from '../../fixtures/launchChecklistTemplate';

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
