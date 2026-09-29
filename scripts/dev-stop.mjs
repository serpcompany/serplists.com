#!/usr/bin/env node
// Stop the dev server started by `pnpm run dev:all`, including its child processes. Killing
// only the launcher (for example, stopping a background task) leaves Next.js and workerd
// running on Windows and holding the port.
// A recorded pid is killed only while it still belongs to the dev launcher that wrote it:
// after the launcher dies, the OS can give its pid to an unrelated process.
import { DEV_SESSION_PATH, readDevSession, stopDevSession } from "./dev-auto-lib.mjs";

const session = readDevSession();
if (!session) {
  console.log("No dev session is running.");
  process.exit(0);
}

const { stopped, skipped, failed } = await stopDevSession({ session });

for (const pid of skipped) {
  console.log(`Skipped pid ${pid}: it is no longer the dev launcher that started this session, so it was left running.`);
}
for (const { pid, message } of failed) {
  console.error(`Could not stop pid ${pid}: ${message}`);
}
if (skipped.length > 0 || failed.length > 0) {
  console.log("If dev servers still hold their ports, stop them from their terminal or the task manager.");
}

console.log(
  stopped.length > 0
    ? `Stopped dev session (pid ${stopped.join(", ")}).`
    : `Dev session was not running; cleared ${DEV_SESSION_PATH}.`,
);
process.exitCode = failed.length > 0 ? 1 : 0;
