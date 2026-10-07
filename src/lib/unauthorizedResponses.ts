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
