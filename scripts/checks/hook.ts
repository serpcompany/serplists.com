import { readFileSync } from "node:fs";
import { z } from "zod";

import { root } from "./files";
import { editHookReport } from "./hooks";

const editedFile = z.object({ file: z.string() });

const report = await editHookReport(root, editedFile.parse(JSON.parse(readFileSync(0, "utf8"))).file);
if (report) console.error(report);
process.exit(report ? 2 : 0);
