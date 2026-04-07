# Phase 6: Cross-Test Analysis - Research

**Researched:** 2026-04-07
**Domain:** React UI + Recharts grouped bar chart + existing IPC data layer
**Confidence:** HIGH

## Summary

Phase 6 adds a new "Analise de Erros" screen accessible from the sidebar that lets users select 2-5 historical tests and compare their error distribution by operation name. The implementation is almost entirely a **renderer-side feature** -- no new IPC channels, no new SQL queries, and no main process changes are required. The existing `window.stressflow.errors.byOperationName(testId)` IPC channel (Phase 5) and `window.stressflow.history.list()` provide all necessary data.

The core technical challenges are: (1) adding a new `AppView` value and wiring it through the routing/sidebar infrastructure, (2) building the test selector with checkbox semantics, (3) transforming per-test `Record<string, number>` results into the flat array format required by Recharts `BarChart`, and (4) computing trend indicators (degradation/improvement) between consecutive tests. All of these are well-understood patterns already established in the codebase.

**Primary recommendation:** Build a single `CrossTestAnalysis.tsx` component that manages its own local state (selected tests, comparison data, loading states). No store changes needed -- history is already in Zustand, and comparison data is ephemeral UI state. Use Recharts `BarChart` with multiple `<Bar>` components for the grouped chart.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1: Selecao de testes -- Lista com checkboxes do historico**
O usuario seleciona testes via checkboxes em uma lista que exibe nome/URL, data, e contagem de erros de cada teste. Minimo 2 testes para habilitar comparacao. A lista e carregada de `window.stressflow.history.list()` (IPC existente).

**D2: Visualizacao -- Tabela comparativa + grafico de barras agrupadas**
Dois componentes de visualizacao:
1. Tabela: Linhas = operacoes, Colunas = testes selecionados. Celulas = contagem de erros. Destaques visuais (cor) para operacoes com crescimento de erros entre testes.
2. Grafico de barras agrupadas (Recharts): Barras agrupadas por operacao, uma barra por teste.

**D3: Navegacao -- Novo item na sidebar "Analise de Erros"**
Novo item no `NAV_ITEMS[]` com `id: "analysis"` (nova entrada em `AppView`). Icone: `BarChart3` do lucide-react. Posicao: entre "Historico" e "Configuracoes".

**D4: Escopo de dados -- Erros por operacao por teste**
A comparacao exibe a contagem de erros agrupada por `operation_name` para cada teste selecionado. Reutiliza `getErrorsByOperationName(testId)` (Phase 5) chamando-o para cada teste selecionado.

### Claude's Discretion

