import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, expect, vi } from "vitest";

import { readJson } from "../support/readJson";
import type { ResponseSchema } from "@/lib/api/request";
import { schema } from "../../functions/api/db";
import { checklistRunSelectFor } from "../../functions/api/utils/checklist-runs";
import { runListProvenanceSelect } from "../../functions/api/utils/run-provenance";
import type { Env } from "@functions/api/types";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

vi.mock("../../functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(),
}));

import { handleChecklists } from "../../functions/api/handlers/checklists";
import { getSessionUserId } from "../../functions/api/utils/session";

type ApiHandler = (request: Request, env: Env) => Promise<Response>;

export function runsOnLocalD1(name: string, seed: (db: D1Database) => Promise<unknown>) {
  let d1: LocalD1 | undefined;

  beforeAll(async () => {
    d1 = await startLocalD1(name);
    await seed(d1.env.DB);
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
  });

  const env = (): Env => {
    if (!d1) throw new Error(`Local D1 for ${name} has not started`);
    return d1.env;
  };

  const requestWith = async (handler: ApiHandler, userId: string, path: string, init?: RequestInit): Promise<Response> => {
    vi.mocked(getSessionUserId).mockResolvedValue(userId);
    return handler(new Request(`http://localhost${path}`, init), env());
  };

  const requestAs = (userId: string, path: string, init?: RequestInit): Promise<Response> =>
    requestWith(handleChecklists, userId, `/api/checklists${path}`, init);

  const listAs = async <Row extends { id: string }>(
    userId: string,
    query: string,
    rows: ResponseSchema<Row[]>,
  ): Promise<Record<string, Row>> => {
    const response = await requestAs(userId, query);
    expect(response.status).toBe(200);
    const runs = await readJson(response, rows);
    return Object.fromEntries(runs.map((run) => [run.id, run]));
  };

  const personalRunListPlan = async (userId: string, { withProvenance = false } = {}): Promise<string[]> => {
    const { checklistRuns } = schema;
    const query = drizzle(env().DB)
      .select({ ...checklistRunSelectFor(userId), ...(withProvenance ? runListProvenanceSelect() : {}) })
      .from(checklistRuns)
      .where(and(eq(checklistRuns.user_id, userId), isNull(checklistRuns.team_id), isNull(checklistRuns.deleted_at)))
      .toSQL();
    const plan = await env().DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).bind(...query.params).all<{ detail: string }>();
    return plan.results.map(({ detail }) => detail);
  };

  return { db: () => env().DB, listAs, personalRunListPlan, requestAs, requestWith };
}
