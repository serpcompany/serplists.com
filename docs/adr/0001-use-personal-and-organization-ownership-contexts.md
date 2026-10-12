---
status: accepted
---

# Use Personal and Organization ownership contexts

SERP Lists uses **Personal** for resources owned directly by a User and **Organization** for shared resource ownership, replacing the overlapping Team and Workspace product terms. The authenticated console follows Apify's context-routing model: Personal routes remain under `/dashboard`, while Organization routes use `/dashboard/organization/:organizationId`; the route is authoritative and any remembered selection is only a convenience for entering `/dashboard`.

Decided on 2026-09-19 in #213. Why, Considered and most of Consequences were added on
2026-10-12 from the records of #213 and #212, which built the routes; the decision is unchanged.

## Why

- **Two words for one thing.** A Workspace was the ownership context, and a Team was one kind
  of Workspace, so the product said both for an Organization, and "Personal Workspace" made a
  User's own resources sound like a shared space. Personal and Organization name the two owners
  a resource can have, and nothing else.
- **A link has to mean the same thing in every tab.** Before #212 the console took its context
  from the tab's selection, so an Organization's page could not be refreshed into, shared or
  opened in a new tab: a copied link opened in whatever context the reader's tab had chosen.
  When the route decides, a URL names the owner of what it shows.
- **A console URL has to keep working.** An Organization's handle changes when an owner renames
  it, so console routes use the Organization's stable id, while public pages use the handle.

## Considered

- **Keeping Team and Workspace** as product terms, the language before #213.
- **Context from the tab's selection only,** as the console worked before #212.
- **A cookie holding the remembered context,** so the server could redirect a bare `/dashboard/`:
  stored state sent with every request, for one redirect. The remembered context stays in the
  browser, and a client page reads it.
- **The Organization's handle in console URLs:** readable, but it changes, and an Organization
  created before handles could lack one.

## Consequences

- Existing `teams`, `team_id`, and Team-named code remain temporary legacy implementation
  details until separately scoped changes can rename or replace them safely (TD-5 in
  [`tech-debt.md`](../tech-debt.md)). The terms and their legacy names are in
  [`CONTEXT.md`](../../CONTEXT.md).
- `src/lib/consoleRoutes.ts` builds and parses every console path, and every link names the
  context it means. How a tab picks, remembers and confirms its context is in
  [Organizations](../agents/organizations.md#ui-flow).
- The API stays the authority: it authorizes each Organization request by its `teamId`. The route
  only decides what the browser asks for.
- Public identity continues to use the shared `/profile/:publicHandle` route family
  ([ADR 0004](0004-share-one-namespace-for-public-handles.md)), and Organization console routes
  use a stable Organization ID rather than a mutable public handle.
