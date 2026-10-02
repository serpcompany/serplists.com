export async function reactWithHookStubs(
  importOriginal: () => Promise<typeof import('react')>,
  stubs: Record<string, unknown>,
) {
  const actual = await importOriginal();
  return { ...actual, ...stubs, default: { ...actual, ...stubs } };
}

export async function reactKeepingStateBetweenRenders(
  importOriginal: () => Promise<typeof import('react')>,
  stubs: Record<string, unknown>,
) {
  const { useStateKeptBetweenRenders } = await import('./hookStateSlots');
  return reactWithHookStubs(importOriginal, { useState: useStateKeptBetweenRenders, ...stubs });
}
