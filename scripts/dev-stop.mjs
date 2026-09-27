#!/usr/bin/env node
// Stop the dev servers started by `pnpm run dev`, `dev:api`, or `dev:all`, including their
// child processes. Killing only the parent (for example, stopping a background task) leaves
// Vite and Wrangler running on Windows and holding the ports.
import { execFileSync } from "node:child_process";
import { isProcessAlive, readDevSession, removeDevSession } from "./dev-auto-lib.mjs";

const session = readDevSession();
if (!session) {
  console.log("No dev session is running.");
  process.exit(0);
}

const pids = [session.allPid, session.frontendPid, session.apiPid].filter((pid) => pid && isProcessAlive(pid));
for (const pid of pids) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}
removeDevSession();
console.log(pids.length > 0 ? `Stopped dev session (pid ${pids.join(", ")}).` : "Dev session was not running; cleared tmp/dev-session.json.");
