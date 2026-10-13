export function commandsTheRunnerRuns(output: string): string[] {
  const ran: string[] = [];
  let stoppedUntil: string | undefined;
  for (const line of output.split(/\r\n|\r|\n/)) {
    const command = /^::([^\s:]+)/.exec(line.trimStart())?.[1] ?? /##\[([^\s\]]+)/.exec(line)?.[1];
    if (command === undefined) continue;
    if (stoppedUntil !== undefined) {
      if (command === stoppedUntil) {
        stoppedUntil = undefined;
        ran.push('resume');
      }
      continue;
    }
    if (command === 'stop-commands') stoppedUntil = line.trimStart().slice('::stop-commands::'.length);
    ran.push(command);
  }
  return ran;
}
