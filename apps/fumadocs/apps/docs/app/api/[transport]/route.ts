import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { ProvideLinksToolSchema } from '@/lib/inkeep/inkeep-qa-schema';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const openai = createOpenAICompatible({
  name: 'inkeep',
  apiKey: process.env.INKEEP_API_KEY,
  baseURL: 'https://api.inkeep.com/v1',
});

async function searchDocs(query: string) {
  const dataSourceId = process.env.NEXT_PUBLIC_ORAMA_DATASOURCE_ID;
  const projectId = process.env.NEXT_PUBLIC_ORAMA_PROJECT_ID;
  const apiKey = process.env.ORAMA_PRIVATE_API_KEY ?? process.env.NEXT_PUBLIC_ORAMA_API_KEY;

  if (!dataSourceId || !projectId || !apiKey) {
    return { hits: [] as { document: unknown }[] };
  }

  try {
    const { OramaCloud } = await import('@orama/core');
    const orama = new OramaCloud({
      projectId,
      apiKey,
    });

    return await orama.search({
      term: query,
      datasources: [dataSourceId],
      limit: 50,
    });
  } catch {
    return { hits: [] as { document: unknown }[] };
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'search',
      {
        title: 'Search Docs',
        description: 'Search docs pages with a query',
        inputSchema: z.object({
          query: z.string('the search query'),
        }),
      },
      async ({ query }) => {
        const result = await searchDocs(query);

        return {
          content: result.hits.map((hit) => ({
            type: 'text',
            text: JSON.stringify(hit.document),
          })),
        };
      },
    );

    server.registerTool(
      'ask-ai',
      {
        title: 'Ask AI',
        description: 'Ask another specialized AI a question for more info',
        inputSchema: z.object({
          message: z.string(),
        }),
      },
      async ({ message }) => {
        const result = await generateText({
          model: openai('inkeep-qa-sonnet-4'),
          tools: {
            provideLinks: {
              inputSchema: ProvideLinksToolSchema,
            },
          },
          messages: [
            {
              role: 'user',
              content: message,
            },
          ],
        });

        return {
          content: [
            {
              type: 'text',
              text: result.text,
            },
          ],
        };
      },
    );
  },
  {},
  { basePath: '/api', disableSse: true },
);

export { handler as GET, handler as POST, handler as DELETE };
