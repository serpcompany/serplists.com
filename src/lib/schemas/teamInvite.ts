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
