import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assert, describe, expect, it, vi } from 'vitest';

import { TaskImageView } from '@/components/shared/TaskImage';
import { resolveTaskImageSource } from '@/components/shared/taskImageSource';
import { UserContentImage } from '@/components/shared/UserContentImage';
import { findElement } from '../../support/elementTree';

describe('TaskImageView', () => {
  it('reports a failed load without touching the img src, however often the error fires', () => {
    const onFail = vi.fn();
    const img = findElement(
      TaskImageView({ alt: 'Task content', onFail, src: 'https://cdn.example.com/missing.png' }),
      (element) => element.type === UserContentImage,
    );
    assert.exists(img);

    const target = { src: 'https://cdn.example.com/missing.png' };
    const onError = (img.props as { onError: (event: unknown) => void }).onError;
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

  it('tries a new url again after an earlier one failed, since the run page reuses the same block when the selected task changes', () => {
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

describe('UserContentImage', () => {
  it('renders the stored image as given, with no size, srcset or optimizer url', () => {
    const markup = renderToStaticMarkup(
      <UserContentImage alt="Diagram" className="w-full" src="https://cdn.example.com/diagram.png" />,
    );

    expect(markup).toContain('<img alt="Diagram" class="w-full" src="https://cdn.example.com/diagram.png"/>');
    expect(markup).not.toMatch(/srcset|width=|height=|\/_next\/image/);
  });
});
