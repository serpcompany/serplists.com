# Final route URL patterns (2026-04-03)

This sheet shows the canonical URL patterns for Serplists after the route migration work for issue `#47`.

## Public routes

| Route pattern | Example URL |
| --- | --- |
| `/` | `https://serplists.com/` |
| `/templates` | `https://serplists.com/templates` |
| `/categories` | `https://serplists.com/categories` |
| `/categories/{categorySlug}` | `https://serplists.com/categories/technical-seo` |
| `/profile/{username}` | `https://serplists.com/profile/devin` |
| `/profile/{username}/{templateSlug}` | `https://serplists.com/profile/devin/complete-wedding-planning-checklist` |
| `/features` | `https://serplists.com/features` |
| `/features/{featureSlug}` | `https://serplists.com/features/template-builder` |
| `/pricing` | `https://serplists.com/pricing` |
| `/about` | `https://serplists.com/about` |
| `/contact` | `https://serplists.com/contact` |
| `/login` | `https://serplists.com/login` |
| `/register` | `https://serplists.com/register` |
| `/forgot-password` | `https://serplists.com/forgot-password` |
| `/reset-password` | `https://serplists.com/reset-password` |

## Private workspace routes

| Route pattern | Example URL |
| --- | --- |
| `/dashboard` | `https://serplists.com/dashboard` |
| `/dashboard/templates` | `https://serplists.com/dashboard/templates` |
| `/dashboard/templates/new` | `https://serplists.com/dashboard/templates/new` |
| `/dashboard/templates/{templateId}` | `https://serplists.com/dashboard/templates/tpl_123` |
| `/dashboard/templates/{templateId}/edit` | `https://serplists.com/dashboard/templates/tpl_123/edit` |
| `/dashboard/runs` | `https://serplists.com/dashboard/runs` |
| `/dashboard/runs/{runId}` | `https://serplists.com/dashboard/runs/run_123` |
| `/account` | `https://serplists.com/account` |

## Shared routes

| Route pattern | Example URL |
| --- | --- |
| `/share/{shareToken}` | `https://serplists.com/share/share_abc123` |

## Future content-type routes

| Route pattern | Example URL |
| --- | --- |
| `/templates/prompts` | `https://serplists.com/templates/prompts` |
| `/templates/skills` | `https://serplists.com/templates/skills` |
| `/templates/{typeSlug}/{templateSlug}` | `https://serplists.com/templates/prompts/seo-meta-prompt-pack` |

## Future template lifecycle routes

| Route pattern | Example URL |
| --- | --- |
| `/dashboard/templates/{templateId}/versions` | `https://serplists.com/dashboard/templates/tpl_123/versions` |
| `/dashboard/templates/{templateId}/versions/{versionId}` | `https://serplists.com/dashboard/templates/tpl_123/versions/ver_456` |
| `/dashboard/templates/{templateId}/publish-jobs` | `https://serplists.com/dashboard/templates/tpl_123/publish-jobs` |
| `/dashboard/templates/{templateId}/publish-jobs/{jobId}` | `https://serplists.com/dashboard/templates/tpl_123/publish-jobs/job_789` |
| `/dashboard/templates/{templateId}/builds` | `https://serplists.com/dashboard/templates/tpl_123/builds` |
| `/dashboard/templates/{templateId}/builds/{buildId}` | `https://serplists.com/dashboard/templates/tpl_123/builds/bld_101` |

## Future run history routes

| Route pattern | Example URL |
| --- | --- |
| `/dashboard/runs` | `https://serplists.com/dashboard/runs` |
| `/dashboard/runs/{runId}` | `https://serplists.com/dashboard/runs/run_123` |
| `/dashboard/runs/{runId}#output` | `https://serplists.com/dashboard/runs/run_123#output` |
| `/dashboard/runs/{runId}#log` | `https://serplists.com/dashboard/runs/run_123#log` |
| `/dashboard/runs/{runId}#input` | `https://serplists.com/dashboard/runs/run_123#input` |
| `/dashboard/runs/{runId}#metrics` | `https://serplists.com/dashboard/runs/run_123#metrics` |
| `/dashboard/runs/{runId}#artifacts` | `https://serplists.com/dashboard/runs/run_123#artifacts` |
| `/dashboard/templates/{templateId}/runs` | `https://serplists.com/dashboard/templates/tpl_123/runs` |
| `/dashboard/templates/{templateId}/runs/{runId}` | `https://serplists.com/dashboard/templates/tpl_123/runs/run_123` |

## Temporary compatibility aliases

| Alias route | Canonical destination example |
| --- | --- |
| `/checklists` | `https://serplists.com/templates` |
| `/console` | `https://serplists.com/dashboard` |
| `/console/templates` | `https://serplists.com/dashboard/templates` |
| `/console/templates/{templateId}` | `https://serplists.com/dashboard/templates/tpl_123` |
| `/console/templates/{templateId}/edit` | `https://serplists.com/dashboard/templates/tpl_123/edit` |
| `/console/runs` | `https://serplists.com/dashboard/runs` |
| `/console/runs/{runId}` | `https://serplists.com/dashboard/runs/run_123` |

## Explicitly not canonical

| Route pattern | Status |
| --- | --- |
| `/templates/new` | Do not restore |
| `/templates/{templateId}` | Do not restore |
| `/templates/{templateId}/edit` | Do not restore |
| `/run/{runId}` | Do not restore |

## Short rationale

- Public discovery stays under `/templates`, `/categories`, and `/profile/...`
- Signed-in work stays under `/dashboard/...`
- Shared run links stay under `/share/...`
- `/checklists` and `/console` remain temporary bridge routes only
- Additional content families like prompts and skills should live under `/templates/...`, not as disconnected top-level roots
- Future run history should use one stable run URL with hash subviews like `#output`, `#log`, and `#input`
- Apify validates the public-versus-workspace split, but Serplists does not need to copy Apify's deeper console taxonomy yet
