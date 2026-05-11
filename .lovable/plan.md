## Goal

On the Guard Schedule Import page, add a "Preset Mismatch Diff" panel that shows, per row, exactly which value failed preset validation (rank / group / serial range / serial format) alongside the expected preset values — so the user can audit and fix issues before exporting or committing.

## What the user will see

A new collapsible card in Step 5 (Validation), shown only when the active preset has `allowedRanks`, `allowedGroups`, `serialFormat`, or `serialMin/Max` configured AND there is at least one preset-mismatch error.

```text
Preset Mismatch Diff (12 rows)            [Filter: All | Rank | Group | Serial]
-----------------------------------------------------------------------------
Row  Name              Field   Got                Expected                  
3    DOE J             rank    "SARGE" -> SGT?    one of: DCO, ACI, CI, ...
7    KAY M             group   "GRP A"            one of: GROUP A..D
11   SMITH P           serial  41234              range [10000, 39999]
14   AYI K             serial  "ABC12"            format ^[0-9]{4,5}$
```

- Field column color-codes the diff (red strike-through on Got, green on Expected).
- Header chips toggle filters by mismatch field.
- Footer shows counts: `Ranks: 4 · Groups: 1 · Serial range: 5 · Serial format: 2`.
- "Copy diff as CSV" button (Row, Name, Serial, Field, Got, Expected) for offline review.
- Card is gated behind the existing `blockedByErrors` flow — purely informational, doesn't change gating logic.

## Implementation

### 1. Extend `RowIssue` with diff metadata
In `src/pages/GuardScheduleImport.tsx`:

- Add optional `got?: string` and `expected?: string` fields to `RowIssue`.
- Add `kind?: "preset_rank" | "preset_group" | "serial_range" | "serial_format"` so we can filter without parsing messages.

### 2. Populate diff fields inside `validateRows`
For the four existing preset-mismatch branches (lines 410, 426, 437, 451), set:

- `kind`, `got` (raw value), `expected` (e.g. `"GROUP A | GROUP B | GROUP C | GROUP D"` or `"range [min, max]"` or the regex source).
- For rank: also include nearest alias suggestion using a simple Levenshtein over `Object.keys(tpl.rankAliases ?? {})` ∪ `allowedRanks` to power the `-> SGT?` hint.

### 3. New `PresetDiffPanel` component (inline in same file)
- Props: `issues: RowIssue[]`, `template: MappingTemplate`.
- Filters issues to those with a `kind` starting with `preset_` or `serial_`.
- Local state for active filter chip (`all | rank | group | serial`).
- Renders shadcn `Card` + `Table` (Row #, Name, Serial, Field, Got, Expected) with max-height ~400px and `overflow-y-auto`.
- "Copy as CSV" uses `src/lib/download-utils.ts` patterns; trigger downloads `preset-mismatch-diff.csv`.

### 4. Wire into Step 5 validation card
- Render `<PresetDiffPanel>` directly under the existing issue summary, only when `validation && diffIssues.length > 0`.
- No changes to `guardValidation` / export / commit gating — diff view is read-only.

### 5. Minor copy update
Adjust the existing toast/summary text to mention "See Preset Mismatch Diff for per-row details" when preset errors exist.

## Files touched

- `src/pages/GuardScheduleImport.tsx` — type extension, `validateRows` enrichment, new `PresetDiffPanel` component, render in Step 5.

No DB, edge function, route, or sidebar changes. No other files affected.

## Out of scope

- Auto-fix / inline edit of mismatched rows (could be a follow-up).
- Persisting diff snapshots to the database.
- Changes to Bulk Staff Import (separate flow).
