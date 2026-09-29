// Every template pack in this directory, keyed by its file ('./<name>.json'): the bundled
// library (src/lib/repoTemplateCatalog.ts) reads them all, so a new pack needs no other
// change. The glob sits here because Turbopack matches only patterns below the calling
// file's directory; one that starts with '../' matches nothing.
export const templatePackModules: Record<string, unknown> = import.meta.glob('./*.json', {
  eager: true,
});
