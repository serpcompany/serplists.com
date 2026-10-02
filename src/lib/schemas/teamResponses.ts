import { z } from "zod";

const TEAM_ROLES = ["owner", "admin", "editor", "runner", "viewer"] as const;

const storedTeamRole = z.enum(TEAM_ROLES).catch("viewer");
const storedAssignableRole = z.enum(["admin", "editor", "runner", "viewer"]).catch("viewer");
const storedMemberStatus = z.enum(["active", "disabled"]).catch("disabled");
const optionalText = z.string().nullish();

export const teamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: optionalText,
  role: storedTeamRole,
  membershipStatus: storedMemberStatus,
  memberId: z.string(),
});

export const teamDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: optionalText,
  billing_owner_user_id: optionalText,
  created_by_user_id: z.string(),
  created_at: z.string(),
  updated_at: optionalText,
  archived_at: optionalText,
  membership: z.object({ id: z.string(), role: storedTeamRole, status: storedMemberStatus }),
});

export const teamMemberSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  user_id: z.string(),
  role: storedTeamRole,
  status: storedMemberStatus,
  email: optionalText,
  name: optionalText,
  avatar_url: optionalText,
});

export const teamInviteSchema = z.object({
  id: z.string(),
  team_id: z.string(),
  email: z.string(),
  role: storedAssignableRole,
  invited_by_user_id: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
  updated_at: optionalText,
  inviterEmail: optionalText,
  inviterName: optionalText,
});

export const incomingTeamInviteSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  teamSlug: optionalText,
  email: z.string(),
  role: storedAssignableRole,
  expiresAt: z.string(),
  createdAt: z.string(),
  inviterEmail: optionalText,
  inviterName: optionalText,
});

export const acceptedTeamInviteSchema = z.object({
  memberId: z.string(),
  role: storedTeamRole,
  teamId: z.string(),
  team: teamSummarySchema.optional(),
});

export const updatedTeamSchema = z.object({ success: z.literal(true), team: teamDetailSchema });

export const transferredTeamOwnershipSchema = z.object({
  success: z.literal(true),
  ownerMemberId: z.string(),
  ownerUserId: z.string(),
});

export type TeamRole = (typeof TEAM_ROLES)[number];
export type TeamMemberStatus = z.infer<typeof storedMemberStatus>;
export type TeamSummary = z.infer<typeof teamSummarySchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type IncomingTeamInvite = z.infer<typeof incomingTeamInviteSchema>;
export type AcceptedTeamInvite = z.infer<typeof acceptedTeamInviteSchema>;
