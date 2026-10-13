import { type Duplicate, describeDuplicate } from "./duplicates";
import { covers } from "./files";

export interface DuplicateException {
  blocks: number;
  reason: string;
}

export const knownDuplicates: Readonly<Record<string, DuplicateException>> = {};

const pairOf = ({ first, second }: Duplicate) =>
  [first.name, second.name].sort((left, right) => left.localeCompare(right)).join(" and ");

function exceptionProblem(pair: string, count: number, { blocks, reason }: DuplicateException): string | undefined {
  if (!reason.trim()) return `${pair}  are excepted without a reason: give them one, or share the code`;
  if (count > blocks) return `${pair}  repeat ${count} blocks, more than the ${blocks} knownDuplicates allows`;
  if (count === 0) return `${pair}  no longer repeat each other: remove them from knownDuplicates`;
  if (count < blocks) return `${pair}  repeat ${count} blocks now: lower knownDuplicates to ${count}`;
  return undefined;
}

export function duplicateProblems(
  found: readonly Duplicate[],
  prefixes: readonly string[],
  known: Readonly<Record<string, DuplicateException>> = knownDuplicates,
): string[] {
  const touchesTheRun = (duplicate: Duplicate) =>
    covers(prefixes, duplicate.first.name) || covers(prefixes, duplicate.second.name);
  const counts = new Map<string, number>();
  for (const duplicate of found) counts.set(pairOf(duplicate), (counts.get(pairOf(duplicate)) ?? 0) + 1);
  const problems = found
    .filter((duplicate) => touchesTheRun(duplicate) && known[pairOf(duplicate)] === undefined)
    .map(describeDuplicate);
  for (const [pair, exception] of Object.entries(known)) {
    if (!pair.split(" and ").some((file) => covers(prefixes, file))) continue;
    const count = counts.get(pair) ?? 0;
    const problem = exceptionProblem(pair, count, exception);
    if (!problem) continue;
    if (count > exception.blocks) problems.push(...found.filter((duplicate) => pairOf(duplicate) === pair).map(describeDuplicate));
    problems.push(problem);
  }
  return problems;
}
