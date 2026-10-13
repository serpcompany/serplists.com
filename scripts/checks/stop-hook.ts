import { readFileSync } from "node:fs";
import { z } from "zod";

import { root } from "./files";
import { stopHookReport } from "./hooks";

const turn = z.object({ changed: z.array(z.string()), session: z.string().optional() });

const { changed, session } = turn.parse(JSON.parse(readFileSync(0, "utf8")));
const report = await stopHookReport(root, changed, session);
if (report) console.error(report);
process.exit(report ? 2 : 0);
