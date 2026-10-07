export const LOCAL_SHARE_OF_CPU_THREADS = 4;

export function testWorkerLimit(env: Readonly<Record<string, string | undefined>>, cpuThreads: number): number | null {
  if (env["CI"]) return null;
  return Math.max(1, Math.floor(cpuThreads / LOCAL_SHARE_OF_CPU_THREADS));
}
