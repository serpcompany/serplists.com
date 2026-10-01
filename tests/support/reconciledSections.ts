import { z } from 'zod';

const reconciledSections = z.array(
  z
    .object({
      items: z.array(
        z
          .object({
            contents: z
              .array(z.object({ subItems: z.array(z.record(z.unknown())).optional() }).passthrough())
              .optional(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
);

export const sectionsOf = (result: { sections: unknown[] }) => reconciledSections.parse(result.sections);
