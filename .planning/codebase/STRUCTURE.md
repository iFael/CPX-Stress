# Codebase Structure

**Analysis Date:** 2026-04-06

## Directory Layout

```
CPX-MisterT Stress/
├── electron/                      # Main process (Node.js / Electron)
│   ├── main.ts                    # App entry point, IPC handlers, window, lifecycle
│   ├── preload.ts                 # Context bridge — exposes window.stressflow to renderer
│   ├── engine/
│   │   ├── stress-engine.ts       # HTTP load test orchestrator (VU lifecycle, metrics)
│   │   ├── stress-worker.ts       # Worker thread for parallel HTTP requests
│   │   ├── protection-detector.ts # WAF / CDN / rate-limit detection engine
│   │   └── cookie-jar.ts          # Per-VU session cookie management
│   └── database/
│       ├── database.ts            # SQLite init, migrations (better-sqlite3)
│       └── repository.ts          # CRUD prepared statements (test_results, test_errors)
├── src/                           # Renderer process (React app)
│   ├── main.tsx                   # React DOM entry point
│   ├── App.tsx                    # Root component — view routing, history load
│   ├── index.css                  # Tailwind directives + global styles
│   ├── env.d.ts                   # Vite environment type declarations
│   ├── components/                # React UI components
│   │   ├── Layout.tsx             # App shell (header + content area)
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── TestConfig.tsx         # Test configuration form
│   │   ├── TestProgress.tsx       # Real-time test progress display
│   │   ├── TestResults.tsx        # Test results view (container)
│   │   ├── ResultsSummary.tsx     # Summary metrics cards
│   │   ├── MetricsChart.tsx       # Recharts-based metrics charts
│   │   ├── MetricCard.tsx         # Individual metric display card
│   │   ├── ProtectionReport.tsx   # Server protection analysis view
│   │   ├── HistoryPanel.tsx       # Test history list
│   │   ├── InfoTooltip.tsx        # Tooltip wrapper component
│   │   ├── ErrorBoundary.tsx      # React error boundary
│   │   ├── ErrorExplorer.tsx      # Detailed error drill-down (SQLite query)
│   │   ├── Toast.tsx              # Toast notification system
│   │   ├── StarField.tsx          # Animated star background
│   │   ├── WelcomeOverlay.tsx     # First-run welcome screen
│   │   └── results-constants.ts   # Shared display constants for results views
│   ├── constants/
│   │   └── test-presets.ts        # MisterT ERP preset operations and default base URL
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts # Global keyboard shortcut handler
│   ├── services/
│   │   └── pdf-generator.ts       # jsPDF report generation (client-side)
│   ├── shared/
│   │   └── test-analysis.ts       # Shared logic used by both main and renderer
│   ├── stores/
│   │   └── test-store.ts          # Zustand global state store
│   ├── types/
│   │   └── index.ts               # All TypeScript type definitions + Window.stressflow declaration
│   └── assets/
│       └── compex-logo.gif        # Compex branding logo
├── resources/                     # Electron app resources
│   └── icon.gif                   # App window icon
├── scripts/                       # Utility / maintenance scripts
├── audit/                         # Load test audit resources
│   └── results/                   # Audit result outputs
├── openspec/                      # OpenSpec change management
│   ├── changes/                   # Active and archived change specs
│   │   └── archive/               # Completed/shipped changes
│   └── specs/                     # App-level specifications
├── .planning/                     # GSD planning documents
│   └── codebase/                  # Codebase analysis docs (this directory)
├── .github/
│   ├── workflows/                 # GitHub Actions CI pipelines
│   ├── prompts/                   # GitHub Copilot prompt files
│   └── skills/                    # OpenSpec skill definitions
├── dist/                          # Vite renderer build output (generated, not committed)
├── dist-electron/                 # Electron main process build output (generated, not committed)
├── tailwind.config.mjs            # Tailwind CSS config with sf-* color palette
├── vite.config.ts                 # Vite + Electron plugin config
├── tsconfig.json                  # TypeScript config for renderer (src/)
├── tsconfig.node.json             # TypeScript config for Node/Vite (electron/)
├── electron-builder.json5         # Electron Builder packaging config
└── package.json                   # Dependencies and npm scripts
```

## Directory Purposes

**`electron/`:**
- Purpose: Main process — everything requiring Node.js or OS access
- Contains: IPC handlers, load test engine, SQLite persistence, preload bridge
- Key files: `electron/main.ts`, `electron/preload.ts`

**`electron/engine/`:**
- Purpose: Core HTTP stress testing logic
- Contains: Engine orchestrator, worker thread, protection detector, cookie jar
- Key files: `electron/engine/stress-engine.ts`, `electron/engine/stress-worker.ts`

**`electron/database/`:**
- Purpose: SQLite data access layer
- Contains: Database initialization with versioned migrations, typed repository with prepared statements
- Key files: `electron/database/database.ts`, `electron/database/repository.ts`

**`src/components/`:**
- Purpose: All React UI components
- Contains: Page-level components (TestConfig, TestProgress, TestResults, HistoryPanel) and shared primitives (MetricCard, InfoTooltip, Toast)
- Note: `results-constants.ts` is a `.ts` file (not a component) co-located here for display constants shared across results views

