import { z } from 'zod';
import type { Env } from '../types';
import { json, jsonError } from '../utils/response';
import { getSessionUserId } from '../utils/session';
import { clipyVideoId, withSerpListsClipyRef } from '../../../src/lib/utils/clipyUrl';

const CLIPY_ORIGIN = 'https://clipy.online';
const CLIPY_CDN_ORIGIN = 'https://cdn.clipy.online';
const CLIPY_ID_PATTERN = /^[a-zA-Z0-9_-]{6,64}$/;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_KEY_POINTS = 50;
const MAX_IMAGES = 3;
const MAX_SEO_TITLE_LENGTH = 70;
const MAX_SEO_DESCRIPTION_LENGTH = 160;

type ClipyMoment = {
  caption: string;
  frameUrl: string;
  tMs: number;
};

const optionalPart = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).passthrough().optional().catch(undefined);

const clipyContextSchema = z.object({
  readiness: optionalPart({
    state: z.unknown(),
    summary: z.unknown(),
    transcript: z.unknown(),
    video: z.unknown(),
    keyMoments: z.unknown(),
  }),
  clip: optionalPart({ accessMode: z.unknown(), publicId: z.unknown(), title: z.unknown() }),
  summary: optionalPart({ keyPoints: z.unknown(), tldr: z.unknown() }),
  transcript: optionalPart({ plaintext: z.unknown() }),
  keyMoments: optionalPart({ moments: z.unknown() }),
}).passthrough();

type ClipyContext = z.infer<typeof clipyContextSchema>;

const clipyMomentSchema = z.object({ caption: z.unknown(), frameUrl: z.unknown(), tMs: z.unknown() }).passthrough();

const clipyRequestSchema = z.object({ url: z.unknown() }).passthrough();

type ClipyTemplateDraft = {
  title: string;
  description: string;
  templateType: 'checklist';
  categories: string[];
  tags: string[];
  isPublic: boolean;
  seoTitle: string;
  seoDescription: string;
  seoUrl: string;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      title: string;
      description: string;
      contents: Array<{
        id: string;
        type: 'image' | 'text' | 'video';
        uploadType?: 'url';
        value: string;
      }>;
    }>;
  }>;
};

type ClipyHandlerDependencies = {
  fetch?: typeof globalThis.fetch;
  getUserId?: typeof getSessionUserId;
};

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const shortened = value.slice(0, maxLength - 1).trimEnd();
  const lastSpace = shortened.lastIndexOf(' ');
  return `${lastSpace >= Math.floor(maxLength * 0.65) ? shortened.slice(0, lastSpace) : shortened}…`;
}

function buildSeoTitle(title: string): string {
  if (/\b(checklist|template|guide)\b/i.test(title)) {
    return truncateAtWord(title, MAX_SEO_TITLE_LENGTH);
  }

  const suffix = ' Checklist';
  return `${truncateAtWord(title, MAX_SEO_TITLE_LENGTH - suffix.length)}${suffix}`;
}

function buildSeoDescription(tldr: string, stepCount: number): string {
  const normalizedTldr = tldr.replace(/\s+/g, ' ').trim();
  const suffix = ` Includes ${stepCount} actionable steps from the recorded walkthrough.`;
  return truncateAtWord(
    normalizedTldr.length + suffix.length <= MAX_SEO_DESCRIPTION_LENGTH
      ? `${normalizedTldr}${suffix}`
      : normalizedTldr,
    MAX_SEO_DESCRIPTION_LENGTH,
  );
}

const TAG_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'GitHub', pattern: /\bgithub\b/i },
  {
    label: 'Issue Tracking',
    pattern: /\b(issue[- ]track(er|ers|ing)|bug[- ]track(er|ers|ing)|bug reports?|bug fix(es|ing)?|bug triage|triag(e|ing) (bugs|issues|tickets)|(github|gitlab) (issues?|bugs?|tickets?)|(issues?|bugs?|tickets?) (in|on) (github|gitlab)|jira|support tickets?|help ?desk tickets?|ticketing (system|tool)s?)\b/i,
  },
  { label: 'Software Development', pattern: /\b(source code|code review|coding|developer|developers|software development|git|repository|repositories|pull request)\b/i },
  { label: 'Project Management', pattern: /\b(project management|project plan|project planning|sprint planning|kanban|milestones?)\b/i },
  { label: 'Tutorial', pattern: /\b(guide|tutorial|walkthrough|how to)\b/i },
  { label: 'Productivity', pattern: /\b(productivity|time management|daily routine|habits)\b/i },
];

