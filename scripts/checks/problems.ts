export interface Problem {
  path: string;
  line?: number;
  problem: string;
}

export const located = ({ path, line, problem }: Problem) => `${path}${line === undefined ? "" : `:${line}`}  ${problem}`;

export const excerpt = (text: string) => {
  const firstLine = (text.split("\n", 1)[0] ?? "").trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
};
