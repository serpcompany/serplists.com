export function parseAllowedOrigin(value: string): string | null;
export function parseOriginList(raw: string): { origins: string[]; invalid: string[] };
export function describeOriginListProblem(raw: string): string | null;
export function describeFrontendUrlProblem(raw: string): string | null;
