import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateHeader } from '@/components/template-editor/TemplateHeader';

import { findUnnamedControls, getByAccessibleName } from './accessibleMarkup';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

const renderHeader = (props: Partial<React.ComponentProps<typeof TemplateHeader>>) =>
  renderToStaticMarkup(
    <TemplateHeader
      isEditing
      isSaving={false}
      title="New Employee Onboarding"
      onCancel={() => undefined}
      onSave={() => undefined}
      {...props}
    />,
  );

describe('TemplateHeader', () => {
  it('renders the compact reference-style editor top bar, sticky under the console top bar', () => {
    const html = renderHeader({ templateSlug: 'piggyback-discovery-sop', onPreview: () => undefined });

    expect(html).toContain('New Employee Onboarding');
    expect(html).toContain('Editing');
    expect(html).toContain('Save');
    expect(html).toContain('Preview');
    expect(html).toContain('sticky top-14 z-30');
    expect(html).not.toContain('Template editor');
    expect(html).not.toContain('Draft');
    expect(html).not.toContain('Cancel');
  });
});

describe('TemplateHeader while a file uploads', () => {
  it('disables Save and says a file is uploading, since a save now would store the block without its file', () => {
    const html = renderHeader({ isUploading: true });

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Uploading\.\.\.<\/button>/);
    expect(html).not.toMatch(/>\s*Save\s*<\/button>/);
  });

  it('keeps Save enabled when nothing is uploading', () => {
    const html = renderHeader({ isUploading: false });

    expect(html).not.toContain('Uploading...');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Save<\/button>/);
  });
});

describe('TemplateHeader while a Clipy draft generates', () => {
  it('disables Save and says a draft is generating, since the draft replaces the form when it arrives', () => {
    const html = renderHeader({ isEditing: false, isGenerating: true, title: 'New Template' });

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Generating\.\.\.<\/button>/);
    expect(html).not.toMatch(/>\s*Save\s*<\/button>/);
  });
});

describe('TemplateHeader accessible names', () => {
  it('names every button, including the icon-only back and more-actions buttons', () => {
    const html = renderHeader({ onPreview: () => undefined });

    expect(findUnnamedControls(html)).toEqual([]);
    expect(getByAccessibleName(html, 'Back to templates')?.tag).toBe('button');
    expect(getByAccessibleName(html, 'More actions')?.tag).toBe('button');
  });
});
