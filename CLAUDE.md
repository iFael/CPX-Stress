# CLAUDE.md - CPX-MisterT Stress Developer Guide

## Project Overview

CPX-MisterT Stress is an Electron + React desktop application for HTTP stress testing. It allows users to configure and run load tests against HTTP endpoints, view real-time metrics, analyze results with charts, detect server protections (WAF, CDN, rate limiting), and export reports as PDF or JSON.

All user-facing text in the application is written in **Brazilian Portuguese (pt-BR)**.

## Tech Stack

| Technology   | Version | Purpose                                 |
| ------------ | ------- | --------------------------------------- |
| Electron     | 28      | Desktop shell (main process)            |
| React        | 18      | UI framework (renderer process)         |
| TypeScript   | 5.7     | Type-safe language                      |
| Vite         | 5       | Build tool and dev server               |
| Zustand      | 4.5     | Lightweight state management            |
| Tailwind CSS | 3.4     | Utility-first styling                   |
| Recharts     | 2.15    | Chart library for metrics visualization |
| jsPDF        | 2.5     | PDF report generation                   |
| lucide-react | 0.468   | Icon library                            |
| date-fns     | 3.6     | Date formatting utilities               |

## Key Commands

```bash
npm run dev       # Start Vite dev server with Electron (hot reload)
npm run build     # TypeScript compile + Vite production build
npm run preview   # Preview the production build locally
npm run dist      # Build + package with electron-builder
```

## Project Architecture

```
CPX-MisterT Stress/
├── electron/                    # Main process (Node.js / Electron)
│   ├── main.ts                  # Electron main process entry point
│   ├── preload.ts               # Context bridge (IPC API exposed to renderer)
│   └── engine/
│       ├── stress-engine.ts     # Core HTTP stress test engine
│       └── protection-detector.ts  # Server protection detection (WAF, CDN, etc.)
├── src/                         # Renderer process (React app)
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component
│   ├── index.css                # Global styles (Tailwind directives)
│   ├── env.d.ts                 # Vite environment type declarations
│   ├── components/              # React UI components
│   │   ├── Layout.tsx           # App shell layout
│   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   ├── TestConfig.tsx       # Test configuration form
│   │   ├── TestProgress.tsx     # Real-time test progress display
│   │   ├── TestResults.tsx      # Test results view
│   │   ├── ResultsSummary.tsx   # Summary metrics cards
│   │   ├── MetricsChart.tsx     # Recharts-based metrics charts
│   │   ├── ProtectionReport.tsx # Server protection analysis view
│   │   ├── HistoryPanel.tsx     # Test history list
│   │   ├── InfoTooltip.tsx      # Tooltip component
│   │   └── results-constants.ts # Shared constants for results display
│   ├── services/
│   │   └── pdf-generator.ts     # PDF report generation with jsPDF
│   ├── stores/
│   │   └── test-store.ts        # Zustand global state store
│   └── types/
│       └── index.ts             # All TypeScript type definitions
├── tailwind.config.mjs          # Tailwind config with sf-* color palette
├── vite.config.ts               # Vite config with Electron plugin
├── tsconfig.json                # TypeScript config (renderer)
├── tsconfig.node.json           # TypeScript config (Node/Vite)
└── electron-builder.json5       # Electron Builder packaging config
```

### Path Aliases

The project uses `@/*` as a path alias for `src/*`, configured in both `tsconfig.json` and `vite.config.ts`. Use it in imports:

```typescript
import type { TestConfig } from "@/types";
import { useTestStore } from "@/stores/test-store";
```

## Key Patterns

### IPC Communication (Main <-> Renderer)

The app uses Electron's IPC with a secure preload bridge. The renderer process communicates with the main process exclusively through `window.stressflow`:

```typescript
// Renderer side - calling the bridge API
const result = await window.stressflow.test.start(config)
const history = await window.stressflow.history.list()
const unsub = window.stressflow.test.onProgress((data) => { ... })
```

