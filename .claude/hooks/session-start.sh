#!/bin/bash
set -euo pipefail

# Only relevant for Claude Code on the web — sessions run in ephemeral
# containers, so plugin marketplace installs don't persist between them.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! claude plugin list 2>/dev/null | grep -q "caveman@caveman"; then
  claude plugin marketplace add JuliusBrussee/caveman
  claude plugin install caveman@caveman
fi
