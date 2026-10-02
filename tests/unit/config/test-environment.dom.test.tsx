import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('the DOM a *.dom.test.tsx file renders into', () => {
  it('has the globals a browser has, Element and matchMedia included', () => {
    expect(document.createElement('div')).toBeInstanceOf(Element);
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(true);
  });

  it('follows no link, so a click the app leaves to the browser loads nothing', () => {
    const before = window.location.href;
    render(<a href="https://example.com/elsewhere">Elsewhere</a>);

    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));

    expect(window.location.href).toBe(before);
  });
});
