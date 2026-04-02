# CLAUDE.md - StressFlow Developer Guide

## Project Overview

StressFlow is an Electron + React desktop application for HTTP stress testing. It allows users to configure and run load tests against HTTP endpoints, view real-time metrics, analyze results with charts, detect server protections (WAF, CDN, rate limiting), and export reports as PDF or JSON.

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
StressFlow/
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
