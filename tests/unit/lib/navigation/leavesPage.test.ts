import { describe, expect, it } from 'vitest';

import { hrefToString, leavesPage } from '@/lib/navigation/leavesPage';

describe('the address a link points to', () => {
  it.each([
    ['a string', '/templates/?q=launch', '/templates/?q=launch'],
    ['a path with its query as an object', { pathname: '/templates/', query: { q: 'launch', tag: ['ops', 'qa'], page: 2 } }, '/templates/?q=launch&tag=ops&tag=qa&page=2'],
    ['a query object with only empty values', { pathname: '/templates/', query: { q: undefined, tag: null } }, '/templates/'],
    ['a query string with or without its question mark', { pathname: '/runs/', query: '?status=open' }, '/runs/?status=open'],
    ['an empty query string', { pathname: '/runs/', query: '' }, '/runs/'],
    ['a search and hash, which win over the query', { pathname: '/runs/', search: '?status=done', hash: '#latest', query: { status: 'open' } }, '/runs/?status=done#latest'],
    ['no pathname', { query: { tab: 'runs' } }, '?tab=runs'],
  ])('reads %s', (_label, href, expected) => {
    expect(hrefToString(href)).toBe(expected);
  });
});

describe('whether a link leaves the page, while the page renders on the server', () => {
  it('compares paths only, so a link to another query of the same page stays', () => {
    expect(leavesPage('/templates/?q=launch', '/templates/')).toBe(false);
    expect(leavesPage({ pathname: '/runs/' }, '/templates/')).toBe(true);
  });

  it('reads a link with no path against the site root when the current path is not known', () => {
    expect(leavesPage({ query: { tab: 'runs' } }, null)).toBe(false);
    expect(leavesPage('/templates/', null)).toBe(true);
  });

  it('reads an empty link as the folder of the page it is on, which the root page does not leave', () => {
    expect(leavesPage('', '/')).toBe(false);
    expect(leavesPage({}, '/templates/')).toBe(true);
  });
});
