// The API client reports every 401 here. A 401 means the request carried no valid session: it
// expired, or the user signed out other sessions or changed their password on another device.
// AuthProvider listens and re-reads the session before it signs the tab out (sessionSync.ts),
// since one 401 alone does not prove that the session is gone.
type Listener = () => void;

const listeners = new Set<Listener>();

export const onUnauthorizedResponse = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const reportUnauthorizedResponse = (): void => {
  listeners.forEach((listener) => listener());
};
