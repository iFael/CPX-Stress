# Phase 3: Preset System - Research

**Researched:** 2026-04-06
**Domain:** SQLite persistence layer + React UI (modal CRUD) + Electron IPC bridge
**Confidence:** HIGH

## Summary

Phase 3 implements a preset system that lets users apply the built-in "MisterT Completo" preset with one click and save/load/rename/delete their own test configurations. The implementation touches all three layers of the Electron architecture: a new SQLite table with migration v3 (main process), four new IPC channels with the mandatory 4-file atomic update rule, and two new React components (PresetModal + SavePresetDialog) plus store extensions.

The codebase already provides all necessary infrastructure patterns. The migration system (database.ts) has a clean versioned pattern for v1 and v2 that v3 can follow directly. The IPC bridge (preload.ts) has established whitelist + safeInvoke patterns. The WelcomeOverlay component provides a production-ready modal pattern with animations, escape-to-close, and backdrop-click-to-close. The Toast system provides CRUD feedback. The `buildMistertOperations()` function in `test-presets.ts` is the source of truth for the 10 operations that must be serialized as JSON inline in the migration SQL.

**Primary recommendation:** Follow the existing patterns exactly -- migration v3 for the table, repository functions for CRUD, 4-file IPC atomic updates, WelcomeOverlay modal pattern for the UI. The built-in seed JSON must be hardcoded inline in the migration SQL (never import from src/).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. **Preset storage in SQLite** -- tabela `test_presets` com flag `is_builtin` (migration v3)
2. **Built-in seed never imports from src/** -- JSON hardcoded inline na migration SQL, nunca `import` de `src/constants/test-presets.ts` (anti-pattern: quebraria no build empacotado)
3. **4-file atomic IPC update rule** -- todo novo canal IPC: preload whitelist, preload api, src/types/index.ts, main.ts
4. **D1: Preset Data Model -- Full TestConfig** -- O preset persiste o `TestConfig` inteiro (url, virtualUsers, duration, method, headers, body, operations[])
5. **D2: UI -- Modal com Overlay + Grid de Cards** -- Presets em modal com overlay, botao "Presets" no TestConfig, grid de cards, built-in com badge "Built-in", user presets com Carregar/Renomear/Deletar
6. **D3: Save Flow -- Save + Save As** -- Se preset ativo e user-created: "Atualizar" ou "Salvar Como Novo". Se built-in ou nenhum: apenas "Salvar Como"
7. **D4: Built-in Seed -- Migration + Version Check** -- Migration v3 cria tabela + INSERT built-in com JSON inline, `CURRENT_BUILTIN_VERSION=1`, startup check atualiza se versao diferir
8. **D5: URL Base Substituida ao Aplicar** -- Built-in persiste com URL default; ao aplicar, renderer substitui URL base pela do environment selector
9. **D6: IPC Channels** -- `presets:list`, `presets:save`, `presets:rename`, `presets:delete`

### Claude's Discretion
(none -- all items were locked in discussion)

### Deferred Ideas (OUT OF SCOPE)
- Phase 4 boundary: module selector (checkboxes) is PRESET-03, not included here
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRESET-01 | Built-in "MisterT Completo" preset with 10 operations, ready with 1 click, no manual configuration | Migration v3 seeds the preset with JSON inline. `buildMistertOperations()` provides the source of truth for the 10 ops. Version check auto-updates on app upgrade. |
| PRESET-02 | User can save current config as named preset, load, rename, delete. Presets persist across app restart. | SQLite `test_presets` table, 4 IPC channels (list/save/rename/delete), PresetModal + SavePresetDialog components, store extensions for `activePreset` tracking. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Language:** All user-facing text in Brazilian Portuguese (pt-BR). Code comments in pt-BR.
- **Color palette:** Always use `sf-*` Tailwind tokens. Never raw Tailwind colors.
- **Types:** All shared TypeScript types centralized in `src/types/index.ts`.
- **IPC Security:** Never expose Node.js APIs directly to renderer. All communication through preload bridge with whitelisted channels.
- **Path alias:** `@/*` maps to `src/*` for all intra-src imports.
- **Zustand selectors:** Always use `useTestStore((s) => s.field)` pattern, never `useTestStore()` without selector.
- **Component conventions:** Function components with hooks. `useCallback` for event handlers. `useMemo` for derived values.
- **Error handling:** Async operations use try/catch/finally. Errors surfaced via `setError(msg)` or Toast. Console messages prefixed with `[StressFlow]`.
- **Module design:** Named exports for components, hooks, and stores. Default export only for root `App` component.
- **No test framework configured:** Phase does not need to add tests.

## Standard Stack

### Core (already in project -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.9.0 | SQLite persistence for presets table | Already used for test_results and test_errors. Synchronous API with prepared statements. [VERIFIED: codebase] |
| zustand | ^4.5.5 | State management for activePreset tracking | Already manages all app state. [VERIFIED: codebase] |
| lucide-react | ^0.468.0 | Icons for preset cards and buttons (BookOpen, Save, Pencil, Trash2) | Already used across all components. [VERIFIED: codebase] |
| uuid | ^9.0.1 | UUID v4 for preset IDs | Already used for test result IDs. [VERIFIED: codebase] |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React 18.3.x | renderer | PresetModal, SavePresetDialog components | All new UI components |
| Tailwind CSS 3.4.x | styling | sf-* tokens, sf-card-interactive utility | All visual styling |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite for presets | JSON file on disk | SQLite is already established for persistence; adding JSON would introduce a second persistence mechanism without benefit |
| New modal library | Hand-rolled modal (WelcomeOverlay pattern) | Project convention is hand-rolled components. WelcomeOverlay provides a complete, tested modal pattern. No external dependency needed. |

**Installation:**
```bash
# No new packages needed. All dependencies already installed.
```

## Architecture Patterns

### Recommended Project Structure (new/modified files only)

```
electron/
  database/
    database.ts         # ADD: migration v3 (CREATE TABLE test_presets + INSERT built-in)
    repository.ts       # ADD: preset CRUD functions (listPresets, savePreset, renamePreset, deletePreset, checkBuiltinVersion)
  main.ts               # ADD: 4 IPC handlers (presets:list/save/rename/delete)
  preload.ts            # ADD: 4 channels to whitelist + 4 api functions in presets namespace
src/
  types/
    index.ts            # ADD: TestPreset interface + Window.stressflow.presets type declarations
  stores/
    test-store.ts       # ADD: activePreset state + presets list + loadPresets/setActivePreset/clearActivePreset actions
  components/
    PresetModal.tsx      # NEW: Modal overlay with preset card grid
    SavePresetDialog.tsx # NEW: Save/rename dialog with name input + validation
    TestConfig.tsx       # MODIFY: Add toolbar row with "Presets" and "Salvar Preset" buttons
```

### Pattern 1: Migration v3 (follows existing v1/v2 pattern)

**What:** Versioned SQLite migration creating the `test_presets` table and seeding the built-in preset.
**When to use:** Applied automatically on `initDatabase()` when `schema_version < 3`.
**Source:** [VERIFIED: electron/database/database.ts lines 64-172]

```typescript
// Pattern from existing codebase -- migration v3 follows identical structure
if (version < 3) {
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS test_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        config_json TEXT NOT NULL,
        is_builtin INTEGER DEFAULT 0,
        builtin_version INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Built-in seed -- JSON inline, NEVER imported from src/
    database.exec(`
      INSERT INTO test_presets (id, name, config_json, is_builtin, builtin_version)
      VALUES (
        'builtin-mistert-completo',
        'MisterT Completo',
        '{ ... serialized TestConfig JSON ... }',
        1,
        1
      )
    `);

    database.prepare("INSERT INTO schema_version (version) VALUES (?)").run(3);
  })();
}
```

**Critical constraint:** The JSON string for the built-in preset must be a static string literal in the migration SQL. It must NOT import from `src/constants/test-presets.ts`. This is an enforced anti-pattern because the electron process cannot import from src/ in the packaged build. [VERIFIED: CONTEXT.md D4, STATE.md]

### Pattern 2: Repository Functions (follows existing CRUD pattern)

**What:** Prepared-statement-based CRUD functions for presets.
**When to use:** Called from IPC handlers in main.ts.
**Source:** [VERIFIED: electron/database/repository.ts]

```typescript
// Pattern follows existing saveTestResult / listTestResults / deleteTestResult
export function listPresets(): PresetRow[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM test_presets ORDER BY is_builtin DESC, name ASC")
    .all() as PresetRow[];
}

export function savePreset(preset: { id: string; name: string; configJson: string }): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO test_presets (id, name, config_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(preset.id, preset.name, preset.configJson);
}
```

### Pattern 3: 4-File Atomic IPC Update (enforced project constraint)

**What:** Every new IPC channel requires simultaneous updates to exactly 4 files.
**When to use:** Each of the 4 new channels (presets:list, presets:save, presets:rename, presets:delete).
**Source:** [VERIFIED: CONTEXT.md prior decisions, STATE.md critical constraints]

Files to update per channel:
1. `electron/preload.ts` -- add to `ALLOWED_INVOKE_CHANNELS` array
2. `electron/preload.ts` -- add function in `api.presets` namespace
3. `src/types/index.ts` -- add to `Window.stressflow.presets` type declaration
4. `electron/main.ts` -- add `ipcMain.handle(...)` with try/catch + traduzirErro

### Pattern 4: Modal (reuse WelcomeOverlay pattern exactly)

**What:** Full-screen overlay modal with backdrop, animation, escape-to-close.
**When to use:** PresetModal and SavePresetDialog components.
**Source:** [VERIFIED: src/components/WelcomeOverlay.tsx]

Key elements to replicate:
- `fixed inset-0 z-[9999]` container with `role="dialog" aria-modal="true"`
- `bg-black/70 backdrop-blur-sm` backdrop with click-to-close
- Panel with `rounded-2xl border border-sf-border bg-sf-bg shadow-elevated`
- Top gradient bar: `h-1 bg-gradient-to-r from-sf-primary via-sf-accent to-sf-primary`
- X close button in top-right corner
- `isClosing` state for exit animation (300ms delay before unmount)
- Escape key listener via `useEffect`
- Inline `<style>` for keyframe animations (self-contained pattern)

### Pattern 5: Built-in Version Check (startup auto-update)

**What:** On database initialization, compare `builtin_version` in DB against `CURRENT_BUILTIN_VERSION` constant. If mismatch, UPDATE the built-in row.
**When to use:** Called during `initDatabase()` after migrations, or as a separate function called by the main process on startup.
**Source:** [VERIFIED: CONTEXT.md D4]

```typescript
const CURRENT_BUILTIN_VERSION = 1;

export function ensureBuiltinPresetVersion(db: Database.Database): void {
  const row = db
    .prepare("SELECT builtin_version FROM test_presets WHERE is_builtin = 1")
    .get() as { builtin_version: number } | undefined;

  if (!row || row.builtin_version < CURRENT_BUILTIN_VERSION) {
    db.prepare(`
      UPDATE test_presets
      SET config_json = ?, builtin_version = ?, updated_at = datetime('now')
      WHERE is_builtin = 1
    `).run(BUILTIN_CONFIG_JSON, CURRENT_BUILTIN_VERSION);
  }
}
```

### Pattern 6: URL Base Replacement on Apply

**What:** When applying a preset, replace the default base URL in all operation URLs with the currently selected environment URL.
**When to use:** In the renderer when loading a preset into the store.
**Source:** [VERIFIED: src/constants/test-presets.ts -- buildMistertOperations()]

```typescript
// Existing function already does this:
export function buildMistertOperations(baseUrl?: string): TestOperation[] {
  const base = (baseUrl || MISTERT_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const defaultBase = MISTERT_DEFAULT_BASE_URL;
  return MISTERT_OPERATIONS_TEMPLATE.map((op) => ({
    ...op,
    url: op.url.replace(defaultBase, base),
    headers: op.headers ? { ...op.headers } : undefined,
  }));
}

// For preset application, a generic replaceBaseUrl utility:
function replaceBaseUrl(operations: TestOperation[], newBase: string): TestOperation[] {
  const defaultBase = MISTERT_DEFAULT_BASE_URL;
  return operations.map((op) => ({
    ...op,
    url: op.url.replace(defaultBase, newBase),
    headers: op.headers ? { ...op.headers } : undefined,
  }));
}
```

### Anti-Patterns to Avoid

- **Importing src/ from electron/:** Never import `src/constants/test-presets.ts` from electron code. The electron main process bundles separately and cannot resolve `@/` or `src/` paths at runtime in the packaged app. [VERIFIED: STATE.md critical constraints]
- **Storing credential values in presets:** The `config_json` stores `{{STRESSFLOW_USER}}` and `{{STRESSFLOW_PASS}}` as placeholder strings, not resolved values. Resolution happens at test start time in main.ts via `resolveConfigPlaceholders()`. [VERIFIED: electron/main.ts lines 147-165]
- **Modifying built-in presets:** Built-in presets must never be editable/deletable by the user. The `is_builtin` flag must be checked in IPC handlers and enforced in the UI. [VERIFIED: CONTEXT.md D2]
- **Using useTestStore() without selector:** Always destructure with selector pattern `useTestStore((s) => s.field)`. [VERIFIED: CLAUDE.md conventions]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite persistence | Custom file-based JSON storage | better-sqlite3 with existing migration pattern | Already established; prepared statements prevent SQL injection; transactional integrity |
| Modal overlay | CSS-only overlay without focus management | WelcomeOverlay pattern (complete with escape, backdrop click, aria) | Proven pattern in codebase with animations, accessibility, and self-contained styles |
| Toast notifications | Custom alert system | Existing `useToast()` hook from Toast.tsx | Already provides success/error/warning/info variants with auto-dismiss |
| UUID generation | Custom ID generation | `uuid` v4 (already a dependency) | Collision-safe, established pattern from stress-engine.ts |
| URL replacement | Regex-based custom URL parser | Existing `buildMistertOperations()` / string.replace pattern | Proven, simple, handles trailing slashes |

**Key insight:** This phase requires ZERO new dependencies. Every building block exists in the codebase.

## Common Pitfalls

### Pitfall 1: Built-in JSON Inline Serialization Errors

**What goes wrong:** The JSON string for the built-in preset in the migration SQL has syntax errors (missing escapes, wrong quotes, truncated fields) that cause the migration to fail silently or insert corrupt data.
**Why it happens:** The 10-operation MisterT config is a complex nested JSON with regex patterns (`CTRL=(\\d+)`) that need double-escaping inside a SQL string literal.
**How to avoid:** (1) Generate the JSON from `buildMistertOperations()` in a build script or manually, then paste into the migration. (2) Use single-quoted SQL strings. (3) Test the migration independently by running `initDatabase()` with a fresh DB file. (4) Verify the inserted row can be parsed back to a valid `TestConfig` object.
**Warning signs:** App crashes on first launch after migration; preset list returns empty; JSON.parse errors in console.

### Pitfall 2: Duplicate Name Constraint Violation

**What goes wrong:** User tries to save a preset with the same name as an existing one, causing a UNIQUE constraint violation in SQLite that bubbles up as an opaque error.
**Why it happens:** The `name` column has a UNIQUE constraint. Without client-side validation, the error reaches the user as a raw SQLite message.
**How to avoid:** (1) Validate name uniqueness client-side before calling IPC (check against the loaded presets list). (2) In the IPC handler, catch the UNIQUE constraint error and return a user-friendly pt-BR message. (3) The UI spec already defines inline validation: "Ja existe um preset com este nome".
**Warning signs:** Toast shows raw English error message instead of pt-BR.

### Pitfall 3: Race Condition Between Preset Load and URL Replacement

**What goes wrong:** When loading a preset, the URL base replacement uses the environment selector's current value, but if the store hasn't updated yet, the wrong base URL is applied.
**Why it happens:** Zustand state updates are batched. If `updateConfig` is called with the preset data and the URL replacement reads `config.operations[0].url` in the same render cycle, it may read stale state.
**How to avoid:** Perform URL replacement BEFORE calling `updateConfig`. Compute the final config object (with replaced URLs) first, then set it in the store in a single `updateConfig` call.
**Warning signs:** Preset loads but operations still show the default dev URL instead of the user's selected environment.

### Pitfall 4: Built-in Preset Deletion/Rename Not Blocked in Backend

**What goes wrong:** Even though the UI hides rename/delete buttons for built-in presets, a crafty IPC call could still delete the built-in.
**Why it happens:** UI-only guards are insufficient; the IPC handler must also check `is_builtin` flag.
**How to avoid:** In `presets:rename` and `presets:delete` handlers, query the preset first and reject if `is_builtin = 1`. Return a specific error message: "Presets built-in nao podem ser alterados."
**Warning signs:** Built-in preset disappears after unexpected IPC call.

### Pitfall 5: Forgot to Add to ALLOWED_INVOKE_CHANNELS

**What goes wrong:** New IPC channels work in development but fail silently in production because the channel was added to the api object but not to the `ALLOWED_INVOKE_CHANNELS` array.
**Why it happens:** The 4-file rule is easy to remember conceptually but one of the 4 updates gets missed.
**How to avoid:** Each new channel must be a single atomic task that touches all 4 files. The planner should structure tasks so that each IPC channel is added as a complete unit, not split across separate tasks.
**Warning signs:** `Canal IPC nao permitido: presets:list` error in console. The `safeInvoke` function rejects the call.

### Pitfall 6: Store State Not Updated After CRUD Operations

**What goes wrong:** User saves a preset but the modal doesn't show the new preset until reopened. Or user deletes a preset but the card remains visible.
**Why it happens:** IPC call succeeds but the local `presets` array in the store isn't refreshed.
**How to avoid:** After each successful CRUD IPC call, reload the presets list via `presets:list` and update the store. Alternatively, optimistically update the local state and reconcile on next load.
**Warning signs:** Stale data in the modal after save/delete/rename operations.

## Code Examples

### Example 1: PresetRow and TestPreset Type Definitions

```typescript
// Source: [VERIFIED: CONTEXT.md D1 schema + existing codebase patterns]

// In electron/database/repository.ts
export interface PresetRow {
  id: string;
  name: string;
  config_json: string;
  is_builtin: number;  // SQLite uses INTEGER for boolean
  builtin_version: number | null;
  created_at: string;
  updated_at: string;
}

// In src/types/index.ts
/** Preset de teste salvo no banco de dados. */
export interface TestPreset {
  /** Identificador unico do preset (UUID). */
  id: string;
  /** Nome exibido ao usuario. */
  name: string;
  /** Configuracao de teste completa. */
  config: TestConfig;
  /** Se este preset e built-in (nao editavel/deletavel). */
  isBuiltin: boolean;
  /** Data de criacao (ISO 8601). */
  createdAt: string;
  /** Data da ultima atualizacao (ISO 8601). */
  updatedAt: string;
}
```

### Example 2: IPC Handler Pattern (presets:list)

```typescript
// Source: [VERIFIED: electron/main.ts existing handler patterns]

