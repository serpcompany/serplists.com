export interface Problem {
  path: string;
  line?: number;
  problem: string;
}

export const located = ({ path, line, problem }: Problem) => `${path}${line === undefined ? "" : `:${line}`}  ${problem}`;

export const excerpt = (text: string) => {
  const firstLine = text.replace(/\n.*/s, "").trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
};

export const onTheirLines = <Found extends { line: number }>(lines: readonly string[], found: readonly Found[]) =>
  lines.flatMap((lineText, index) => found.filter(({ line }) => line === index + 1).map((each) => ({ ...each, lineText })));
