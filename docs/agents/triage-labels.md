# Triage Labels

The engineering skills use five canonical triage roles. This repository uses
the canonical role names directly as its GitHub issue labels.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate or refine this issue |
| `needs-info` | `needs-info` | Waiting on the reporter for specific information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an autonomous agent |
| `ready-for-human` | `ready-for-human` | Requires human judgment or implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill refers to a canonical triage role, apply the corresponding GitHub
label from this table. Each triaged issue should have exactly one triage-state
label. Classification labels such as `bug`, `feature`, `chore`, `refactor`,
`ux`, `duplicate`, and `epic` are separate and may coexist with the state label.
