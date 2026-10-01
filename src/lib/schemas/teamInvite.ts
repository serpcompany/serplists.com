import { z } from "zod";

export const teamInvitePreviewSchema = z.object({
  status: z.enum(["pending", "already_member"]),
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  teamSlug: z.string().nullable().optional(),
  role: z.enum(["owner", "admin", "editor", "runner", "viewer"]),
  expiresAt: z.string(),
  inviterName: z.string().nullable().optional(),
  inviterEmail: z.string().nullable().optional(),
});

export type TeamInvitePreview = z.infer<typeof teamInvitePreviewSchema>;

const assignableTeamRoleSchema = z.enum(["admin", "editor", "runner", "viewer"]);

const teamInviteDeliverySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("link"),
    status: z.literal("ready"),
    invitePath: z.string(),
    inviteUrl: z.string(),
  }),
  z.object({
    mode: z.literal("email"),
    status: z.enum(["queued", "sent"]),
    invitePath: z.string(),
    inviteUrl: z.string(),
  }),
]);

export const createdTeamInviteSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: assignableTeamRoleSchema,
  expiresAt: z.string(),
  inviteToken: z.string().min(1),
  invitePath: z.string().min(1),
  inviteUrl: z.string().optional(),
  delivery: teamInviteDeliverySchema.optional(),
});

export type CreatedTeamInvite = z.infer<typeof createdTeamInviteSchema>;
export type TeamInviteDelivery = z.infer<typeof teamInviteDeliverySchema>;

export const teamInviteExistsDetailsSchema = z.object({
  inviteId: z.string().min(1),
  expiresAt: z.string().optional(),
});
