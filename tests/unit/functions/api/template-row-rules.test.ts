import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTemplateRow, type TemplateRowColumns } from '@functions/api/utils/template-rows';
import { logLineIn } from '../../../support/storedJson';

const row = (rules: string | null): TemplateRowColumns => ({
  id: 'template-1',
  items: '[]',
  category: null,
  tags: null,
  seo_title: null,
  seo_description: null,
  type: 'checklist',
  owner_type: 'user',
  team_id: null,
  user_id: 'user-1',
  rules,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseTemplateRow rules', () => {
  it('reads stored rules that match the rule shape', () => {
    const rules = [{ id: 'r1', type: 'require', path: 'sections[0]' }];

    expect(parseTemplateRow(row(JSON.stringify(rules))).rules).toMatchObject(rules);
  });

  it('drops stored rules of another shape without failing the read', () => {
    expect(parseTemplateRow(row(JSON.stringify({ not: 'a list' }))).rules).toBeUndefined();
  });

  it('drops rules that are not JSON and logs which template held them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(parseTemplateRow(row('[{"id":')).rules).toBeUndefined();
    expect(warn.mock.calls.map(([line]) => logLineIn(line))).toContainEqual(
      expect.objectContaining({ message: 'template_rules_parse_failed', templateId: 'template-1' }),
    );
  });
});
