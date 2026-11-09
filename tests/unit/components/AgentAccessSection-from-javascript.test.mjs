import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentAccessSectionView } from '../../../src/components/account/AgentAccessSection';
import { ACTIVE_AGENT_KEY } from '../../fixtures/agentKeys';

const doNothing = () => undefined;

describe('the Run Keys list given a permission it has no label for, which the permission type rules out', () => {
  it('shows the permission as it is', () => {
    const markup = renderToStaticMarkup(
      createElement(AgentAccessSectionView, {
        createdKey: null,
        isCreating: false,
        isError: false,
        isLoading: false,
        keys: [{ ...ACTIVE_AGENT_KEY, permissions: ['runs:read', 'billing:read'] }],
        keyName: '',
        mcpEndpoint: 'https://serplists.com/api/mcp',
        mcpHostMismatch: false,
        permissions: [],
        revokingKeyId: null,
        onCopyEndpoint: doNothing,
        onCopySecret: doNothing,
        onCreate: doNothing,
        onDismissSecret: doNothing,
        onKeyNameChange: doNothing,
        onPermissionChange: doNothing,
        onRetry: doNothing,
        onRevoke: doNothing,
      }),
    );
    const permissionList = /<ul aria-label="Permissions for Codex SOP Runner"[^>]*>(.*?)<\/ul>/.exec(markup)?.[1] ?? '';

    expect(permissionList).toContain('>Read runs</li>');
    expect(permissionList).toContain('>billing:read</li>');
  });
});
