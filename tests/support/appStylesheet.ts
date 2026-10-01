import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import postcss, { type AcceptedPlugin } from 'postcss';

const repoRoot = path.resolve(__dirname, '../..');

const isPostcssPlugin = (value: unknown): value is AcceptedPlugin =>
  typeof value === 'object' && value !== null && 'postcssPlugin' in value;

const tailwindPostcssPlugin = (): AcceptedPlugin => {
  const plugin: unknown = tailwindcss({ base: repoRoot });
  if (!isPostcssPlugin(plugin)) throw new Error('@tailwindcss/postcss gave no PostCSS plugin');
  return plugin;
};

export const compileTheStylesheetTheRootLayoutImports = () =>
  postcss([tailwindPostcssPlugin()]).process('@import "./src/app/globals.css";', {
    from: path.join(repoRoot, 'root-layout-stylesheet.css'),
  });
