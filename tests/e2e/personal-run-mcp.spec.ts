import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const protocolVersion = '2025-06-18';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type JsonRecord = Record<string, unknown>;

async function mcpRequest(
  secret: string,
  method: string,
  params?: JsonRecord,
  id = 1,
) {
  const response = await fetch(`${apiBaseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocolVersion }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    }),
  });

  const body = await response.json() as JsonRecord;
  return { body, response };
}

test('@smoke personal Run Key drives a persistent run and revokes access', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch workspace' })).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/dashboard/settings');
  await expect(page.getByRole('heading', { name: 'Agent Access' })).toBeVisible();

  const keyName = `Playwright SOP Runner ${Date.now()}`;
  await page.getByLabel('Key name').fill(keyName);
  await page.getByRole('button', { name: 'Create Run Key' }).click();

  const secretInput = page.getByLabel('New Run Key secret');
  await expect(secretInput).toBeVisible();
  const secret = await secretInput.inputValue();
  expect(secret.startsWith('slrk_')).toBe(true);
  expect(secret.length).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'I have saved this key' }).click();

  const initialized = await mcpRequest(secret, 'initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'serplists-playwright', version: '1.0.0' },
  });
  expect(initialized.response.status).toBe(200);
  expect((initialized.body.result as JsonRecord).protocolVersion).toBe(protocolVersion);

  const templateResult = await mcpRequest(secret, 'tools/call', {
    name: 'list_templates',
    arguments: {},
  }, 2);
  expect(templateResult.response.status).toBe(200);
  const templateContent = (templateResult.body.result as JsonRecord).structuredContent as JsonRecord;
  const templates = templateContent.templates as JsonRecord[];
  expect(templates.length).toBeGreaterThan(0);

  const template = templates[0];
  const runTitle = `Playwright Personal SOP Run ${Date.now()}`;
  const started = await mcpRequest(secret, 'tools/call', {
    name: 'start_run',
    arguments: { templateId: template.id, title: runTitle },
  }, 3);
  expect(started.response.status).toBe(200);
  const startedContent = (started.body.result as JsonRecord).structuredContent as JsonRecord;
  const startedRun = startedContent.run as JsonRecord;
  const sections = startedRun.sections as JsonRecord[];
  const firstTask = (sections[0].items as JsonRecord[])[0];
  const runId = String(startedRun.id);
  const taskId = String(firstTask.id);
  const taskTitle = String(firstTask.title);
  const note = 'Verified through the local browser-to-MCP Playwright flow.';

  const noted = await mcpRequest(secret, 'tools/call', {
    name: 'update_run',
    arguments: {
      runId,
      expectedRevision: startedRun.revision,
      operation: 'set_task_notes',
      taskId,
      notes: note,
    },
  }, 4);
  expect(noted.response.status).toBe(200);
  const notedRun = ((noted.body.result as JsonRecord).structuredContent as JsonRecord).run as JsonRecord;

  const completed = await mcpRequest(secret, 'tools/call', {
    name: 'update_run',
    arguments: {
      runId,
      expectedRevision: notedRun.revision,
      operation: 'set_task_completed',
      taskId,
      completed: true,
    },
  }, 5);
  expect(completed.response.status).toBe(200);
  const completedRun = ((completed.body.result as JsonRecord).structuredContent as JsonRecord).run as JsonRecord;

  await page.goto(`/dashboard/runs/${encodeURIComponent(runId)}`);
  await expect(page.getByRole('heading', { name: runTitle })).toBeVisible();
  await expect(page.getByText(`${completedRun.progress}%`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: taskTitle }).click();
  await expect(page.getByLabel('Task notes')).toHaveValue(note);
  await expect(page.getByText(new RegExp(`${keyName} via MCP · authorized by `)).first()).toBeVisible();

  await page.goto('/dashboard/settings');
  const keyRow = page.locator('div.divide-y > div').filter({ hasText: keyName });
  await expect(keyRow).toHaveCount(1);
  await keyRow.getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke key' }).click();
  await expect(keyRow.getByText('Revoked')).toBeVisible();

  const denied = await mcpRequest(secret, 'tools/list', undefined, 6);
  expect(denied.response.status).toBe(401);
});
