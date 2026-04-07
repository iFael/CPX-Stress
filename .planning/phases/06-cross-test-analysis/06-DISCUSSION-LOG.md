# Phase 6: Cross-Test Analysis - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 06-cross-test-analysis
**Areas discussed:** Test selection UX, Comparison visualization, Navigation entry, Data scope
**Mode:** --auto (all decisions auto-selected with recommended defaults)

---

## Test Selection UX

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox list from history | Reuses existing history list pattern with checkboxes for multi-select | ✓ |
| Dropdown multi-select | Compact but less familiar, harder to see test details |  |
| Drag-and-drop | Visual but over-engineered for 2-6 items |  |

**User's choice:** [auto] Checkbox list from history (recommended default)
**Notes:** Matches HistoryPanel pattern. Minimum 2 tests required for comparison.

---

## Comparison Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Table + bar chart | Table for exact numbers, grouped bar chart for visual degradation pattern | ✓ |
| Table only | Precise but harder to spot trends visually |  |
| Chart only | Visual but lacks exact numbers for reporting |  |

**User's choice:** [auto] Table comparison + simple bar chart (recommended default)
**Notes:** Recharts already available. Dual view satisfies both success criteria #3 (numbers) and #4 (visual patterns).

---

## Navigation Entry

| Option | Description | Selected |
|--------|-------------|----------|
| New sidebar item "Análise de Erros" | Explicit entry point, matches success criteria #1 | ✓ |
| Sub-tab in HistoryPanel | Saves sidebar space but hides the feature |  |
| Button in TestResults | Context-dependent, not always visible |  |

**User's choice:** [auto] New sidebar entry (recommended default)
**Notes:** Success criteria #1 explicitly requires "Nova entrada 'Análise de Erros' na sidebar".

---

## Data Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Errors by operation name per test | Reuses getErrorsByOperationName from Phase 5 | ✓ |
| Errors by status code per test | Different dimension, less actionable for MisterT modules |  |
| Full error breakdown (operation + status + type) | Comprehensive but complex UI |  |

**User's choice:** [auto] Errors by operation name per test (recommended default)
**Notes:** Matches success criteria #3 ("contagem de erros por operação para cada teste selecionado"). No new SQL queries needed.

---

## Claude's Discretion

- Visual degradation indicators (color, icons)
- Empty state design
- Operation ordering in table
- Max tests selectable for comparison
- Table/chart styling with sf-* tokens

## Deferred Ideas

None — discussion stayed within phase scope.
