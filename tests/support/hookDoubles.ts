export type HookDouble<Hook extends (...args: never[]) => unknown> = (...args: Parameters<Hook>) => Partial<ReturnType<Hook>>;
