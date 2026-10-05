import { beforeEach, describe, expect, it } from 'vitest';

import {
  baseModel,
  mockUseTemplateDetailModel,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
} from '../../support/templateDetailPage';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';

beforeEach(resetTemplateDetailPageMocks);

const showTemplateWithTools = (requiredTools: ReturnType<typeof buildV0DemoPrivateTemplate>['requiredTools']) =>
  mockUseTemplateDetailModel.mockReturnValue({ ...baseModel(), template: { ...buildV0DemoPrivateTemplate(), requiredTools } });

describe('Template detail with Required tools', () => {
  it('lists them before the Template Structure, as links that open a new tab', () => {
    showTemplateWithTools([{ name: 'Time tracker', url: 'https://example.com/track', required: true }]);

    const html = renderTemplateDetail();

    expect(html).toMatch(/<h2[^>]*>Required tools<\/h2>[\s\S]*Template Structure/);
    expect(html).toContain('href="https://example.com/track"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/Time tracker[\s\S]*Required</);
  });

  it('shows no Required tools section for a Template without them', () => {
    showTemplateWithTools([]);

    expect(renderTemplateDetail()).not.toContain('Required tools');
  });
});
