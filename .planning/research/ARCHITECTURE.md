# Architecture Patterns

**Project:** CPX-MisterT Stress
**Researched:** 2026-04-06
**Scope:** Preset/template system, error analytics enhancements, credentials setup UI

---

## Context: What Already Exists

Before mapping what to build, it is critical to record what is already done and functional,
because several of the milestone requirements are partially or fully implemented.

### Already Implemented (Do Not Rebuild)

| Capability | Location | Status |
|---|---|---|
| Error search IPC: `errors:search`, `errors:byStatusCode`, `errors:byErrorType` | `electron/preload.ts`, `electron/main.ts`, `electron/database/repository.ts` | Fully working |
| `ErrorExplorer` component with pagination + status/type filters | `src/components/ErrorExplorer.tsx` | Fully working |
| `.env` loading and `{{STRESSFLOW_*}}` placeholder resolution | `electron/main.ts` (`loadEnvFile`, `resolveEnvPlaceholders`) | Fully working |
| MisterT 10-operation template | `src/constants/test-presets.ts` (`buildMistertOperations`) | Hard-coded constant, not user-configurable |
| SQLite schema v2 + versioned migrations | `electron/database/database.ts` | Active; next migration is v3 |
| IPC bridge with whitelist + `safeInvoke` / `safeOnReceive` | `electron/preload.ts` | Pattern established; extend by addition only |
| Zustand store with `config`, `history`, `status`, `progress`, `timeline`, `currentResult` | `src/stores/test-store.ts` | Active; extend by addition only |

---

## Recommended Architecture

The three new features — preset system, error analytics enhancements, and credentials setup — map
cleanly onto the existing dual-process architecture. They are additive. Nothing about the existing
security model (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) needs to change.

### Component Boundaries for New Features

```
electron/
  main.ts                      ← add handlers: presets:*, credentials:*
  preload.ts                   ← extend ALLOWED_INVOKE_CHANNELS; add presets/credentials api groups
  database/
    database.ts                ← migration v3: test_presets table
    repository.ts              ← add preset CRUD; extend searchErrors with operationName + timestamp range

src/
  types/index.ts               ← add TestPreset type; extend Window.stressflow declaration
  stores/test-store.ts         ← add presets slice + hasCredentials flag
  constants/test-presets.ts    ← unchanged (static template remains as seeding source)
  components/
    PresetPanel.tsx            ← NEW: browse / apply / save / delete named presets
    CredentialsSetup.tsx       ← NEW: form for STRESSFLOW_* key/value entry (masked inputs)
    ErrorExplorer.tsx          ← EXTEND: add operationName filter + timestamp range filter
    ErrorAnalytics.tsx         ← NEW: cross-test error analytics view (separate from per-test ErrorExplorer)
    Sidebar.tsx                ← EXTEND: add 'erros' navigation entry
  App.tsx                      ← EXTEND: add 'errors' route case in view switch
```

### Data Flow for New Features

#### Feature A — Preset System

```
1. App startup (App.tsx useEffect)
      → window.stressflow.presets.list()
      → IPC: presets:list
      → listPresets() in repository.ts
      → useTestStore.setPresets(presets)

2. User opens PresetPanel → reads presets from store (no IPC call)

3. User clicks "Aplicar" on a preset
      → buildMistertOperations(preset.baseUrl) replaces URL placeholders
      → useTestStore.updateConfig({ operations, url, virtualUsers, duration, rampUp })
      → navigates to 'test' view

4. User clicks "Salvar configuração atual como preset"
      → PresetPanel calls window.stressflow.presets.save({ name, config })
      → IPC: presets:save
      → savePreset() inserts into test_presets
      → returns new TestPreset row
      → useTestStore.addPreset(newPreset)

5. User deletes a preset
      → window.stressflow.presets.delete(id)
      → IPC: presets:delete
      → deletePreset(id)
      → useTestStore.removePreset(id)
```

**Seeding:** On first run after migration v3, if `SELECT COUNT(*) FROM test_presets` = 0,
auto-insert the MisterT 10-operation template as a built-in preset named "MisterT ERP — Fluxo Completo".
This seed runs inside `initDatabase()` after `applyMigrations()`. The seed uses
`MISTERT_OPERATIONS_TEMPLATE` from `src/constants/test-presets.ts` — but since that file is in `src/`,
it cannot be imported from `electron/`. Embed the static template JSON directly in `database.ts`
or accept the seed runs from `main.ts` after `initDatabase()` via a dedicated `seedDefaultPresets()`.

