import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import { teamsApi } from '../../support/signedInTeamsApi';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Link } from '@/components/navigation/Link';
import type { TeamSummary } from '@/lib/api';
import DashboardHome from '@/views/DashboardHome';

import { deferred } from '../../support/deferred';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { oneWorkspaceTabPerTest, organizationSummary, rememberedContext } from '../../support/workspaceTab';

const { getTeams } = teamsApi;

theInMemoryBrowserAsTheWindow();
const openTheTabAt = oneWorkspaceTabPerTest();

const ACME_TEMPLATES = '/dashboard/organization/team-1/templates/';
const PERSONAL_TEMPLATES = '/dashboard/templates/';
const PERSONAL_RUNS = '/dashboard/runs/';

const openTheDashboardHome = (remembered: string) =>
  openTheTabAt('/dashboard/', { before: ['/pricing/'], page: <RoutedPages pages={{ '/dashboard': <DashboardHome /> }} />, remembered });

const everyUrlTheTabOpened = () => navigation.log.flatMap((record) => (record.href === undefined ? [] : [record.href]));

beforeEach(() => {
  getTeams.mockReset();
  getTeams.mockResolvedValue([organizationSummary('team-1', 'Acme')]);
});

describe('the bare /dashboard/ opens the remembered context', () => {
  it("opens a remembered Organization's Templates once the list confirms it, replacing /dashboard/ so Back skips it", async () => {
    await openTheDashboardHome('team-1');

    expect(navigation.url()).toBe(ACME_TEMPLATES);
    expect(navigation.entries()).toEqual(['/pricing/', ACME_TEMPLATES]);
    expect(navigation.log).toEqual([{ kind: 'replace', href: ACME_TEMPLATES, via: 'router' }]);
  });

  it('opens Personal Templates when Personal is remembered', async () => {
    await openTheDashboardHome('personal');

    expect(navigation.url()).toBe(PERSONAL_TEMPLATES);
    expect(navigation.entries()).toEqual(['/pricing/', PERSONAL_TEMPLATES]);
  });

  it('waits on /dashboard/ until the list confirms the remembered Organization', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    await openTheDashboardHome('team-1');

    expect(navigation.url()).toBe('/dashboard/');

    teams.resolve([organizationSummary('team-1', 'Acme')]);
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe(ACME_TEMPLATES);
  });

  it('falls back to Personal for a remembered Organization the user cannot open, and never opens a URL that names it', async () => {
    await openTheDashboardHome('team-9');

    expect(navigation.url()).toBe(PERSONAL_TEMPLATES);
    expect(everyUrlTheTabOpened().filter((href) => href.includes('team-9'))).toEqual([]);
    expect(rememberedContext()).toBe('personal');
  });

  it('stays on /dashboard/ with the Organizations error when the list fails, and Continue in Personal opens Personal Templates', async () => {
    getTeams.mockRejectedValue(new Error('Teams unavailable'));
    const workspace = await openTheDashboardHome('team-1');

    expect(navigation.url()).toBe('/dashboard/');
    expect(workspace().workspaceStatus).toBe('error');

    act(() => workspace().selectWorkspace('personal'));
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe(PERSONAL_TEMPLATES);
  });
});

describe('the bare /dashboard/ leaves a navigation the user started while the Organizations load (TD-85)', () => {
  const openTheDashboardHomeWithARunsLink = () =>
    openTheTabAt('/dashboard/', {
      before: ['/pricing/'],
      page: (
        <RoutedPages
          pages={{
            '/dashboard': (
              <>
                <DashboardHome />
                <Link href={PERSONAL_RUNS}>Runs</Link>
              </>
            ),
            '/dashboard/runs': <p>Runs page</p>,
          }}
        />
      ),
      remembered: 'team-1',
    });

  it('opens Runs clicked right after signing in, never replacing it with the Templates the list then confirms', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    await openTheDashboardHomeWithARunsLink();
    const runsPageLoaded = navigation.holdNavigationsUntilTheNextPageLoads();

    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'Runs' }));
    });
    teams.resolve([organizationSummary('team-1', 'Acme')]);
    await letQueryUpdatesReachObservers();
    act(() => runsPageLoaded());

    expect(navigation.url()).toBe(PERSONAL_RUNS);
    expect(navigation.log).toEqual([{ kind: 'push', href: PERSONAL_RUNS, via: 'link' }]);
    expect(screen.getByText('Runs page')).toBeTruthy();
  });

  it('still opens the Templates when nothing was clicked while the list loaded', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    await openTheDashboardHomeWithARunsLink();

    teams.resolve([organizationSummary('team-1', 'Acme')]);
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe(ACME_TEMPLATES);
  });
});
