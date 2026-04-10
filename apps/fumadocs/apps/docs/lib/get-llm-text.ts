import { type Page } from '@/lib/source';
import { getSection } from './source/navigation';

export async function getLLMText(page: Page) {
  const section = getSection(page.slugs[0]);
  const category =
    {
      overview: 'Serplists UI Inventory Overview',
      inventory: 'Serplists Page Inventory',
      features: 'Serplists Feature Registry',
      'ui-blocks': 'Serplists UI Blocks',
      glossary: 'Serplists Glossary',
    }[section] ?? section;

  const processed = await page.data.getText('processed');

  return `# ${category}: ${page.data.title}
URL: ${page.url}
Source: https://raw.githubusercontent.com/serpcompany/serplists.com/refs/heads/staging/apps/fumadocs/apps/docs/content/serplists/${page.path}

${page.data.description ?? ''}
        
${processed}`;
}
