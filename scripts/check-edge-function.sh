#!/usr/bin/env bash
# Pre-deploy syntax + type + lint check for one or more edge functions.
# Mirrors what the Supabase bundler does (Deno-based), so syntax errors like
# mismatched braces are caught locally before a deploy attempt.
#
# Usage:
#   scripts/check-edge-function.sh                     # checks bulk-upload-staff
#   scripts/check-edge-function.sh function-a function-b
#
# Exits non-zero on any failure so it can gate CI / pre-commit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"

# Default targets if none provided
TARGETS=("${@:-bulk-upload-staff}")

if ! command -v deno >/dev/null 2>&1; then
  echo "✖ deno CLI not found in PATH. Install Deno: https://deno.land" >&2
  exit 127
fi

FAIL=0
for fn in "${TARGETS[@]}"; do
  ENTRY="$FUNCTIONS_DIR/$fn/index.ts"
  if [ ! -f "$ENTRY" ]; then
    echo "✖ $fn — index.ts not found at $ENTRY" >&2
    FAIL=1
    continue
  fi

  echo ""
  echo "▶ Checking edge function: $fn"
  echo "  • Parse + type-check (deno check)"
  if ! deno check --no-lock --quiet "$ENTRY"; then
    echo "  ✖ deno check failed for $fn" >&2
    FAIL=1
    continue
  fi

  echo "  • Lint (deno lint)"
  if ! deno lint --quiet "$ENTRY"; then
    echo "  ✖ deno lint failed for $fn" >&2
    FAIL=1
    continue
  fi

  echo "  ✔ $fn passed"
done

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "✖ One or more edge function checks failed — fix before deploying." >&2
  exit 1
fi
echo "✔ All edge function checks passed."
