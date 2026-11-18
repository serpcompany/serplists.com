import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLists, useTemplates } from '@/contexts/TemplatesContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

describe('the context hooks, used outside the provider that gives them a value', () => {
  it.each([
    ['useAuth', useAuth, 'useAuth must be used within an AuthProvider'],
    ['useWorkspace', useWorkspace, 'useWorkspace must be used within a WorkspaceProvider'],
    ['useTemplates', useTemplates, 'useTemplates must be used within a TemplatesProvider'],
    ['useTemplateLists', () => useTemplateLists(), 'useTemplateLists must be used within a TemplatesProvider'],
  ])('%s fails the render, naming the provider it needs', (_name, useHook, message) => {
    function Consumer() {
      useHook();
      return null;
    }

    expect(() => renderToStaticMarkup(<Consumer />)).toThrow(message);
  });
});
