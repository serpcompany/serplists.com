import { LOCAL_SHARE_OF_CPU_THREADS } from "./local-test-workers";

export type CpuCapCommand = { command: string; args: string[] };

export const cappedThreadCount = (cpuThreads: number): number =>
  Math.max(1, Math.floor(cpuThreads / LOCAL_SHARE_OF_CPU_THREADS));

export function cpuCapCommand(platform: NodeJS.Platform, pid: number, cpuThreads: number): CpuCapCommand | null {
  const threads = cappedThreadCount(cpuThreads);
  if (platform === "win32") {
    const mask = ((1n << BigInt(threads)) - 1n).toString();
    return { command: "powershell", args: ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).ProcessorAffinity = ${mask}`] };
  }
  if (platform === "linux") {
    return { command: "taskset", args: ["-a", "-p", "-c", `0-${threads - 1}`, String(pid)] };
  }
  return null;
}
