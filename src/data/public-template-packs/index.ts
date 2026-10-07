export const templatePackModules: Record<string, unknown> = import.meta.glob('./*.json', {
  eager: true,
});
