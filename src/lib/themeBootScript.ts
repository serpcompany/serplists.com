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