IPC channels are whitelisted in `electron/preload.ts`. The allowed channels are:

- **Invoke (request/response):** `test:start`, `test:cancel`, `history:list`, `history:get`, `history:delete`, `history:clear`, `pdf:save`, `pdf:open`, `json:export`, `app:getPath`
- **Receive (real-time events):** `test:progress`

To add a new IPC channel, you must update:

1. The `ALLOWED_INVOKE_CHANNELS` or `ALLOWED_RECEIVE_CHANNELS` arrays in `electron/preload.ts`
2. The `api` object in the same file to expose the new function
3. The `Window.stressflow` type declaration in `src/types/index.ts`
4. The handler in `electron/main.ts`

### State Management (Zustand)

All global state lives in a single Zustand store at `src/stores/test-store.ts`. Access it with the `useTestStore` hook:

```typescript
const { config, updateConfig, status, setView } = useTestStore();
```

The store manages: navigation (current view), test configuration, execution status, real-time progress data, test results, history, and error messages.

### Dark Theme and Styling

The app uses a dark-only theme. All custom colors use the `sf-*` namespace defined in `tailwind.config.mjs`:

| Token              | Hex       | Usage                    |
| ------------------ | --------- | ------------------------ |
| `sf-bg`            | `#0f1117` | Page background          |
| `sf-surface`       | `#1a1d27` | Card/panel backgrounds   |
| `sf-border`        | `#2a2d3a` | Borders                  |
| `sf-primary`       | `#6366f1` | Primary actions (indigo) |
| `sf-accent`        | `#22d3ee` | Accent highlights (cyan) |
| `sf-success`       | `#22c55e` | Success states           |
| `sf-warning`       | `#f59e0b` | Warning states           |
| `sf-danger`        | `#ef4444` | Error/danger states      |
| `sf-text`          | `#e2e8f0` | Primary text             |
| `sf-textSecondary` | `#94a3b8` | Secondary text           |

Use these instead of raw Tailwind colors:

```tsx
<div className="bg-sf-surface border border-sf-border text-sf-text">
  <button className="bg-sf-primary hover:bg-sf-primaryHover">...</button>
</div>
```

Custom shadow utilities are also available: `shadow-card`, `shadow-glow`, `shadow-elevated`, etc.

### Typography

- Sans-serif: Inter (with system-ui fallback)
- Monospace: JetBrains Mono (with Fira Code, Cascadia Code fallbacks)

### Animations

Custom animations are defined in the Tailwind config: `animate-fade-in`, `animate-slide-up`, `animate-scale-in`, `animate-shimmer`, `animate-pulse-glow`, etc.

## Important Conventions

1. **Language:** All user-facing text (labels, tooltips, messages, errors) MUST be in Brazilian Portuguese. Code comments are also written in Portuguese throughout the codebase.

2. **Color Palette:** Always use the `sf-*` Tailwind color tokens. Do not use raw Tailwind colors (e.g., use `bg-sf-primary` instead of `bg-indigo-500`).

3. **Types:** All shared TypeScript types are centralized in `src/types/index.ts`. Do not scatter type definitions across component files. The main types are:
   - `TestConfig` - test parameters
   - `TestResult` - complete test result with metrics
   - `ProgressData` / `SecondMetrics` - real-time progress data
   - `ProtectionReport` / `ProtectionDetection` - server protection analysis
   - `AppView` / `TestStatus` - UI state enums

4. **Component Patterns:** Follow the existing component structure. Components are function components using hooks. Use the `useTestStore` hook for state access.

5. **IPC Security:** Never expose Node.js APIs directly to the renderer. All communication goes through the preload bridge with whitelisted channels.

6. **PDF Generation:** PDF reports are generated client-side in the renderer process using jsPDF (`src/services/pdf-generator.ts`), then saved to disk via the `pdf:save` IPC channel.

7. **No Test Framework Currently:** The project does not have a test runner configured. If adding tests, coordinate with the team on framework choice.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CPX-MisterT Stress**

