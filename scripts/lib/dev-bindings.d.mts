export const DEV_BINDINGS_VARIABLE: "SERPLISTS_DEV_BINDINGS";

export function parseDevBindings(raw: string | undefined): Record<string, string>;
export function applyDevBindings(
  processEnv: Record<string, string | undefined>,
  getContext: () => { env: object },
): boolean;