- Estilizacao da tabela comparativa e grafico seguindo sf-* tokens
- Indicador visual de degradacao (cor vermelha crescente, icone de trending-up, etc.)
- Empty state quando nenhum teste esta selecionado ou quando testes nao tem erros
- Ordenacao das operacoes na tabela (por total de erros, alfabetico, etc.)
- Limite maximo de testes selecionaveis para comparacao (sugestao: 5-6 para legibilidade)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANALYTICS-03 | Usuario pode visualizar uma tela de analise cross-test que compara a distribuicao de erros entre multiplos testes historicos, identificando se erros de uma operacao especifica pioram com o tempo ou com aumento de carga | All findings: AppView routing, test selector from history, byOperationName IPC, Recharts BarChart grouped bars, trend computation |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Language:** All user-facing text in Brazilian Portuguese (pt-BR). Code comments also in pt-BR.
- **Color Palette:** Always use `sf-*` Tailwind tokens. Never raw Tailwind colors.
- **Types:** Centralized in `src/types/index.ts`. Never scatter type definitions across components.
- **IPC Security:** All communication through preload bridge with whitelisted channels.
- **Component Patterns:** Function components with hooks. `useTestStore` for state access. Use selectors (`useTestStore((s) => s.field)`), never `useTestStore()` without selector.
- **Path Alias:** `@/*` maps to `src/*` in all imports.
- **No Test Framework:** Project does not have a test runner configured.
- **New IPC Channel Rule:** 4-file atomic update (preload whitelist, preload api, src/types/index.ts, main.ts). **Not needed for this phase** -- all required channels already exist.

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x | UI framework | Already installed [VERIFIED: codebase] |
| Recharts | 2.15.4 | BarChart with grouped bars | Already installed [VERIFIED: npm list] |
| Zustand | 4.5.x | State management (history access) | Already installed [VERIFIED: codebase] |
| lucide-react | 0.468.0 | BarChart3, TrendingUp, TrendingDown icons | Already installed [VERIFIED: node -e check] |
| date-fns | 3.6.0 | Date formatting with ptBR locale | Already installed [VERIFIED: npm list] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | 3.4.x | sf-* design tokens for styling | All component styling [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts BarChart | Custom SVG bars | Unnecessary complexity; Recharts already in project |
| Local state in component | Store state in Zustand | Comparison data is ephemeral UI state, not shared -- local state is correct |

**Installation:** None needed. All dependencies are already present.

## Architecture Patterns

### Recommended Project Structure

```
src/
  components/
    CrossTestAnalysis.tsx    # NEW - Main page component (selector + table + chart)
  types/
    index.ts                 # MODIFIED - Add "analysis" to AppView union
  App.tsx                    # MODIFIED - Add "analysis" branch to MainContent
  components/
    Sidebar.tsx              # MODIFIED - Add NAV_ITEMS entry for "analysis"
```

### Pattern 1: AppView Routing (Adding a New Screen)

**What:** Every screen in the app is a value in the `AppView` type union. The `MainContent` component in `App.tsx` uses if-branches to render the correct component. The `Sidebar.tsx` declares `NAV_ITEMS[]` with matching ids.

**When to use:** Any time a new top-level screen is added.

**Current AppView definition (line 792 of `src/types/index.ts`):** [VERIFIED: codebase]
```typescript
export type AppView = "test" | "history" | "results" | "settings" | "presets";
```

**Required change:**
```typescript
export type AppView = "test" | "history" | "results" | "settings" | "presets" | "analysis";
```

**Current NAV_ITEMS (Sidebar.tsx lines 43-65):** 3 items: test, history, settings. [VERIFIED: codebase]

**Required change -- add between "history" and "settings":**
```typescript
{
  id: "analysis" as const,
  label: "Analise de Erros",
  description: "Comparar testes",
  icon: BarChart3,
  ariaLabel: "Ir para a tela de analise comparativa de erros entre testes",
},
```

**App.tsx MainContent routing pattern (lines 176-188):** [VERIFIED: codebase]
```typescript
// Existing pattern -- add new branch before the "test" flow
if (view === "settings") {
  return <CredentialsSettings />;
}
if (view === "history") {
  return <HistoryPanel />;
}
if (view === "results") {
  return <TestResults />;
}
// NEW: add here
if (view === "analysis") {
  return <CrossTestAnalysis />;
}
```

### Pattern 2: IPC Data Fetching in Components

**What:** Components call `window.stressflow.*` methods directly inside `useEffect` or event handlers, using try/catch for error handling. [VERIFIED: ErrorExplorer.tsx, HistoryPanel.tsx]

**Example from ErrorExplorer.tsx (loading aggregated data):**
```typescript
// Source: src/components/ErrorExplorer.tsx lines 87-103
useEffect(() => {
  const load = async () => {
    try {
      const [sc, et, op] = await Promise.all([
        window.stressflow.errors.byStatusCode(testId),
        window.stressflow.errors.byErrorType(testId),
        window.stressflow.errors.byOperationName(testId),
      ]);
      setByStatusCode(sc);
      setByErrorType(et);
      setByOperationName(op);
    } catch {
      // Silenciar -- dados opcionais
    }
  };
  load();
}, [testId]);
```

**For Phase 6:** Call `window.stressflow.errors.byOperationName(testId)` for each selected test using `Promise.all`. No new IPC channel needed.

### Pattern 3: Recharts BarChart with Grouped Bars

**What:** Recharts `<BarChart>` renders grouped bars by placing multiple `<Bar>` children. Each `<Bar>` uses a different `dataKey`. [VERIFIED: recharts.github.io official docs]

**Data format required:**
```typescript
// Each object = one X-axis category (operation name)
// Each property = error count for that test
const chartData = [
  { operation: "Login", test1: 12, test2: 28 },
  { operation: "Estoque", test1: 5, test2: 14 },
  { operation: "Financeiro", test1: 0, test2: 3 },
];
```

**Recharts grouped bar usage:**
```typescript
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

<ResponsiveContainer width="100%" height={280}>
  <BarChart data={chartData} barGap={2} barCategoryGap="20%">
    <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" vertical={false} />
    <XAxis dataKey="operation" stroke="#64748b" fontSize={11} tickLine={false} />
    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
    <Tooltip content={<CustomTooltip />} />
    <Legend content={<CustomLegend />} />
    <Bar dataKey="test1" fill="#6366f1" name="06/04 15h - 25 VUs" />
    <Bar dataKey="test2" fill="#22d3ee" name="06/04 16h - 50 VUs" />
  </BarChart>
</ResponsiveContainer>
```

**Key Recharts BarChart props (from official docs):** [VERIFIED: recharts.github.io]
- `barGap` (default: 4) -- gap between bars in the same category
- `barCategoryGap` (default: "10%") -- gap between bar groups
- `barSize` -- explicit width per bar (omit to auto-size)
- Multiple `<Bar>` children = grouped (side-by-side). Adding `stackId` would stack them instead.

### Pattern 4: History Data Access

**What:** The `history` array in the Zustand store contains all `TestResult` objects loaded at app startup. Components access it via `useTestStore((s) => s.history)`. [VERIFIED: HistoryPanel.tsx, App.tsx]

**TestResult fields relevant for test selector:**
```typescript
// Source: src/types/index.ts
interface TestResult {
  id: string;              // UUID
  url: string;             // Target URL
  startTime: string;       // ISO 8601
  totalErrors: number;     // Error count
  config: {
    virtualUsers: number;  // VU count
  };
}
```

**No additional IPC call needed to list tests** -- the history is already loaded at app startup in `App.tsx` line 71 via `window.stressflow.history.list()` and stored in Zustand. [VERIFIED: App.tsx, test-store.ts]

### Pattern 5: Data Transformation for Comparison

**What:** Transform per-test `Record<string, number>` results from `byOperationName` into the flat array format needed by Recharts.

**Input (from IPC calls):**
```typescript
// window.stressflow.errors.byOperationName(testId) returns:
// Test A: { "Login": 12, "Estoque": 5, "Financeiro": 0 }
// Test B: { "Login": 28, "Estoque": 14, "Financeiro": 3 }
```

**Transformation logic:**
```typescript
function buildChartData(
  testResults: Array<{ testId: string; label: string; data: Record<string, number> }>
): Array<Record<string, unknown>> {
  // 1. Collect all unique operation names across all tests
  const allOps = new Set<string>();
  for (const t of testResults) {
    for (const op of Object.keys(t.data)) {
      allOps.add(op);
    }
  }

  // 2. Build flat array: one row per operation, one property per test
  return Array.from(allOps).map((op) => {
    const row: Record<string, unknown> = { operation: op };
    for (const t of testResults) {
      row[t.testId] = t.data[op] ?? 0;
    }
    return row;
  });
}
```

### Pattern 6: Trend Computation (Degradation Detection)

**What:** Compare error counts between consecutive tests (sorted by date) to detect degradation.

**Logic:**
```typescript
function computeTrend(current: number, previous: number): { delta: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) return { delta: 0, direction: "neutral" };
  if (previous === 0 && current > 0) return { delta: Infinity, direction: "up" };
  const delta = ((current - previous) / previous) * 100;
  if (delta > 0) return { delta, direction: "up" };
  if (delta < 0) return { delta: Math.abs(delta), direction: "down" };
  return { delta: 0, direction: "neutral" };
}
```

**Visual treatment from UI-SPEC:**
- Increase: `bg-sf-danger/10 text-sf-danger` + `TrendingUp` icon (16x16)
- Decrease: `bg-sf-success/10 text-sf-success` + `TrendingDown` icon (16x16)
- Neutral: default `text-sf-text` with no background

### Anti-Patterns to Avoid

- **Storing comparison data in Zustand:** The comparison state is ephemeral and local to CrossTestAnalysis. Do not pollute the global store.
- **Creating new IPC channels:** `errors.byOperationName(testId)` and `history.list()` already exist. Do not duplicate.
- **Importing from electron/:** The renderer must never import from `electron/` directly. Use only `window.stressflow.*`.
- **Unbounded parallel IPC calls:** With max 5 tests, `Promise.all` with 5 calls is fine. If the limit were higher, batching would be needed.
- **Using raw Tailwind colors in the chart:** The 5-color palette must use sf-* hex values (`#6366f1`, `#22d3ee`, `#22c55e`, `#f59e0b`, `#3b82f6`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouped bar chart | Custom SVG/Canvas bars | Recharts `<BarChart>` + `<Bar>` | Already in project, handles responsiveness, tooltips, legends |
| Date formatting | Custom format strings | date-fns `format()` with `ptBR` locale | Already used throughout codebase, handles pt-BR correctly |
| Icon rendering | SVG inlines | lucide-react `BarChart3`, `TrendingUp`, `TrendingDown` | Already in project, consistent sizing |
| Tooltip/Legend styling | Recharts defaults | Copy `CustomTooltip` and `CustomLegend` pattern from MetricsChart.tsx | Matches existing design system |

**Key insight:** This phase introduces zero new external dependencies. Every library needed is already installed and patterns for using them are established in the codebase.

## Common Pitfalls

### Pitfall 1: Recharts BarChart Data Keys Must Be Stable

**What goes wrong:** If `dataKey` values passed to `<Bar>` components change between renders, Recharts loses animation state and re-renders incorrectly.
**Why it happens:** Using test.id as dataKey can cause issues if the selected tests change.
**How to avoid:** Use stable keys derived from the selected test IDs. When the selection changes, reset the chart data entirely (new array reference).
**Warning signs:** Chart bars flicker or don't animate on selection change.

### Pitfall 2: Empty Operation Names

**What goes wrong:** Tests run in single-URL mode (no operations) store errors with `operationName: "default"`. If compared with multi-operation tests, "default" appears as a meaningless operation name.
**Why it happens:** The `operation_name` column defaults to "default" for single-URL tests.
**How to avoid:** Map "default" to a friendly label like "Requisicao Unica" in the display layer. Or filter it contextually.
**Warning signs:** Table shows "default" as an operation name alongside real operation names.

### Pitfall 3: Tests With Zero Errors Selected

**What goes wrong:** If a user selects a test with zero errors, `byOperationName` returns an empty object `{}`. The chart and table would show empty data for that test.
**Why it happens:** No error records = no aggregation results.
**How to avoid:** Handle the case where all selected tests have zero errors with a specific empty state (UI-SPEC: "Nenhum erro encontrado" message). Show a warning badge on test rows with 0 errors in the selector.
**Warning signs:** Blank chart with no bars, empty table.

### Pitfall 4: AppView Union Not Updated Atomically

**What goes wrong:** Adding `"analysis"` to `AppView` but forgetting to update the Sidebar `NAV_ITEMS` or the `App.tsx` routing causes a blank screen.
**Why it happens:** Three files must be updated in sync: `types/index.ts`, `Sidebar.tsx`, `App.tsx`.
**How to avoid:** Update all three in the same task/commit.
**Warning signs:** Clicking "Analise de Erros" in sidebar shows the TestConfig fallback instead of the new component.

### Pitfall 5: Percentage Delta Division by Zero

**What goes wrong:** Computing `(current - previous) / previous * 100` when `previous === 0` and `current > 0` produces `Infinity`.
**Why it happens:** An operation that had no errors in the first test but has errors in the second.
**How to avoid:** Special-case `previous === 0`: if `current > 0`, display "novo" (new) instead of a percentage.
**Warning signs:** Table shows "Infinity%" or "NaN%".

### Pitfall 6: Chart Height Too Short for Many Operations

**What goes wrong:** With 10 operations (MisterT has 10), the X-axis labels overlap or become unreadable.
**Why it happens:** Fixed chart height with many categories.
**How to avoid:** Use `angle={-45}` or `textAnchor="end"` on XAxis tick, or truncate operation names to 12 chars. UI-SPEC specifies truncation to 12 chars + ellipsis.
**Warning signs:** X-axis labels overlapping each other.

## Code Examples

Verified patterns from the existing codebase:

### Adding a NAV_ITEMS Entry (Sidebar.tsx Pattern)
```typescript
// Source: src/components/Sidebar.tsx lines 43-65
// Pattern: each entry has id (AppView), label, description, icon, ariaLabel
const NAV_ITEMS: NavItem[] = [
  { id: "test", label: "Novo Teste", description: "Configurar e executar", icon: Play, ariaLabel: "..." },
  { id: "history", label: "Historico", description: "Testes anteriores", icon: History, ariaLabel: "..." },
  // NEW ITEM HERE (between history and settings)
  { id: "analysis", label: "Analise de Erros", description: "Comparar testes", icon: BarChart3, ariaLabel: "Ir para a tela de analise comparativa de erros entre testes" },
  { id: "settings", label: "Configuracoes", description: "Credenciais e ambiente", icon: Settings, ariaLabel: "..." },
];
```

### Calling byOperationName for Multiple Tests
```typescript
// Source pattern: src/components/ErrorExplorer.tsx lines 87-103
// Adapted for multiple tests
const loadComparisonData = async (selectedTestIds: string[]) => {
  setLoading(true);
  try {
    const results = await Promise.all(
      selectedTestIds.map((testId) =>
        window.stressflow.errors.byOperationName(testId)
          .then((data) => ({ testId, data }))
      )
    );
    // Transform results into chart-friendly format
    setComparisonData(results);
  } catch {
    setError("Falha ao carregar dados de erros.");
  } finally {
    setLoading(false);
  }
};
```

### MetricsChart THEME Constants (Reusable for BarChart)
```typescript
// Source: src/components/MetricsChart.tsx lines 30-39
const THEME = {
  surface: "#1a1d27",
  border: "#2a2d3a",
  grid: "#1e2130",
  axisLabel: "#64748b",
} as const;
```

### Chart Color Palette for Tests (from UI-SPEC)
```typescript
// Source: 06-UI-SPEC.md Semantic colors section
const CHART_COLORS = [
  "#6366f1", // sf-primary (indigo) -- Test 1
  "#22d3ee", // sf-accent (cyan) -- Test 2
  "#22c55e", // sf-success (green) -- Test 3
  "#f59e0b", // sf-warning (amber) -- Test 4
  "#3b82f6", // sf-info (blue) -- Test 5
] as const;
```

### HistoryPanel Search Pattern (Reusable for Test Selector)
```typescript
// Source: src/components/HistoryPanel.tsx lines 237-280
// Filtering by search text
const processedResults = useMemo(() => {
  const searchLower = search.toLowerCase().trim();
  let results = history.filter((t) => {
    if (!searchLower) return true;
    return t.url.toLowerCase().includes(searchLower);
  });
  // Sort by date descending
  const sorted = [...results];
  sorted.sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
  return sorted;
}, [history, search]);
```

### Tooltip and Legend Patterns from MetricsChart
```typescript
// Source: src/components/MetricsChart.tsx lines 144-178 (CustomTooltip)
// Source: src/components/MetricsChart.tsx lines 196-216 (CustomLegend)
// Container: "bg-sf-surface border border-sf-border rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
// Legend: "flex justify-center flex-wrap gap-4 pt-1"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Individual test error viewing (ErrorExplorer) | Cross-test comparison (Phase 6) | This phase | Users can now identify degradation patterns across test runs |

**Deprecated/outdated:** None -- all libraries used are current versions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Recharts BarChart with multiple `<Bar>` children renders grouped bars by default (no stackId needed) | Architecture Patterns / Pattern 3 | Chart would render stacked instead of grouped; fix by ensuring no stackId prop |
| A2 | 5 concurrent `byOperationName` IPC calls via Promise.all is performant with better-sqlite3 | Architecture Patterns / Pattern 2 | Unlikely bottleneck -- SQLite is synchronous in main process, 5 simple GROUP BY queries complete in <50ms total |

**Note:** A1 was verified against official Recharts docs at recharts.github.io. The risk is low.

## Open Questions

1. **Should the "analysis" view be accessible during a running test?**
   - What we know: Other views like "history" and "settings" are accessible during running tests. The sidebar does not disable navigation.
   - What's unclear: Whether viewing analysis while a test runs could cause confusion.
   - Recommendation: Allow access -- it is read-only and does not interfere with the running test. Match existing pattern where all sidebar items remain accessible.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is purely code/config changes using existing installed libraries.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None configured |
| Config file | none |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANALYTICS-03 | Cross-test error comparison screen renders correctly with selected tests | manual-only | N/A -- no test framework configured | N/A |

**Justification for manual-only:** The project explicitly has no test framework configured (CLAUDE.md: "No Test Framework Currently"). All verification must be done through manual human testing of the UI.

### Sampling Rate

- **Per task commit:** Manual verification -- build compiles (`npm run build`)
- **Per wave merge:** Full manual test -- select 2+ tests, verify table + chart render
- **Phase gate:** Human verification of all 4 success criteria

### Wave 0 Gaps

No automated test infrastructure exists. Manual verification plan:
1. Sidebar shows "Analise de Erros" item between "Historico" and "Configuracoes"
2. Clicking navigates to CrossTestAnalysis screen
3. Selecting 2+ tests enables "Comparar Testes" button
4. Comparison table shows errors per operation per test with trend indicators
5. Grouped bar chart renders with correct colors and legend
6. Empty states display correctly (no history, no errors)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A -- read-only UI, no auth changes |
| V3 Session Management | no | N/A -- no session changes |
| V4 Access Control | no | N/A -- all data is local |
| V5 Input Validation | no | No user input goes to IPC; test IDs come from store |
| V6 Cryptography | no | N/A -- no crypto operations |

### Known Threat Patterns for React + Electron renderer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via user-supplied test URLs displayed in UI | Tampering | React's JSX auto-escaping -- already handles this |
| Prototype pollution via JSON.parse of IPC data | Tampering | Data comes from SQLite via typed repository -- safe |

**Security impact of Phase 6:** Minimal. This is a read-only visualization screen that consumes data already available through existing IPC channels. No new IPC channels are introduced. No user input is sent to the main process.

## Sources

### Primary (HIGH confidence)
- Codebase files read directly: `src/types/index.ts`, `src/components/Sidebar.tsx`, `src/App.tsx`, `src/components/HistoryPanel.tsx`, `src/components/MetricsChart.tsx`, `src/components/ErrorExplorer.tsx`, `electron/database/repository.ts`, `electron/preload.ts`, `src/stores/test-store.ts`, `tailwind.config.mjs`
- Recharts official docs (recharts.github.io/en-US/api/BarChart) -- BarChart grouped bars API and props
- npm list verification -- recharts@2.15.4, lucide-react@0.468.0, date-fns@3.6.0
- Node runtime verification -- BarChart3, TrendingUp, TrendingDown icons confirmed present in lucide-react

### Secondary (MEDIUM confidence)
- None needed -- all claims verified against codebase or official docs

### Tertiary (LOW confidence)
- A1 assumption about Recharts grouped bar default behavior -- verified against official docs but not tested in this project

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in the project
- Architecture: HIGH -- all patterns directly observed in existing codebase files
- Pitfalls: HIGH -- derived from actual code analysis and Recharts API documentation

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days -- stable tech, no version changes expected)
