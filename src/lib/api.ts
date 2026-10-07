import { accountApi } from "@/lib/api/account";
import { runsApi } from "@/lib/api/runs";
import { teamsApi } from "@/lib/api/teams";
import { templatesApi } from "@/lib/api/templates";

export { getAgentMcpEndpoint } from "@/lib/api/request";
export type { AgentKey, CreatedAgentKey } from "@/lib/api/account";
export type { ChecklistRunHistoryResponse } from "@/lib/api/runs";
export type {
  AcceptedTeamInvite,
  CreatedTeamInvite,
  IncomingTeamInvite,
  TeamActivityEvent,
  TeamMember,
  TeamMemberStatus,
  TeamRole,
  TeamSummary,
} from "@/lib/api/teams";
export type {
  TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from "@/lib/api/templates";

export const api = { ...templatesApi, ...runsApi, ...teamsApi, ...accountApi };
