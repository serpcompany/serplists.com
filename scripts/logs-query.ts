import { runLogQuery } from "./lib/logQueryCommand";

const { output, exitCode } = runLogQuery(process.argv.slice(2), Date.now());
if (exitCode === 0) console.log(output);
else console.error(output);
process.exitCode = exitCode;
