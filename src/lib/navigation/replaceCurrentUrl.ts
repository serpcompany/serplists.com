export const replaceCurrentUrl = (url: string, state: Record<string, unknown> | null = null): void => {
  window.history.replaceState(state === null ? null : { ...state }, '', url);
};

export const currentLocationPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;
