import { serveTheSiteFrom } from '../../../support/mockedServerContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata as profileMetadata } from '@/app/(site)/profile/[username]/page';
import PublicTemplatePage, { generateMetadata as templateMetadata } from '@/app/(site)/profile/[username]/[templateSlug]/page';
import GuestRunPage, { generateMetadata as guestRunMetadata } from '@/app/(site)/profile/[username]/[templateSlug]/run/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import {
  ACME,
  ARCHIVED_ORGANIZATION,
  CREATOR,
  seedProfileOwners,
  storeProfileTemplate,
} from '../../../support/publicProfiles';
import { SqliteD1 } from '../../../support/sqlite-d1';

let d1: SqliteD1;

const profileAt = (username: string) => profileMetadata({ params: Promise.resolve({ username }) });

const templateAt = (username: string, templateSlug: string) =>
  templateMetadata({ params: Promise.resolve({ username, templateSlug }) });

const templatePageAt = (username: string, templateSlug: string, search: Record<string, string | string[]> = {}) =>
  PublicTemplatePage({ params: Promise.resolve({ username, templateSlug }), searchParams: Promise.resolve(search) });

const guestRunPageAt = (username: string, templateSlug: string, search: Record<string, string | string[]> = {}) =>
  GuestRunPage({ params: Promise.resolve({ username, templateSlug }), searchParams: Promise.resolve(search) });

const guestRunAt = (username: string, templateSlug: string) =>
  guestRunMetadata({ params: Promise.resolve({ username, templateSlug }) });

const permanentRedirectTo = (path: string) => ({ digest: `NEXT_REDIRECT;replace;${path};308;` });

const expectNotFound = (metadata: Awaited<ReturnType<typeof profileAt>>, title: string) => {
  expect(metadata.robots).toBe('noindex, nofollow');
  expect(metadata.title).toEqual({ absolute: `${title} | ${APP_BRAND_NAME}` });
  expect(metadata.alternates?.canonical).toBeUndefined();
};

beforeEach(() => {
  d1 = new SqliteD1();
  serveTheSiteFrom(d1);
  seedProfileOwners(d1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an Organization Public Profile page', () => {
  it('names the Organization, gives its description and points the canonical URL at its stored handle', async () => {
    const metadata = await profileAt('acme-launch');

    expect(metadata.title).toEqual({ absolute: `${ACME.name} | ${APP_BRAND_NAME}` });
    expect(metadata.description).toBe(ACME.description);
    expect(metadata.alternates?.canonical).toBe(`https://serplists.com/profile/${ACME.handle}/`);
    expect(metadata.robots).toBe('index, follow');
  });

  it('summarizes its public Templates when it has no description', async () => {
    d1.run('UPDATE teams SET description = NULL WHERE id = ?', ACME.id);
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team', category: '["Launch"]' });

    const metadata = await profileAt(ACME.handle);

    expect(metadata.description).toBe(`Public checklist templates from @${ACME.handle} covering Launch.`);
  });

  it('keeps an archived Organization out of search, as a profile that is not there', async () => {
    expectNotFound(await profileAt(ARCHIVED_ORGANIZATION.handle), 'Profile not found');
  });
});

describe("an Organization's public Template page, found only under its Organization's handle", () => {
  beforeEach(() => {
    storeProfileTemplate(d1, { id: 'launch-plan', ownerType: 'team' });
    storeProfileTemplate(d1, { id: 'bob-plan' });
    storeProfileTemplate(d1, { id: 'archived-plan', ownerType: 'team', teamId: ARCHIVED_ORGANIZATION.id });
  });

  it("is found under the Organization's handle in any letter case, with the Organization's URL as its canonical", async () => {
    const metadata = await templateAt('ACME-LAUNCH', 'launch-plan');

    expect(metadata.robots).toBe('index, follow');
    expect(metadata.alternates?.canonical).toBe(`https://serplists.com/profile/${ACME.handle}/launch-plan/`);
  });

  it("answers its Creator's URL, where it used to live, with a permanent redirect to the Organization's URL", async () => {
    const organizationUrl = `/profile/${ACME.handle}/launch-plan/`;

    await expect(templatePageAt('ALICE', 'launch-plan')).rejects.toMatchObject(permanentRedirectTo(organizationUrl));
    await expect(templateAt(CREATOR.username, 'launch-plan')).rejects.toMatchObject(permanentRedirectTo(organizationUrl));
  });

  it("keeps the query string of the Creator's URL it redirects", async () => {
    await expect(
      templatePageAt(CREATOR.username, 'launch-plan', { utm_source: 'newsletter', tag: ['a', 'b'] }),
    ).rejects.toMatchObject(permanentRedirectTo(`/profile/${ACME.handle}/launch-plan/?utm_source=newsletter&tag=a&tag=b`));
  });

  it("moves the guest run at its Creator's URL to the Organization's, keeping the query string", async () => {
    const organizationRunUrl = `/profile/${ACME.handle}/launch-plan/run/`;

    await expect(guestRunPageAt(CREATOR.username, 'launch-plan', { ref: 'skill' })).rejects.toMatchObject(
      permanentRedirectTo(`${organizationRunUrl}?ref=skill`),
    );
    await expect(guestRunAt(CREATOR.username, 'launch-plan')).rejects.toMatchObject(permanentRedirectTo(organizationRunUrl));
    await expect(guestRunPageAt(ACME.handle, 'launch-plan')).resolves.toBeTruthy();
  });

  it("renders the page under the Organization's handle without redirecting", async () => {
    await expect(templatePageAt(ACME.handle, 'launch-plan')).resolves.toBeTruthy();
  });

  it("does not find a Personal Template under an Organization's handle", async () => {
    expectNotFound(await templateAt(ACME.handle, 'bob-plan'), 'Template not found');
  });

  it('does not find the Template of an archived Organization under any handle, nor redirect its Creator URL', async () => {
    expectNotFound(await templateAt(ARCHIVED_ORGANIZATION.handle, 'archived-plan'), 'Template not found');
    expectNotFound(await templateAt(CREATOR.username, 'archived-plan'), 'Template not found');
    await expect(templatePageAt(CREATOR.username, 'archived-plan')).resolves.toBeTruthy();
  });

  it("never redirects another User's URL for an Organization Template", async () => {
    expectNotFound(await templateAt('bob', 'launch-plan'), 'Template not found');
  });
});
