import type * as SessionSyncModule from '@/contexts/sessionSync';

type SessionSync = ReturnType<typeof SessionSyncModule.createSessionSync>;

export async function sessionSyncModuleWith(
  importOriginal: () => Promise<typeof SessionSyncModule>,
  changeSync: (sync: SessionSync) => Partial<SessionSync>,
  changeModule: Partial<typeof SessionSyncModule> = {},
) {
  const real = await importOriginal();
  return {
    ...real,
    createSessionSync: (...args: Parameters<typeof real.createSessionSync>) => {
      const sync = real.createSessionSync(...args);
      return { ...sync, ...changeSync(sync) };
    },
    ...changeModule,
  };
}
