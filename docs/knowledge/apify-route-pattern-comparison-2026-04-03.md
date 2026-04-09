# Apify route pattern comparison (2026-04-03)

This note compares Apify's public and logged-in route patterns against the Serplists route model locked by issue `#47`.

## Route comparison

| Surface | Serplists canonical | Serplists legacy/compat | Apify actual pattern | Example Apify URL | Notes |
| --- | --- | --- | --- | --- | --- |
| Public home | `/` | none | Public marketing root | `https://apify.com/` | Same role. |
| Public discovery index | `/templates` | `/checklists` redirects | Public marketplace/store root | `https://apify.com/store` | This is the closest direct analog. |
| Public item detail | `/profile/{username}/{templateSlug}` | none | Public owner/item detail | `https://apify.com/compass/crawler-google-places` | Very close structurally. |
| Public pricing | `/pricing` | none | Public pricing | `https://apify.com/pricing` | Same role. |
| Signed-in app root | `/dashboard` | `/console` redirects | Separate console root | `https://console.apify.com/` | Main difference is host split vs our path split. |
| Signed-in template/tool list | `/dashboard/templates` | `/console/templates` | Actor listing and filtered tabs | `https://console.apify.com/actors?tab=recently-used` | Apify uses query tabs for some filtered states. |
| Signed-in template/tool input page | Closest current equivalent is `/dashboard/templates/{id}` or `/dashboard/templates/{id}/edit` depending intent | Legacy `/console/templates/...` | Resource-specific input page | `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/input` | Apify separates `input`, `runs`, and `source` under one resource. |
| Signed-in runs list for one item | `/dashboard/runs` and item-level run pages | `/console/runs` | Item-scoped runs | `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/runs` | Apify has stronger per-resource execution routing. |
| Signed-in run detail | `/dashboard/runs/{runId}` | `/console/runs/{runId}` | Global or item-scoped run detail with hash subview | `https://console.apify.com/actors/runs/KkqyHSM9nxc2iByW8#log` | Apify exposes logs as an anchored subview. |
| Signed-in item-scoped run detail | `/dashboard/runs/{runId}` | `/console/runs/{runId}` | Item-scoped run detail | `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/runs/KkqyHSM9nxc2iByW8#log` | More contextual than our flat run path. |
| Org-scoped run detail | No org-scoped route family today | none | Organization namespace above resource | `https://console.apify.com/organization/WcB4dF8Q87sHhFqJu/actors/5dMfR6j5tciih6QNu/runs/1ebvI1OdOvctah4s9#log` | Apify has first-class org tenancy in the URL. |
| Org-scoped input page | No org-scoped route family today | none | Organization + actor + view | `https://console.apify.com/organization/WcB4dF8Q87sHhFqJu/actors/O6knBihxFig55ve53/input` | Relevant if Serplists ever adds org-aware URL design. |
| Tasks/automations | No exact current equivalent | none | Actor tasks | `https://console.apify.com/actors/tasks` | This fits a future automation area if added. |
| Schedules | No exact current equivalent | none | Schedules root | `https://console.apify.com/schedules` | Separate operational surface. |
| Integrations | No exact current equivalent | none | Integrations root | `https://console.apify.com/actors/integrations` | Separate console subsystem. |
| Development/source | No exact current equivalent | none | Development area and source editor | `https://console.apify.com/actors/development` and `https://console.apify.com/actors/FTn4Kia8VILCUOqlN/source` | Apify treats build/dev as first-class console concerns. |
| Monetization/insights | No exact current equivalent | none | Analytics/monetization area | `https://console.apify.com/actors/insights/monetization` | Clear example of console-only business views. |
| Messaging/issues | No exact current equivalent | none | Support/issues inbox | `https://console.apify.com/actors/messaging/issues` | Another separate console subsystem. |
| Proxy usage | No exact current equivalent | none | Product-specific usage dashboard | `https://console.apify.com/proxy/usage` | Console routes are grouped by product domain, not just one resource type. |
| Storage data view | No exact current equivalent | none | Storage detail by object id | `https://console.apify.com/storage/datasets/BRQeyWZQBUaQWmMTq` | Clear resource-first operational route design. |

## Logged-in Apify console URLs reviewed

- `https://console.apify.com/`
- `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/input`
- `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/runs`
- `https://console.apify.com/actors?tab=recently-used`
- `https://console.apify.com/actors/h99kb2lZfcDjPJ1xW/runs/KkqyHSM9nxc2iByW8#log`
- `https://console.apify.com/organization/WcB4dF8Q87sHhFqJu/actors/5dMfR6j5tciih6QNu/runs/1ebvI1OdOvctah4s9#log`
- `https://console.apify.com/organization/WcB4dF8Q87sHhFqJu/actors/O6knBihxFig55ve53/input`
- `https://console.apify.com/actors/runs/KkqyHSM9nxc2iByW8#log`
- `https://console.apify.com/actors/tasks`
- `https://console.apify.com/schedules`
- `https://console.apify.com/actors/integrations`
- `https://console.apify.com/actors/development`
- `https://console.apify.com/actors/FTn4Kia8VILCUOqlN/source`
- `https://console.apify.com/actors/insights/monetization`
- `https://console.apify.com/actors/messaging/issues`
- `https://console.apify.com/proxy/usage`
- `https://console.apify.com/storage/datasets/BRQeyWZQBUaQWmMTq`

## Main takeaways

Apify draws a hard line between public discovery and authenticated operation. Public browsing stays on `apify.com`, while actual work moves into `console.apify.com`.

Serplists follows the same conceptual split, but only at the path level:

- Public discovery lives under `/templates`, `/categories`, and `/profile/...`
- Authenticated work lives under `/dashboard/...`

Apify's console routing is much more resource-oriented than Serplists' current dashboard model. It gives one resource multiple focused subviews like `input`, `runs`, and `source`, and it also adds first-class organization namespaces and product-specific subsystems such as storage, schedules, and proxy usage.

## Recommendation for issue #47

Issue `#47` should treat Apify as validation for the broad public-vs-workspace separation, not as a reason to copy Apify's full console route tree right now.

The practical route lock should stay:

- `/templates` as the canonical public discovery index
- `/dashboard/...` as the canonical private workspace family
- `/checklists` and `/console` as temporary compatibility aliases only

The following Apify-inspired patterns should be considered future-facing, not part of the immediate route lock:

- Host-level split between public site and console
- Resource-specific console subviews like `/input`, `/runs`, and `/source`
- Organization-scoped route families
- Product-domain route families such as storage, schedules, integrations, and analytics

For Serplists-specific future expansion, these patterns fit cleanly without copying Apify one-to-one:

- Additional library families should stay under `/templates/...`, for example `/templates/prompts` and `/templates/skills`
- Template lifecycle views should live under `/dashboard/templates/{templateId}/...`, for example `versions`, `publish-jobs`, or `builds`
- Run history should keep one stable canonical run URL such as `/dashboard/runs/{runId}` with hash subviews like `#output`, `#log`, and `#input`
- Template-context run views can exist as convenience routes under `/dashboard/templates/{templateId}/runs/...` without replacing the canonical global run route
