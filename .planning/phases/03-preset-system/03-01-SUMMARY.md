---
phase: 03-preset-system
plan: 01
subsystem: preset-backend
tags: [sqlite, ipc, zustand, types, migration, crud]
dependency_graph:
  requires: []
  provides: [TestPreset, ActivePresetInfo, presets-ipc, test_presets-table, ensureBuiltinPresetVersion]
  affects: [src/types/index.ts, src/stores/test-store.ts, electron/database/database.ts, electron/database/repository.ts, electron/preload.ts, electron/main.ts]
tech_stack:
  added: []
  patterns: [migration-v3, preset-crud, builtin-version-check, 4-file-ipc-atomic]
key_files:
  created: []
  modified:
    - src/types/index.ts
    - src/stores/test-store.ts
    - electron/database/database.ts
    - electron/database/repository.ts
    - electron/preload.ts
    - electron/main.ts
decisions:
  - "Built-in preset JSON hardcoded inline in database.ts (never imported from src/)"
  - "CURRENT_BUILTIN_VERSION=1 with startup auto-update via ensureBuiltinPresetVersion"
  - "updateConfig clears activePreset to detect manual config divergence from preset"
  - "Prepared statements for all SQL queries (no string interpolation)"
  - "MAX_CONFIG_JSON_SIZE=1MB enforced in repository layer"
metrics:
  duration: "5m 11s"
  completed: "2026-04-06"
  tasks: 3/3
  files_modified: 6
---

# Phase 3 Plan 01: Preset System Backend Infrastructure Summary

SQLite migration v3 with test_presets table, built-in "MisterT Completo" seed (10 operations inline JSON, builtin_version=1), CRUD repository with built-in protection, 4 IPC channels (presets:list/save/rename/delete) with 4-file atomic updates, and Zustand store extension with activePreset tracking.

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Types + Store extension | cc71e1b | TestPreset, ActivePresetInfo interfaces; Window.stressflow.presets IPC types; Zustand activePreset/presets state + applyPreset/setPresets/clearActivePreset actions |
| 2 | Migration v3 + Repository CRUD | 71b362e | CREATE TABLE test_presets; built-in seed with 10 ops inline JSON; ensureBuiltinPresetVersion; listPresets/savePreset/renamePreset/deletePreset with validation |
| 3 | IPC Bridge (4-file atomic) | 40deb0a | 4 channels in ALLOWED_INVOKE_CHANNELS; presets namespace in preload api; ensureBuiltinPresetVersion on startup; 4 ipcMain.handle handlers with error translation |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Built-in JSON inline in database.ts** - The 10-operation MisterT template is serialized as a JSON.stringify constant (`BUILTIN_CONFIG_JSON`) in `electron/database/database.ts`. Never imported from `src/constants/test-presets.ts` (anti-pattern: would break packaged build).

2. **updateConfig clears activePreset** - When the user manually changes any config field via `updateConfig`, the `activePreset` is set to `null`. This ensures the UI accurately reflects when the loaded preset has been modified.

3. **Prepared statements everywhere** - All SQL queries in the preset CRUD use parameterized prepared statements. No string interpolation. Mitigates T-03-04 (SQL injection).

4. **1MB config_json limit** - `MAX_CONFIG_JSON_SIZE = 1_048_576` bytes enforced in `savePreset` before INSERT. Mitigates T-03-05 (DoS via oversized payload).

5. **UNIQUE constraint error translation** - SQLite UNIQUE constraint violations on `test_presets.name` are caught in IPC handlers and translated to pt-BR: "Ja existe um preset com este nome." Mitigates T-03-07.

## Threat Mitigations Applied

All 7 threats from the plan's threat model are mitigated:

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-03-01 | Mitigated | `renamePreset` checks `is_builtin` flag before UPDATE; rejects with pt-BR message |
| T-03-02 | Mitigated | `deletePreset` checks `is_builtin` flag before DELETE; rejects with pt-BR message |
| T-03-03 | Mitigated | `savePreset` calls `JSON.parse(data.configJson)` before storage; rejects malformed JSON |
| T-03-04 | Mitigated | All queries use prepared statements with parameterized values |
| T-03-05 | Mitigated | `MAX_CONFIG_JSON_SIZE = 1MB` enforced in repository before INSERT |
| T-03-06 | Accepted | Presets store `{{STRESSFLOW_*}}` placeholders, not resolved values |
| T-03-07 | Mitigated | UNIQUE constraint errors caught in IPC handlers; translated to pt-BR |

## Known Stubs

None - all data paths are fully wired. The preset backend is complete and ready for the UI layer (Plan 02).

## Verification

- `npm run build` exits with code 0 (TypeScript compilation + Vite production build)
- All 6 files contain expected interfaces, functions, and handlers per acceptance criteria
- Migration v3 creates test_presets table with correct schema (UNIQUE name, is_builtin flag)
- Built-in preset seeded with 10 operations matching src/constants/test-presets.ts template
- ensureBuiltinPresetVersion compares CURRENT_BUILTIN_VERSION with DB version
- All 4 IPC channels whitelisted in preload and handled in main.ts
- Built-in presets protected from rename/delete in both repository and IPC handler layers

## Self-Check: PASSED

All 6 modified files exist. All 3 commit hashes verified. All key interfaces, functions, handlers, and content markers present in the codebase.
