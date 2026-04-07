# Phase 5: Error Filters - Research

**Researched:** 2026-04-07
**Domain:** SQLite query extension + React component enhancement (ErrorExplorer filters)
**Confidence:** HIGH

## Summary

Phase 5 adds two new filters to the existing ErrorExplorer component: operation name filtering (ANALYTICS-01) and time period filtering (ANALYTICS-02). The implementation is well-constrained by user decisions in CONTEXT.md -- all key design choices are locked, leaving only styling and formatting details to Claude's discretion.

The existing architecture already supports this work cleanly. The `searchErrors()` query builder in `repository.ts` uses a dynamic WHERE-clause pattern that can be extended with two new conditions (`operation_name = ?` and `timestamp BETWEEN ? AND ?`) without modifying the existing logic. The `test_errors` table already has `idx_test_errors_timestamp` covering `(test_id, timestamp)`, and while there is no composite index on `(test_id, operation_name)`, the ARCHITECTURE.md explicitly notes this is acceptable for an internal tool and can be deferred to a future migration v4 if performance degrades. No new IPC channels are required -- the existing `errors:search` channel passes a params object that can accept new fields. One new IPC channel (`errors:byOperationName`) is needed for the aggregation card, following the exact pattern of `errors:byStatusCode`.

**Primary recommendation:** Extend `searchErrors()` params + add `getErrorsByOperationName()` in repository, update IPC bridge for the new aggregation channel, then expand ErrorExplorer with operation card (grid-cols-3) + datetime-local inputs + new filter chips. No new libraries required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1: Filtro de operacao -- Card de resumo clicavel**
Novo card de resumo "Por Operacao" no grid, identico ao padrao dos cards "Por Tipo de Erro" e "Por Status HTTP". Lista operacoes com contagem de erros; click numa operacao filtra a tabela.
Implementation: Nova query `getErrorsByOperationName(testId)` no repository retornando `Record<string, number>`. Novo state `filterOperationName` no ErrorExplorer. Chip de filtro ativo com X para limpar.

**D2: Layout dos cards -- grid-cols-3**
Grid de resumos muda de `grid-cols-2` para `grid-cols-3` para acomodar os tres cards (Tipo de Erro, Status HTTP, Operacao) lado a lado.

**D3: Filtro de periodo -- Inputs datetime-local nativos**
Dois inputs `<input type="datetime-local">` para inicio e fim, posicionados entre os cards de resumo e os chips de filtro ativo. Sem biblioteca externa de date picker.
Implementation: Novos states `filterTimeStart` e `filterTimeEnd` (strings ISO). Convertidos para timestamp Unix ms para query SQL. Backend `searchErrors()` recebe `timestampStart` e `timestampEnd` opcionais. Chips de "Periodo:" na barra de filtros ativos.

**D4: Combinacao de filtros -- Cards + periodo abaixo + chips ativos**
Layout vertical mantém o padrao atual expandido: (1) Grid grid-cols-3 com cards clicaveis, (2) Inputs de periodo abaixo dos cards, (3) Chips de filtro ativo abaixo dos inputs, (4) Tabela de erros com paginacao. Todos os filtros combinados via AND na query SQL (intersecao).

**D5: Escopo -- Single-test**
ErrorExplorer continua recebendo `testId` como prop. Filtro de operacao e filtro de periodo operam DENTRO desse teste. Cross-test analysis e Phase 6.

### Claude's Discretion