ipcMain.handle("presets:list", async () => {
  try {
    return listPresets();
  } catch (error) {
    console.error("[StressFlow] Erro ao listar presets:", error);
    throw new Error("Nao foi possivel carregar os presets.");
  }
});
```

### Example 3: Preload Bridge Extension

```typescript
// Source: [VERIFIED: electron/preload.ts existing pattern]

// 1. Add to ALLOWED_INVOKE_CHANNELS:
"presets:list",
"presets:save",
"presets:rename",
"presets:delete",

// 2. Add to api object:
presets: {
  list: (): Promise<TestPreset[]> =>
    safeInvoke("presets:list") as Promise<TestPreset[]>,
  save: (preset: { id?: string; name: string; configJson: string }): Promise<TestPreset> =>
    safeInvoke("presets:save", preset) as Promise<TestPreset>,
  rename: (id: string, newName: string): Promise<boolean> =>
    safeInvoke("presets:rename", id, newName) as Promise<boolean>,
  delete: (id: string): Promise<boolean> =>
    safeInvoke("presets:delete", id) as Promise<boolean>,
},
```

### Example 4: Store Extension for Active Preset

```typescript
// Source: [VERIFIED: src/stores/test-store.ts existing pattern]

// Add to TestState interface:
/** Preset ativo atualmente carregado (null = nenhum). */
activePreset: { id: string; name: string; isBuiltin: boolean } | null;

