# Product Plans

This document is the canonical source of truth for launch plan behavior.

For MVP launch, keep the plan matrix intentionally small. Add new gates only when they are needed by the product, not in anticipation of future complexity.

## Launch scope

Launch with two plans only:

- `Free`
- `Pro`

## Launch rule

For launch, features default to `Free` unless this document explicitly marks them as `Pro`.

## Feature matrix

| Capability | Free | Pro |
| --- | --- | --- |
| Use the core product | Yes | Yes |
| Copy templates into your account | No | Yes |

## Upgrade trigger

The primary paid upgrade reason at launch is:

- `Copy templates into your account`

## Implementation notes

- The API is the source of truth for plan enforcement.
- UI gating should match API behavior, but it is secondary to backend enforcement.
- If a new feature becomes paid later, add it here first before spreading the rule across code and UI.
