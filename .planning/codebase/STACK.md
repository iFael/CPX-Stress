# Technology Stack

**Analysis Date:** 2026-04-06

## Languages

**Primary:**
- TypeScript 5.7 - All source code (renderer, main process, preload, audit scripts)

**Secondary:**
- JavaScript (CommonJS) - `scripts/install-native.js`, `audit/mock-server.js`
- Python - `scripts/fix-accents.py` (utility script)
- CSS - `src/index.css` (global styles via Tailwind directives)

## Runtime

**Environment:**
- Node.js >=18.0.0 (main process via Electron)
- Chromium renderer process (React UI inside Electron BrowserWindow)

**Package Manager:**
- npm >=9.0.0
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Electron 28.3.x - Desktop shell; main process owns IPC, SQLite, file I/O, window lifecycle
- React 18.3.x - Renderer process UI; function components with hooks only
- Zustand 4.5.x - Lightweight global state; single store at `src/stores/test-store.ts`

**Styling:**
- Tailwind CSS 3.4.x - Utility-first styling with custom `sf-*` design system tokens
- PostCSS 8.4.x - Tailwind compilation pipeline; config at `postcss.config.mjs`
- Autoprefixer 10.4.x - Vendor prefix automation

**Build/Dev:**
- Vite 5.4.x - Dev server and production bundler; config at `vite.config.ts`
- vite-plugin-electron 0.28.x - Integrates Electron main/preload compilation with Vite
- vite-plugin-electron-renderer 0.14.x - Renderer-side Electron bridge
- esbuild - Used directly to bundle `electron/engine/stress-worker.ts` as separate CJS bundle (script: `build:worker`)
- TypeScript compiler (tsc) - Type checking only; no emit; Vite/esbuild handles transpilation

**Testing / Audit:**
- No test runner configured. Audit scripts use `tsx` to run TypeScript directly:
  - `audit/test-ssrf.ts` - SSRF security audit
  - `audit/engine-test-harness.ts` - Engine integration audit
  - `audit/stress-extreme-test.ts` - Extreme load audit
  - `scripts/run-audit-with-mock.ts` - Wraps audit scripts with a mock HTTP server

**Packaging:**
- electron-builder 24.x - Cross-platform installer packaging; config at `electron-builder.json5`
  - Windows: NSIS installer (x64)
  - macOS: DMG + ZIP (configured, not primary target)
  - Linux: AppImage + DEB (configured, not primary target)

## Key Dependencies

**Critical:**
- `better-sqlite3` ^11.9.0 - Synchronous SQLite client (native addon); used exclusively in the main process (`electron/database/database.ts`). Requires prebuilt `.node` binary per Electron ABI. Handled by `scripts/install-native.js` postinstall hook.
- `jspdf` ^2.5.2 - Client-side PDF generation in the renderer; used in `src/services/pdf-generator.ts`
- `jspdf-autotable` ^3.8.4 - Table rendering plugin for jsPDF; used alongside jsPDF for structured report tables
- `html-to-image` ^1.11.11 - Converts DOM nodes (Recharts charts) to PNG base64 for embedding in PDFs
- `uuid` ^9.0.1 - UUID v4 generation for test result IDs; used in `electron/engine/stress-engine.ts`

**Infrastructure:**
- `recharts` ^2.15.3 - Chart visualization for real-time metrics in the renderer
- `zustand` ^4.5.5 - Global state store
- `lucide-react` ^0.468.0 - Icon library
- `date-fns` ^3.6.0 - Date formatting with `ptBR` locale throughout app and PDF reports
- `react-dom` ^18.3.1 - React renderer

**Dev Infrastructure:**
- `tsx` ^4.21.0 - TypeScript execution for audit and script files without compilation step
- `@electron/rebuild` ^4.0.3 - Native addon recompilation for Electron ABI
- `eslint` ^9.39.4 - Linting; config at `eslint.config.mjs`
- `prettier` ^3.8.1 - Code formatting
- `typescript-eslint` ^8.57.2 - TypeScript-aware ESLint rules
- `eslint-plugin-react-hooks` ^7.0.1 - React hooks lint rules
- `eslint-plugin-jsx-a11y` ^6.10.2 - Accessibility lint rules
- `rimraf` - Clean utility for `dist` and `dist-electron` directories

## Configuration

**Environment:**
- No `.env` file required for standard operation. The main process loads a `.env` from the app path or `userData` path at startup (`electron/main.ts` → `loadEnvFile()`).
- Only variables prefixed with `STRESSFLOW_` are resolved in test configs via `{{STRESSFLOW_KEY}}` placeholders. This is a security whitelist pattern — no arbitrary env vars are injected.
- The `.env` file is never committed. It is read at runtime by the Electron main process only; the renderer never sees its values.

**TypeScript Config:**
- `tsconfig.json` - Renderer process (`src/`); target ES2020, module ESNext, `moduleResolution: bundler`, strict mode, path alias `@/*` → `src/*`
- `tsconfig.node.json` - Main process and Vite config files; separate settings for Node.js context

**Build:**
- `vite.config.ts` - Main Vite config; Electron integration, path alias, manual chunk splitting for `vendor-react`, `vendor-charts`, `vendor-pdf`
- `electron-builder.json5` - Packaging config; app ID `com.stressflow.app`, output to `release/`, ASAR enabled, `better-sqlite3` unpacked from ASAR
- `tailwind.config.mjs` - Custom design system; all `sf-*` color tokens, custom animations, breakpoints, and Tailwind plugin utilities

**Linting:**
- `eslint.config.mjs` - Flat config ESLint; separate rule sets for `src/**` (browser) and `electron/**` (Node.js). Several rules intentionally disabled (e.g., `react-hooks/exhaustive-deps`, `@typescript-eslint/no-explicit-any`).

## Platform Requirements

**Development:**
- Node.js >=18.0.0, npm >=9.0.0
- Windows requires Visual Studio Build Tools for native addon compilation if prebuilt binary is unavailable
- `postinstall` script auto-downloads prebuilt `better-sqlite3` binary from GitHub releases for the detected Electron ABI

**Production:**
- Packaged as a standalone Electron desktop app via `electron-builder`
- Data persisted to OS user data directory (`%APPDATA%/stressflow/stressflow-data` on Windows)
- No server component; fully offline/local operation

---

*Stack analysis: 2026-04-06*
