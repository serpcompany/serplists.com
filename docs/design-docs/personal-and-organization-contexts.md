---
status: accepted
---

# Use Personal and Organization ownership contexts

SERP Lists uses **Personal** for resources owned directly by a User and **Organization** for shared resource ownership, replacing the overlapping Team and Workspace product terms. The authenticated console follows Apify's context-routing model: Personal routes remain under `/dashboard`, while Organization routes use `/dashboard/organization/:organizationId`; the route is authoritative and any remembered selection is only a convenience for entering `/dashboard`.

## Consequences

Existing `teams`, `team_id`, and Team-named code remain temporary legacy implementation details until separately scoped changes can rename or replace them safely. How a tab picks, remembers and confirms its context is in [Organizations](organizations.md#ui-flow). Public identity continues to use the shared `/profile/:publicHandle` route family, and Organization console routes use a stable Organization ID rather than a mutable public handle.
