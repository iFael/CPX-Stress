---
phase: 04-module-selector
plan: 02
subsystem: ui
tags: [react, typescript, zustand, tailwind, checkbox, module-selector]

# Dependency graph
requires:
  - phase: 04-module-selector
    provides: "MISTERT_MODULE_METADATA constant and updateModuleSelection Zustand action (plan 04-01)"
  - phase: 03-preset-system
    provides: "activePreset state, preset CRUD flow, applyPreset/clearActivePreset actions"
provides:
  - "Fieldset 'Módulos do Teste' rendered conditionally in TestConfig when MisterT ops detected"
  - "7 checkboxes (grid 3-col) for granular module selection with peer/sr-only pattern"
  - "handleModuleToggle reconstructs operations[] from template without zeroing activePreset"
  - "Toggle button Selecionar Todos / Limpar Seleção and counter"
  - "Orange warning when 0 modules selected (role=status)"
affects: []  # Terminal plan for phase 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isMistertPreset gate: config.operations.some() with MISTERT_MODULE_NAMES.has() detects MisterT preset without relying on activePreset name"
    - "Operations reconstructed from buildMistertOperations() template on each toggle — no mutation of existing ops array"
    - "peer/sr-only/SVG checkbox pattern from WelcomeOverlay replicated for visual consistency"
    - "Set<string> explicit type parameter on module names set to avoid TypeScript narrow-union inference errors"

key-files:
  created: []
  modified:
    - src/components/TestConfig.tsx

key-decisions:
  - "MISTERT_MODULE_NAMES declared as Set<string> (not Set<literal-union>) — prevents TypeScript errors when calling has(op.name) where op.name is string"
  - "handleModuleToggle rebuilds from template each time — avoids stale reference issues and keeps infra ops [0-2] always fresh"
  - "isMistertPreset derived from config.operations (not activePreset.name) — works even after user renames preset or applies partial selection"

patterns-established:
  - "Module selector gate: isMistertPreset = config.operations.some(op => MISTERT_MODULE_NAMES.has(op.name))"
  - "Preset-preserving toggle: updateModuleSelection (not updateConfig) keeps activePreset intact during module checkbox changes"

requirements-completed:
  - PRESET-03

# Metrics
duration: 15min
completed: 2026-04-06
---

# Phase 4 Plan 02: Module Selector UI Summary

**Checkboxes de módulos integrados diretamente na seção "Ver Operações" do TestConfig — módulos têm checkbox toggle, infra ops têm badge "fixo", módulos removidos aparecem como strikethrough com opção de reativar**

## Performance

- **Duration:** ~25 min (incluindo fix pós-feedback)
- **Started:** 2026-04-06T00:00:00Z
- **Completed:** 2026-04-06T00:25:00Z
- **Tasks:** 1 auto + 1 checkpoint (human feedback applied) + 1 fix
- **Files modified:** 1

## Accomplishments

- Declared `MISTERT_MODULE_NAMES = new Set<string>(...)` at module level for O(1) name lookups
- Added `updateModuleSelection` selector, derived `isMistertPreset / selectedModuleNames / allModulesSelected / noModulesSelected`
- Implemented `handleModuleToggle`, `handleSelectAll`, `handleClearAll` with `useCallback` (correct dependency arrays)
- **[Post-feedback fix]** Removed redundant "Módulos do Teste" fieldset — integrated checkboxes directly into "Ver Operações" section
- Module operations show checkbox toggle; infra ops (Login, Menu Principal) show "fixo" badge without checkbox
- Unchecked modules appear at bottom of operations list as strikethrough with re-enable checkbox
- Toggle "Selecionar Todos / Limpar Seleção" + counter inside operations panel header
- Dynamic operation count in "Ver Operações" button reflects actual selection
- Removed unused `LayoutGrid` and `MISTERT_OPERATION_COUNT` imports
- TypeScript build passes (`npm run build` exit 0)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implementar seção Módulos do Teste em TestConfig.tsx** - `ac3fc05` (feat)
2. **Task 2: Verificação humana do seletor de módulos** - checkpoint:human-verify (feedback: remover fieldset separado)
3. **Task 3: Fix — integrar checkboxes na seção Ver Operações** - `edf5cd6` (fix)

