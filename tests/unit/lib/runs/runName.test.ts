import { describe, expect, it } from 'vitest';

import { checklistPayloadSchema } from '../../../../functions/api/utils/payloads';
import { buildDefaultRunName, RUN_TITLE_MAX_LENGTH } from '@/lib/runs/runName';

const isValidRunTitle = (title: string) => checklistPayloadSchema.safeParse({ title }).success;
const hasLoneSurrogate = (value: string) =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);

const SUFFIXES = [
  '9/28/2026',
  '9/28/2026, 3:45:12 PM',
  '28.9.2026, 15:45:12',
  '2026. 9. 28. 오후 3:45:12',
  '٢٨‏/٩‏/٢٠٢٦، ٣:٤٥:١٢ م',
];

describe('RUN_TITLE_MAX_LENGTH', () => {
  it('matches the limit the API enforces on run titles', () => {
    expect(isValidRunTitle('a'.repeat(RUN_TITLE_MAX_LENGTH))).toBe(true);
    expect(isValidRunTitle('a'.repeat(RUN_TITLE_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('buildDefaultRunName', () => {
  it('keeps a name that already fits', () => {
    expect(buildDefaultRunName('Camping Checklist', '9/28/2026')).toBe(
      'Camping Checklist - 9/28/2026',
    );
  });

  it('shortens a long title so the whole name fits and the date stays', () => {
    const name = buildDefaultRunName('a'.repeat(160), '9/28/2026, 3:45:12 PM');

    expect(name.length).toBeLessThanOrEqual(RUN_TITLE_MAX_LENGTH);
    expect(name.endsWith(' - 9/28/2026, 3:45:12 PM')).toBe(true);
    expect(name).toContain('\u2026');
  });

  it.each([1, 100, 136, 137, 148, 149, 150, 159, 160])(
    'gives a %i-character title a name the API accepts in every locale',
    (length) => {
      for (const suffix of SUFFIXES) {
        const name = buildDefaultRunName('x'.repeat(length), suffix);

        expect(isValidRunTitle(name)).toBe(true);
        expect(name.endsWith(suffix)).toBe(true);
      }
    },
  );

  it('never splits an emoji at the cut', () => {
    for (let offset = 0; offset < 4; offset += 1) {
      const title = `${'a'.repeat(130 + offset)}${'\u{1F3D5}'.repeat(20)}`;
      const name = buildDefaultRunName(title, '9/28/2026, 3:45:12 PM');

      expect(hasLoneSurrogate(name)).toBe(false);
      expect(name.length).toBeLessThanOrEqual(RUN_TITLE_MAX_LENGTH);
    }
  });

  it('leaves no space before the ellipsis or around the title', () => {
    const name = buildDefaultRunName(`  ${'word '.repeat(40)}  `, '9/28/2026, 3:45:12 PM');

    expect(name).not.toMatch(/\s\u2026/);
    expect(name.startsWith(' ')).toBe(false);
  });

  it('falls back to the suffix for an empty title and to the title for an oversized suffix', () => {
    expect(buildDefaultRunName('   ', '9/28/2026')).toBe('9/28/2026');
    expect(buildDefaultRunName('Camping', 'z'.repeat(200))).toBe('Camping');
  });
});