/** Lista de presets carregados do banco. */
presets: TestPreset[];

// Add to TestActions interface:
/** Define o preset ativo. */
setActivePreset: (preset: { id: string; name: string; isBuiltin: boolean } | null) => void;

/** Substitui a lista de presets. */
setPresets: (presets: TestPreset[]) => void;

// Add to ESTADO_INICIAL:
activePreset: null,
presets: [],

// Add to create<TestStore>:
setActivePreset: (preset) => set({ activePreset: preset }),
setPresets: (presets) => set({ presets }),
```

### Example 5: Built-in Config JSON (for migration SQL)

```typescript
// This JSON must be generated once from buildMistertOperations() and pasted
// as a static string in the migration. DO NOT import at runtime.
// Source: [VERIFIED: src/constants/test-presets.ts]

const BUILTIN_CONFIG: TestConfig = {
  url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
  virtualUsers: 150,
  duration: 60,
  method: "GET",
  operations: [
    {
      name: "Pagina de Login",
      url: "https://dev-mistert.compex.com.br/MisterT.asp?MF=Y",
      method: "GET",
      captureSession: true,
      extract: { CTRL: "CTRL=(\\d+)" }
    },
    // ... all 10 operations serialized here
  ]
};
// JSON.stringify(BUILTIN_CONFIG) generates the inline string for the SQL INSERT
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded operations in store CONFIG_PADRAO | SQLite-persisted presets with built-in seed | Phase 3 (this phase) | Users can save/reuse configurations across sessions |
| Single environment hardcoded | Environment selector + URL replacement | Already exists (Phase 2) | Preset URL replacement leverages existing pattern |