const CATEGORY_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'wedding', pattern: /\bwedding\b/i },
  {
    label: 'moving',
    pattern: /\b(moving (house|home|day|checklist)|move-(in|out)|(move|moving) (in|out) (day|date|checklist|inspection|cleaning)|house move|relocation checklist|relocating to a new (city|country|state|home|house))\b/i,
  },
  { label: 'camping', pattern: /\b(camping|campsite|campground)\b/i },
  {
    label: 'packing',
    pattern: /\b(packing (list|checklist|boxes|tips)|luggage|suitcase|pack(ing)? for (a |an |your |the )?(trip|vacation|holiday|travel|move|flight))\b/i,
  },
  { label: 'morning routine', pattern: /\b(morning routine|morning habits)\b/i },
  { label: 'home inspection', pattern: /\b(home inspection|property inspection)\b/i },
];

export function classifyClipySummary(summary: { title: string; tldr: string }): {
  categories: string[];
  tags: string[];
} {
  const text = `${summary.title} ${summary.tldr}`;
  return {
    categories: CATEGORY_RULES
      .filter(({ pattern }) => pattern.test(text))
      .map(({ label }) => label)
      .slice(0, 2),
    tags: [
      'Clipy',
      ...TAG_RULES.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label),
    ].slice(0, 6),
  };
}

export function parseClipyWatchUrl(value: unknown): { id: string; watchUrl: string } | null {
  if (typeof value !== 'string' || value.length > 500) return null;

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return null;
  }

  const id = clipyVideoId(parsed);
  if (!id || !CLIPY_ID_PATTERN.test(id)) return null;

  return {
    id,
    watchUrl: `${CLIPY_ORIGIN}/video/${id}`,
  };
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  let score = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) score += 1;
  });
  return score;
}

function normalizeMoments(value: unknown): ClipyMoment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ClipyMoment[] => {
    const parsedEntry = clipyMomentSchema.safeParse(entry);
    if (!parsedEntry.success) return [];
    const record = parsedEntry.data;
    const caption = boundedString(record.caption, 1_000);
    const frameUrl = boundedString(record.frameUrl, 2_000);
    const tMs = typeof record.tMs === 'number' && Number.isFinite(record.tMs)
      ? record.tMs
      : -1;

    try {
      const parsedFrame = new URL(frameUrl);
      if (
        parsedFrame.origin !== CLIPY_CDN_ORIGIN ||
        parsedFrame.protocol !== 'https:' ||
        !caption ||
        tMs < 0
      ) {
        return [];
      }
    } catch {
      return [];
    }

    return [{ caption, frameUrl, tMs }];
  });
}

function selectImages(keyPoints: string[], moments: ClipyMoment[]): Map<number, ClipyMoment> {
  const candidates = keyPoints.flatMap((keyPoint, keyPointIndex) =>
    moments.map((moment, momentIndex) => ({
      keyPointIndex,
      momentIndex,
      moment,
      score: overlapScore(keyPoint, moment.caption),
    })),
  );

  candidates.sort((a, b) =>
    b.score - a.score ||
    a.keyPointIndex - b.keyPointIndex ||
    a.moment.tMs - b.moment.tMs,
  );

  const selected = new Map<number, ClipyMoment>();
  const usedMoments = new Set<number>();
  for (const candidate of candidates) {
    if (candidate.score < 1 || selected.size >= MAX_IMAGES) break;
    if (selected.has(candidate.keyPointIndex) || usedMoments.has(candidate.momentIndex)) continue;
    selected.set(candidate.keyPointIndex, candidate.moment);
    usedMoments.add(candidate.momentIndex);
  }

  const chronologicalMoments = moments
    .map((moment, momentIndex) => ({ moment, momentIndex }))
    .sort((left, right) => left.moment.tMs - right.moment.tMs || left.momentIndex - right.momentIndex);
  for (const candidate of chronologicalMoments) {
    if (selected.size >= MAX_IMAGES) break;
    if (usedMoments.has(candidate.momentIndex)) continue;
    const keyPointIndex = keyPoints.findIndex((_, index) => !selected.has(index));
    if (keyPointIndex < 0) break;
    selected.set(keyPointIndex, candidate.moment);
    usedMoments.add(candidate.momentIndex);
  }

  return selected;
}

