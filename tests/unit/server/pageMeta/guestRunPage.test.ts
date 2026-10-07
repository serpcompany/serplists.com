import { serverContext, unreachableD1 } from '../../../support/mockedServerContext';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMetadata as generateTemplatePageMetadata } from '@/app/(site)/profile/[username]/[templateSlug]/page';
import { generateMetadata } from '@/app/(site)/profile/[username]/[templateSlug]/run/page';
import { APP_BRAND_NAME } from '@/lib/brand';
import { SqliteD1 } from '../../../support/sqlite-d1';

const params = (username: string, templateSlug: string) => ({
  params: Promise.resolve({ username, templateSlug }),
});

beforeEach(() => {
  serverContext.env = { DB: new SqliteD1().binding };
  serverContext.host = 'serplists.com';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a public Template's guest run page metadata, a page that holds one visitor's progress in their browser", () => {
  it("names the Template as its page does but keeps the run page out of search and names no canonical URL", async () => {
    serverContext.env = { DB: unreachableD1 };
    const visit = params('SERP', 'ultimate-camping-checklist');

    const [templatePage, runPage] = await Promise.all([generateTemplatePageMetadata(visit), generateMetadata(visit)]);

    expect(templatePage.robots).toBe('index, follow');
    expect(runPage).toMatchObject({ description: templatePage.description, robots: 'noindex, follow', title: templatePage.title });
    expect(runPage.alternates?.canonical).toBeUndefined();
    expect(runPage.openGraph?.url).toBeUndefined();
  });

  it('says the Template was not found, and stays out of search, for a Template that is not there', async () => {
    const metadata = await generateMetadata(params('alice', 'no-such-template'));

    expect(metadata.title).toEqual({ absolute: `Template not found | ${APP_BRAND_NAME}` });
    expect(metadata.robots).toBe('noindex, nofollow');
  });

  it('stays out of search with the site defaults when the lookup fails', async () => {
    serverContext.env = { DB: unreachableD1 };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await generateMetadata(params('alice', 'reviewed-clipy-checklist'))).toEqual({ robots: 'noindex, follow' });
  });
});