**Deprecated/outdated:**
- `CONFIG_PADRAO` in `test-store.ts` currently hardcodes MisterT operations as the default config. After Phase 3, the default config will still initialize from `buildMistertOperations()`, but the preset system provides an explicit mechanism for loading configurations. `CONFIG_PADRAO` remains as the initial form state -- it does NOT become the built-in preset (the built-in is in SQLite).

## Assumptions Log

> List all claims tagged [ASSUMED] in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `uuid` v4 should be used for preset IDs (same as test result IDs) | Architecture Patterns | LOW -- could use any unique ID scheme; v4 UUID is already established in the codebase |
| A2 | The built-in preset should use `virtualUsers: 150` and `duration: 60` matching current CONFIG_PADRAO defaults | Code Examples | LOW -- the exact defaults for VUs/duration in the built-in preset were not explicitly specified in CONTEXT.md; using the same values as CONFIG_PADRAO is reasonable |
| A3 | `presets:save` should handle both insert (new) and update (existing) via a single channel | Architecture Patterns | LOW -- could split into two channels but one is simpler and follows the "Save + Save As" flow from D3 |

**If this table is empty:** N/A -- three low-risk assumptions identified above.

## Open Questions

1. **Active Preset Tracking After Test Execution**
   - What we know: When a user loads a preset and modifies config values (e.g., changes VUs), the config diverges from the preset.
   - What's unclear: Should `activePreset` be cleared when the user manually changes any config field? Or does it persist until another preset is loaded?
   - Recommendation: Clear `activePreset` when `updateConfig` is called with changes that differ from the loaded preset config. This is simpler to implement: just clear on any manual config change. The UI spec shows the active preset indicator on cards, so the user can re-load if needed.

