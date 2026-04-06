# Architecture

**Analysis Date:** 2026-04-06

## Pattern Overview

**Overall:** Electron Dual-Process Architecture with IPC Bridge

**Key Characteristics:**
- Strict process isolation: renderer (React) has no direct Node.js access
- All cross-process communication funneled through a typed, whitelisted IPC bridge at `window.stressflow`
- Single Zustand store as the single source of truth for all renderer state
- SQLite persistence in the main process; renderer never touches disk directly
- Worker threads in the main process for concurrent HTTP load generation

## Layers

**Main Process (Electron):**
- Purpose: OS-level operations — window management, HTTP test execution, file I/O, SQLite persistence
- Location: `electron/`
- Contains: IPC handlers, StressEngine orchestrator, SQLite database, worker threads
- Depends on: Node.js built-ins (`http`, `https`, `fs`, `path`, `worker_threads`), `better-sqlite3`, `uuid`
- Used by: Renderer process via IPC channels only

**IPC Bridge (Preload):**
- Purpose: Secure, typed surface between main and renderer; exposes `window.stressflow`
- Location: `electron/preload.ts`
- Contains: Channel whitelist, `safeInvoke` / `safeOnReceive` helpers, `contextBridge.exposeInMainWorld`
- Depends on: Electron `contextBridge`, `ipcRenderer`
- Used by: Renderer (all `window.stressflow.*` calls)

**Renderer Process (React App):**
- Purpose: UI — configuration, real-time progress display, results visualization
- Location: `src/`
- Contains: React components, Zustand store, services (PDF), hooks, types, constants
- Depends on: `window.stressflow` bridge exclusively; never imports from `electron/`
- Used by: End user

**Engine (Stress Test Core):**
- Purpose: Orchestrate virtual users, dispatch HTTP requests via worker threads, aggregate metrics
- Location: `electron/engine/stress-engine.ts`, `electron/engine/stress-worker.ts`
- Contains: VU lifecycle, ramp-up logic, per-second metric aggregation, worker pool management
- Depends on: `electron/engine/protection-detector.ts`, `electron/engine/cookie-jar.ts`, `src/shared/test-analysis.ts`

**Database Layer:**
- Purpose: Persist test results and individual error records in SQLite
- Location: `electron/database/database.ts`, `electron/database/repository.ts`
- Contains: `initDatabase`, `applyMigrations`, CRUD prepared statements, batch error insert
- Depends on: `better-sqlite3`
- Used by: `electron/main.ts` IPC handlers

**Shared Utilities:**
- Purpose: Business logic usable in both main and renderer processes
- Location: `src/shared/test-analysis.ts`
- Contains: `MeasurementReliability` types and scoring logic, `round2` helper
- Imported by: `electron/engine/stress-engine.ts` AND `src/types/index.ts`

## Data Flow

**Test Execution (Happy Path):**

1. User fills form in `TestConfig` component → calls `useTestStore.updateConfig(partial)`
2. User clicks "Iniciar" → `TestConfig` calls `window.stressflow.test.start(config)`
3. `electron/main.ts` handler `test:start` receives config, resolves `{{STRESSFLOW_*}}` env placeholders via `resolveConfigPlaceholders()`, validates with `validateTestConfig()`
4. `new StressEngine()` is created; `.run(config, progressCallback, errorFlushCallback)` starts
5. Engine spawns worker threads (`stress-worker.ts`) per virtual user; ramp-up adds VUs gradually if `config.rampUp` is set
6. Every second, `progressCallback` fires → `mainWindow.webContents.send("test:progress", progress)`
7. Renderer `test:progress` event → `useTestStore.setProgress(data)` → `TestProgress` component re-renders with live metrics
8. Error flush batches are written to `test_errors` SQLite table in near-real-time via `saveErrorBatch()`
9. On completion, `StressEngine.run()` resolves with `TestResult` → `saveTestResult()` persists to `test_results` table
10. `TestResult` is returned through IPC to renderer → `useTestStore.setCurrentResult(result)` + `addToHistory(result)` → view switches to `TestResults`

**History Load (Startup):**

1. `App.tsx` `useEffect` fires on mount → `window.stressflow.history.list()`
2. `history:list` IPC handler calls `listTestResults()` from repository
3. Repository deserializes JSON columns back to full `TestResult` objects
4. Renderer receives array → `useTestStore.setHistory(savedHistory)`
5. `HistoryPanel` renders the list; selecting an item calls `history:get(id)` and navigates to `view="results"`

**PDF Report Export:**

1. `TestResults` component triggers export → `src/services/pdf-generator.ts` builds PDF in-browser using `jsPDF`
2. PDF is serialized to base64 string → `window.stressflow.pdf.save(base64, filename)`
3. `pdf:save` IPC handler validates path traversal, checks size limit (50 MB), writes to `userData/stressflow-data/reports/`
4. Returns saved path → renderer calls `window.stressflow.pdf.open(path)` → `shell.openPath()`