## Files Created/Modified

- `src/components/TestConfig.tsx` — Added module selector fieldset with 7 checkboxes, handlers, derived values, and module-level MISTERT_MODULE_NAMES constant

## Decisions Made

- `MISTERT_MODULE_NAMES` declared as `Set<string>` (not inferred as narrow union type from `as const` array) to prevent TypeScript errors when calling `has(op.name)` where `op.name` is typed as `string`. This is a Rule 1 auto-fix applied during build verification.
- `handleModuleToggle` rebuilds operations from `buildMistertOperations(currentBaseUrl)` on every call rather than mutating existing ops — guarantees infra ops [0-2] are always fresh and avoids stale-closure issues.
- `isMistertPreset` derived from `config.operations.some()` (not from `activePreset.name`) — correctly handles partial selections and renamed presets.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript narrow-union type error on Set.has()**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** `new Set(MISTERT_MODULE_METADATA.map(m => m.name))` inferred type as `Set<"CPX-Fretes" | "CPX-Rastreio" | ... | "Financeiro">`. Calling `has(op.name)` where `op.name: string` caused TS2345 errors on lines 125 and 130.
- **Fix:** Changed to `new Set<string>(...)` — explicit type parameter widens the set to accept any string as argument to `has()`
- **Files modified:** `src/components/TestConfig.tsx` (line 49)
- **Verification:** `npm run build` exits 0 after fix
- **Committed in:** `ac3fc05` (Task 1 commit)

### Human Feedback Fix

**2. [Human feedback] Redundant "Módulos do Teste" fieldset**
- **Found during:** Task 2 human checkpoint
- **Issue:** User rejected the separate fieldset as redundant — "Não faz sentido ter duas opções com as mesmas coisas. Era mais fácil usar o que eu já tinha feito, e ter criado a opção de marcar ou desmarcar os módulos."
- **Fix:** Removed entire "Módulos do Teste" fieldset (78 lines). Integrated checkboxes directly into "Ver Operações" section. Module ops get toggle checkbox, infra ops get "fixo" badge. Unchecked modules shown at bottom with strikethrough and re-enable option.
- **Files modified:** `src/components/TestConfig.tsx`
- **Verification:** `npm run build` exits 0 after fix
- **Committed in:** `edf5cd6` (fix commit)

---

**Total deviations:** 1 auto-fixed (type error) + 1 human-feedback fix (UI layout)
**Impact on plan:** Moderate — UI changed from separate fieldset to inline checkboxes in existing section. Same behavioral logic (handlers, derived state) preserved.

## Issues Encountered

None — aside from the TypeScript type inference issue auto-fixed above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 is COMPLETE — human verification passed after fix
- Phase 5 (Error Filters) can begin — depends only on Phase 1 (Engine Fixes)
- No blockers

## Self-Check

- [x] `src/components/TestConfig.tsx` does NOT import `LayoutGrid` (removed)
- [x] `src/components/TestConfig.tsx` does NOT import `MISTERT_OPERATION_COUNT` (removed)
- [x] `src/components/TestConfig.tsx` imports `MISTERT_MODULE_METADATA` from "@/constants/test-presets"
- [x] Contains `const updateModuleSelection = useTestStore((s) => s.updateModuleSelection)`
- [x] Contains `const MISTERT_MODULE_NAMES = new Set<string>` (module-level)
- [x] Contains `const isMistertPreset`
- [x] Contains `handleModuleToggle` with `useCallback`
- [x] Contains `handleSelectAll` with `useCallback`
- [x] Contains `handleClearAll` with `useCallback`
- [x] No separate "Módulos do Teste" fieldset exists (removed per feedback)
- [x] Checkboxes are inside "Ver Operações" section
- [x] Contains `role="status"` for empty-selection warning
- [x] `npm run build` exit code 0
- [x] Commit `ac3fc05` exists (initial)
- [x] Commit `edf5cd6` exists (fix)

## Self-Check: PASSED

---
*Phase: 04-module-selector*
*Completed: 2026-04-06*