Recommendation: Add `seedDefaultPresets(dataPath: string)` to `electron/database/repository.ts`
and call it from `initializeDatabase()` in `main.ts` after `initDatabase()`. The seed embeds
the operations JSON inline — small, stable, no cross-process import needed.

#### Feature B — Error Analytics Enhancements

The existing `errors:search` IPC channel already supports `testId`, `statusCode`, `errorType`,
`limit`, and `offset`. Two parameters are missing for the full requirement:
`operationName?: string` and `timestampFrom?: number`, `timestampTo?: number`.

These additions are entirely in-process (repository + type declarations only):

```
searchErrors({ testId, statusCode, errorType, operationName, timestampFrom, timestampTo,
               limit, offset })
    → adds WHERE operation_name = ? (when operationName provided)
    → adds WHERE timestamp >= ? AND timestamp <= ? (when range provided)
    → existing index idx_test_errors_timestamp already covers this efficiently
```

The cross-test dedicated view (`ErrorAnalytics.tsx`) differs from the inline `ErrorExplorer`:

```
ErrorExplorer  → scoped to one testId, embedded inside TestResults view
ErrorAnalytics → no testId constraint, searchable across all tests,
                  accessible from sidebar as standalone 'errors' view
```

`ErrorAnalytics` calls `errors:search` without `testId` (already valid; testId is optional
in the existing implementation). It adds a test-selector dropdown populated from
`useTestStore((s) => s.history)` so the user can optionally scope to a test.

#### Feature C — Credentials Setup

Security constraint: the renderer MUST NEVER see credential values. The design handles this:

```
credentials:hasCredentials
    → reads userData/.env, returns boolean (any STRESSFLOW_* key exists with non-empty value)
    → renderer uses this to decide whether to show the setup prompt

credentials:load
    → reads userData/.env, returns ONLY key names: string[]
    → example: ["STRESSFLOW_USER", "STRESSFLOW_PASS", "STRESSFLOW_BASE_URL"]
    → renderer knows which keys are set (to pre-check form fields) but never sees values

credentials:save
    → receives entries: Array<{ key: string; value: string }>
    → VALIDATES: key must match /^STRESSFLOW_\w+$/ — reject anything else
    → merges with existing .env (preserves non-STRESSFLOW keys and comments)
    → writes to path.join(app.getPath("userData"), ".env") (production target)
    → reloads envVars = loadEnvFile() in memory
    → returns { saved: number; path: string }
```

Write strategy for `.env` merging:
1. Read existing `.env` if present; parse all lines
2. For each line, if key matches a key in the incoming save, replace its value
3. For keys in the incoming save not present in the file, append them
4. Write the result back with `fs.writeFileSync` (atomic on the OS level for small files)

This preserves any manually added non-`STRESSFLOW_` keys and any comments the user may have placed.

After a successful `credentials:save`, the main process must call `envVars = loadEnvFile()` to
update the in-memory cache. Otherwise the next test run would still use the old values.

First-run flow in renderer:
```
App.tsx useEffect (after history load)
    → window.stressflow.credentials.hasCredentials()
    → if false → navigate to 'credentials' view (or show a modal banner)
    → user fills form and submits
    → credentials:save succeeds
    → navigate to 'test' view
```

Add `'credentials'` as a new `AppView` type in `src/types/index.ts`. Alternatively,
keep it as a modal overlay triggered from the sidebar and avoid adding a new route.
The modal approach is simpler — `CredentialsSetup` renders over the 'test' view with a
backdrop, keeping `AppView` minimal.

---

## Patterns to Follow

### Pattern 1: Additive IPC Extension

Every new IPC channel follows the same four-file checklist from `CLAUDE.md`:

```
1. Add to ALLOWED_INVOKE_CHANNELS in electron/preload.ts
2. Expose function in the api object in electron/preload.ts
3. Add TypeScript declaration to Window.stressflow in src/types/index.ts
4. Register ipcMain.handle('channel:name', handler) in electron/main.ts
```

Follow this strictly. No shortcuts. All four must be updated atomically per channel.

### Pattern 2: Synchronous better-sqlite3 Wrapped in Async IPC Handler

`better-sqlite3` is synchronous by design. All existing IPC handlers in `main.ts` are marked
`async` even when calling synchronous DB methods. Follow this convention:

```typescript
// Correct — matches existing handlers in main.ts
ipcMain.handle("presets:list", async () => {
  try {
    return listPresets();           // synchronous better-sqlite3 call
  } catch (error) {
    throw new Error("Não foi possível listar os presets.");
  }
});
```

