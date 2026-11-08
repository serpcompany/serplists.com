export interface Problem {
  path: string;
  line?: number;
  problem: string;
}

export const located = ({ path, line, problem }: Problem) => `${path}${line === undefined ? "" : `:${line}`}  ${problem}`;

export const lineExcerpt = (text: string, line: number) => {
  const shown = text.split(/\r?\n/).slice(line - 1, line).join("").trim();
  return shown.length > 80 ? `${shown.slice(0, 77)}...` : shown;
};
