import { describe, expect, it, vi } from 'vitest';

import {
  handleGenerateTemplateFromClipy,
} from '../../../functions/api/handlers/clipy';

const sourceUrl = 'https://clipy.online/video/8fptqlnappr6';

function completeContext() {
  return {
    readiness: {
      state: 'complete',
      video: 'ready',
      transcript: 'ready',
      summary: 'ready',
      keyMoments: 'ready',
    },
    clip: {
      accessMode: 'public',
      publicId: '8fptqlnappr6',
      title: 'Creating Issues In GitHub Repositories',
    },
    summary: {
      tldr: 'Create a clear GitHub issue that a developer can act on.',
      keyPoints: [
        'Navigate to the repository issues tab.',
        'Click the new issue button.',
        'Provide a concise descriptive title.',
        'Include detailed information and screenshots.',
        'Submit the issue and share its URL.',
      ],
    },
    transcript: {
      plaintext: '[0:01] Open the repository.\n[0:05] Select Issues and create a new issue.',
    },
    keyMoments: {
      moments: [
        {
          tMs: 11_500,
          caption: 'Clicks the Issues tab in the GitHub repository',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/issues.jpg',
        },
        {
          tMs: 15_600,
          caption: 'Clicks the New issue button',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/new-issue.jpg',
        },
        {
          tMs: 22_700,
          caption: 'Enters a title for the new issue',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/title.jpg',
        },
        {
          tMs: 48_800,
          caption: 'Attaches a screenshot file to the issue',
          frameUrl: 'https://cdn.clipy.online/key-moments/demo/screenshot.jpg',
        },
      ],
    },
  };
}

function request(url = sourceUrl) {
  return new Request('http://localhost/api/templates/generate-from-clipy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

describe('Clipy template generation', () => {
  it('requires a Serplists session before fetching Clipy', async () => {
    const fetchMock = vi.fn();
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: fetchMock,
      getUserId: vi.fn().mockResolvedValue(null),
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs without making an outbound request', async () => {
    const fetchMock = vi.fn();
    const response = await handleGenerateTemplateFromClipy(
      request('https://example.com/video/8fptqlnappr6'),
      {} as never,
      {
        fetch: fetchMock,
        getUserId: vi.fn().mockResolvedValue('user-1'),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_clipy_url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports recordings that are still processing', async () => {
    const context = completeContext();
    context.readiness.state = 'processing';
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(Response.json(context)),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'clipy_not_ready' });
  });

  it('waits for key moments before generating the media-complete draft', async () => {
    const context = completeContext();
    context.readiness.keyMoments = 'processing';
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(Response.json(context)),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'clipy_not_ready' });
  });

  it('reports unavailable public recordings without using their response as content', async () => {
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(new Response('Not found', { status: 404 })),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'clipy_not_found' });
  });

  it('fetches only the fixed Clipy JSON endpoint and returns an unsaved draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(completeContext()));
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: fetchMock,
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://clipy.online/video/8fptqlnappr6.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      draft: {
        title: 'Creating Issues In GitHub Repositories',
        description: 'Create a clear GitHub issue that a developer can act on.',
        templateType: 'checklist',
        categories: [],
        tags: ['Clipy', 'GitHub', 'Issue Tracking', 'Software Development'],
        isPublic: false,
        seoTitle: 'Creating Issues In GitHub Repositories Checklist',
        seoDescription: 'Create a clear GitHub issue that a developer can act on. Includes 5 actionable steps from the recorded walkthrough.',
        sections: [{ id: 'clipy_8fptqlnappr6_steps', title: 'Steps' }],
      },
    });
  });

  it('returns only approved categories and does not classify generic process language', async () => {
    const context = completeContext();
    context.clip.title = 'A process for reviewing a routine project';
    context.summary.tldr = 'Review the process and organize project tasks.';
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(Response.json(context)),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });

    expect((await response.json()).draft.categories).toEqual([]);
  });

  it('preserves the complete transcript returned within the response size limit', async () => {
    const context = completeContext();
    context.transcript.plaintext = `Start ${'detailed transcript '.repeat(900)} Finish`;
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(Response.json(context)),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });
    const payload = await response.json();
    const sourceText = payload.draft.sections[0].items[0].contents.find(
      (content: { type: string }) => content.type === 'text',
    ).value;

    expect(sourceText).toContain('Finish');
  });

  it('keeps ready key-moment media in chronological order when captions do not overlap steps', async () => {
    const context = completeContext();
    context.keyMoments.moments = [
      {
        tMs: 30_000,
        caption: 'A completely unrelated final frame',
        frameUrl: 'https://cdn.clipy.online/key-moments/demo/third.jpg',
      },
      {
        tMs: 10_000,
        caption: 'A completely unrelated opening frame',
        frameUrl: 'https://cdn.clipy.online/key-moments/demo/first.jpg',
      },
      {
        tMs: 20_000,
        caption: 'A completely unrelated middle frame',
        frameUrl: 'https://cdn.clipy.online/key-moments/demo/second.jpg',
      },
    ];
    const response = await handleGenerateTemplateFromClipy(request(), {} as never, {
      fetch: vi.fn().mockResolvedValue(Response.json(context)),
      getUserId: vi.fn().mockResolvedValue('user-1'),
    });
    const payload = await response.json();

    expect(
      payload.draft.sections[0].items
        .slice(1)
        .flatMap((item: { contents: Array<{ type: string; value: string }> }) => item.contents)
        .filter((content: { type: string }) => content.type === 'image')
        .map((content: { value: string }) => content.value),
    ).toEqual([
      'https://cdn.clipy.online/key-moments/demo/first.jpg',
      'https://cdn.clipy.online/key-moments/demo/second.jpg',
      'https://cdn.clipy.online/key-moments/demo/third.jpg',
    ]);
  });
});
