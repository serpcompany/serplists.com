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

function resolveInviteOrigin(request: Request, frontendUrl?: string): string {
  const originHeader = request.headers.get("Origin")?.trim();
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // Fall through to configured origin.
    }
  }

  const configuredFrontendUrl = frontendUrl?.trim();
  if (configuredFrontendUrl) {
    try {
      return new URL(configuredFrontendUrl).origin;
    } catch {
      // Fall through to request URL.
    }
  }

  return new URL(request.url).origin;
}

// The invite page's canonical path, with its trailing slash (src/lib/http/urlStandard.ts).
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
