import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createTemplateAs,
  d1,
  openTheToolsDatabase,
  SLIDESHOW_APP,
  templatesApi,
  TIME_TRACKER,
} from "../../../support/requiredToolsSqlite";
import { createDb } from "@functions/api/db";
import { selectPublicRequiredTools } from "@functions/api/handlers/template-reads";
import { PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX } from "@/lib/schemas/requiredTools";
import { apiEnvOn } from "../../../support/apiEnv";
import { readJson } from "../../../support/readJson";

const toolsOfTemplates = z.array(z.object({ id: z.string(), requiredTools: z.unknown() }));
const refusal = z.object({ error: z.string(), code: z.string().optional() }).passthrough();

const toolsRead = async (templateIds: string[]) => {
  const response = await templatesApi(null, "GET", `/public/required-tools?ids=${templateIds.map(encodeURIComponent).join(",")}`);
  expect(response.status).toBe(200);
  return readJson(response, toolsOfTemplates);
};

describe("GET /api/templates/public/required-tools, the export page's read of the chosen public Templates' tools (TD-83)", () => {
  beforeEach(openTheToolsDatabase);
  afterEach(() => d1.close());

  it("answers anyone with the tools of each public Template asked for, and nothing for one without tools", async () => {
    const withTools = await createTemplateAs("alice", { title: "Public tools", requiredTools: [TIME_TRACKER, SLIDESHOW_APP], is_public: true });
    const withoutTools = await createTemplateAs("alice", { title: "Public, no tools", is_public: true });

    expect(await toolsRead([withTools, withoutTools])).toEqual([{ id: withTools, requiredTools: [TIME_TRACKER, SLIDESHOW_APP] }]);
  });

  it("leaves out a private, deleted or unknown Template, so it reveals nothing a public read would not", async () => {
    const privateTemplate = await createTemplateAs("alice", { title: "Private tools", requiredTools: [TIME_TRACKER] });
    const deletedTemplate = await createTemplateAs("alice", { title: "Deleted tools", requiredTools: [TIME_TRACKER], is_public: true });
    d1.run("UPDATE templates SET deleted_at = '2026-10-05T01:00:00.000Z' WHERE id = ?", deletedTemplate);

    expect(await toolsRead([privateTemplate, deletedTemplate, "no-such-template"])).toEqual([]);
  });

  it(`refuses a request for no Templates, or for more than ${PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX}, so each read stays bounded`, async () => {
    const tooMany = Array.from({ length: PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX + 1 }, (_, index) => `template-${index}`);

    for (const query of ["", "?ids=", `?ids=${tooMany.join(",")}`]) {
      const response = await templatesApi(null, "GET", `/public/required-tools${query}`);
      expect(response.status, query).toBe(400);
      await readJson(response, refusal);
    }
    const atTheLimit = await templatesApi(null, "GET", `/public/required-tools?ids=${tooMany.slice(1).join(",")}`);
    expect(atTheLimit.status).toBe(200);
  });

  it("reads each Template by its primary key, never every public Template through the is_public index", () => {
    const { sql, params } = selectPublicRequiredTools(createDb(apiEnvOn(d1)), ["template-1", "template-2"]).toSQL();
    const plan = d1.queryPlan({ sql, params }).join("; ");

    expect(plan).toContain("sqlite_autoindex_templates_1");
    expect(plan).not.toContain("idx_templates_public_created_at");
    expect(plan).not.toMatch(/SCAN templates/);
  });
});
