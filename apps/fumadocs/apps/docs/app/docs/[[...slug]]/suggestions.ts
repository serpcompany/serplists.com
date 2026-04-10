import type { Suggestion } from '@/components/layouts/not-found';

export async function getSuggestions(pathname: string): Promise<Suggestion[]> {
  const dataSourceId = process.env.NEXT_PUBLIC_ORAMA_DATASOURCE_ID;
  const projectId = process.env.NEXT_PUBLIC_ORAMA_PROJECT_ID;
  const apiKey = process.env.ORAMA_PRIVATE_API_KEY ?? process.env.NEXT_PUBLIC_ORAMA_API_KEY;

  if (!dataSourceId || !projectId || !apiKey) return [];

  let results:
    | {
        groups?: {
          result: {
            id: string;
            document: {
              url?: string;
              title?: string;
            };
          }[];
        }[];
      }
    | undefined;

  try {
    const { OramaCloud } = await import('@orama/core');
    const orama = new OramaCloud({
      projectId,
      apiKey,
    });

    results = await orama.search({
      term: pathname,
      mode: 'vector',
      datasources: [dataSourceId],
      groupBy: {
        properties: ['url'],
        max_results: 1,
      },
    });
  } catch {
    return [];
  }

  if (!results?.groups) return [];

  return results.groups.flatMap((group) => {
    const doc = group.result[0];
    if (!doc) return [];

    return {
      id: doc.id,
      href: doc.document.url as string,
      title: doc.document.title as string,
    };
  });
}