function buildClipyTemplateDraft(
  context: ClipyContext,
  source: { id: string; watchUrl: string },
): ClipyTemplateDraft {
  const title = boundedString(context.clip?.title, 160);
  const tldr = boundedString(context.summary?.tldr, 850);
  const keyPoints = Array.isArray(context.summary?.keyPoints)
    ? context.summary.keyPoints
        .map((value) => boundedString(value, 200))
        .filter(Boolean)
        .slice(0, MAX_KEY_POINTS)
    : [];
  const transcript = typeof context.transcript?.plaintext === 'string'
    ? context.transcript.plaintext.trim()
    : '';

  if (!title || !tldr || keyPoints.length === 0) {
    throw new Error('Clipy recording does not contain a usable title, summary, and checklist steps');
  }

  const selectedImages = selectImages(
    keyPoints,
    normalizeMoments(context.keyMoments?.moments),
  );
  const referredWatchUrl = withSerpListsClipyRef(source.watchUrl);
  const sourceMarkdown = [
    `### Recording summary\n${tldr}`,
    transcript ? `### Transcript\n${transcript}` : '',
  ].filter(Boolean).join('\n\n');
  const { categories, tags } = classifyClipySummary({ title, tldr });

  return {
    title,
    description: tldr,
    templateType: 'checklist',
    categories,
    tags,
    isPublic: false,
    seoTitle: buildSeoTitle(title),
    seoDescription: buildSeoDescription(tldr, keyPoints.length),
    seoUrl: '',
    sections: [
      {
        id: `clipy_${source.id}_steps`,
        title: 'Steps',
        items: [
          {
            id: `clipy_${source.id}_source`,
            title: 'Watch the source recording',
            description: 'Review the original walkthrough before starting the checklist.',
            contents: [
              {
                id: `clipy_${source.id}_video`,
                type: 'video',
                uploadType: 'url',
                value: referredWatchUrl,
              },
              {
                id: `clipy_${source.id}_attribution`,
                type: 'text',
                value: sourceMarkdown,
              },
            ],
          },
          ...keyPoints.map((keyPoint, index) => {
            const image = selectedImages.get(index);
            return {
              id: `clipy_${source.id}_step_${index + 1}`,
              title: keyPoint,
              description: '',
              contents: image
                ? [
                    {
                      id: `clipy_${source.id}_step_${index + 1}_image`,
                      type: 'image' as const,
                      uploadType: 'url' as const,
                      value: image.frameUrl,
                    },
                  ]
                : [],
            };
          }),
        ],
      },
    ],
  };
}

async function readJsonWithinLimit(response: Response): Promise<unknown> {
  const declaredLength = Number.parseInt(response.headers.get('Content-Length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Clipy response is too large');
  }

  if (!response.body) throw new Error('Clipy returned an empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Clipy response is too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleGenerateTemplateFromClipy(
  request: Request,
  env: Env,
  dependencies: ClipyHandlerDependencies = {},
): Promise<Response> {
  if (request.method !== 'POST') return jsonError('Method Not Allowed', 405);

  const userId = await (dependencies.getUserId ?? getSessionUserId)(request, env);
  if (!userId) return jsonError('Unauthorized', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON payload', 400, { code: 'invalid_json' });
  }

  const source = parseClipyWatchUrl(clipyRequestSchema.safeParse(body).data?.url);
  if (!source) {
    return jsonError('Enter a public Clipy watch link like https://clipy.online/video/abc123', 400, {
      code: 'invalid_clipy_url',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await (dependencies.fetch ?? globalThis.fetch)(
      `${CLIPY_ORIGIN}/video/${source.id}.json`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
  } catch {
    clearTimeout(timeout);
    return jsonError('Clipy could not be reached. Try again in a moment.', 502, {
      code: 'clipy_unavailable',
    });
  }

  if (response.status === 404) {
    clearTimeout(timeout);
    return jsonError('Clipy recording was not found or is not public.', 404, {
      code: 'clipy_not_found',
    });
  }
  if (!response.ok) {
    clearTimeout(timeout);
    return jsonError('Clipy could not provide this recording.', 502, {
      code: 'clipy_unavailable',
    });
  }

  let context: unknown;
  try {
    context = await readJsonWithinLimit(response);
  } catch {
    clearTimeout(timeout);
    return jsonError('Clipy returned an invalid or oversized response.', 502, {
      code: 'clipy_invalid_response',
    });
  }
  clearTimeout(timeout);

  const parsedContext = clipyContextSchema.safeParse(context);
  if (!parsedContext.success) {
    return jsonError('Clipy returned an invalid or oversized response.', 502, {
      code: 'clipy_invalid_response',
    });
  }
  const { readiness, clip } = parsedContext.data;

  if (
    readiness?.state !== 'complete' ||
    readiness.video !== 'ready' ||
    readiness.transcript !== 'ready' ||
    readiness.summary !== 'ready' ||
    readiness.keyMoments !== 'ready'
  ) {
    return jsonError('This Clipy recording is still processing. Try again when it is ready.', 409, {
      code: 'clipy_not_ready',
    });
  }
  if (clip?.accessMode !== 'public' || clip.publicId !== source.id) {
    return jsonError('Clipy recording was not found or is not public.', 404, {
      code: 'clipy_not_found',
    });
  }

  try {
    return json({ draft: buildClipyTemplateDraft(parsedContext.data, source) });
  } catch {
    return jsonError('This Clipy recording does not contain enough information to create a checklist.', 422, {
      code: 'clipy_missing_content',
    });
  }
}