Aplicação desktop Electron + React para teste de carga HTTP autorizado no ERP MisterT. Permite simular múltiplos usuários simultâneos executando sequências autenticadas de operações (login + módulos do sistema), coletar métricas em tempo real, analisar erros individuais e gerar relatórios de capacidade. Uso exclusivo interno pela equipe de Engenharia.

**Core Value:** Simular carga realista no MisterT ERP com sessões autenticadas e operações encadeadas, validando a capacidade do sistema antes de crises em produção.

### Constraints

- **Tech Stack**: Electron + React + TypeScript — manter framework base; não migrar para outra stack
- **Idioma**: Toda interface de usuário obrigatoriamente em pt-BR (código comentado em pt-BR também)
- **Alvo**: Exclusivamente MisterT ERP interno — uso fora desse escopo é não autorizado
- **Segurança IPC**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — não relaxar essas configurações
- **Cores**: Sempre usar tokens `sf-*` do Tailwind — nunca cores raw como `bg-indigo-500`
- **Tipos**: Definições TypeScript centralizadas em `src/types/index.ts` — não espalhar tipos em arquivos de componentes
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7 - All source code (renderer, main process, preload, audit scripts)
- JavaScript (CommonJS) - `scripts/install-native.js`, `audit/mock-server.js`
- Python - `scripts/fix-accents.py` (utility script)
- CSS - `src/index.css` (global styles via Tailwind directives)
## Runtime
- Node.js >=18.0.0 (main process via Electron)
- Chromium renderer process (React UI inside Electron BrowserWindow)
- npm >=9.0.0
- Lockfile: `package-lock.json` (present)
## Frameworks
- Electron 28.3.x - Desktop shell; main process owns IPC, SQLite, file I/O, window lifecycle
- React 18.3.x - Renderer process UI; function components with hooks only
- Zustand 4.5.x - Lightweight global state; single store at `src/stores/test-store.ts`
- Tailwind CSS 3.4.x - Utility-first styling with custom `sf-*` design system tokens
- PostCSS 8.4.x - Tailwind compilation pipeline; config at `postcss.config.mjs`
- Autoprefixer 10.4.x - Vendor prefix automation
- Vite 5.4.x - Dev server and production bundler; config at `vite.config.ts`
- vite-plugin-electron 0.28.x - Integrates Electron main/preload compilation with Vite
- vite-plugin-electron-renderer 0.14.x - Renderer-side Electron bridge
- esbuild - Used directly to bundle `electron/engine/stress-worker.ts` as separate CJS bundle (script: `build:worker`)
- TypeScript compiler (tsc) - Type checking only; no emit; Vite/esbuild handles transpilation
- No test runner configured. Audit scripts use `tsx` to run TypeScript directly:
- electron-builder 24.x - Cross-platform installer packaging; config at `electron-builder.json5`
## Key Dependencies
- `better-sqlite3` ^11.9.0 - Synchronous SQLite client (native addon); used exclusively in the main process (`electron/database/database.ts`). Requires prebuilt `.node` binary per Electron ABI. Handled by `scripts/install-native.js` postinstall hook.
- `jspdf` ^2.5.2 - Client-side PDF generation in the renderer; used in `src/services/pdf-generator.ts`
- `jspdf-autotable` ^3.8.4 - Table rendering plugin for jsPDF; used alongside jsPDF for structured report tables
- `html-to-image` ^1.11.11 - Converts DOM nodes (Recharts charts) to PNG base64 for embedding in PDFs
- `uuid` ^9.0.1 - UUID v4 generation for test result IDs; used in `electron/engine/stress-engine.ts`
- `recharts` ^2.15.3 - Chart visualization for real-time metrics in the renderer
- `zustand` ^4.5.5 - Global state store
- `lucide-react` ^0.468.0 - Icon library
- `date-fns` ^3.6.0 - Date formatting with `ptBR` locale throughout app and PDF reports
- `react-dom` ^18.3.1 - React renderer
- `tsx` ^4.21.0 - TypeScript execution for audit and script files without compilation step
- `@electron/rebuild` ^4.0.3 - Native addon recompilation for Electron ABI
- `eslint` ^9.39.4 - Linting; config at `eslint.config.mjs`
- `prettier` ^3.8.1 - Code formatting
- `typescript-eslint` ^8.57.2 - TypeScript-aware ESLint rules
- `eslint-plugin-react-hooks` ^7.0.1 - React hooks lint rules
- `eslint-plugin-jsx-a11y` ^6.10.2 - Accessibility lint rules
- `rimraf` - Clean utility for `dist` and `dist-electron` directories
## Configuration
- No `.env` file required for standard operation. The main process loads a `.env` from the app path or `userData` path at startup (`electron/main.ts` → `loadEnvFile()`).
- Only variables prefixed with `STRESSFLOW_` are resolved in test configs via `{{STRESSFLOW_KEY}}` placeholders. This is a security whitelist pattern — no arbitrary env vars are injected.
- The `.env` file is never committed. It is read at runtime by the Electron main process only; the renderer never sees its values.
- `tsconfig.json` - Renderer process (`src/`); target ES2020, module ESNext, `moduleResolution: bundler`, strict mode, path alias `@/*` → `src/*`
- `tsconfig.node.json` - Main process and Vite config files; separate settings for Node.js context
- `vite.config.ts` - Main Vite config; Electron integration, path alias, manual chunk splitting for `vendor-react`, `vendor-charts`, `vendor-pdf`
- `electron-builder.json5` - Packaging config; app ID `com.stressflow.app`, output to `release/`, ASAR enabled, `better-sqlite3` unpacked from ASAR
- `tailwind.config.mjs` - Custom design system; all `sf-*` color tokens, custom animations, breakpoints, and Tailwind plugin utilities
- `eslint.config.mjs` - Flat config ESLint; separate rule sets for `src/**` (browser) and `electron/**` (Node.js). Several rules intentionally disabled (e.g., `react-hooks/exhaustive-deps`, `@typescript-eslint/no-explicit-any`).
## Platform Requirements
- Node.js >=18.0.0, npm >=9.0.0
- Windows requires Visual Studio Build Tools for native addon compilation if prebuilt binary is unavailable
- `postinstall` script auto-downloads prebuilt `better-sqlite3` binary from GitHub releases for the detected Electron ABI
- Packaged as a standalone Electron desktop app via `electron-builder`
- Data persisted to OS user data directory (`%APPDATA%/stressflow/stressflow-data` on Windows)
- No server component; fully offline/local operation
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: PascalCase `.tsx` — e.g., `TestConfig.tsx`, `HistoryPanel.tsx`, `ErrorBoundary.tsx`
- Hooks: camelCase with `use` prefix, `.ts` extension — e.g., `useKeyboardShortcuts.ts`
- Stores: camelCase with `-store` suffix — e.g., `test-store.ts`
- Services: kebab-case `.ts` — e.g., `pdf-generator.ts`
- Types barrel: `index.ts` inside `src/types/`
- Shared utilities: kebab-case `.ts` — e.g., `test-analysis.ts`
- Constants: kebab-case `.ts` — e.g., `test-presets.ts`
- Audit/script files: kebab-case `.ts` or `.js`
- Functions: camelCase — e.g., `loadEnvFile`, `resolveEnvPlaceholders`, `calculateHealthScore`
- Event handlers: `handle` prefix — e.g., `handleEnvironmentChange`, `handleKeyDown`, `handleReload`
- Boolean flags: descriptive nouns — e.g., `isStarting`, `isLoadingHistory`, `hasError`
- Callback props: `on` prefix — e.g., `onDismiss`, `onProgress`
- Zustand state selectors: arrow with `s` param — e.g., `useTestStore((s) => s.config)`
- Module-level constants: SCREAMING_SNAKE_CASE — e.g., `CONFIG_PADRAO`, `ESTADO_INICIAL`, `LIMITS`, `DEFAULT_DURATION`, `EXIT_ANIMATION_MS`, `MISTERT_DEFAULT_BASE_URL`
- Exported constants: SCREAMING_SNAKE_CASE — e.g., `MISTERT_OPERATION_COUNT`
- Config/style objects: SCREAMING_SNAKE_CASE — e.g., `VARIANT_CONFIG`, `THEME`, `RISK_LABELS`
- Interfaces: PascalCase — e.g., `TestConfig`, `TestResult`, `ProtectionReport`
- Type aliases: PascalCase — e.g., `HttpMethod`, `AppView`, `TestStatus`
- Internal/private interfaces: PascalCase — e.g., `HealthAssessment`, `PreBlockingData`, `CheckResult`
- Zustand combined type: `TestStore = TestState & TestActions`
## Code Style
- Tool: Prettier 3.8 — configured via `prettier` package, invoked with `npm run format`
- No `.prettierrc` file found at project root; Prettier runs with implicit defaults plus `eslint-config-prettier` for ESLint compatibility
- Tool: ESLint 9 with `eslint.config.mjs` (flat config)
- TypeScript ESLint (`typescript-eslint` recommended rules)
- React Hooks plugin (`eslint-plugin-react-hooks`)
- Accessibility plugin (`eslint-plugin-jsx-a11y`)
- Several rules are deliberately disabled: `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `prefer-const`, all exhaustive-deps hooks rules, most jsx-a11y interaction rules
- Max warnings: 0 (enforced via `--max-warnings 0` in CI)
- TypeScript 5.7 with strict-capable tsconfig
- `import type` used consistently for type-only imports
- Explicit return types on class methods (e.g., `ErrorBoundary`)
- `as const` used for immutable config objects and tuple types
## Import Organization
- `@/*` maps to `src/*` — configured in both `tsconfig.json` and `vite.config.ts`
- Always use `@/` for intra-`src` imports, never relative paths like `../../`
- Electron process files use relative imports: `import { StressEngine } from "../electron/engine/stress-engine"`
## Error Handling
- Async operations in components use `try/catch/finally` blocks
- Errors are surfaced via `setError(msg)` to the Zustand store for display
- `console.warn` for recoverable failures, `console.error` for unexpected errors
- All `console` messages are prefixed with `[StressFlow]` tag
- IPC handlers use `try/catch`; errors returned as `{ error: string }` objects via `ipcMain.handle`
- `console.error` with `[StressFlow]` prefix for all error logs
- `ErrorBoundary` class component wraps the entire React tree (`src/components/ErrorBoundary.tsx`)
- `componentDidCatch` logs to console; `getDerivedStateFromError` sets `hasError: true`
- User sees friendly Portuguese message with optional technical details (expandable)
- Failures call `process.exit(1)` immediately; unexpected errors call `process.exit(2)`
## Logging
- All log messages use `[StressFlow]` prefix: `console.warn("[StressFlow] Não foi possível...")`
- `console.warn` for recoverable, non-critical issues
- `console.error` for error boundary captures and unexpected IPC failures
- Audit scripts use `console.log` with emoji icons (✅ ⚠️ ❌) for structured output
## Comments
- File-level JSDoc block explaining purpose, architecture and usage
- Section dividers using `// ===` or `// ---` or `/* --- */` patterns
- Inline comments for non-obvious decisions (performance, security rationale)
- TSDoc `/** */` on every exported interface, type and public function
- All exported types in `src/types/index.ts` have `/** */` JSDoc with property-level docs
- Store interfaces document both state fields and action functions
- Components document props via inline interface with per-field JSDoc
## Function Design
- Async functions return typed Promises
- Boolean flag functions return explicit `true`/`false`
- Cleanup functions return teardown callbacks (e.g., `onProgress` returns `() => void`)
## Module Design
- Named exports for components, hooks and stores: `export function TestConfig()`, `export const useTestStore`
- Default export only for root `App` component: `export default function App()`
- Types use named exports from `src/types/index.ts`
- Single barrel: `src/types/index.ts` — all shared TypeScript types
- No barrel index files in components, hooks or services (direct imports)
## React Patterns
- Functional components with hooks (except `ErrorBoundary` which requires class component)
- `React.memo` used explicitly for expensive child components: `const MainContent = memo(...)`
- `useCallback` on all event handlers to prevent unnecessary re-renders
- `useMemo` for derived values (e.g., `toast` object in `ToastProvider`)
- Local state kept in the component for UI-only concerns (form field strings, open/closed toggles)
- Global state from Zustand store for cross-component concerns
- Single store at `src/stores/test-store.ts`
- Selector pattern to avoid unnecessary re-renders: `useTestStore((s) => s.config)`
- Never call `useTestStore()` without a selector
- State and actions split into `TestState` and `TestActions` interfaces, combined as `TestStore`
- Never. Always use Tailwind utility classes.
- Style groups extracted to named constants for reuse: `const inputBaseClass = "..."`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Strict process isolation: renderer (React) has no direct Node.js access
- All cross-process communication funneled through a typed, whitelisted IPC bridge at `window.stressflow`
- Single Zustand store as the single source of truth for all renderer state
- SQLite persistence in the main process; renderer never touches disk directly
- Worker threads in the main process for concurrent HTTP load generation
## Layers
- Purpose: OS-level operations — window management, HTTP test execution, file I/O, SQLite persistence
- Location: `electron/`
- Contains: IPC handlers, StressEngine orchestrator, SQLite database, worker threads
- Depends on: Node.js built-ins (`http`, `https`, `fs`, `path`, `worker_threads`), `better-sqlite3`, `uuid`
- Used by: Renderer process via IPC channels only
- Purpose: Secure, typed surface between main and renderer; exposes `window.stressflow`
- Location: `electron/preload.ts`
- Contains: Channel whitelist, `safeInvoke` / `safeOnReceive` helpers, `contextBridge.exposeInMainWorld`
- Depends on: Electron `contextBridge`, `ipcRenderer`
- Used by: Renderer (all `window.stressflow.*` calls)
- Purpose: UI — configuration, real-time progress display, results visualization
- Location: `src/`
- Contains: React components, Zustand store, services (PDF), hooks, types, constants
- Depends on: `window.stressflow` bridge exclusively; never imports from `electron/`
- Used by: End user
- Purpose: Orchestrate virtual users, dispatch HTTP requests via worker threads, aggregate metrics
- Location: `electron/engine/stress-engine.ts`, `electron/engine/stress-worker.ts`
- Contains: VU lifecycle, ramp-up logic, per-second metric aggregation, worker pool management
- Depends on: `electron/engine/protection-detector.ts`, `electron/engine/cookie-jar.ts`, `src/shared/test-analysis.ts`
- Purpose: Persist test results and individual error records in SQLite
- Location: `electron/database/database.ts`, `electron/database/repository.ts`
- Contains: `initDatabase`, `applyMigrations`, CRUD prepared statements, batch error insert
- Depends on: `better-sqlite3`
- Used by: `electron/main.ts` IPC handlers
- Purpose: Business logic usable in both main and renderer processes
- Location: `src/shared/test-analysis.ts`
- Contains: `MeasurementReliability` types and scoring logic, `round2` helper
- Imported by: `electron/engine/stress-engine.ts` AND `src/types/index.ts`
## Data Flow
- All UI state lives in `useTestStore` (`src/stores/test-store.ts`)
- Components select individual slices: `useTestStore((s) => s.config)` — not the full store
- Timeline array uses `concat` (not spread) to avoid copying large arrays on each per-second update
- `clearProgress()` resets progress and timeline when starting a new test
## Key Abstractions
- Purpose: Orchestrates the entire load test lifecycle
- Location: `electron/engine/stress-engine.ts`
- Pattern: Class with `.run(config, onProgress, onErrorFlush)` and `.cancel()` methods; uses worker threads for concurrency
- Purpose: Per-VU session cookie storage for multi-operation tests (e.g., ASP Classic sessions)
- Location: `electron/engine/cookie-jar.ts`
- Pattern: Map of VU ID → cookie store; `captureSession: true` on a `TestOperation` activates it
- Purpose: Analyze HTTP response samples to detect WAF, CDN, rate limiting, anti-bot protections
- Location: `electron/engine/protection-detector.ts`
- Pattern: Stateless analyzer; receives `ResponseSample[]`, returns `ProtectionReport`
- Purpose: Single source of truth for all renderer state
- Location: `src/stores/test-store.ts`
- Pattern: Zustand `create<TestStore>()` with typed state + action interfaces; exported as `useTestStore` hook
- Purpose: Typed API surface for renderer → main communication
- Defined in: `electron/preload.ts` (implementation), `src/types/index.ts` (TypeScript declaration)
- Pattern: Namespace-grouped (`test`, `history`, `pdf`, `json`, `app`, `errors`); all async returning Promises
- Purpose: Capture dynamic tokens from HTTP responses (e.g., MisterT's `CTRL` param) for subsequent operations
- Location: `TestOperation.extract` field (regex), resolved inside `StressEngine`
- Pattern: Per-VU variable map; `{{VAR_NAME}}` placeholders in `url`, `body`, `headers` of later operations
## Entry Points
- Location: `electron/main.ts`
- Triggers: Electron `app.whenReady()` event
- Responsibilities: Load `.env`, initialize SQLite, create `BrowserWindow`, register all IPC handlers
- Location: `src/main.tsx`
- Triggers: Loaded by Electron's `BrowserWindow.loadURL` / `loadFile`
- Responsibilities: Mount `<App />` into DOM, set up React root
- Location: `src/App.tsx`
- Triggers: React render
- Responsibilities: Load history on mount, register keyboard shortcuts, route views via `(view, status)` state combination
- Location: `electron/engine/stress-worker.ts`
- Triggers: `new Worker(...)` from `StressEngine`
- Responsibilities: Execute individual HTTP requests for a batch of virtual users, report results back via `parentPort`
## Error Handling
- `traduzirErro()` in `electron/main.ts` maps Node.js error codes (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, etc.) to human-readable pt-BR strings
- IPC handlers wrap all operations in try/catch; errors are re-thrown as `new Error(friendlyMessage)` so the renderer receives a localized message
- `process.on("uncaughtException")` and `process.on("unhandledRejection")` prevent silent crashes in the main process
- `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) catches React render errors in the renderer
- `useTestStore.setError(msg)` stores error messages for display in UI without crashing
## Cross-Cutting Concerns
- Config validated by `validateTestConfig()` in `electron/engine/stress-engine.ts` before test starts
- Path traversal prevented by `assertPathWithinDirectory()` for all file write/open operations
- IPC input types checked at handler entry (null checks, `typeof` guards)
- `.env` file loaded at startup; only `STRESSFLOW_*` prefixed keys are resolved
- Placeholder injection happens server-side in main process — renderer never sees secret values
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on `BrowserWindow`
- `src/shared/test-analysis.ts` provides `MeasurementReliability` scoring
- Engine self-monitors: detects client saturation, reservoir sampling activation, duration overrun
- Results include `measurementReliability` and `operationalWarnings` fields
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| openspec-apply-change | Implement tasks from an OpenSpec change. Use when the user wants to start implementing, continue implementation, or work through tasks. | `.github/skills/openspec-apply-change/SKILL.md` |
| openspec-archive-change | Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete. | `.github/skills/openspec-archive-change/SKILL.md` |
| openspec-explore | Enter explore mode - a thinking partner for exploring ideas, investigating problems, and clarifying requirements. Use when the user wants to think through something before or during a change. | `.github/skills/openspec-explore/SKILL.md` |
| openspec-propose | Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation. | `.github/skills/openspec-propose/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
