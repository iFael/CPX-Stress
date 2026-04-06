# Coding Conventions

**Analysis Date:** 2026-04-06

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` — e.g., `TestConfig.tsx`, `HistoryPanel.tsx`, `ErrorBoundary.tsx`
- Hooks: camelCase with `use` prefix, `.ts` extension — e.g., `useKeyboardShortcuts.ts`
- Stores: camelCase with `-store` suffix — e.g., `test-store.ts`
- Services: kebab-case `.ts` — e.g., `pdf-generator.ts`
- Types barrel: `index.ts` inside `src/types/`
- Shared utilities: kebab-case `.ts` — e.g., `test-analysis.ts`
- Constants: kebab-case `.ts` — e.g., `test-presets.ts`
- Audit/script files: kebab-case `.ts` or `.js`

**Functions and Variables:**
- Functions: camelCase — e.g., `loadEnvFile`, `resolveEnvPlaceholders`, `calculateHealthScore`
- Event handlers: `handle` prefix — e.g., `handleEnvironmentChange`, `handleKeyDown`, `handleReload`
- Boolean flags: descriptive nouns — e.g., `isStarting`, `isLoadingHistory`, `hasError`
- Callback props: `on` prefix — e.g., `onDismiss`, `onProgress`
- Zustand state selectors: arrow with `s` param — e.g., `useTestStore((s) => s.config)`

**Constants:**
- Module-level constants: SCREAMING_SNAKE_CASE — e.g., `CONFIG_PADRAO`, `ESTADO_INICIAL`, `LIMITS`, `DEFAULT_DURATION`, `EXIT_ANIMATION_MS`, `MISTERT_DEFAULT_BASE_URL`
- Exported constants: SCREAMING_SNAKE_CASE — e.g., `MISTERT_OPERATION_COUNT`
- Config/style objects: SCREAMING_SNAKE_CASE — e.g., `VARIANT_CONFIG`, `THEME`, `RISK_LABELS`

**Types and Interfaces:**
- Interfaces: PascalCase — e.g., `TestConfig`, `TestResult`, `ProtectionReport`
- Type aliases: PascalCase — e.g., `HttpMethod`, `AppView`, `TestStatus`
- Internal/private interfaces: PascalCase — e.g., `HealthAssessment`, `PreBlockingData`, `CheckResult`
- Zustand combined type: `TestStore = TestState & TestActions`

## Code Style

**Formatting:**
- Tool: Prettier 3.8 — configured via `prettier` package, invoked with `npm run format`
- No `.prettierrc` file found at project root; Prettier runs with implicit defaults plus `eslint-config-prettier` for ESLint compatibility

**Linting:**
- Tool: ESLint 9 with `eslint.config.mjs` (flat config)
- TypeScript ESLint (`typescript-eslint` recommended rules)
- React Hooks plugin (`eslint-plugin-react-hooks`)
- Accessibility plugin (`eslint-plugin-jsx-a11y`)
- Several rules are deliberately disabled: `@typescript-eslint/no-explicit-any`, `no-unused-vars`, `prefer-const`, all exhaustive-deps hooks rules, most jsx-a11y interaction rules
- Max warnings: 0 (enforced via `--max-warnings 0` in CI)

**TypeScript:**
- TypeScript 5.7 with strict-capable tsconfig
- `import type` used consistently for type-only imports
- Explicit return types on class methods (e.g., `ErrorBoundary`)
- `as const` used for immutable config objects and tuple types

## Import Organization

**Order (observed pattern):**
1. React core imports — `import { useState, useCallback, useEffect } from "react"`
2. External library imports — `import { Loader2 } from "lucide-react"`
3. Internal store imports — `import { useTestStore } from "@/stores/test-store"`
4. Internal component imports — `import { Layout } from "@/components/Layout"`
5. Internal service/shared imports — `import { calculateHealthScore } from "@/shared/test-analysis"`
6. Type-only imports — `import type { AppView, TestStatus } from "@/types"`
7. Asset imports — `import compexLogo from "@/assets/compex-logo.gif"`

**Path Aliases:**
- `@/*` maps to `src/*` — configured in both `tsconfig.json` and `vite.config.ts`
- Always use `@/` for intra-`src` imports, never relative paths like `../../`
- Electron process files use relative imports: `import { StressEngine } from "../electron/engine/stress-engine"`

## Error Handling

**Renderer process:**
- Async operations in components use `try/catch/finally` blocks
- Errors are surfaced via `setError(msg)` to the Zustand store for display
- `console.warn` for recoverable failures, `console.error` for unexpected errors
- All `console` messages are prefixed with `[StressFlow]` tag

**Electron main process:**
- IPC handlers use `try/catch`; errors returned as `{ error: string }` objects via `ipcMain.handle`
- `console.error` with `[StressFlow]` prefix for all error logs

**Boundary:**
- `ErrorBoundary` class component wraps the entire React tree (`src/components/ErrorBoundary.tsx`)
- `componentDidCatch` logs to console; `getDerivedStateFromError` sets `hasError: true`
- User sees friendly Portuguese message with optional technical details (expandable)

**Audit/test scripts:**
- Failures call `process.exit(1)` immediately; unexpected errors call `process.exit(2)`

## Logging

**Framework:** `console` (no external logger)

**Patterns:**
- All log messages use `[StressFlow]` prefix: `console.warn("[StressFlow] Não foi possível...")`
- `console.warn` for recoverable, non-critical issues
- `console.error` for error boundary captures and unexpected IPC failures
- Audit scripts use `console.log` with emoji icons (✅ ⚠️ ❌) for structured output

## Comments

**Language:** Portuguese throughout — inline comments, JSDoc, section headers all in pt-BR

**Style:**
- File-level JSDoc block explaining purpose, architecture and usage
- Section dividers using `// ===` or `// ---` or `/* --- */` patterns
- Inline comments for non-obvious decisions (performance, security rationale)
- TSDoc `/** */` on every exported interface, type and public function

**JSDoc/TSDoc:**
- All exported types in `src/types/index.ts` have `/** */` JSDoc with property-level docs
- Store interfaces document both state fields and action functions
- Components document props via inline interface with per-field JSDoc

## Function Design

**Size:** Functions are focused and single-purpose; large components extract sub-components (e.g., `MainContent` extracted from `App`)

**Parameters:** Prefer destructured objects for component props; Zustand selectors use inline arrow functions

**Return Values:**
- Async functions return typed Promises
- Boolean flag functions return explicit `true`/`false`
- Cleanup functions return teardown callbacks (e.g., `onProgress` returns `() => void`)

## Module Design

**Exports:**
- Named exports for components, hooks and stores: `export function TestConfig()`, `export const useTestStore`
- Default export only for root `App` component: `export default function App()`
- Types use named exports from `src/types/index.ts`

**Barrel Files:**
- Single barrel: `src/types/index.ts` — all shared TypeScript types
- No barrel index files in components, hooks or services (direct imports)

## React Patterns

**Component structure:**
- Functional components with hooks (except `ErrorBoundary` which requires class component)
- `React.memo` used explicitly for expensive child components: `const MainContent = memo(...)`
- `useCallback` on all event handlers to prevent unnecessary re-renders
- `useMemo` for derived values (e.g., `toast` object in `ToastProvider`)
- Local state kept in the component for UI-only concerns (form field strings, open/closed toggles)
- Global state from Zustand store for cross-component concerns

**Zustand usage:**
- Single store at `src/stores/test-store.ts`
- Selector pattern to avoid unnecessary re-renders: `useTestStore((s) => s.config)`
- Never call `useTestStore()` without a selector
- State and actions split into `TestState` and `TestActions` interfaces, combined as `TestStore`

**Inline styles:**
- Never. Always use Tailwind utility classes.
- Style groups extracted to named constants for reuse: `const inputBaseClass = "..."`

---

*Convention analysis: 2026-04-06*
