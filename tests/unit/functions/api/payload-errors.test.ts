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
import { invalidPayloadResponse, readJsonPayload } from '@functions/api/utils/request-json';
import { parseToolArguments } from '@functions/api/handlers/agentMcpTools';
import { stringMatching } from '../../../support/asymmetricMatchers';
import { toolErrorOf } from '../../../support/agentMcp';
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

  it('answers with its fallback for an error that reports no problem', () => {
    expect(formatPayloadIssue(new z.ZodError([]), 'Invalid template fields')).toBe('Invalid template fields');
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

  it('answers with its fallback, naming no field, for an error that reports no problem', () => {
    expect(describePayloadError(new z.ZodError([]), 'Invalid template payload')).toEqual({ message: 'Invalid template payload', details: {} });
  });
});

const refusedWithoutAMessage = z.string().refine(() => false, '');

describe('invalidPayloadResponse', () => {
  it('answers 400 with the first problem', async () => {
    const response = invalidPayloadResponse(zodErrorOf(checklistPayloadSchema, { status: 'paused' }), 'Invalid checklist payload');

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toMatch(/^Invalid enum value/);
  });

  it.each([
    ['reports no problem', new z.ZodError([])],
    ['reports a problem with no message', zodErrorOf(refusedWithoutAMessage, 'x')],
  ])('answers 400 with its fallback for an error that %s', async (_label, error) => {
    const response = invalidPayloadResponse(error, 'Invalid key payload');

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toBe('Invalid key payload');
  });

  it('is what readJsonPayload answers for a body its schema refuses without a message', async () => {
    const read = await readJsonPayload(new Request('http://localhost/api/x', { method: 'POST', body: '"x"' }), refusedWithoutAMessage, 'Invalid error report');

    if (!('response' in read)) throw new Error('The body was accepted');
    expect((await readJson(read.response, apiErrorBody)).error).toBe('Invalid error report');
  });
});

describe('parseToolArguments', () => {
  it('names the refusal "Invalid arguments" when no problem it reports has a message', () => {
    const error = toolErrorOf(() => parseToolArguments(refusedWithoutAMessage, 'x'));

    expect(error.message).toBe('Invalid arguments');
    expect(error.details).toEqual({ issues: [{ path: '', message: '' }] });
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
