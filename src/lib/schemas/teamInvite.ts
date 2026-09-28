import { z } from "zod";

// Response of GET /api/teams/invites/:token, the read-only preview the invite
// page shows before the invitee chooses to accept or decline.
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

// Response of POST /api/teams/:teamId/invites and of
// POST /api/teams/:teamId/invites/:inviteId/link. The raw link is returned only
// here: the server stores a hash of the token and cannot show it again.
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

// `details` of the 409 `team_invite_exists` error from creating an invite.
export const teamInviteExistsDetailsSchema = z.object({
  inviteId: z.string().min(1),
  expiresAt: z.string().optional(),
});