2. **Built-in Preset Default VUs/Duration**
   - What we know: CONTEXT.md D1 says the preset persists the full TestConfig. The current CONFIG_PADRAO uses 150 VUs and 60s.
   - What's unclear: Should the built-in preset lock specific VU/duration values, or leave them as "suggested defaults"?
   - Recommendation: Store 150 VUs and 60s in the built-in (matching CONFIG_PADRAO). User can modify after loading. This is the most natural UX -- load preset, adjust parameters, run.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured |
| Config file | none |
| Quick run command | `npm run build` (type-check + build verifies compilation) |
| Full suite command | `npm run build` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRESET-01 | Built-in "MisterT Completo" appears on first launch | manual-only | Manual: open app, click "Presets", verify built-in card visible | N/A |
| PRESET-01 | Applying built-in loads 10 operations correctly | manual-only | Manual: click "Carregar Preset" on built-in, verify 10 ops in form | N/A |
| PRESET-02 | Save current config as named preset | manual-only | Manual: configure test, click "Salvar Preset", enter name, verify in modal | N/A |
| PRESET-02 | Load, rename, delete user presets | manual-only | Manual: perform each CRUD operation, verify feedback toast | N/A |
| PRESET-02 | User presets persist after restart | manual-only | Manual: save preset, close app, reopen, verify preset still in list | N/A |

