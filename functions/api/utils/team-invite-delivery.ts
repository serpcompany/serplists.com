import { urlOrigin } from "./origin-list";

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
  frontendUrl?: string | undefined;
  request: Request;
  token: string;
};

function resolveInviteOrigin(request: Request, frontendUrl?: string): string {
  return urlOrigin(request.headers.get("Origin")) ?? urlOrigin(frontendUrl) ?? new URL(request.url).origin;
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
