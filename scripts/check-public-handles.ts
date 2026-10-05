import { z } from "zod";

import { findHandleProblems, formatHandleReport, handleOwnerSchema, HANDLE_OWNERS_QUERY } from "./check-public-handles-lib";
import { execTool } from "./lib/run-tool";
import { parseWranglerResultSets } from "./lib/wrangler-json";

const onStaging = process.argv.includes("--staging");
const target = onStaging
  ? { label: "staging", database: ["DB", "--remote", "--preview"] }
  : { label: "local", database: ["serp-checklists-db", "--local"] };

const stdout = execTool("wrangler", ["d1", "execute", ...target.database, "--json", "--command", HANDLE_OWNERS_QUERY], {
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 1024 * 1024 * 10,
});
const [resultSet] = parseWranglerResultSets(stdout);
const owners = z.array(handleOwnerSchema).parse(resultSet?.results ?? []);
const problems = findHandleProblems(owners);

for (const line of formatHandleReport(target.label, owners.length, problems)) console.log(line);
if (problems.collisions.length > 0) process.exitCode = 1;