**State Management:**

- All UI state lives in `useTestStore` (`src/stores/test-store.ts`)
- Components select individual slices: `useTestStore((s) => s.config)` — not the full store
- Timeline array uses `concat` (not spread) to avoid copying large arrays on each per-second update
- `clearProgress()` resets progress and timeline when starting a new test

## Key Abstractions

**StressEngine:**
- Purpose: Orchestrates the entire load test lifecycle
- Location: `electron/engine/stress-engine.ts`
- Pattern: Class with `.run(config, onProgress, onErrorFlush)` and `.cancel()` methods; uses worker threads for concurrency

**CookieJar:**
- Purpose: Per-VU session cookie storage for multi-operation tests (e.g., ASP Classic sessions)
- Location: `electron/engine/cookie-jar.ts`
- Pattern: Map of VU ID → cookie store; `captureSession: true` on a `TestOperation` activates it

**ProtectionDetector:**
- Purpose: Analyze HTTP response samples to detect WAF, CDN, rate limiting, anti-bot protections
- Location: `electron/engine/protection-detector.ts`
- Pattern: Stateless analyzer; receives `ResponseSample[]`, returns `ProtectionReport`

**TestStore:**
- Purpose: Single source of truth for all renderer state
- Location: `src/stores/test-store.ts`
- Pattern: Zustand `create<TestStore>()` with typed state + action interfaces; exported as `useTestStore` hook

**IPC Bridge (`window.stressflow`):**
- Purpose: Typed API surface for renderer → main communication
- Defined in: `electron/preload.ts` (implementation), `src/types/index.ts` (TypeScript declaration)
- Pattern: Namespace-grouped (`test`, `history`, `pdf`, `json`, `app`, `errors`); all async returning Promises

**Response Extraction:**
- Purpose: Capture dynamic tokens from HTTP responses (e.g., MisterT's `CTRL` param) for subsequent operations
- Location: `TestOperation.extract` field (regex), resolved inside `StressEngine`
- Pattern: Per-VU variable map; `{{VAR_NAME}}` placeholders in `url`, `body`, `headers` of later operations

## Entry Points

**Electron Main Process:**
- Location: `electron/main.ts`
- Triggers: Electron `app.whenReady()` event
- Responsibilities: Load `.env`, initialize SQLite, create `BrowserWindow`, register all IPC handlers

**React Renderer:**
- Location: `src/main.tsx`
- Triggers: Loaded by Electron's `BrowserWindow.loadURL` / `loadFile`
- Responsibilities: Mount `<App />` into DOM, set up React root

**Root Component:**
- Location: `src/App.tsx`
- Triggers: React render
- Responsibilities: Load history on mount, register keyboard shortcuts, route views via `(view, status)` state combination

**Worker Thread:**
- Location: `electron/engine/stress-worker.ts`
- Triggers: `new Worker(...)` from `StressEngine`
- Responsibilities: Execute individual HTTP requests for a batch of virtual users, report results back via `parentPort`

## Error Handling

**Strategy:** Layered — engine errors translate to user-friendly Portuguese messages before reaching the renderer

**Patterns:**
- `traduzirErro()` in `electron/main.ts` maps Node.js error codes (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, etc.) to human-readable pt-BR strings
- IPC handlers wrap all operations in try/catch; errors are re-thrown as `new Error(friendlyMessage)` so the renderer receives a localized message
- `process.on("uncaughtException")` and `process.on("unhandledRejection")` prevent silent crashes in the main process
- `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) catches React render errors in the renderer
- `useTestStore.setError(msg)` stores error messages for display in UI without crashing

## Cross-Cutting Concerns

**Logging:** `console.error` / `console.warn` with `[StressFlow]` prefix throughout main process; no structured logging library

**Validation:**
- Config validated by `validateTestConfig()` in `electron/engine/stress-engine.ts` before test starts
- Path traversal prevented by `assertPathWithinDirectory()` for all file write/open operations
- IPC input types checked at handler entry (null checks, `typeof` guards)

**Authentication / Secrets:**
- `.env` file loaded at startup; only `STRESSFLOW_*` prefixed keys are resolved
- Placeholder injection happens server-side in main process — renderer never sees secret values
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on `BrowserWindow`

**Measurement Reliability:**
- `src/shared/test-analysis.ts` provides `MeasurementReliability` scoring
- Engine self-monitors: detects client saturation, reservoir sampling activation, duration overrun
- Results include `measurementReliability` and `operationalWarnings` fields

---

*Architecture analysis: 2026-04-06*
