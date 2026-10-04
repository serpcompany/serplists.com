import type { RunActor, RunProvenance } from '@/types/checklist';

export const RUN_ORIGIN_LABELS: Record<RunProvenance['origin'], string> = {
  web: 'Web',
  mcp: 'MCP',
  unknown: 'Unknown',
};

export const runActorLabel = (actor: RunActor | null | undefined): string | null => {
  if (!actor) return null;
  const name = actor.name?.trim();
  if (name) return name;
  return actor.username ? `@${actor.username}` : 'Unnamed user';
};

export function runProvenanceSummary(provenance: RunProvenance | undefined): string | null {
  if (!provenance) return null;
  const { origin } = provenance;
  const starter = origin === 'mcp' ? provenance.agentKeyName || runActorLabel(provenance.startedBy) : runActorLabel(provenance.startedBy);
  const started = [starter ? `Started by ${starter}` : 'Started', origin === 'unknown' ? null : `via ${RUN_ORIGIN_LABELS[origin]}`]
    .filter(Boolean)
    .join(' ');
  if (started === 'Started') return null;
  const authorizer = origin === 'mcp' ? runActorLabel(provenance.authorizedBy) : null;
  return authorizer ? `${started} · authorized by ${authorizer}` : started;
}
