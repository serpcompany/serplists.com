import { navigation } from '../../support/mockedNextNavigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  baseModel,
  contextCreateTemplate,
  mockUseTemplateDetailModel,
  moreMenuItemProps,
  renderTemplateDetail,
  resetTemplateDetailPageMocks,
  userStillOnThePage,
  workspaceState,
} from '../../support/templateDetailPage';
import { handlerIn } from '../../support/elementTree';
import { present } from '../../support/elements';
import { buildV0DemoPrivateTemplate } from '../../fixtures/v0DemoFixtures';
import type { TemplateDetailActionResult } from '@/features/template-detail/templateDetailApi';
import type { ChecklistTemplate } from '@/types/checklist';

const runDialog = vi.hoisted(() => ({ confirm: null as ((runName: string) => void | Promise<void>) | null }));

vi.mock('@/components/ui/run-name-dialog', () => ({
  RunNameDialog: ({ onConfirm }: { onConfirm: (runName: string) => void | Promise<void> }) => {
    runDialog.confirm = onConfirm;
    return null;
  },
}));

beforeEach(() => {
  resetTemplateDetailPageMocks();
  runDialog.confirm = null;
  userStillOnThePage.current = true;
});

const openTheTemplate = (template: Partial<ChecklistTemplate>, startRunResult?: TemplateDetailActionResult) => {
  mockUseTemplateDetailModel.mockReturnValue({
    ...baseModel(),
    startRun: vi.fn().mockResolvedValue(startRunResult ?? { kind: 'error', message: 'unused' }),
    template: { ...buildV0DemoPrivateTemplate(), ...template },
  });
  return renderTemplateDetail();
};

const inTheOrganization = (teamId: string) => {
  workspaceState.activeTeamId = teamId;
  workspaceState.isTeamWorkspace = true;
};

const startARun = async () => {
  await present(runDialog.confirm, 'the Start Run dialog')('Launch run');
};

const duplicate = async () => {
  const item = moreMenuItemProps.find((props) => [props.children].flat(Infinity).includes('Duplicate'));
  await handlerIn(item, 'onClick')();
};

describe('the Template page links in the context it shows', () => {
  it('links My Templates, Edit and View runs in Personal from Personal', () => {
    const html = openTheTemplate({});

    expect(html).toContain('href="/dashboard/templates/"');
    expect(html).toContain('href="/dashboard/templates/tpl-1/edit/"');
    expect(html).toContain('href="/dashboard/runs/?template=tpl-1"');
    expect(html).not.toContain('/dashboard/organization/');
  });

  it("links My Templates, Edit and View runs inside the Organization the page shows, whose runs list that Template's runs", () => {
    inTheOrganization('team-1');

    const html = openTheTemplate({ teamId: 'team-1' });

    expect(html).toContain('href="/dashboard/organization/team-1/templates/"');
    expect(html).toContain('href="/dashboard/organization/team-1/templates/tpl-1/edit/"');
    expect(html).toContain('href="/dashboard/organization/team-1/runs/?template=tpl-1"');
  });

  it("shows no links for a private Organization Template at another context's URL, which it leaves for its Organization's", () => {
    const fromPersonal = openTheTemplate({ isPublic: false, teamId: 'team-2' });
    inTheOrganization('team-1');
    const fromAnotherOrganization = openTheTemplate({ isPublic: false, teamId: 'team-2' });

    for (const html of [fromPersonal, fromAnotherOrganization]) {
      expect(html).toContain('Loading template...');
      expect(html).not.toContain('href="/dashboard/');
    }
  });

  it("links a public Organization Template in the context the page shows, which keeps it", () => {
    const html = openTheTemplate({ isPublic: true, teamId: 'team-2' });

    expect(html).toContain('href="/dashboard/templates/"');
    expect(html).not.toContain('/dashboard/organization/');
  });
});

describe('the Template page opens what an action made in the context that owns it', () => {
  it('opens a run started in Personal in Personal', async () => {
    openTheTemplate({}, { kind: 'ok', runId: 'run-1' });

    await startARun();

    expect(navigation.url()).toBe('/dashboard/runs/run-1/');
  });

  it('opens a run started in an Organization in that Organization', async () => {
    inTheOrganization('team-1');
    openTheTemplate({ teamId: 'team-1' }, { kind: 'ok', runId: 'run-1', teamId: 'team-1' });

    await startARun();

    expect(navigation.url()).toBe('/dashboard/organization/team-1/runs/run-1/');
  });

  it('opens the run of a public Organization Template started in Personal in Personal, where the API put it', async () => {
    openTheTemplate({ isPublic: true, teamId: 'team-2' }, { kind: 'ok', runId: 'run-1' });

    await startARun();

    expect(navigation.url()).toBe('/dashboard/runs/run-1/');
  });

  it('opens a duplicate in the context that owns it', async () => {
    inTheOrganization('team-1');
    contextCreateTemplate.mockResolvedValue({ id: 'tpl-2', teamId: 'team-1' });
    openTheTemplate({ teamId: 'team-1' });

    await duplicate();

    expect(navigation.url()).toBe('/dashboard/organization/team-1/templates/tpl-2/');
  });
});
