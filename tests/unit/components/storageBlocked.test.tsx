import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Toaster } from '@/components/ui/sonner';
import { useViewModePreference } from '@/hooks/useViewModePreference';

const blockSiteDataSoReadingLocalStorageThrows = () => {
  const windowStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  };
  Object.defineProperty(windowStub, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
  vi.stubGlobal('window', windowStub);
};

const ViewModeProbe = () => {
  const [viewMode] = useViewModePreference({ surface: 'category-templates' });
  return <span data-view-mode={viewMode} />;
};

describe('rendering with site data blocked', () => {
  beforeEach(blockSiteDataSoReadingLocalStorageThrows);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Toaster that every route mounts', () => {
    expect(() => renderToStaticMarkup(<Toaster />)).not.toThrow();
  });

  it('renders the theme toggle in light mode', () => {
    expect(renderToStaticMarkup(<ThemeToggle />)).toContain('Switch to dark mode');
  });

  it('falls back to the default view mode', () => {
    expect(renderToStaticMarkup(<ViewModeProbe />)).toContain('data-view-mode="grid"');
  });
});
