import { runKeysServer as server } from '../../support/signedInRunKeysApi';
import React, { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import type { AgentKey, CreatedAgentKey } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryKeys';

import { ACTIVE_AGENT_KEY } from '../../fixtures/agentKeys';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';
import { clickTheCheckboxInItsLabel } from '../../support/checkboxInALabel';
import { clickInTheDialog, theDialogsToClose } from '../../support/confirmDialogs';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

const endpoint = 'https://serplists.test/api/mcp';
const newKey: AgentKey = { ...ACTIVE_AGENT_KEY, id: 'key-2', name: 'Claude runner', prefix: 'slrk_new123', permissions: ['templates:read', 'templates:write', 'runs:read', 'runs:write'] };
const created: CreatedAgentKey = { key: newKey, secret: 'slrk_new123_secret' };
const writeText = vi.fn();

async function openAgentAccess(keys: AgentKey[] = [ACTIVE_AGENT_KEY]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.agentKeys('user-1'), keys);
  queryClient.setQueryData(['agent-mcp-connection'], { mcpEndpoint: endpoint, hostMismatch: false });
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <AgentAccessSection />
    </QueryClientProvider>,
  );
  return queryClient;
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

const createKeyNamed = async (name: string) => {
  await typeInto(inputNamed('Key name'), name);
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Create Run Key' }).closest('form') ?? document.body);
  });
};

const listedKeyNames = () =>
  screen.getAllByRole('list', { name: /^Permissions for / }).map((list) => list.getAttribute('aria-label')?.replace('Permissions for ', ''));

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('creating a Run Key', () => {
  it('creates the key with the chosen permissions, shows its secret once, lists it first, and resets the form', async () => {
    let answerTheReload: (keys: AgentKey[]) => void = () => undefined;
    server.createAgentKey.mockResolvedValue(created);
    server.getAgentKeys.mockReturnValue(new Promise<AgentKey[]>((resolve) => { answerTheReload = resolve; }));
    await openAgentAccess();

    await clickTheCheckboxInItsLabel(screen.getByRole('checkbox', { name: 'Write templates' }));
    await createKeyNamed('  Claude runner ');

    expect(server.createAgentKey).toHaveBeenCalledWith('Claude runner', ['templates:read', 'templates:write', 'runs:read', 'runs:write']);
    const secret = within(screen.getByTestId('created-agent-key'));
    expect(secret.getByText('Copy Claude runner and connect your agent')).toBeTruthy();
    expect(inputNamed('New Run Key secret').value).toBe('slrk_new123_secret');
    expect(inputNamed('Key name').value).toBe('');
    expect(screen.getByRole('checkbox', { name: 'Write templates' }).getAttribute('aria-checked')).toBe('false');
    expect(listedKeyNames()).toEqual(['Claude runner', 'Codex SOP Runner']);

    await act(async () => {
      answerTheReload([ACTIVE_AGENT_KEY, newKey]);
    });
    expect(listedKeyNames()).toEqual(['Codex SOP Runner', 'Claude runner']);
    expect(toast.success).toHaveBeenCalledWith('Run Key created');
  });

  it('shows Creating... while the key is made', async () => {
    let finish: (key: CreatedAgentKey) => void = () => undefined;
    server.createAgentKey.mockReturnValue(new Promise<CreatedAgentKey>((resolve) => { finish = resolve; }));
    server.getAgentKeys.mockResolvedValue([newKey]);
    await openAgentAccess();

    await createKeyNamed('Claude runner');
    expect(screen.getByRole('button', { name: 'Creating...' }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      finish(created);
    });
    expect(screen.getByRole('button', { name: 'Create Run Key' })).toBeTruthy();
  });

  it('creates no key when the form is sent with a name of only spaces', async () => {
    await openAgentAccess();

    await createKeyNamed('   ');

    expect(server.createAgentKey).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create Run Key' }).hasAttribute('disabled')).toBe(true);
  });

  it("shows the server's reason when the key could not be created, and keeps what was typed", async () => {
    server.createAgentKey.mockRejectedValue(new ApiError({ status: 429, message: 'Too many Run Keys' }));
    await openAgentAccess();

    await createKeyNamed('Claude runner');

    expect(toast.error).toHaveBeenCalledWith('Too many Run Keys');
    expect(inputNamed('Key name').value).toBe('Claude runner');
    expect(screen.queryByTestId('created-agent-key')).toBeNull();
  });

  it('copies the secret and selects it on focus, and hides it once the user saved it', async () => {
    server.createAgentKey.mockResolvedValue(created);
    server.getAgentKeys.mockResolvedValue([newKey]);
    writeText.mockResolvedValue(undefined);
    await openAgentAccess();
    await createKeyNamed('Claude runner');

    const secret = inputNamed('New Run Key secret');
    act(() => {
      secret.focus();
    });
    expect(secret.selectionStart).toBe(0);
    expect(secret.selectionEnd).toBe('slrk_new123_secret'.length);
    await press('Copy key');
    expect(writeText).toHaveBeenCalledWith('slrk_new123_secret');
    expect(toast.success).toHaveBeenCalledWith('Run Key copied');

    await press('I have saved this key');
    expect(screen.queryByTestId('created-agent-key')).toBeNull();
  });

  it('asks the user to copy the secret by hand when the browser refused', async () => {
    server.createAgentKey.mockResolvedValue(created);
    server.getAgentKeys.mockResolvedValue([newKey]);
    writeText.mockRejectedValue(new Error('denied'));
    await openAgentAccess();
    await createKeyNamed('Claude runner');

    await press('Copy key');

    expect(toast.error).toHaveBeenCalledWith('Could not copy the key. Select and copy it manually.');
  });

  it('hides the secret once its key is revoked', async () => {
    server.createAgentKey.mockResolvedValue(created);
    server.getAgentKeys.mockResolvedValue([newKey]);
    server.revokeAgentKey.mockResolvedValue({ id: 'key-2', revokedAt: '2026-11-07T00:00:00.000Z' });
    await openAgentAccess([]);
    await createKeyNamed('Claude runner');
    await waitFor(() => expect(listedKeyNames()).toEqual(['Claude runner']));
    server.getAgentKeys.mockResolvedValue([{ ...newKey, status: 'revoked', revokedAt: '2026-11-07T00:00:00.000Z' }]);

    await press('Revoke');
    const [dialog] = await screen.findAllByRole('alertdialog');
    if (!dialog) throw new Error('Revoke opened no dialog');
    await clickInTheDialog(dialog, 'Revoke key');
    await theDialogsToClose();

    expect(server.revokeAgentKey).toHaveBeenCalledWith('key-2');
    await waitFor(() => expect(screen.queryByTestId('created-agent-key')).toBeNull());
  });
});