### Pattern 3: Paginated SQLite Query via IPC

The `errors:search` pattern is the reference for all paginated queries:
- Always return `{ records: T[]; total: number }`
- Cap `limit` server-side: `Math.min(params.limit || 50, 500)`
- `total` from a separate `SELECT COUNT(*)` with the same WHERE clause
- The renderer increments `offset` by `limit` per page — no cursor needed

This pattern is established and working in `ErrorExplorer.tsx`. Replicate it directly
for `ErrorAnalytics.tsx` without inventing a different pagination model.

### Pattern 4: Renderer Never Touches the Filesystem

All file reads and writes happen in the main process. The renderer sends data (or requests data)
via IPC and receives results. This includes:
- `.env` writes → `credentials:save` handler writes the file
- PDF writes → `pdf:save` handler writes the file
- Preset JSON → stored in SQLite, never a file the renderer accesses

Never use `fs` in `src/`. Never import `electron` in `src/`. These constraints are already
enforced by `contextIsolation: true` — adding such imports would fail at runtime.

### Pattern 5: Input Validation at IPC Entry

Every handler in `main.ts` validates its input before touching DB or filesystem:

```typescript
// Correct — matches existing validation pattern
ipcMain.handle("presets:save", async (_event, preset: unknown) => {
  if (!preset || typeof preset !== "object") {
    throw new Error("Dados do preset inválidos.");
  }
  // ... cast to known type after validation
});
```

For `credentials:save`, add an additional key whitelist check:
```typescript
if (!/^STRESSFLOW_\w+$/.test(entry.key)) {
  throw new Error(`Chave inválida: ${entry.key}`);
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Credentials in Zustand Store

**What:** Holding `STRESSFLOW_USER` or `STRESSFLOW_PASS` values in the renderer's Zustand store.
**Why bad:** The store is in the renderer process. Any value written to it is accessible to
the renderer's JavaScript context and potentially to DevTools inspection. This violates the
security constraint that the renderer never sees secret values.
**Instead:** The store may hold a `hasCredentials: boolean` (set after a successful save)
and a `credentialKeys: string[]` (key names only). Never store values.

### Anti-Pattern 2: Re-importing test-presets.ts from electron/

**What:** `import { buildMistertOperations } from "../src/constants/test-presets"` in main process files.
**Why bad:** This works in dev (Vite resolves it) but breaks in the packaged build because
`src/` is compiled to the renderer bundle, not available as a Node module in `dist-electron/`.
**Instead:** Embed the MisterT seed data as a static JSON object directly in
`electron/database/repository.ts`. It is a small, stable, never-changing constant.

### Anti-Pattern 3: Writing .env to the App Bundle Directory in Production

**What:** Writing credentials to `path.join(app.getAppPath(), ".env")` in packaged app.
**Why bad:** The app bundle is in a read-only directory on macOS and on Windows when installed
in `Program Files`. Writes will fail with EACCES.
**Instead:** Always write to `path.join(app.getPath("userData"), ".env")`. The existing
`loadEnvFile()` already checks both paths: it reads from `appPath/.env` first (dev) and
`userData/.env` second (production). Writing is always to `userData/.env`. No changes to the
read logic needed — the production path already wins if both exist because writes go there.

### Anti-Pattern 4: Blocking the Preset Panel with a Network Call

**What:** Fetching presets from SQLite on every render of `PresetPanel`.
**Why bad:** Causes visible flicker even though SQLite is local and fast. Every open of the panel
fires an IPC round-trip.
**Instead:** Load presets once at app startup (in `App.tsx useEffect`, alongside history load)
into the Zustand store. `PresetPanel` reads from the store — zero async work on open. Only
reload after a save or delete operation.

### Anti-Pattern 5: Scatter .env File Logic Across Handlers

**What:** Each credentials handler re-implements `.env` file read/parse.
**Why bad:** The existing `loadEnvFile()` already handles quoting, comment stripping, and
multi-path resolution. Duplicating it creates drift.
**Instead:** Add a new `saveEnvKeys(entries)` helper in `main.ts` alongside `loadEnvFile()`.
`credentials:save` calls `saveEnvKeys()` then `envVars = loadEnvFile()`.

---

## New Component Specifications

### `electron/database/database.ts` — Migration v3

```typescript
if (version < 3) {
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS test_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        config_json TEXT NOT NULL,    -- serialized TestConfig
        is_builtin INTEGER NOT NULL DEFAULT 0,  -- 1 = seeded, cannot delete
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    database.prepare("INSERT INTO schema_version (version) VALUES (?)").run(3);
  })();
}
```

### `electron/database/repository.ts` — New Preset Functions

```typescript
export interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  config_json: string;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

