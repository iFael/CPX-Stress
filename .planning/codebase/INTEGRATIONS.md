# External Integrations

**Analysis Date:** 2026-04-06

## APIs & External Services

**No runtime external API calls are made by the application itself.**

The app is a fully offline desktop tool. All HTTP requests are outbound stress-test requests made against user-configured target URLs — these are not integrations, they are the product's core function.

**GitHub Releases (postinstall only):**
- `better-sqlite3` prebuilt binary download from `https://github.com/WiseLibs/better-sqlite3/releases/`
  - Triggered by: `postinstall` npm lifecycle hook (`scripts/install-native.js`)
  - Timing: Development setup / `npm install` only; never at runtime
  - Auth: None (public GitHub releases)

## Data Storage

**Databases:**
- SQLite (via `better-sqlite3`)
  - Client: `better-sqlite3` ^11.9.0 — synchronous, no connection string, file-based
  - File location: `{userData}/stressflow-data/stressflow.db`
    - Windows: `%APPDATA%/stressflow/stressflow-data/stressflow.db`
    - macOS: `~/Library/Application Support/stressflow/stressflow-data/stressflow.db`
    - Linux: `~/.config/stressflow/stressflow-data/stressflow.db`
  - Initialization: `electron/database/database.ts` → `initDatabase(dataPath)`
  - Repository layer: `electron/database/repository.ts`
  - Tables: test results, per-second timeline, individual error records, per-operation metrics
  - Pragmas: WAL journal mode, NORMAL synchronous, 64MB cache, foreign keys ON

**Legacy JSON history:**
- `{userData}/stressflow-data/history.json` (migrated to SQLite on first run via `migrateFromJsonHistory`)
- Migration is one-way and automatic on app startup

**File Storage:**
- Local filesystem only
- PDF reports: `{userData}/stressflow-data/reports/` directory
- Files written via `electron/main.ts` IPC handler `pdf:save`; path traversal prevention enforced via `assertPathWithinDirectory`
- JSON exports: user-chosen path via Electron `dialog.showSaveDialog` (IPC handler `json:export`)

**Caching:**
- None (no in-memory or external cache layer)

## Authentication & Identity

**Auth Provider:** None
- No user accounts, no authentication, no session management
- The app runs fully locally without any identity layer

## Monitoring & Observability

**Error Tracking:** None
- No Sentry, Datadog, or similar integration
- Errors are logged to `console.error` in the Electron main process only

**Logs:**
- `console.log` / `console.error` in main process with `[StressFlow]` prefix
- No structured logging, no log file output
- Uncaught exceptions and unhandled promise rejections are caught globally in `electron/main.ts` and logged to console

## CI/CD & Deployment

**Hosting:** Local desktop app — no server hosting
- Distributed as: NSIS installer (Windows `.exe`), DMG (macOS), AppImage/DEB (Linux)
- Output directory: `release/` (via `electron-builder`)

**CI Pipeline:**
- GitHub Actions workflow present (`.github/` directory inferred from repo structure)
- `npm run verify` script orchestrates: `lint` → `format:check` → `typecheck` → `build` → `audit:ssrf` → `audit:engine`

## Environment Configuration

**Required env vars at runtime:** None required for standard operation.

**Optional env vars (`.env` file):**
- Format: `STRESSFLOW_<KEY>=<VALUE>` (only `STRESSFLOW_`-prefixed vars are resolved)
- Location: app root (dev) or `{userData}` (production)
- Purpose: inject credentials/tokens into test HTTP headers/body via `{{STRESSFLOW_KEY}}` placeholders in test config
- Security: resolved exclusively in the Electron main process before passing config to the stress engine; never exposed to renderer

**Build-time env vars:**
- `VITE_DEV_SERVER_URL` - Set by Vite in development mode; signals the main process to load from dev server instead of bundled files
- `DIST_ELECTRON`, `DIST`, `VITE_PUBLIC` - Path resolution vars set by `electron/main.ts` at startup

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None (the stress test HTTP calls are user-configurable, not hardcoded integrations)

## IPC Bridge (Internal — Electron Main ↔ Renderer)

This is the primary "integration" surface within the app. All renderer-to-system communication goes through `window.stressflow` (defined in `electron/preload.ts`, exposed via `contextBridge`).

**Invoke channels (request/response):**
| Channel | Purpose |
|---|---|
| `test:start` | Start stress test with config |
| `test:cancel` | Cancel running test |
| `history:list` | List all saved test results |
| `history:get` | Get single result by ID |
| `history:delete` | Delete result by ID |
| `history:clear` | Clear all results |
| `pdf:save` | Save base64 PDF to disk |
| `pdf:open` | Open saved PDF in OS default viewer |
| `json:export` | Export JSON with save dialog |
| `app:getPath` | Get app data directory path |
| `errors:search` | Paginated error query with filters |
| `errors:byStatusCode` | Error counts grouped by HTTP status |
| `errors:byErrorType` | Error counts grouped by type |

**Receive channels (server-push events):**
| Channel | Purpose |
|---|---|
| `test:progress` | Real-time progress data during test execution |

---

*Integration audit: 2026-04-06*
