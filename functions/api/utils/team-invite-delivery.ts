export type TeamInviteDelivery =
  | {
      mode: "link";
      status: "ready";
      invitePath: string;
      inviteUrl: string;
    }
  | {
      mode: "email";
      status: "queued" | "sent";
      invitePath: string;
      inviteUrl: string;
    };

type BuildTeamInviteDeliveryOptions = {
  frontendUrl?: string;
  request: Request;
  token: string;
};

function originOf(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function resolveInviteOrigin(request: Request, frontendUrl?: string): string {
  return originOf(request.headers.get("Origin")) ?? originOf(frontendUrl) ?? new URL(request.url).origin;
}

export function buildTeamInvitePath(token: string): string {
  return `/team-invites/${encodeURIComponent(token)}/`;
}

export function buildTeamInviteDelivery({
  frontendUrl,
  request,
  token,
}: BuildTeamInviteDeliveryOptions): TeamInviteDelivery {
  const invitePath = buildTeamInvitePath(token);
  const inviteUrl = new URL(invitePath, resolveInviteOrigin(request, frontendUrl)).toString();

  return {
    mode: "link",
    status: "ready",
    invitePath,
    inviteUrl,
  };
}
