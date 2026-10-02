import { z } from "zod";

const publicHandleAndName = {
  publicHandle: z.string().nullable(),
  displayName: z.string().nullable(),
};

export const templateOwnerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string(), ...publicHandleAndName }),
  z.object({ type: z.literal("team"), teamId: z.string(), ...publicHandleAndName }),
]);

export type TemplateOwner = z.infer<typeof templateOwnerSchema>;
