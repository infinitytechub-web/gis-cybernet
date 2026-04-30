#!/usr/bin/env bash
# Pre-deploy validation for Supabase edge functions.
#
# What it catches (default mode — fast, matches what Supabase's bundler rejects):
#   • Parse errors (mismatched braces, invalid TS syntax) via `deno check --no-check=remote`
#   • Lint issues (dead code, prefer-const, …) via `deno lint`
#
# What it skips by default:
#   • Deep type-checking of remote (`https:` / `npm:` / `jsr:`) imports — the local
#     Deno resolver doesn't share the bundler's module graph and produces false
#     positives. Pass --strict to enable full type-checking.
#
# Usage:
#   scripts/check-edge-function.sh                     # auto-discovers ALL functions
#   scripts/check-edge-function.sh function-a function-b
#   scripts/check-edge-function.sh --strict            # deep type-check (slower, noisier)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"

STRICT=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --strict) STRICT=1 ;;
    *) ARGS+=("$a") ;;
  esac
done

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
if [ "${#ARGS[@]}" -gt 0 ]; then
  TARGETS=("${ARGS[@]}")
else
  while IFS= read -r -d '' entry; do
    fn="$(basename "$(dirname "$entry")")"
    case "$fn" in
      _*) continue ;;  # skip _shared, _internal, …
    esac
    TARGETS+=("$fn")
  done < <(find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -name 'index.ts' -print0 | sort -z)
fi

if [ "${#TARGETS[@]}" -eq 0 ]; then
  echo "ℹ No edge functions found under $FUNCTIONS_DIR — nothing to check."
  exit 0
fi

MODE="fast"; [ "$STRICT" -eq 1 ] && MODE="strict (full type-check)"
echo "▶ Validating ${#TARGETS[@]} edge function(s) [mode: $MODE]"
echo "  ${TARGETS[*]}"

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
  echo "▶ $fn"
  ok=1

  # 1. Parse / syntax check (always runs — this is what catches the bundler's syntax errors)
  if [ "$STRICT" -eq 1 ]; then
    echo "  • deno check (strict, full type-check)"
    if ! deno check --no-lock --quiet "$ENTRY"; then
      echo "  ✖ deno check failed for $fn" >&2
      ok=0
    fi
  else
    # `deno fmt --check` runs the SWC parser without type-checking — fast and
    # catches the same syntax errors the Supabase bundler rejects (mismatched
    # braces, invalid TS, etc.) without needing remote-module resolution.
    echo "  • parse check (deno fmt --check)"
    if ! deno fmt --check --quiet "$ENTRY" >/dev/null 2>&1; then
      # fmt --check fails on either parse error OR formatting drift.
      # Re-run without --check to distinguish: if it can format the file, the
      # parse is OK and we just have whitespace drift (not a deploy blocker).
      if deno fmt --quiet "$ENTRY" >/dev/null 2>&1; then
        : # parse OK; ignore formatting drift
      else
        echo "  ✖ parse failed for $fn" >&2
        deno fmt --check "$ENTRY" 2>&1 | head -20 >&2 || true
        ok=0
      fi
    fi
  fi

  # 2. Lint
  if [ "$ok" -eq 1 ]; then
    echo "  • deno lint"
    # no-import-prefix is required by the Supabase bundler — disable it project-wide.
    if ! deno lint --quiet --rules-exclude=no-import-prefix "$ENTRY"; then
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
