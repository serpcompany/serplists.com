import { runDeployedLogQuery } from "./lib/logsDeployed";

const { output, exitCode, notice } = await runDeployedLogQuery(process.argv.slice(2), { env: process.env, nowMs: Date.now() });
console.error(notice);
if (exitCode === 0) console.log(output);
else console.error(output);
process.exitCode = exitCode;
