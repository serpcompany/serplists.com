import { z } from "zod";

const publicHandleAndName = {
  publicHandle: z.string().nullable(),
  displayName: z.string().nullable(),
};

const userOwnerSchema = z.object({ type: z.literal("user"), userId: z.string(), ...publicHandleAndName });
const organizationOwnerSchema = z.object({ type: z.literal("team"), teamId: z.string(), ...publicHandleAndName });
const publicOrganizationOwnerSchema = z.object({
  type: z.literal("team"),
  publicHandle: z.string(),
  displayName: z.string().nullable(),
});
const unnamedOrganizationOwnerSchema = z.object({ type: z.literal("team") });

export const templateOwnerSchema = z.union([
  userOwnerSchema,
  organizationOwnerSchema,
  publicOrganizationOwnerSchema,
  unnamedOrganizationOwnerSchema,
]);

export type TemplateOwner = z.infer<typeof userOwnerSchema> | z.infer<typeof organizationOwnerSchema>;

export type PublicTemplateOwner =
  | z.infer<typeof userOwnerSchema>
  | z.infer<typeof publicOrganizationOwnerSchema>
  | z.infer<typeof unnamedOrganizationOwnerSchema>;
