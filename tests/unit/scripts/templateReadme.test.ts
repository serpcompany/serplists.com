import { describe, expect, it } from 'vitest';
import { renderTemplateReadme } from '@/../scripts/lib/templateReadme';
import { launchChecklistTemplate as template } from '../../fixtures/launchChecklistTemplate';

describe('templateReadme', () => {
  it('renders a readable markdown preview document', () => {
    const readme = renderTemplateReadme(template);

    expect(readme).toContain('# Launch Checklist');
    expect(readme).toContain('## Preparation');
    expect(readme).toContain('- [ ] **Review content**');
    expect(readme).toContain('Categories: ops');
  });
});
