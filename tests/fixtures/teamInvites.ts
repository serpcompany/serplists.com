import type { z } from 'zod';

import type { CreatedTeamInvite } from '@/lib/api';
import type { teamInviteSchema } from '@/lib/schemas/teamResponses';

export type PendingTeamInvite = z.infer<typeof teamInviteSchema>;

export const createdInvite: CreatedTeamInvite = {
  id: 'invite-1',
  email: 'newhire@example.com',
  role: 'viewer',
  expiresAt: '2026-10-07T00:00:00.000Z',
  inviteToken: 'token-1',
  invitePath: '/team-invites/token-1/',
  inviteUrl: 'https://serplists.com/team-invites/token-1/',
};

export const pendingInvite: PendingTeamInvite = {
  id: 'invite-1',
  team_id: 'team-1',
  email: 'newhire@example.com',
  role: 'viewer',
  invited_by_user_id: 'user-1',
  expires_at: '2026-10-07T00:00:00.000Z',
  created_at: '2026-09-30T00:00:00.000Z',
};
