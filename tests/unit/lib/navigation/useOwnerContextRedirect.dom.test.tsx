import { navigation, RoutedPages } from '../../../support/mockedNextNavigation';
import React, { act } from 'react';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

import { organizationConsole, ownerConsoleContext, PERSONAL_CONSOLE, parseConsoleRoute, type ConsoleContext } from '@/lib/consoleRoutes';
import { useOwnerContextRedirect } from '@/lib/navigation/useOwnerContextRedirect';
import { resolveTemplateConsoleContext } from '@/lib/templateDestination';

theInMemoryBrowserAsTheWindow();

const PREVIOUS_PAGE = '/dashboard/templates/';

function RecordPage({ owner }: { owner: ConsoleContext | null }) {
  return <p>{useOwnerContextRedirect(owner) ? 'Moving to the owner' : 'Record shown'}</p>;
}

const routeContextOf = (url: string): ConsoleContext => parseConsoleRoute(url)?.context ?? PERSONAL_CONSOLE;

const RECORD_ROUTES = [
  '/dashboard/templates/[id]',
  '/dashboard/templates/[id]/edit',
  '/dashboard/runs/[id]',
  '/dashboard/organization/[organizationId]/templates/[id]',
  '/dashboard/organization/[organizationId]/templates/[id]/edit',
  '/dashboard/organization/[organizationId]/runs/[id]',
];

async function openTheRecordAt(url: string, owner: (shownContext: ConsoleContext) => ConsoleContext | null) {
  navigation.reset(url, { before: [PREVIOUS_PAGE] });
  const page = <RecordPage owner={owner(routeContextOf(url))} />;
  await renderSettled(<RoutedPages pages={Object.fromEntries(RECORD_ROUTES.map((route) => [route, page]))} />);
  await act(navigation.settle);
}

const privateTemplateOf = (teamId: string) => (shown: ConsoleContext) =>
  resolveTemplateConsoleContext({ isPublic: false, teamId }, shown);
const runOf = (teamId: string | undefined) => () => ownerConsoleContext(teamId);

describe("a record opened under another context's URL moves to its owner's URL", () => {
  it.each([
    ['a private Organization Template at a Personal URL', '/dashboard/templates/tpl-1/', privateTemplateOf('team-1'), '/dashboard/organization/team-1/templates/tpl-1/'],
    ["a private Organization Template's editor at a Personal URL", '/dashboard/templates/tpl-1/edit/', privateTemplateOf('team-1'), '/dashboard/organization/team-1/templates/tpl-1/edit/'],
    ['an Organization Run at a Personal URL', '/dashboard/runs/run-1/', runOf('team-1'), '/dashboard/organization/team-1/runs/run-1/'],
    ["a Personal Run at an Organization's URL", '/dashboard/organization/team-1/runs/run-1/', runOf(undefined), '/dashboard/runs/run-1/'],
    ["another Organization's Run at an Organization's URL", '/dashboard/organization/team-1/runs/run-1/', runOf('team-2'), '/dashboard/organization/team-2/runs/run-1/'],
    ["another Organization's private Template at an Organization's URL", '/dashboard/organization/team-1/templates/tpl-1/', privateTemplateOf('team-2'), '/dashboard/organization/team-2/templates/tpl-1/'],
  ])('moves %s, replacing the wrong URL so Back skips it', async (_record, url, owner, expected) => {
    await openTheRecordAt(url, owner);

    expect(navigation.url()).toBe(expected);
    expect(navigation.entries()).toEqual([PREVIOUS_PAGE, expected]);
    expect(navigation.log).toEqual([{ kind: 'replace', href: expected, via: 'router' }]);
    expect(screen.getByText('Record shown')).toBeTruthy();

    act(() => navigation.window.history.back());
    await act(navigation.settle);

    expect(navigation.url()).toBe(PREVIOUS_PAGE);
  });

  it('keeps the query and the hash', async () => {
    await openTheRecordAt('/dashboard/runs/run-1/?from=email#notes', runOf('team-1'));

    expect(navigation.url()).toBe('/dashboard/organization/team-1/runs/run-1/?from=email#notes');
  });

  it.each([
    ['a public Organization Template at a Personal URL', '/dashboard/templates/tpl-1/', (shown: ConsoleContext) => resolveTemplateConsoleContext({ isPublic: true, teamId: 'team-1' }, shown)],
    ["the user's own Template at an Organization's URL", '/dashboard/organization/team-1/templates/tpl-1/', (shown: ConsoleContext) => resolveTemplateConsoleContext({ isPublic: false }, shown)],
    ["an Organization's Run at its own URL", '/dashboard/organization/team-1/runs/run-1/', () => organizationConsole('team-1')],
    ['a record that has not loaded, or that the API answered 404 for', '/dashboard/runs/run-1/', () => null],
  ])('leaves %s where it is', async (_record, url, owner) => {
    await openTheRecordAt(url, owner);

    expect(navigation.url()).toBe(url);
    expect(navigation.log).toEqual([]);
    expect(screen.getByText('Record shown')).toBeTruthy();
  });
});
