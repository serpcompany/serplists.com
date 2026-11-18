export const savedTeam = (team: { name: string; slug: string; description?: string | null; avatar_url?: string | null }) => ({
  success: true as const,
  team: {
    id: 'team-1',
    created_at: '2026-01-01T00:00:00.000Z',
    created_by_user_id: 'user-1',
    membership: { id: 'member-1', status: 'active' as const, role: 'owner' as const },
    ...team,
  },
});
