export function getSection(path: string | undefined) {
  if (!path) return 'overview';
  const [dir] = path.split('/', 1);
  if (!dir) return 'overview';
  return (
    {
      overview: 'overview',
      inventory: 'inventory',
      features: 'features',
      'ui-blocks': 'ui-blocks',
      glossary: 'glossary',
    }[dir] ?? 'overview'
  );
}
