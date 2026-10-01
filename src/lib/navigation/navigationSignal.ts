type NavigationListener = () => void;

const listeners = new Set<NavigationListener>();

export const subscribeToNavigations = (listener: NavigationListener): (() => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

export const reportNavigation = (): void => {
  listeners.forEach((listener) => listener());
};
