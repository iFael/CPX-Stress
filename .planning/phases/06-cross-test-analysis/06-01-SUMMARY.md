---
phase: 06-cross-test-analysis
plan: 01
subsystem: ui
tags: [react, recharts, bar-chart, cross-test, error-analysis, zustand]

# Dependency graph
requires:
  - phase: 05-error-filters
    provides: "window.stressflow.errors.byOperationName IPC channel and error aggregation query"
provides:
  - "CrossTestAnalysis page component with test selector, comparison table, and grouped bar chart"
  - "AppView 'analysis' routing and sidebar navigation entry"
affects: [07-pdf-capacity-verdict]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-test comparison with chronological trend indicators"
    - "Recharts BarChart with dynamic Bar children per selected test"
    - "Local-only component state for ephemeral comparison data (no Zustand pollution)"

key-files:
  created:
    - src/components/CrossTestAnalysis.tsx
  modified:
    - src/types/index.ts
    - src/components/Sidebar.tsx
    - src/App.tsx

key-decisions:
  - "All state local to CrossTestAnalysis (no Zustand store changes) -- comparison data is ephemeral UI state"
  - "Single component file with inline sub-components (ComparisonTooltip, ComparisonLegend) following MetricsChart pattern"
  - "Tasks 1 and 2 merged into single commit since they share one new file (CrossTestAnalysis.tsx)"

patterns-established:
  - "Cross-test data loading: Promise.all over selectedTestIds with byOperationName IPC"
  - "buildChartData transforms per-test Record<string,number> into Recharts flat array format"
  - "computeTrend handles division-by-zero with 'novo' label instead of Infinity%"

requirements-completed: [ANALYTICS-03]

# Metrics
duration: 5min
completed: 2026-04-07
---

# Phase 6 Plan 1: Cross-Test Analysis Summary

**Cross-test error comparison screen with test selector (2-5 tests), comparison table with degradation trend indicators, and Recharts grouped bar chart for visual error pattern detection**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T13:20:23Z
- **Completed:** 2026-04-07T13:25:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- New "Analise de Erros" sidebar entry with BarChart3 icon navigates to CrossTestAnalysis screen
- Test selector panel with checkboxes, URL search, min 2/max 5 validation, error count badges, and VU display
- Comparison table with operations as rows, tests as columns, trend indicators (TrendingUp red / TrendingDown green), and percentage deltas
- Recharts grouped bar chart with 5-color palette, custom tooltip and legend following MetricsChart pattern
- Full empty states: no history, no errors in selected tests, loading spinner, error message
- "default" operation name mapped to "Requisicao Unica" for display clarity

## Task Commits

Each task was committed atomically:

1. **Task 1: Navigation wiring + CrossTestAnalysis test selector panel** - `a7deaf3` (feat)
   - Includes Task 2 functionality (comparison table, chart, trend indicators) since both tasks target the same new file

**Plan metadata:** (pending)

## Files Created/Modified

- `src/components/CrossTestAnalysis.tsx` - New page component: test selector, comparison table, grouped bar chart, trend indicators, all empty/error states
- `src/types/index.ts` - Added "analysis" to AppView type union
- `src/components/Sidebar.tsx` - Added "Analise de Erros" NAV_ITEMS entry with BarChart3 icon
- `src/App.tsx` - Added CrossTestAnalysis import and routing branch for view="analysis"

## Decisions Made

- **All state local:** Comparison data (selectedTestIds, comparisonData, loading, error) kept as local useState -- ephemeral UI state that does not belong in the global Zustand store
- **Single commit for both tasks:** Tasks 1 and 2 were delivered in a single commit because they produce a single new file (CrossTestAnalysis.tsx) that cannot be meaningfully split between selector panel and visualization
- **ComparisonTooltip/ComparisonLegend inline:** Sub-components defined in the same file following MetricsChart.tsx pattern (CustomTooltip, CustomLegend)
- **Chronological sort before rendering:** comparisonData sorted by startTime ascending so trend indicators compare oldest-to-newest left-to-right

## Deviations from Plan

None - plan executed exactly as written. The only structural difference is that Tasks 1 and 2 were committed together since they target the same new file.

## Issues Encountered

None - TypeScript compilation and production build passed on first attempt.

## User Setup Required

None - no external service configuration required. All data comes from existing IPC channels (history.list, errors.byOperationName).

## Next Phase Readiness

- CrossTestAnalysis screen fully functional pending manual verification with real test data
- Phase 7 (PDF Capacity Verdict) can proceed -- no blockers from this phase
- All 4 success criteria addressed: sidebar navigation, test selection, comparison table with trends, grouped bar chart

## Self-Check: PASSED

- All 4 source files found on disk
- SUMMARY.md created at expected path
- Commit a7deaf3 verified in git log
- TypeScript compilation: clean (0 errors)
- Production build: success

---
*Phase: 06-cross-test-analysis*
*Completed: 2026-04-07*
