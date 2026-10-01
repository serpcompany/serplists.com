import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import postcss from 'postcss';

const repoRoot = path.resolve(__dirname, '../..');

export const compileTheStylesheetTheRootLayoutImports = () =>
  postcss([tailwindcss({ base: repoRoot })]).process('@import "./src/app/globals.css";', {
    from: path.join(repoRoot, 'root-layout-stylesheet.css'),
  });
