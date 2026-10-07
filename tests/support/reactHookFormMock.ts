import { present } from './elements';

type ReactHookForm = typeof import('react-hook-form');

type FormHarness = { form: { getValues: () => unknown } | null };

export async function reactHookFormWatching(
  importOriginal: () => Promise<ReactHookForm>,
  harness: FormHarness,
  hooks: (form: { actual: ReactHookForm; valueAt: (name: string) => unknown }) => Record<string, unknown>,
) {
  const actual = await importOriginal();
  const valueAt = (name: string): unknown => actual.get(present(harness.form, 'the form under test').getValues(), name);
  return {
    ...actual,
    useWatch: ({ name }: { name: string }) => structuredClone(valueAt(name)),
    ...hooks({ actual, valueAt }),
  };
}
