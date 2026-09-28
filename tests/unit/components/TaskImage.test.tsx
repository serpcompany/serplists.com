import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TaskImageView } from '@/components/shared/TaskImage';
import { resolveTaskImageSource } from '@/components/shared/taskImageSource';

const SRC = path.resolve(__dirname, '../../../src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

const findElement = (node: React.ReactNode, type: string): React.ReactElement | null => {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  const children = (node.props as { children?: React.ReactNode }).children;
  for (const child of React.Children.toArray(children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
};

describe('TaskImageView', () => {
  it('reports a failed load without touching the img src, however often the error fires', () => {
    const onFail = vi.fn();
    const img = findElement(
      TaskImageView({ alt: 'Task content', onFail, src: 'https://cdn.example.com/missing.png' }),
      'img',
    );
    expect(img).not.toBeNull();

    const target = { src: 'https://cdn.example.com/missing.png' };
    const onError = (img!.props as { onError: (event: unknown) => void }).onError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      onError({ currentTarget: target, target });
    }

    expect(target.src).toBe('https://cdn.example.com/missing.png');
    expect(onFail).toHaveBeenCalledTimes(3);
  });

  it('renders a local fallback with no image request once the load failed', () => {
    const markup = renderToStaticMarkup(<TaskImageView alt="Task content" onFail={() => undefined} src={null} />);

    expect(markup).toContain('aria-label="Image unavailable"');
    expect(markup).toContain('Image unavailable');
    expect(markup).not.toContain('<img');
    expect(markup).not.toMatch(/\s(src|srcset|href)=/);
  });
});

describe('resolveTaskImageSource', () => {
  it('shows the image until that url fails', () => {
    expect(resolveTaskImageSource('https://cdn.example.com/a.png', null)).toBe('https://cdn.example.com/a.png');
    expect(resolveTaskImageSource('https://cdn.example.com/a.png', 'https://cdn.example.com/a.png')).toBeNull();
  });

  it('tries a new url again after an earlier one failed', () => {
    // The run page reuses the same block when the selected task changes.
    expect(resolveTaskImageSource('https://cdn.example.com/b.png', 'https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/b.png',
    );
  });

  it.each(['', '   ', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'mailto:a@example.com', 'tel:+1555', '#top', 'photo.png'])(
    'never requests %j as an image',
    (value) => {
      expect(resolveTaskImageSource(value, null)).toBeNull();
    },
  );
});

describe('image fallbacks in src', () => {
  it('never points a fallback at a third-party placeholder host', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('placehold.co'))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it('never reassigns an image src from an onError handler', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /onError=\{[\s\S]{0,300}?\.src\s*=(?!=)/.test(readFileSync(file, 'utf8')))
      .map(relative);

    expect(offenders).toEqual([]);
  });
});