**`src/stores/`:**
- Purpose: Global application state
- Contains: Single Zustand store with typed state and actions
- Key files: `src/stores/test-store.ts`

**`src/types/`:**
- Purpose: Centralized TypeScript type definitions
- Contains: All interfaces and types; also declares `Window.stressflow` global
- Key files: `src/types/index.ts`

**`src/shared/`:**
- Purpose: Business logic importable by both renderer and main process
- Contains: `MeasurementReliability` scoring, utility math functions
- Key files: `src/shared/test-analysis.ts`
- Note: This is the only `src/` directory imported by `electron/` code

**`src/constants/`:**
- Purpose: Application-level constants and preset configurations
- Contains: MisterT ERP operation templates, default base URL
- Key files: `src/constants/test-presets.ts`

**`src/hooks/`:**
- Purpose: Custom React hooks
- Contains: Global keyboard shortcuts hook
- Key files: `src/hooks/useKeyboardShortcuts.ts`

**`src/services/`:**
- Purpose: Non-UI service modules used by components
- Contains: PDF report generation with jsPDF
- Key files: `src/services/pdf-generator.ts`

**`openspec/`:**
- Purpose: Structured change management — feature specs before implementation
- Contains: Active changes in `changes/`, archived shipped changes in `changes/archive/`, app-level specs in `specs/`
- Generated: No | Committed: Yes

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents consumed by `/gsd-plan-phase` and `/gsd-execute-phase`
- Generated: Yes (by `/gsd-map-codebase`) | Committed: Yes

## Key File Locations

**Entry Points:**
- `electron/main.ts`: Electron main process start, IPC handler registration, window creation
- `src/main.tsx`: React DOM render into `#root`
- `src/App.tsx`: Root React component, history bootstrap, view routing

**IPC Contract:**
- `electron/preload.ts`: Whitelist + bridge implementation
- `src/types/index.ts`: TypeScript declaration of `Window.stressflow`

**Global State:**
- `src/stores/test-store.ts`: Single Zustand store; all components import from here

**All Types:**
- `src/types/index.ts`: Import all types from here, not from component files

**Theme / Design Tokens:**
- `tailwind.config.mjs`: `sf-*` color palette, custom shadows, animations

**Build Config:**
- `vite.config.ts`: Vite with `vite-plugin-electron` integration
- `tsconfig.json`: Renderer TypeScript, includes `@/*` alias for `src/*`
- `tsconfig.node.json`: Node/Electron TypeScript
- `electron-builder.json5`: Packaging for Windows/macOS/Linux

## Naming Conventions

**Files:**
- Components: PascalCase matching component name — `TestConfig.tsx`, `HistoryPanel.tsx`
- Non-component modules: kebab-case — `stress-engine.ts`, `protection-detector.ts`, `pdf-generator.ts`, `test-store.ts`, `test-presets.ts`
- Type-only or constant files: kebab-case — `index.ts`, `results-constants.ts`

**Directories:**
- Lowercase kebab-case: `components/`, `stores/`, `services/`, `shared/`, `hooks/`, `constants/`, `types/`

**IPC Channels:**
- `domain:action` format — `test:start`, `history:list`, `pdf:save`, `errors:byStatusCode`

**Zustand Actions:**
- Verb prefix: `setView`, `updateConfig`, `setStatus`, `setProgress`, `clearProgress`, `setCurrentResult`, `setHistory`, `addToHistory`, `setError`

## Where to Add New Code

**New React Component:**
- Implementation: `src/components/NewComponent.tsx`
- Export: named export (not default)
- State: use `useTestStore((s) => s.slice)` selector; avoid destructuring the whole store

**New IPC Channel:**
1. Add channel string to `ALLOWED_INVOKE_CHANNELS` or `ALLOWED_RECEIVE_CHANNELS` in `electron/preload.ts`
2. Expose function in the `api` object in `electron/preload.ts`
3. Add TypeScript declaration to `Window.stressflow` in `src/types/index.ts`
4. Register `ipcMain.handle('channel:name', handler)` in `electron/main.ts`

**New TypeScript Type:**
- Location: `src/types/index.ts` — do not scatter types across component files

**New Shared Logic (usable by both processes):**
- Location: `src/shared/new-module.ts`
- Constraint: Must not import from `electron/` or use Electron/browser-only APIs

**New Engine Feature (main process only):**
- Location: `electron/engine/new-feature.ts` or extend `electron/engine/stress-engine.ts`

**New Database Operation:**
- Location: `electron/database/repository.ts`
- Pattern: Use prepared statements; call `getDatabase()` to get the singleton instance

**New Constant or Preset:**
- Location: `src/constants/new-constants.ts`

**New Custom Hook:**
- Location: `src/hooks/useNewHook.ts`

**New Service (renderer-side):**
- Location: `src/services/new-service.ts`

## Special Directories

**`dist/`:**
- Purpose: Vite production build of the renderer process
- Generated: Yes | Committed: No

**`dist-electron/`:**
- Purpose: Compiled main process JavaScript (`main.js`, `preload.js`)
- Generated: Yes | Committed: No

**`audit/results/`:**
- Purpose: Output from audit test runs
- Generated: Yes | Committed: Partially (test result files)

**`openspec/changes/archive/`:**
- Purpose: Archive of completed feature change specs
- Generated: No | Committed: Yes

---

*Structure analysis: 2026-04-06*
