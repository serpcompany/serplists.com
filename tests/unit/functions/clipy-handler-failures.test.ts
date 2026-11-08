import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { handleGenerateTemplateFromClipy } from '../../../functions/api/handlers/clipy';
import { apiEnv } from '../../support/apiEnv';
import { apiErrorBody, readJson } from '../../support/readJson';
import { clipyRequest, completeClipyContext } from '../../fixtures/clipyContext';

const draftBody = z.object({
  draft: z.object({
    seoTitle: z.string(),
    seoDescription: z.string(),
    sections: z.array(z.object({ items: z.array(z.object({ contents: z.array(z.object({ type: z.string() }).passthrough()) }).passthrough()) }).passthrough()),
  }).passthrough(),
}).passthrough();

function generateWith(fetch: typeof globalThis.fetch, request = clipyRequest()) {
  return handleGenerateTemplateFromClipy(request, apiEnv(), { fetch, getUserId: vi.fn().mockResolvedValue('user-1') });
}

const answering = (response: Response) => vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);

async function refusal(response: Response) {
  return { status: response.status, code: (await readJson(response, apiErrorBody)).code };
}

function streamOf(bytes: number) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes).fill(32));
      controller.close();
    },
  });
}

describe('Clipy template generation when the request or Clipy fails', () => {
  it('answers a request body that is not JSON with 400 before fetching Clipy', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const request = new Request('http://localhost/api/templates/generate-from-clipy', { method: 'POST', body: 'not json' });

    expect(await refusal(await generateWith(fetch, request))).toEqual({ status: 400, code: 'invalid_json' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 502 when Clipy cannot be reached', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('network down'));

    expect(await refusal(await generateWith(fetch))).toEqual({ status: 502, code: 'clipy_unavailable' });
  });

  it('answers 502 when Clipy answers with a server error', async () => {
    expect(await refusal(await generateWith(answering(new Response('boom', { status: 503 })))))
      .toEqual({ status: 502, code: 'clipy_unavailable' });
  });

  it.each([
    ['declares a body over 1MB', () => new Response('{}', { headers: { 'Content-Length': String(2 * 1024 * 1024) } })],
    ['has no body', () => new Response(null, { status: 200 })],
    ['streams more than 1MB without declaring it', () => new Response(streamOf(1024 * 1024 + 1))],
    ['is not JSON', () => new Response('not json')],
    ['is JSON but not an object', () => Response.json(['not', 'an', 'object'])],
  ])('answers 502 when the response %s', async (_label, response) => {
    expect(await refusal(await generateWith(answering(response())))).toEqual({ status: 502, code: 'clipy_invalid_response' });
  });

  it.each([
    ['is not public', { accessMode: 'private' }],
    ['belongs to another link', { publicId: 'someone-else' }],
  ])('answers 404 when the recording %s', async (_label, clip) => {
    const context = completeClipyContext();

    const response = await generateWith(answering(Response.json({ ...context, clip: { ...context.clip, ...clip } })));

    expect(await refusal(response)).toEqual({ status: 404, code: 'clipy_not_found' });
  });

  it.each([
    ['key points that are not a list', { tldr: 'Do the thing.', keyPoints: 'one, two' }],
    ['no summary', { keyPoints: ['Step one'] }],
  ])('answers 422 when the recording has %s', async (_label, summary) => {
    const response = await generateWith(answering(Response.json({ ...completeClipyContext(), summary })));

    expect(await refusal(response)).toEqual({ status: 422, code: 'clipy_missing_content' });
  });
});

describe('Clipy drafts from recordings with long or unusable parts', () => {
  it('shortens a long title and summary at a word for the search fields', async () => {
    const context = completeClipyContext();
    const title = `How to ${'organize the garage shelves '.repeat(6).trim()}`;
    const tldr = 'Sort, label and store every box. '.repeat(10).trim();

    const response = await generateWith(answering(Response.json({ ...context, clip: { ...context.clip, title }, summary: { ...context.summary, tldr } })));

    const { draft } = await readJson(response, draftBody);
    expect(draft.seoTitle.length).toBeLessThanOrEqual(70);
    expect(draft.seoTitle).toMatch(/… Checklist$/);
    expect(draft.seoDescription.length).toBeLessThanOrEqual(160);
    expect(draft.seoDescription).toMatch(/…$/);
  });

  it('leaves out key moments it cannot show and a transcript that is not text', async () => {
    const context = completeClipyContext();
    const moments = [
      { tMs: 'soon', caption: 'Clicks the Issues tab', frameUrl: 'https://cdn.clipy.online/key-moments/demo/a.jpg' },
      { tMs: 1_000, caption: 'Clicks the New issue button', frameUrl: 'https://elsewhere.example/b.jpg' },
      { tMs: 2_000, caption: 'Enters a title', frameUrl: 'not a url' },
      { tMs: 3_000, caption: '', frameUrl: 'https://cdn.clipy.online/key-moments/demo/c.jpg' },
      'not a moment',
    ];

    const response = await generateWith(answering(Response.json({ ...context, transcript: { plaintext: 42 }, keyMoments: { moments } })));

    const { draft } = await readJson(response, draftBody);
    const contentTypes = draft.sections.flatMap((section) => section.items.flatMap((item) => item.contents.map(({ type }) => type)));
    expect(contentTypes).not.toContain('image');
    expect(JSON.stringify(draft)).not.toContain('### Transcript');
  });
});
