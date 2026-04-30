#!/usr/bin/env bash
# Pre-deploy validation for Supabase edge functions.
#
# What it catches (default mode — fast, matches what Supabase's bundler rejects):
#   • Parse errors (mismatched braces, invalid TS) — FATAL (deploy blocker)
#   • Lint issues (dead code, prefer-const, …) — WARNING by default
#
# What it skips by default:
#   • Deep type-checking of remote (`https:` / `npm:` / `jsr:`) imports — the local
#     Deno resolver doesn't share the bundler's module graph and produces false
#     positives. Pass --strict to enable full type-checking.
#   • The `no-import-prefix` lint rule (the bundler REQUIRES URL-style imports).
#
# Usage:
#   scripts/check-edge-function.sh                # auto-discovers ALL functions (parse-fatal, lint-warn)
#   scripts/check-edge-function.sh func-a func-b  # only the named functions
#   scripts/check-edge-function.sh --lint-strict  # treat lint failures as fatal too
#   scripts/check-edge-function.sh --strict       # full type-check (slow, noisy with URL imports)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"

STRICT=0
LINT_STRICT=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --strict) STRICT=1 ;;
    --lint-strict) LINT_STRICT=1 ;;
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
    # Parser-only: copy to a temp file and run `deno fmt --check`. The SWC
    # parser is the same one the Supabase bundler uses, so mismatched braces
    # and invalid TS are caught without needing remote-module resolution.
    # We use a temp copy so formatting drift in the source file is harmless;
    # a failure here = real parse error.
    TMP_DIR="$(mktemp -d)"
    TMP_FILE="$TMP_DIR/$fn.ts"
    cp "$ENTRY" "$TMP_FILE"
    echo "  • parse check (deno fmt parser)"
    # First normalise formatting in the temp copy. If THAT fails, it's a parse error.
    if ! deno fmt --quiet "$TMP_FILE" 2>/tmp/edge-parse-err; then
      echo "  ✖ parse failed for $fn" >&2
      head -20 /tmp/edge-parse-err >&2 || true
      ok=0
    fi
    rm -rf "$TMP_DIR"
  fi

  # 2. Lint — warn-only by default; pass --lint-strict to make failures fatal.
  # `no-import-prefix` and `no-explicit-any` are project-wide acceptable in edge functions.
  if [ "$ok" -eq 1 ]; then
    echo "  • deno lint"
    if ! deno lint --quiet --rules-exclude=no-import-prefix,no-explicit-any "$ENTRY"; then
      if [ "$LINT_STRICT" -eq 1 ]; then
        echo "  ✖ deno lint failed for $fn (lint-strict)" >&2
        ok=0
      else
        echo "  ⚠ deno lint warnings for $fn (informational; use --lint-strict to enforce)" >&2
      fi
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
