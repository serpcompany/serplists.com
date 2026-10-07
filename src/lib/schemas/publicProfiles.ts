import { z } from 'zod';

import { publicProfileSchema } from './accountResponses';

const userPublicProfileSchema = publicProfileSchema.extend({ type: z.literal('user') });

const organizationPublicProfileSchema = z.object({
  type: z.literal('team'),
  handle: z.string().min(1),
  name: z.string(),
  avatar_url: z.string().nullish(),
  description: z.string().nullish(),
});

export const publicProfileBodySchema = z.discriminatedUnion('type', [
  userPublicProfileSchema,
  organizationPublicProfileSchema,
]);

export type PublicProfileBody = z.infer<typeof publicProfileBodySchema>;