**Justification for manual-only:** No test framework is configured (CLAUDE.md convention #7). Build compilation (`npm run build`) validates TypeScript types and catches structural errors but cannot test runtime IPC or UI behavior.

### Sampling Rate
- **Per task commit:** `npm run build` (type check + build)
- **Per wave merge:** `npm run build` + manual smoke test
- **Phase gate:** Full manual test of all CRUD operations + persistence

### Wave 0 Gaps
- None -- no test infrastructure to add (project convention: no test runner)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A (presets don't involve auth) |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | Built-in presets protected via `is_builtin` flag in both UI and IPC handlers |
| V5 Input Validation | yes | Preset name validated (required, unique, reasonable length). config_json validated as parseable JSON. |
| V6 Cryptography | no | N/A (no encryption needed for preset data) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via preset name | Tampering | Prepared statements with parameterized queries (already used in repository.ts) [VERIFIED: codebase] |
| Malformed config_json injection | Tampering | JSON.parse validation before storage; TypeScript type checking on deserialized object |
| Built-in preset modification via direct IPC | Elevation of privilege | Server-side `is_builtin` check in rename/delete handlers before executing SQL |
| Path traversal in preset name | Tampering | Not applicable -- preset names are stored in SQLite, not used as filesystem paths |
| Oversized config_json payload | Denial of service | Enforce reasonable size limit on config_json (e.g., 1MB) in IPC handler |

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- electron/database/database.ts (migration pattern), electron/database/repository.ts (CRUD pattern), electron/preload.ts (IPC whitelist pattern), electron/main.ts (IPC handler pattern), src/components/WelcomeOverlay.tsx (modal pattern), src/components/Toast.tsx (feedback pattern), src/constants/test-presets.ts (10 operations source of truth), src/stores/test-store.ts (state management pattern), src/types/index.ts (type definitions)
- **CONTEXT.md** -- All 6 locked decisions (D1-D6) + 3 prior decisions
- **UI-SPEC.md** -- Component inventory, interaction contract, layout contract, copywriting contract
- **STATE.md** -- Critical constraints (4-file IPC rule, anti-import pattern, migration v3)

### Secondary (MEDIUM confidence)
- **CLAUDE.md** -- Project conventions and coding standards

### Tertiary (LOW confidence)
- None -- all claims verified against codebase or project artifacts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns verified in codebase
- Architecture: HIGH -- every pattern has a direct precedent in the existing code
- Pitfalls: HIGH -- derived from actual codebase constraints and established anti-patterns

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable -- no external dependency changes expected)
