import { getTableName, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

import { readRequiredTools } from '../../../src/lib/schemas/requiredTools';
import { schema } from '../db';
import { serializeChecklistRun, type RunResponseRow } from './checklist-runs';
import { runSourceTemplateUsableSql } from './template-access';

type RunOrigin = 'web' | 'mcp' | 'unknown';
type RunActor = { userId: string; name: string | null; username: string | null };

type ListProvenanceColumns = {
  provenance_started_by: string | null;
  provenance_first_event: string | null;
};

type DetailProvenanceColumns = ListProvenanceColumns & {
  provenance_created_by: string | null;
  provenance_assigned_to: string | null;
  provenance_completed_by: string | null;
  provenance_owner_name: string | null;
  provenance_template: string | null;
};

const actorSchema = z.object({ userId: z.string(), name: z.string().nullable(), username: z.string().nullable() });

const firstEventSchema = z.object({
  action: z.string(),
  metadata: z.string().nullable(),
  actor: z.unknown(),
});

const sourceTemplateSchema = z.object({
  title: z.string().nullable(),
  requiredTools: z.string().nullable(),
});

const creationMetadataSchema = z.object({
  source: z.string().optional(),
  personalRunKeyName: z.string().optional(),
});

const qualified = (column: SQLiteColumn): SQL => sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;

function actorSql(column: SQLiteColumn): SQL<string | null> {
  const { users } = schema;
  return sql<string | null>`(
    SELECT json_object('userId', ${qualified(users.id)}, 'name', ${qualified(users.name)}, 'username', ${qualified(users.username)})
    FROM ${users} WHERE ${qualified(users.id)} = ${qualified(column)}
  )`;
}

function firstEventSql(withActor: boolean): SQL<string | null> {
  const { auditEvents, checklistRuns } = schema;
  const actor = withActor ? sql`, 'actor', ${actorSql(auditEvents.actor_user_id)}` : sql``;
  return sql<string | null>`(
    SELECT json_object('action', ${qualified(auditEvents.action)}, 'metadata', ${qualified(auditEvents.metadata_json)}${actor})
    FROM ${auditEvents}
    WHERE ${qualified(auditEvents.resource_type)} = 'checklist_run' AND ${qualified(auditEvents.resource_id)} = ${qualified(checklistRuns.id)}
    ORDER BY ${qualified(auditEvents.created_at)} ASC
    LIMIT 1
  )`;
}

export function runListProvenanceSelect() {
  const { checklistRuns } = schema;
  return {
    provenance_started_by: actorSql(checklistRuns.started_by_user_id),
    provenance_first_event: firstEventSql(false),
  };
}

export function runProvenanceSelect(callerUserId: string) {
  const { checklistRuns, teams, templates, users } = schema;
  return {
    provenance_started_by: actorSql(checklistRuns.started_by_user_id),
    provenance_first_event: firstEventSql(true),
    provenance_created_by: actorSql(checklistRuns.created_by_user_id),
    provenance_assigned_to: actorSql(checklistRuns.assigned_to_user_id),
    provenance_completed_by: actorSql(checklistRuns.completed_by_user_id),
    provenance_owner_name: sql<string | null>`CASE
      WHEN ${qualified(checklistRuns.team_id)} IS NOT NULL
        THEN (SELECT ${qualified(teams.name)} FROM ${teams} WHERE ${qualified(teams.id)} = ${qualified(checklistRuns.team_id)})
      ELSE (SELECT ${qualified(users.name)} FROM ${users} WHERE ${qualified(users.id)} = ${qualified(checklistRuns.user_id)})
    END`,
    provenance_template: sql<string | null>`(
      SELECT json_object('title', ${qualified(templates.title)}, 'requiredTools', ${qualified(templates.required_tools)})
      FROM ${templates}
      WHERE ${qualified(templates.id)} = ${qualified(checklistRuns.template_id)} AND ${runSourceTemplateUsableSql(callerUserId)}
    )`,
  };
}

function parseJson(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sourceTemplateOf(value: string | null) {
  const parsed = sourceTemplateSchema.safeParse(parseJson(value));
  return parsed.success
    ? { title: parsed.data.title, requiredTools: readRequiredTools(parsed.data.requiredTools) }
    : { title: null, requiredTools: [] };
}

function actorOf(value: unknown): RunActor | null {
  const parsed = actorSchema.safeParse(typeof value === 'string' ? parseJson(value) : value);
  return parsed.success ? parsed.data : null;
}

type Creation = { origin: RunOrigin; agentKeyName: string | null; authorizedBy: RunActor | null };

const UNKNOWN_CREATION: Creation = { origin: 'unknown', agentKeyName: null, authorizedBy: null };

export function creationOf(firstEventText: string | null): Creation {
  const event = firstEventSchema.safeParse(parseJson(firstEventText));
  if (!event.success || event.data.action !== 'checklist_run.created') return UNKNOWN_CREATION;
  const metadata = creationMetadataSchema.safeParse(parseJson(event.data.metadata));
  const source = metadata.success ? metadata.data.source : undefined;
  if (source === 'web') return { origin: 'web', agentKeyName: null, authorizedBy: null };
  if (source === 'mcp') {
    return {
      origin: 'mcp',
      agentKeyName: (metadata.success ? metadata.data.personalRunKeyName : undefined) ?? null,
      authorizedBy: actorOf(event.data.actor),
    };
  }
  return UNKNOWN_CREATION;
}

export function serializeListedRun(row: RunResponseRow & ListProvenanceColumns) {
  const { provenance_started_by, provenance_first_event, ...run } = row;
  return {
    ...serializeChecklistRun(run),
    provenance: {
      origin: creationOf(provenance_first_event).origin,
      startedBy: actorOf(provenance_started_by),
    },
  };
}

export function serializeRunWithProvenance(row: RunResponseRow & DetailProvenanceColumns) {
  const {
    provenance_started_by,
    provenance_first_event,
    provenance_created_by,
    provenance_assigned_to,
    provenance_completed_by,
    provenance_owner_name,
    provenance_template,
    ...run
  } = row;
  return {
    ...serializeChecklistRun(run),
    provenance: {
      owner: run.team_id
        ? { type: 'organization' as const, id: run.team_id, name: provenance_owner_name }
        : { type: 'personal' as const, id: run.user_id, name: provenance_owner_name },
      template: { id: run.template_id, ...sourceTemplateOf(provenance_template), version: run.template_version },
      ...creationOf(provenance_first_event),
      createdBy: actorOf(provenance_created_by),
      startedBy: actorOf(provenance_started_by),
      assignedTo: actorOf(provenance_assigned_to),
      completedBy: actorOf(provenance_completed_by),
    },
  };
}