describe('the rest of Agent Access', () => {
  it('copies the MCP endpoint, selecting it on focus', async () => {
    writeText.mockResolvedValue(undefined);
    await openAgentAccess();

    const field = inputNamed('SERP Lists MCP endpoint');
    act(() => {
      field.focus();
    });
    expect(field.selectionEnd).toBe(endpoint.length);
    await press('Copy endpoint');

    expect(writeText).toHaveBeenCalledWith(endpoint);
    expect(toast.success).toHaveBeenCalledWith('MCP endpoint copied');
  });

  it('asks the user to copy the endpoint by hand when the browser refused', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    await openAgentAccess();

    await press('Copy endpoint');

    expect(toast.error).toHaveBeenCalledWith('Could not copy the endpoint. Select and copy it manually.');
  });

  it('keeps the key when the revoke dialog is canceled', async () => {
    await openAgentAccess();

    await press('Revoke');
    const [dialog] = await screen.findAllByRole('alertdialog');
    if (!dialog) throw new Error('Revoke opened no dialog');
    await clickInTheDialog(dialog, 'Cancel');
    await theDialogsToClose();

    expect(server.revokeAgentKey).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });

  it('says a key was created at an unknown time when the stored time cannot be read', async () => {
    await openAgentAccess([{ ...ACTIVE_AGENT_KEY, createdAt: 'not a date' }]);

    expect(screen.getByText('Created Unknown · Last used Never')).toBeTruthy();
  });

  it('retries the keys after they failed to load', async () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, queryKeys.agentKeys('user-1'));
    queryClient.setQueryData(['agent-mcp-connection'], { mcpEndpoint: endpoint, hostMismatch: false });
    server.getAgentKeys.mockResolvedValue([ACTIVE_AGENT_KEY]);
    await renderSettled(
      <QueryClientProvider client={queryClient}>
        <AgentAccessSection />
      </QueryClientProvider>,
    );

    await press('Retry');

    await screen.findByText('Codex SOP Runner');
  });
});
