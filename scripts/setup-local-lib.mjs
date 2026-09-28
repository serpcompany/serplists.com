// Pure helpers for scripts/setup-local.mjs, kept apart so they can be unit tested.
import { normalizeEol } from "./lib/line-endings.mjs";

const PLACEHOLDER = /xxx|replace-with|example\.com/;

/**
 * .dev.vars text built from .dev.vars.example: BETTER_AUTH_SECRET gets `secret`, and
 * any other value that is still a placeholder is commented out so optional
 * integrations stay disabled until someone fills in real test values. The example is
 * read with LF line endings, so a CRLF checkout still gets a generated secret.
 */
export function renderDevVars(exampleText, secret) {
  return normalizeEol(exampleText)
    .split("\n")
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return line;
      const [, key, value] = match;
      if (key === "BETTER_AUTH_SECRET") return `${key}=${secret}`;
      return PLACEHOLDER.test(value) ? `# ${line}` : line;
    })
    .join("\n");
}