export function listPresets(): PresetRow[]
export function savePreset(preset: Omit<PresetRow, "created_at" | "updated_at">): void
export function deletePreset(id: string): boolean  // refuses if is_builtin = 1
export function hasAnyPreset(): boolean             // used for seeding check
```

Extended `searchErrors` signature:
```typescript
export function searchErrors(params: {
  testId?: string;
  statusCode?: number;
  errorType?: string;
  operationName?: string;   // NEW
  timestampFrom?: number;   // NEW — Unix ms
  timestampTo?: number;     // NEW — Unix ms
  limit?: number;
  offset?: number;
}): { records: ErrorRow[]; total: number }
```

### `src/types/index.ts` — New Types

```typescript
export interface TestPreset {
  id: string;
  name: string;
  description?: string;
  config: TestConfig;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Extend `Window.stressflow`:
```typescript
presets: {
  list: () => Promise<TestPreset[]>;
  save: (preset: { id?: string; name: string; description?: string; config: TestConfig }) => Promise<TestPreset>;
  delete: (id: string) => Promise<boolean>;
};

credentials: {
  hasCredentials: () => Promise<boolean>;
  load: () => Promise<string[]>;    // key names only
  save: (entries: Array<{ key: string; value: string }>) => Promise<{ saved: number; path: string }>;
};
```

Also extend `errors.search` params:
```typescript
search: (params: {
  testId?: string;
  statusCode?: number;
  errorType?: string;
  operationName?: string;   // NEW
  timestampFrom?: number;   // NEW
  timestampTo?: number;     // NEW
  limit?: number;
  offset?: number;
}) => Promise<{ records: ErrorRecord[]; total: number }>;
```

### `src/stores/test-store.ts` — New State Slices

```typescript
// Add to TestState:
presets: TestPreset[];
hasCredentials: boolean;

// Add to TestActions:
setPresets: (presets: TestPreset[]) => void;
addPreset: (preset: TestPreset) => void;
removePreset: (id: string) => void;
setHasCredentials: (has: boolean) => void;
```

### `src/App.tsx` — Startup Bootstrap Extension

```typescript
useEffect(() => {
  // Existing: load history
  window.stressflow.history.list().then(setHistory);
  // Add: load presets
  window.stressflow.presets.list().then(setPresets);
  // Add: check credentials
  window.stressflow.credentials.hasCredentials().then(setHasCredentials);
}, []);
```

---

## Scalability Considerations

| Concern | Current | With 3 New Features |
|---|---|---|
| Presets table size | N/A | Up to ~50 presets; config_json ~5 KB each = negligible |
| Error analytics query speed | Indexed on test_id, status_code, error_type, timestamp | Adding operationName filter uses no index — acceptable for internal tool (max 10k errors per test) |
| Credentials file | N/A | Single small .env file; only 3-5 keys; no scalability concern |
| Preset panel load time | N/A | Loaded at startup with history; <1ms SQLite read |

The `operation_name` column in `test_errors` is not currently indexed. Adding a filter on it
without an index will do a full scan of the test's error rows. With the 10,000-error cap,
this is acceptable for an internal tool. If it becomes slow, add:
```sql
CREATE INDEX idx_test_errors_operation ON test_errors(test_id, operation_name)
```
as part of a future migration v4.

---

## Suggested Build Order

Dependencies drive this order:

### Step 1: Credentials Setup (foundation — unblocks everything)

**Why first:** The team cannot run tests against MisterT without `STRESSFLOW_USER` and
`STRESSFLOW_PASS` being set. Today they must manually edit `.env` files. This blocks
non-technical team members from using the tool. No other feature depends on it, but it
depends on nothing — lowest risk, highest immediate value.

**Scope:**
- `electron/main.ts` — 3 new handlers (`credentials:hasCredentials`, `credentials:load`, `credentials:save`) + `saveEnvKeys()` helper
- `electron/preload.ts` — add 3 channels + `credentials` api group
- `src/types/index.ts` — add `credentials` to `Window.stressflow`
- `src/components/CredentialsSetup.tsx` — new form component (modal overlay pattern)
- `src/stores/test-store.ts` — add `hasCredentials` slice
- `src/App.tsx` — bootstrap check + conditional first-run overlay

### Step 2: Preset System (reduces friction for recurring tests)

**Why second:** Depends on credentials working (the preset includes `baseUrl` that should
match the configured environment). Builds on the SQLite migration pattern already established.
The static `buildMistertOperations()` becomes the seed source.

**Scope:**
- `electron/database/database.ts` — migration v3 (`test_presets` table)
- `electron/database/repository.ts` — `listPresets`, `savePreset`, `deletePreset`, `hasAnyPreset`, `seedDefaultPresets`
- `electron/main.ts` — 3 new handlers + call `seedDefaultPresets()` at init
- `electron/preload.ts` — add 3 channels + `presets` api group
- `src/types/index.ts` — `TestPreset` interface + `presets` in `Window.stressflow`
- `src/stores/test-store.ts` — `presets` slice + 3 actions
- `src/components/PresetPanel.tsx` — new component
- `src/App.tsx` — presets bootstrap in startup effect

### Step 3: Error Analytics Enhancements (observability layer)

**Why third:** The current `ErrorExplorer` already works for post-test analysis. The
enhancements (operationName + timestamp filters + cross-test view) add observability but
do not block the core usage loop. This step has the most UI scope.

**Scope:**
- `electron/database/repository.ts` — extend `searchErrors` with 3 new params
- `electron/preload.ts` — update `errors:search` params type (backwards compatible — new params are optional)
- `src/types/index.ts` — extend `errors.search` signature
- `src/components/ErrorExplorer.tsx` — add operationName dropdown + date range inputs (extends existing component)
- `src/components/ErrorAnalytics.tsx` — new top-level cross-test view
- `src/types/index.ts` — add `'errors'` to `AppView` union
- `src/components/Sidebar.tsx` — add 'Análise de Erros' navigation entry
- `src/App.tsx` — add `'errors'` case in view router

---

## Integration Points With Existing Code

| New code | Touches | How |
|---|---|---|
| Migration v3 | `database.ts applyMigrations()` | Add `if (version < 3)` block after existing `if (version < 2)` |
| `seedDefaultPresets()` | `main.ts initializeDatabase()` | Call after `migrateFromJsonHistory(dataPath)` |
| Preset IPC handlers | `main.ts` | Append after `errors:byErrorType` handler block |
| Credentials IPC handlers | `main.ts` | Append after preset handlers; also modify module-level `envVars` reload |
| `errors:search` extension | `repository.ts searchErrors()` | Add optional conditions to existing WHERE builder — backwards compatible |
| `PresetPanel` | `src/components/TestConfig.tsx` or standalone | Recommend as sidebar-accessible panel, not embedded in TestConfig form |
| `CredentialsSetup` | `src/App.tsx` | Conditional render based on `hasCredentials` store flag |
| `ErrorAnalytics` | `src/App.tsx` view router | New case `view === 'errors'` |

The `errors:search` extension is the only modification to a working IPC call. Because all three
new params (`operationName`, `timestampFrom`, `timestampTo`) are optional with no defaults,
existing callers (`ErrorExplorer.tsx`) will continue working unchanged. This is safe.

---

## Security Checklist for Credentials Feature

- [ ] `credentials:load` returns `string[]` (key names) — never values
- [ ] `credentials:save` validates each key against `/^STRESSFLOW_\w+$/` before writing
- [ ] `.env` is written only to `userData` path — never to app bundle
- [ ] After successful save, `envVars = loadEnvFile()` is called to update in-memory cache
- [ ] `CredentialsSetup.tsx` uses `type="password"` inputs for STRESSFLOW_PASS
- [ ] No credential value ever passes through the IPC bridge in either direction
- [ ] Key names in the renderer are used only for display ("Senha configurada: sim/não")

---

## Sources

- Codebase direct analysis: `electron/preload.ts`, `electron/main.ts`, `electron/database/database.ts`, `electron/database/repository.ts`, `src/types/index.ts`, `src/stores/test-store.ts`, `src/constants/test-presets.ts`, `src/components/ErrorExplorer.tsx` (all read 2026-04-06)
- Architecture doc: `.planning/codebase/ARCHITECTURE.md` (2026-04-06)
- Structure doc: `.planning/codebase/STRUCTURE.md` (2026-04-06)
- Project doc: `.planning/PROJECT.md` (2026-04-06)
- Confidence: HIGH — all findings derived from direct source code inspection, not assumptions

---

*Research: 2026-04-06*
