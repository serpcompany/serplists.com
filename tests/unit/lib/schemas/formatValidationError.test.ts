import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { formatValidationError } from '@/lib/schemas/formatValidationError';

const zodErrorFor = (schema: z.ZodTypeAny, value: unknown): z.ZodError => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected the value to fail validation');
  return result.error;
};

const expectReadable = (message: string) => {
  expect(message).not.toMatch(/"code"\s*:/);
  expect(message).not.toMatch(/^\s*[[{]/);
  expect(message).not.toContain('\n');
};

const section = z.object({ title: z.string().min(1), items: z.array(z.object({ title: z.string().min(1) })) });
const pack = z.object({ templates: z.array(z.object({ title: z.string().min(1), sections: z.array(section) })) });

describe('formatValidationError', () => {
  it('names the template, section and item with 1-based positions', () => {
    const error = zodErrorFor(pack, {
      templates: [{ title: 'A', sections: [{ title: 'S', items: [{ title: 'ok' }, { title: '' }] }] }],
    });

    const message = formatValidationError(error);

    expect(message).toBe(
      'Template 1 > Section 1 > Item 2 > title: String must contain at least 1 character(s)',
    );
    expectReadable(message);
  });

  it('labels a leading array index as the template', () => {
    const error = zodErrorFor(z.array(z.object({ title: z.string() })), [{ title: 'ok' }, {}]);

    expect(formatValidationError(error)).toBe('Template 2 > title: Required');
  });

  it('shows at most three issues and counts the rest', () => {
    const error = zodErrorFor(z.object({ a: z.string(), b: z.string(), c: z.string(), d: z.string(), e: z.string() }), {});

    const message = formatValidationError(error);

    expect(message).toBe('a: Required; b: Required; c: Required (and 2 more)');
    expectReadable(message);
  });

  it('prints a root-level issue without a path and drops duplicates', () => {
    const error = zodErrorFor(z.object({ title: z.string() }), 'not an object');

    expect(formatValidationError(error)).toBe('Expected object, received string');
  });

  it('reports the most specific branch of a failed union', () => {
    const error = zodErrorFor(
      z.object({ sections: z.union([z.array(z.object({ title: z.string() })), z.string()]) }),
      { sections: [{ title: 5 }] },
    );

    const message = formatValidationError(error);

    expect(message).toBe('Section 1 > title: Expected string, received number');
  });

  it('keeps custom refinement messages', () => {
    const schema = z.object({ value: z.string() }).superRefine((_, ctx) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'image content requires a value', path: ['value'] });
    });

    expect(formatValidationError(zodErrorFor(schema, { value: '' }))).toBe(
      'value: image content requires a value',
    );
  });

  it('passes other errors through unchanged', () => {
    expect(formatValidationError(new Error('Unsupported portable template schema version: 9'))).toBe(
      'Unsupported portable template schema version: 9',
    );
    expect(formatValidationError('boom')).toBe('Unknown error');
  });

  it('turns a multi-line YAML error into one line with its line number', () => {
    const yamlError = Object.assign(new Error('bad indentation (3:5)\n\n 1 | a\n 2 | b\n'), {
      name: 'YAMLException',
      reason: 'bad indentation of a mapping entry',
      mark: { line: 2 },
    });

    expect(formatValidationError(yamlError)).toBe('Invalid YAML at line 3: bad indentation of a mapping entry');
  });
});
