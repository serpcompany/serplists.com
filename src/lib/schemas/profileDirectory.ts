import { z } from 'zod';

export const PROFILE_DIRECTORY_COLLECTIONS = ['people', 'organizations'] as const;

export type ProfileDirectoryCollection = (typeof PROFILE_DIRECTORY_COLLECTIONS)[number];

export const PROFILE_DIRECTORY_PAGE_SIZE = 24;

const PROFILE_DIRECTORY_CURSOR_MAX_LENGTH = 64;

const cursorSchema = z.string().min(1).max(PROFILE_DIRECTORY_CURSOR_MAX_LENGTH);

const profileDirectoryQuerySchema = z
  .object({
    collection: z.enum(PROFILE_DIRECTORY_COLLECTIONS).default('people'),
    after: cursorSchema.optional(),
    before: cursorSchema.optional(),
  })
  .refine((query) => !(query.after && query.before), { message: 'Pass after or before, not both' });

export type ProfileDirectoryQuery = z.infer<typeof profileDirectoryQuerySchema>;

const FIRST_PEOPLE_PAGE: ProfileDirectoryQuery = { collection: 'people' };

export const parseProfileDirectoryQuery = (params: URLSearchParams) =>
  profileDirectoryQuerySchema.safeParse({
    collection: params.get('collection') || undefined,
    after: params.get('after') || undefined,
    before: params.get('before') || undefined,
  });

export const readProfileDirectoryQuery = (params: URLSearchParams): ProfileDirectoryQuery => {
  const parsed = parseProfileDirectoryQuery(params);
  return parsed.success ? parsed.data : FIRST_PEOPLE_PAGE;
};

export const profileDirectorySearchParams = (query: ProfileDirectoryQuery): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.collection !== FIRST_PEOPLE_PAGE.collection) params.set('collection', query.collection);
  if (query.after) params.set('after', query.after);
  else if (query.before) params.set('before', query.before);
  return params;
};

const profileDirectoryEntrySchema = z.object({
  handle: z.string().min(1),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  public_template_count: z.number().int().nonnegative(),
});

export type ProfileDirectoryEntry = z.infer<typeof profileDirectoryEntrySchema>;

export const profileDirectoryPageSchema = z.object({
  collection: z.enum(PROFILE_DIRECTORY_COLLECTIONS),
  profiles: z.array(profileDirectoryEntrySchema),
  next_cursor: z.string().nullable(),
  previous_cursor: z.string().nullable(),
});

export type ProfileDirectoryPage = z.infer<typeof profileDirectoryPageSchema>;
