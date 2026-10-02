import { z } from "zod";

export const DEV_BINDINGS_VARIABLE = "SERPLISTS_DEV_BINDINGS";

const devBindingsSchema = z.record(z.string(), z.string());

export function parseDevBindings(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return devBindingsSchema.parse(JSON.parse(raw));
}

export function applyDevBindings(
  processEnv: Record<string, string | undefined>,
  getContext: () => { env: object },
): boolean {
  const bindings = parseDevBindings(processEnv[DEV_BINDINGS_VARIABLE]);
  if (Object.keys(bindings).length === 0) return false;

  let context: { env: object };
  try {
    context = getContext();
  } catch {
    return false;
  }
  Object.assign(context.env, bindings);
  return true;
}
