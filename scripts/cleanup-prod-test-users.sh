#!/usr/bin/env bash
set -euo pipefail

echo "BLOCKED: production cleanup requires the protected workflow and an approved break-glass incident action." >&2
exit 1
