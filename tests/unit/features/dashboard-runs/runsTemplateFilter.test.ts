import { describe, expect, it } from 'vitest';

import { buildRunsTemplateFilterUrl, readRunsTemplateFilter } from '@/features/dashboard-runs/runsTemplateFilter';
import { buildConsoleTemplateRunsPath, organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';

describe('the runs page Template filter in the URL', () => {
  it("reads the Template's id from ?template=, and no filter from a missing or blank one", () => {
    expect(readRunsTemplateFilter(new URLSearchParams('template=tpl-1'))).toBe('tpl-1');
    expect(readRunsTemplateFilter(new URLSearchParams('template=%20'))).toBeNull();
    expect(readRunsTemplateFilter(new URLSearchParams(''))).toBeNull();
  });

  it('writes the chosen Template, keeping the rest of the URL, and removes it to show every run', () => {
    const location = { pathname: '/dashboard/runs/', search: '?from=email', hash: '#top' };

    expect(buildRunsTemplateFilterUrl(location, 'tpl-1')).toBe('/dashboard/runs/?from=email&template=tpl-1#top');
    expect(buildRunsTemplateFilterUrl({ ...location, search: '?template=tpl-1' }, null)).toBe('/dashboard/runs/#top');
  });

  it("links a Template's runs in the context that owns them", () => {
    expect(buildConsoleTemplateRunsPath('tpl-1', PERSONAL_CONSOLE)).toBe('/dashboard/runs/?template=tpl-1');
    expect(buildConsoleTemplateRunsPath('tpl-1', organizationConsole('team-1'))).toBe(
      '/dashboard/organization/team-1/runs/?template=tpl-1',
    );
    expect(readRunsTemplateFilter(new URL(buildConsoleTemplateRunsPath('a&b c', PERSONAL_CONSOLE), 'https://serplists.com').searchParams)).toBe('a&b c');
  });
});
