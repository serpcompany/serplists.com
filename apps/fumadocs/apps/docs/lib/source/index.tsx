import {
  type InferMetaType,
  type InferPageType,
  type LoaderPlugin,
  loader,
} from 'fumadocs-core/source';
import { blog as blogPosts, docs } from 'collections/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
export const docsContentDir = 'content/serplists';

export const source = loader(docs.toFumadocsSource(), {
  baseUrl: '/docs',
  plugins: [pageTreeCodeTitles(), lucideIconsPlugin()],
});

function pageTreeCodeTitles(): LoaderPlugin {
  return {
    transformPageTree: {
      file(node) {
        if (
          typeof node.name === 'string' &&
          (node.name.endsWith('()') || node.name.match(/^<\w+ \/>$/))
        ) {
          return {
            ...node,
            name: (
              <code key="0" className="text-[0.8125rem]">
                {node.name}
              </code>
            ),
          };
        }
        return node;
      },
    },
  };
}

export const blog = loader(toFumadocsSource(blogPosts, []), {
  baseUrl: '/blog',
});

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
