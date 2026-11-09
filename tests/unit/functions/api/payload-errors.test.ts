import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  checklistPayloadSchema,
  describePayloadError,
  formatPayloadIssue,
  normalizeSectionsPayload,
  parseSectionsPayload,
  templatePayloadSchema,
} from '@functions/api/utils/payloads';
import { invalidPayloadResponse } from '@functions/api/utils/request-json';
import { stringMatching } from '../../../support/asymmetricMatchers';
import { apiErrorBody, readJson } from '../../../support/readJson';

function zodErrorOf(schema: z.ZodTypeAny, value: unknown): z.ZodError {
  const parsed = schema.safeParse(value);
  if (parsed.success) throw new Error('The value parsed, so it has no error to describe');
  return parsed.error;
}

describe('formatPayloadIssue', () => {
  it('names the field the first problem is in', () => {
    expect(formatPayloadIssue(zodErrorOf(checklistPayloadSchema, { progress: 101 }), 'Invalid fields')).toMatch(/^progress: /);
  });

  it('names the payload itself when the body is not an object', () => {
    expect(formatPayloadIssue(zodErrorOf(templatePayloadSchema, 'a title'), 'Invalid fields')).toBe('payload: Expected object, received string');
  });
});

describe('describePayloadError', () => {
  it('prefixes the message with the field and names it in the details', () => {
    expect(describePayloadError(zodErrorOf(checklistPayloadSchema, { status: 'paused' }), 'Invalid payload')).toEqual({
      message: stringMatching(/^status: /),
      details: { field: 'status' },
    });
  });

  it('does not repeat a field the message already names', () => {
    const schema = z.object({ title: z.string().refine(() => false, 'title is taken') });

    expect(describePayloadError(zodErrorOf(schema, { title: 'Launch' }), 'Invalid payload')).toEqual({ message: 'title is taken', details: { field: 'title' } });
  });

  it('names no field for a problem with the whole body', () => {
    expect(describePayloadError(zodErrorOf(checklistPayloadSchema, null), 'Invalid payload')).toEqual({
      message: 'Expected object, received null',
      details: {},
    });
  });
});

describe('invalidPayloadResponse', () => {
  it('answers 400 with the first problem', async () => {
    const response = invalidPayloadResponse(zodErrorOf(checklistPayloadSchema, { status: 'paused' }), 'Invalid checklist payload');

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toMatch(/^Invalid enum value/);
  });
});

describe('normalizeSectionsPayload', () => {
  it.each([undefined, null, []])('reads %j as no sections', (input) => {
    expect(normalizeSectionsPayload(input)).toEqual({ sections: [] });
  });

  it('refuses sections that are not a JSON array', () => {
    expect(normalizeSectionsPayload('{"id":"s1"}')).toEqual({ sections: [], error: 'sections/items must be a JSON array' });
  });

  it('wraps a flat task list, as older clients send it, in one section', () => {
    expect(normalizeSectionsPayload(JSON.stringify([{ id: 't1', title: 'Ship' }]))).toEqual({
      sections: [{ id: '1', title: 'Checklist', items: [{ id: 't1', title: 'Ship' }] }],
    });
  });
});

describe('parseSectionsPayload', () => {
  it('passes on the error of sections that are not a list', () => {
    expect(parseSectionsPayload(42)).toEqual({ sections: [], error: 'sections/items must be a JSON array' });
  });

  it('refuses sections whose tasks break the stored shape, naming where', () => {
    expect(parseSectionsPayload([{ id: 's1', title: 'Launch', items: 'not a list' }])).toEqual({
      sections: [],
      error: stringMatching(/^sections\[0\]\.items: /),
    });
  });
});
