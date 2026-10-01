import { describe, expect, it } from 'vitest';

import { templatePayloadSchema } from '../../../../functions/api/utils/payloads';
import { TEMPLATE_TITLE_MAX_LENGTH } from '@/lib/schemas/templateFields';
import { buildDuplicateTemplateTitle } from '@/lib/templates/duplicateTemplateTitle';

const isValidTemplateTitle = (title: string) =>
  templatePayloadSchema.safeParse({ title }).success;
const hasLoneSurrogate = (value: string) =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);

describe('TEMPLATE_TITLE_MAX_LENGTH', () => {
  it('matches the limit the API enforces on template titles', () => {
    expect(isValidTemplateTitle('a'.repeat(TEMPLATE_TITLE_MAX_LENGTH))).toBe(true);
    expect(isValidTemplateTitle('a'.repeat(TEMPLATE_TITLE_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('buildDuplicateTemplateTitle', () => {
  it('adds " Copy" to a title that has room for it', () => {
    expect(buildDuplicateTemplateTitle('Launch Checklist')).toBe('Launch Checklist Copy');
    expect(buildDuplicateTemplateTitle('a'.repeat(155))).toBe(`${'a'.repeat(155)} Copy`);
  });

  it.each([1, 100, 155, 156, 158, 160, 200])(
    'gives a %i-character title a copy name the API accepts',
    (length) => {
      const title = buildDuplicateTemplateTitle('x'.repeat(length));

      expect(isValidTemplateTitle(title)).toBe(true);
      expect(title.length).toBeLessThanOrEqual(TEMPLATE_TITLE_MAX_LENGTH);
      expect(title.endsWith(' Copy')).toBe(true);
    },
  );

  it('never splits an emoji at the cut', () => {
    for (let offset = 0; offset < 4; offset += 1) {
      const title = buildDuplicateTemplateTitle(
        `${'a'.repeat(140 + offset)}${'\u{1F3D5}'.repeat(20)}`,
      );

      expect(hasLoneSurrogate(title)).toBe(false);
      expect(title.length).toBeLessThanOrEqual(TEMPLATE_TITLE_MAX_LENGTH);
      expect(isValidTemplateTitle(title)).toBe(true);
    }
  });

  it('trims the title, as the API does before it measures one, and leaves no double space before "Copy"', () => {
    expect(buildDuplicateTemplateTitle('  Launch  ')).toBe('Launch Copy');
    expect(buildDuplicateTemplateTitle(`${'word '.repeat(40)}`)).not.toMatch(/\s{2}Copy$/);
  });

  it('stays valid however many times a copy is copied again', () => {
    let title = 'x'.repeat(150);
    for (let copy = 0; copy < 50; copy += 1) {
      title = buildDuplicateTemplateTitle(title);
      expect(isValidTemplateTitle(title)).toBe(true);
    }
  });

  it('falls back to "Copy" for a blank title', () => {
    expect(buildDuplicateTemplateTitle('   ')).toBe('Copy');
    expect(isValidTemplateTitle(buildDuplicateTemplateTitle(''))).toBe(true);
  });
});
