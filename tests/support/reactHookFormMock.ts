type ReactHookForm = typeof import('react-hook-form');

type FormHarness = { form: { getValues: () => Record<string, unknown> } };

export async function reactHookFormWatching(
  importOriginal: () => Promise<ReactHookForm>,
  harness: FormHarness,
  hooks: (form: { actual: ReactHookForm; valueAt: (name: string) => unknown }) => Record<string, unknown>,
) {
  const actual = await importOriginal();
  const valueAt = (name: string): unknown => actual.get(harness.form.getValues(), name);
  return {
    ...actual,
    useWatch: ({ name }: { name: string }) => structuredClone(valueAt(name)),
    ...hooks({ actual, valueAt }),
  };
}
