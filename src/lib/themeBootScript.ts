// Runs in <head> before the first paint (the root layout renders it): the same key and values
// as src/lib/theme.ts, light unless 'dark' is stored, so a dark page never flashes light.
export const THEME_BOOT_SCRIPT = `(function () {
  try {
    var storedTheme = window.localStorage.getItem('serplists-theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (_error) {
    document.documentElement.classList.remove('dark');
  }
})();`;
