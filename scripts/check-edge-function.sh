#!/usr/bin/env bash
# Pre-deploy syntax + type + lint check for Supabase edge functions.
# Mirrors what the Supabase bundler does (Deno-based), so syntax errors like
# mismatched braces are caught locally before a deploy attempt.
#
# Usage:
#   scripts/check-edge-function.sh                     # auto-discovers ALL functions
#                                                       # (every supabase/functions/*/index.ts)
#   scripts/check-edge-function.sh function-a function-b  # checks only the given ones
#
# Exits non-zero on any failure so it can gate CI / pre-commit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"

if ! command -v deno >/dev/null 2>&1; then
  echo "✖ deno CLI not found in PATH. Install Deno: https://deno.land" >&2
  exit 127
fi

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "✖ No supabase/functions directory at $FUNCTIONS_DIR" >&2
  exit 1
fi

# ── Resolve target list ──────────────────────────────────────────────
TARGETS=()
if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  # Auto-discover: every immediate subdirectory containing an index.ts
  # Sorted, null-terminated for safety against funky names.
  while IFS= read -r -d '' entry; do
    fn="$(basename "$(dirname "$entry")")"
    # Skip Supabase internal/shared folders (prefix with _ by convention)
    case "$fn" in
      _*) continue ;;
    esac
    TARGETS+=("$fn")
  done < <(find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -name 'index.ts' -print0 | sort -z)
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "ℹ No edge functions found under $FUNCTIONS_DIR — nothing to check."
  exit 0
fi

echo "▶ Validating ${#TARGETS[@]} edge function(s): ${TARGETS[*]}"

PASS=()
FAILED=()
MISSING=()

for fn in "${TARGETS[@]}"; do
  ENTRY="$FUNCTIONS_DIR/$fn/index.ts"
  if [ ! -f "$ENTRY" ]; then
    echo ""
    echo "✖ $fn — index.ts not found at $ENTRY" >&2
    MISSING+=("$fn")
    continue
  fi

  echo ""
  echo "▶ Checking edge function: $fn"

  ok=1
  echo "  • Parse + type-check (deno check)"
  if ! deno check --no-lock --quiet "$ENTRY"; then
    echo "  ✖ deno check failed for $fn" >&2
    ok=0
  fi

  if [ "$ok" -eq 1 ]; then
    echo "  • Lint (deno lint)"
    if ! deno lint --quiet "$ENTRY"; then
      echo "  ✖ deno lint failed for $fn" >&2
      ok=0
    fi
  fi

  if [ "$ok" -eq 1 ]; then
    echo "  ✔ $fn passed"
    PASS+=("$fn")
  else
    FAILED+=("$fn")
  fi
done

echo ""
echo "──────── Summary ────────"
echo "✔ Passed:  ${#PASS[@]}${PASS:+  (${PASS[*]})}"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "✖ Failed:  ${#FAILED[@]}  (${FAILED[*]})"
fi
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "✖ Missing: ${#MISSING[@]}  (${MISSING[*]})"
fi

if [ "${#FAILED[@]}" -gt 0 ] || [ "${#MISSING[@]}" -gt 0 ]; then
  echo ""
  echo "✖ One or more edge function checks failed — fix before deploying." >&2
  exit 1
fi

echo "✔ All edge function checks passed."