- Estilizacao dos inputs datetime-local com sf-* tokens (dark theme styling)
- Fallback quando nenhum erro de uma operacao especifica existe nos filtros combinados
- Formatacao de data/hora nos chips de filtro ativo (date-fns com ptBR locale)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANALYTICS-01 | Filtrar erros por nome de operacao no ErrorExplorer | D1 locks the card pattern, new `getErrorsByOperationName()` query, `filterOperationName` state, chip filter. Existing `operation_name` column is indexed via `idx_test_errors_timestamp(test_id, timestamp)` but NOT by operation_name -- acceptable per ARCHITECTURE.md guidance. |
| ANALYTICS-02 | Filtrar erros por intervalo de tempo (data/hora inicio e fim) | D3 locks `datetime-local` inputs. `timestamp` column is INTEGER (Unix ms), already indexed via `idx_test_errors_timestamp(test_id, timestamp)`. Convert ISO string to ms at query boundary. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- All user-facing text in **pt-BR** (labels, tooltips, placeholders, chip text)
- Colors via `sf-*` tokens only (never raw Tailwind colors)
- Types centralized in `src/types/index.ts`
- IPC exclusively via `window.stressflow` preload bridge
- New IPC channel = update 4 files atomically: `preload.ts` whitelist, `preload.ts` api, `src/types/index.ts`, `main.ts`
- Path alias: `@/*` maps to `src/*`
- No test framework configured
- `[StressFlow]` prefix on all console messages
- Function components with hooks, `useCallback` on handlers, `useMemo` for derived values
- Never `useTestStore()` without a selector

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x | UI framework | Already in use [VERIFIED: codebase] |
| better-sqlite3 | ^11.9.0 | SQLite queries | Already in use for error storage [VERIFIED: codebase] |
| date-fns | 3.6.0 | Date formatting for chips | Already installed and used with ptBR locale [VERIFIED: npm list] |
| lucide-react | 0.468.0 | Icons (XCircle, Calendar, etc.) | Already in use for filter chips [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `datetime-local` | react-datepicker, flatpickr | **Locked by D3**: user decided native inputs, no external date picker library |
| Custom operation dropdown | @radix-ui/react-select | Overkill -- clickable card pattern matches existing UX (locked by D1) |

**Installation:** No new packages required. All dependencies are already installed.

## Architecture Patterns

### Changes Required per Layer

```
electron/database/repository.ts       # Extend searchErrors(), add getErrorsByOperationName()
electron/main.ts                      # Extend errors:search params type, add errors:byOperationName handler
electron/preload.ts                   # Add errors:byOperationName to whitelist + api
src/types/index.ts                    # Extend StressFlowAPI.errors with byOperationName
src/components/ErrorExplorer.tsx      # New card, datetime inputs, filter state, chips
```

### Pattern 1: Extend searchErrors() Query Builder

**What:** Add `operationName`, `timestampStart`, `timestampEnd` to the params object of `searchErrors()`. Each parameter adds a WHERE condition when present.

**When to use:** This is the established pattern in repository.ts (lines 248-288).

**Example:**
```typescript
// Source: existing pattern in electron/database/repository.ts
export function searchErrors(params: {
  testId?: string;
  statusCode?: number;
  errorType?: string;
  operationName?: string;     // NEW: ANALYTICS-01
  timestampStart?: number;    // NEW: ANALYTICS-02 (Unix ms)
  timestampEnd?: number;      // NEW: ANALYTICS-02 (Unix ms)
  limit?: number;
  offset?: number;
}): { records: ErrorRow[]; total: number } {
  const db = getDatabase();
  const conditions: string[] = [];
  const values: unknown[] = [];

  // ... existing conditions ...

  if (params.operationName) {
    conditions.push("operation_name = ?");
    values.push(params.operationName);
  }
  if (params.timestampStart !== undefined && params.timestampStart !== null) {
    conditions.push("timestamp >= ?");
    values.push(params.timestampStart);
  }
  if (params.timestampEnd !== undefined && params.timestampEnd !== null) {
    conditions.push("timestamp <= ?");
    values.push(params.timestampEnd);
  }

  // ... rest identical ...
}
```
[VERIFIED: codebase pattern at repository.ts:248-288]

### Pattern 2: Aggregation Query (getErrorsByOperationName)

**What:** New function following the exact pattern of `getErrorsByStatusCode()` (lines 291-304) and `getErrorsByType()` (lines 307-320). Returns `Record<string, number>`.

**Example:**
```typescript
// Source: clone of getErrorsByStatusCode pattern at repository.ts:291
export function getErrorsByOperationName(testId: string): Record<string, number> {
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT operation_name, COUNT(*) as count FROM test_errors WHERE test_id = ? GROUP BY operation_name ORDER BY count DESC",
    )
    .all(testId) as Array<{ operation_name: string; count: number }>;

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.operation_name] = row.count;
  }
  return result;
}
```
[VERIFIED: codebase pattern at repository.ts:291-320]

### Pattern 3: IPC Channel Addition (4-file atomic update)

**What:** New `errors:byOperationName` channel. Must update 4 files:
1. `electron/preload.ts` -- add to `ALLOWED_INVOKE_CHANNELS` array
2. `electron/preload.ts` -- add `byOperationName` to `api.errors` object
3. `src/types/index.ts` -- add `byOperationName` to `StressFlowAPI.errors`
4. `electron/main.ts` -- add `ipcMain.handle("errors:byOperationName", ...)`

**When to use:** Every new IPC channel. This is a critical project constraint.

**Example (preload.ts api addition):**
```typescript
// Source: existing pattern at preload.ts:199-224
errors: {
  // ... existing ...
  byOperationName: (testId: string): Promise<Record<string, number>> =>
    safeInvoke("errors:byOperationName", testId) as Promise<Record<string, number>>,
},
```
[VERIFIED: codebase pattern at preload.ts:199-224]

### Pattern 4: ErrorExplorer Filter State (click-to-toggle cards)

**What:** New `filterOperationName` state with same toggle behavior as `filterErrorType` and `filterStatusCode`.

**Example:**
```typescript
// Source: existing pattern at ErrorExplorer.tsx:63-68
const [filterOperationName, setFilterOperationName] = useState<string | undefined>(undefined);
const [filterTimeStart, setFilterTimeStart] = useState<string>("");
const [filterTimeEnd, setFilterTimeEnd] = useState<string>("");

// For datetime-local: convert ISO local string to Unix ms
// "2026-04-06T14:30" -> Date timestamp in ms
const timestampStart = filterTimeStart ? new Date(filterTimeStart).getTime() : undefined;
const timestampEnd = filterTimeEnd ? new Date(filterTimeEnd).getTime() : undefined;
```
[VERIFIED: codebase pattern at ErrorExplorer.tsx:56-68]

### Pattern 5: datetime-local Dark Theme Styling

**What:** Native `<input type="datetime-local">` needs custom CSS for dark theme since Chromium-based Electron renders the native picker with light backgrounds by default.

**Example:**
```css
/* Source: standard Chromium color-scheme approach */
input[type="datetime-local"] {
  color-scheme: dark;
}
```

Alternatively, apply `color-scheme: dark` via Tailwind's arbitrary property or inline style. The `color-scheme: dark` CSS property instructs Chromium to render the native date picker widget with dark colors. This is the simplest approach that avoids custom pseudo-element hacking.

```tsx
<input
  type="datetime-local"
  value={filterTimeStart}
  onChange={(e) => setFilterTimeStart(e.target.value)}
  className="bg-sf-bg border border-sf-border rounded-lg px-3 py-1.5 text-xs text-sf-text"
  style={{ colorScheme: "dark" }}
/>
```
[ASSUMED -- Chromium color-scheme for dark date pickers. Well-documented approach but not verified against Electron 28 specifically.]

### Anti-Patterns to Avoid

- **Separate IPC channel for filtered search:** Do NOT create a new `errors:searchFiltered` channel. The existing `errors:search` already accepts an extensible params object -- just add new fields to it.
- **Converting timestamps in the renderer:** The renderer should send `timestampStart`/`timestampEnd` as Unix ms numbers. Never send ISO strings to the backend and parse them in SQLite -- the column stores INTEGER timestamps.
- **Fetching all errors to filter client-side:** Never load all 10,000 errors into memory. The SQLite query handles filtering server-side with pagination.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting in chips | Custom date format logic | `date-fns format()` with `ptBR` locale | Already used throughout the codebase; handles pt-BR formatting correctly |
| Dark date picker theming | Custom date picker component | Native `datetime-local` + `color-scheme: dark` | Locked by D3; Chromium handles dark mode natively |
| SQL query composition | String concatenation | Parameterized prepared statements with `?` | Existing pattern; prevents SQL injection; project convention |

**Key insight:** This phase has zero novel technical challenges. Every piece is an extension of an existing pattern in the codebase.

## Common Pitfalls

### Pitfall 1: Timezone Mismatch Between datetime-local and Stored Timestamps

**What goes wrong:** The `<input type="datetime-local">` produces a local-time string (e.g., "2026-04-06T14:30") but the `timestamp` column in SQLite stores Unix ms from `Date.now()` (UTC-based). If you naively parse the datetime-local string with `new Date(string).getTime()`, JavaScript correctly interprets it as local time and converts to UTC ms -- which matches `Date.now()`. However, if the user's system timezone changes between test execution and filter usage, the timestamps won't align as expected.

**Why it happens:** `Date.now()` is timezone-invariant (UTC ms). `new Date("2026-04-06T14:30")` interprets the string as local time, producing the correct UTC ms for the user's current timezone.

**How to avoid:** Use `new Date(datetimeLocalValue).getTime()` directly. This works correctly because both `Date.now()` (at error recording time) and `new Date(localString).getTime()` (at filter time) produce UTC-based milliseconds. The match is correct as long as the user's timezone hasn't changed between recording and querying, which is a safe assumption for an internal desktop tool.

**Warning signs:** Filters that should match errors return empty results. Check by logging the ms values on both sides.

### Pitfall 2: Forgetting to Reset Page When New Filters Change

**What goes wrong:** User applies operation filter, sees page 3 of results. Then applies time filter. The component stays on page 3, which might be past the total pages for the new combined filter.

**Why it happens:** Each filter state change must reset pagination to page 0.

**How to avoid:** The existing `useEffect` at line 117-119 already resets page when `filterStatusCode` or `filterErrorType` change. Add the new filter states (`filterOperationName`, `filterTimeStart`, `filterTimeEnd`) to that dependency array.

**Warning signs:** "Nenhum erro encontrado" message when errors clearly exist for the filter combination.

### Pitfall 3: The loadRecords useCallback Dependency Array

**What goes wrong:** `loadRecords` (line 92-110) uses `useCallback` with all filter states in the dependency array. If new filters are added to the component but NOT to the dependency array, the search call will use stale filter values.

**Why it happens:** React's stale closure issue with useCallback.

**How to avoid:** Add `filterOperationName`, `timestampStart`, and `timestampEnd` (derived values, not raw strings) to the `loadRecords` dependency array AND to the `loadRecords` search call.

**Warning signs:** Changing a filter doesn't change the results.

### Pitfall 4: Aggregation Summary Not Including New Filters Context

**What goes wrong:** The aggregation cards (`byStatusCode`, `byErrorType`, `byOperationName`) are loaded once on mount (line 75-89) and show TOTAL counts for the test. When the user applies a time filter, the cards still show unfiltered totals, which can be confusing.

**Why it happens:** The cards are fetched independently from the search results, without filter context.

**How to avoid:** For v1, this is acceptable behavior -- the cards show total distribution and serve as quick-filter buttons. The table below the cards shows the correctly filtered results. Document this in the UI with clear visual distinction (the cards are summary/navigation, the table is the filtered result). The time filter affects only the table, not the card aggregations.

**Warning signs:** User expects card counts to update when time filter is applied. This is a conscious design tradeoff, not a bug.

### Pitfall 5: Empty datetime-local Value Handling

**What goes wrong:** An empty `datetime-local` input produces `""` as its value. `new Date("").getTime()` returns `NaN`. Passing `NaN` as a SQL parameter causes unexpected behavior.

**Why it happens:** Empty string is not a valid date.

**How to avoid:** Guard with `filterTimeStart ? new Date(filterTimeStart).getTime() : undefined`. Only pass the timestamp parameter when the string is non-empty.

**Warning signs:** SQL errors or unexpected zero-result queries.

## Code Examples

### Example 1: Extended searchErrors Call from ErrorExplorer

```typescript
// Source: extending existing pattern at ErrorExplorer.tsx:92-110
const loadRecords = useCallback(async () => {
  setLoading(true);
  try {
    const timestampStart = filterTimeStart
      ? new Date(filterTimeStart).getTime()
      : undefined;
    const timestampEnd = filterTimeEnd
      ? new Date(filterTimeEnd).getTime()
      : undefined;

    const result = await window.stressflow.errors.search({
      testId,
      statusCode: filterStatusCode,
      errorType: filterErrorType,
      operationName: filterOperationName,
      timestampStart,
      timestampEnd,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    setRecords(result.records as ErrorRecord[]);
    setTotal(result.total);
  } catch {
    setRecords([]);
    setTotal(0);
  } finally {
    setLoading(false);
  }
}, [
  testId,
  filterStatusCode,
  filterErrorType,
  filterOperationName,
  filterTimeStart,
  filterTimeEnd,
  page,
]);
```

### Example 2: Operation Card (replicating existing card pattern)

```tsx
// Source: replicating pattern at ErrorExplorer.tsx:138-200
{Object.keys(byOperationName).length > 0 && (
  <div className="p-3 bg-sf-surface border border-sf-border rounded-xl">
    <h4 className="text-xs font-medium text-sf-textSecondary mb-2 flex items-center gap-1.5">
      <Layers className="w-3.5 h-3.5" />
      Por Operacao
    </h4>
    <div className="space-y-1">
      {Object.entries(byOperationName).map(([name, count]) => (
        <button
          key={name}
          onClick={() =>
            setFilterOperationName(
              filterOperationName === name ? undefined : name,
            )
          }
          className={`w-full flex justify-between items-center text-xs px-2 py-1 rounded transition-all ${
            filterOperationName === name
              ? "bg-sf-primary/20 text-sf-primary"
              : "hover:bg-sf-bg text-sf-textSecondary"
          }`}
        >
          <span className="text-sf-text truncate">{name}</span>
          <span className="font-mono">
            {count.toLocaleString("pt-BR")}
          </span>
        </button>
      ))}
    </div>
  </div>
)}
```

### Example 3: Datetime-Local Inputs Section

```tsx
// Source: new section between cards and chips
<div className="flex items-center gap-3">
  <div className="flex items-center gap-2">
    <label className="text-xs text-sf-textMuted whitespace-nowrap">
      Periodo:
    </label>
    <input
      type="datetime-local"
      value={filterTimeStart}
      onChange={(e) => setFilterTimeStart(e.target.value)}
      className="bg-sf-bg border border-sf-border rounded-lg px-2.5 py-1 text-xs text-sf-text focus:border-sf-primary focus:outline-none transition-colors"
      style={{ colorScheme: "dark" }}
    />
    <span className="text-xs text-sf-textMuted">ate</span>
    <input
      type="datetime-local"
      value={filterTimeEnd}
      onChange={(e) => setFilterTimeEnd(e.target.value)}
      className="bg-sf-bg border border-sf-border rounded-lg px-2.5 py-1 text-xs text-sf-text focus:border-sf-primary focus:outline-none transition-colors"
      style={{ colorScheme: "dark" }}
    />
  </div>
</div>
```

### Example 4: Filter Active Chips (extended)

```tsx
// Source: extending pattern at ErrorExplorer.tsx:204-226
{filterOperationName && (
  <button
    onClick={() => setFilterOperationName(undefined)}
    className="flex items-center gap-1 px-2 py-0.5 bg-sf-primary/10 text-sf-primary rounded-full"
  >
    Operacao: {filterOperationName}
    <XCircle className="w-3 h-3" />
  </button>
)}
{(filterTimeStart || filterTimeEnd) && (
  <button
    onClick={() => { setFilterTimeStart(""); setFilterTimeEnd(""); }}
    className="flex items-center gap-1 px-2 py-0.5 bg-sf-primary/10 text-sf-primary rounded-full"
  >
    Periodo: {filterTimeStart ? format(new Date(filterTimeStart), "dd/MM HH:mm", { locale: ptBR }) : "..."} -
    {filterTimeEnd ? format(new Date(filterTimeEnd), "dd/MM HH:mm", { locale: ptBR }) : "..."}
    <XCircle className="w-3 h-3" />
  </button>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | N/A | N/A | No paradigm shifts relevant to this phase |

This phase involves zero new libraries and zero new patterns. It is purely an extension of existing code.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `color-scheme: dark` on `<input type="datetime-local">` renders dark picker in Electron 28's Chromium | Architecture Patterns (Pattern 5) | Low -- if it doesn't work, fallback is custom CSS on `::webkit-calendar-picker-indicator` pseudo-element or inline text-color override |
| A2 | No composite index on `(test_id, operation_name)` is acceptable for performance | Phase Requirements | Low -- ARCHITECTURE.md explicitly confirms this; max 10K errors per test is small dataset for SQLite |

**If this table is empty:** N/A -- two minor assumptions listed above, both low-risk.

## Open Questions

1. **Operation card count vs. filtered count**
   - What we know: The aggregation cards show total counts per test (not filtered by time period).
   - What's unclear: Whether users will be confused when time filter reduces table results but card counts stay the same.
   - Recommendation: Ship as-is for v1. Cards are navigation aids (total distribution), table is the filtered result. If feedback arises, the cards can be made reactive in a follow-up.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANALYTICS-01 | Operation filter returns only errors for selected operation | manual-only | N/A -- no test framework | N/A |
| ANALYTICS-02 | Time range filter limits errors to specified period | manual-only | N/A -- no test framework | N/A |

**Justification for manual-only:** Project has no test runner configured (documented in CLAUDE.md: "No test framework currently"). Validation will rely on manual UI verification: apply each filter, verify correct results, verify combined filters produce intersection.

### Sampling Rate
- **Per task commit:** Manual smoke test -- apply filters, verify result counts
- **Per wave merge:** Full manual test of all filter combinations
- **Phase gate:** All 4 success criteria verified manually before `/gsd-verify-work`

### Wave 0 Gaps
None -- no test infrastructure to gap-fill given no framework is configured.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A -- local desktop app, single user |
| V5 Input Validation | Yes | Parameterized SQL queries (existing `?` placeholder pattern) |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for SQLite Query Extension

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via filter params | Tampering | Parameterized queries with `?` placeholders (already established pattern) [VERIFIED: repository.ts] |
| Timestamp manipulation to access other test's errors | Information Disclosure | `testId` is always included in WHERE clause (D5 locks single-test scope) [VERIFIED: ErrorExplorer always passes testId] |

**Note:** No new security concerns introduced. All new parameters pass through the same `searchErrors()` prepared statement pattern that prevents injection. The `operationName` parameter is a string comparison against a TEXT column, and timestamps are INTEGER comparisons. Both use `?` placeholders.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `electron/database/repository.ts` -- `searchErrors()` at line 248, `getErrorsByStatusCode()` at line 291, `getErrorsByType()` at line 307
- Codebase analysis: `electron/database/database.ts` -- `test_errors` schema (line 222), indexes (lines 237-251)
- Codebase analysis: `src/components/ErrorExplorer.tsx` -- full component (334 lines), filter state pattern, card pattern, chip pattern
- Codebase analysis: `electron/main.ts` -- IPC handlers for `errors:search` (line 1058), `errors:byStatusCode` (line 1086), `errors:byErrorType` (line 1100)
- Codebase analysis: `electron/preload.ts` -- IPC whitelist (line 44), errors API (line 199)
- Codebase analysis: `src/types/index.ts` -- `ErrorRecord` interface (line 78), `StressFlowAPI.errors` (line 898)
- `.planning/research/ARCHITECTURE.md` -- Feature B analysis (lines 100-126), index recommendation (lines 442-446)

### Secondary (MEDIUM confidence)
- npm list: `date-fns@3.6.0` installed and confirmed [VERIFIED: npm list]

### Tertiary (LOW confidence)
- Electron 28 Chromium `color-scheme: dark` support for datetime-local picker [ASSUMED -- standard Chromium feature but not verified against specific Electron 28 build]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing
- Architecture: HIGH -- every pattern is a verified clone of existing codebase patterns
- Pitfalls: HIGH -- identified from direct code analysis of existing component behavior

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable -- no external dependencies, no moving targets)
