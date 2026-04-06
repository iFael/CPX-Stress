# Phase 4: Module Selector - Research

**Researched:** 2026-04-06
**Domain:** React UI (checkbox grid), Zustand state management, MisterT operation template
**Confidence:** HIGH

## Summary

Phase 4 is a focused UI-only feature that adds a checkbox grid to the TestConfig form, allowing the user to toggle individual MisterT ERP business modules (7 of 10 operations) on/off before running a stress test. The first 3 operations (login page, login POST, main menu) are fixed infrastructure and always included.

The implementation surface is small: one new UI section inside `TestConfig.tsx`, one new store action in `test-store.ts`, one metadata export from `test-presets.ts`, and a type update in `index.ts`. No engine changes, no IPC changes, no SQLite changes, and no new components are required. The codebase already has a checkbox visual pattern in `WelcomeOverlay.tsx` that should be replicated for consistency.

**Primary recommendation:** Build the module selector as an inline section within `TestConfig.tsx` (not a separate component file), using the existing custom checkbox visual pattern from `WelcomeOverlay.tsx`. Add a dedicated `updateModuleSelection` store action that updates `config.operations` without clearing `activePreset`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1: Selectable Operations -- 7 business modules**
- Operations 0-2 are fixed infrastructure (invisible to selector): Pagina de Login (GET), Login POST, Menu Principal (GET)
- Operations 3-9 are selectable modules (7 checkboxes): CPX-Fretes (R=89), CPX-Rastreio (R=90), Estoque (R=122), Ordens E/S (R=102), Producao (R=84), Faturamento (R=206), Financeiro (R=250)
- REQUIREMENTS.md says "9 modulos" but the actual template has 7 business modules + 3 infra ops

**D2: UI Placement -- Always-visible section in TestConfig**
- New always-visible section placed between "Configuracao de carga" (VUs/duration) and "Configuracoes Avancadas" (ramp-up collapsible)
- Section label: "Modulos do Teste" with icon and InfoTooltip
- Grid of 2-3 columns with compact checkboxes (sf-* styled)
- All 7 checkboxes checked by default
- Optional: "Selecionar Todos/Nenhum" toggle link

**D3: Storage -- Filter operations[] directly**
- Unchecking a module removes its operation from `config.operations[]`
- No changes to TestConfig interface, TestOperation interface, Engine, SQLite, or IPC
- UI derives checkbox state by comparing `config.operations[].name` against full template
- Preset save with partial selection saves filtered `operations[]` as-is

**D4: Preset Interaction -- Preserve activePreset on module toggle**
- New store action: `updateModuleSelection(operations: TestOperation[])` updates `config.operations` and `config.url` without clearing `activePreset`
- Existing `updateConfig(partial)` continues to clear `activePreset` for all other changes
- Module selection is temporary customization of active preset for a specific test run

### Claude's Discretion

- Grid column count (2 vs 3) based on available width
- Whether to implement the "Selecionar Todos/Nenhum" toggle link (optional per D2)
- Exact checkbox visual style (custom SVG vs lucide icon)
- Animation on section appearance (if any)

### Deferred Ideas (OUT OF SCOPE)

- Module grouping (ex: "Logistica" = Fretes + Rastreio) -- v2
- Per-module weight/repetition count -- v2
- Module selector for custom (non-MisterT) presets -- requires generic operation tagging
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRESET-03 | Usuario pode selecionar via checkboxes quais dos 9 modulos do preset MisterT incluir em um teste especifico (ex: apenas Estoque + Financeiro), sem precisar editar JSON ou criar um preset do zero | All findings below directly enable implementation: module metadata export, checkbox UI pattern, `updateModuleSelection` store action, and operation filtering logic |
</phase_requirements>

## Standard Stack

No new libraries are required for this phase. All functionality is built with existing dependencies.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x | UI framework | Already in use |
| Zustand | 4.5.x | State management | Already in use, single store pattern |
| Tailwind CSS | 3.4.x | Styling | Already in use, sf-* tokens |
| lucide-react | 0.468.0 | Icons | Already in use (note: npm registry shows latest is 1.7.0 but project pins 0.468.0) |

[VERIFIED: codebase package.json and installed modules]

**Installation:** None required -- all dependencies already present.

## Architecture Patterns

### Files Modified (4 files total)

```
src/
  constants/
    test-presets.ts       # Export MISTERT_MODULE_METADATA constant
  stores/
    test-store.ts         # Add updateModuleSelection action
  components/
    TestConfig.tsx         # Add module selector UI section
  types/
    index.ts              # Add updateModuleSelection to TestActions interface
```

### Pattern 1: Module Metadata Constant

**What:** Export a typed array of module metadata from `test-presets.ts` that maps operation indices 3-9 to display names.
**When to use:** The UI needs to know which operations are "selectable modules" vs fixed infrastructure. This metadata is the single source of truth.
**Why:** The template `MISTERT_OPERATIONS_TEMPLATE` is `readonly` and private. The metadata exposes only the module names and their position in the template, enabling the checkbox grid to match operations by name.

[VERIFIED: codebase -- `test-presets.ts` lines 22-95]

```typescript
// Source: derived from MISTERT_OPERATIONS_TEMPLATE (test-presets.ts lines 22-95)

/**
 * Metadados dos modulos selecionaveis do MisterT.
 * Indices 0-2 sao infraestrutura fixa (Login, Login POST, Menu).
 * Indices 3-9 sao modulos de negocio que o usuario pode ativar/desativar.
 */
export const MISTERT_MODULE_METADATA = [
  { index: 3, name: "CPX-Fretes", code: "R=89" },
  { index: 4, name: "CPX-Rastreio", code: "R=90" },
  { index: 5, name: "Estoque", code: "R=122" },
  { index: 6, name: "Ordens E/S", code: "R=102" },
  { index: 7, name: "Producao", code: "R=84" },
  { index: 8, name: "Faturamento", code: "R=206" },
  { index: 9, name: "Financeiro", code: "R=250" },
] as const;
```

### Pattern 2: Store Action That Preserves activePreset

**What:** A new `updateModuleSelection` action that updates `config.operations` and `config.url` atomically without clearing `activePreset`.
**When to use:** When the user toggles a module checkbox.
**Why:** The existing `updateConfig` always sets `activePreset: null` (line 318 of test-store.ts). Module toggles are a temporary customization of the active preset and should not clear it (CONTEXT.md D4).

[VERIFIED: codebase -- `test-store.ts` lines 315-319]

```typescript
// Source: pattern derived from existing applyPreset action (test-store.ts line 380)

// In TestActions interface (types/index.ts):
updateModuleSelection: (operations: TestOperation[]) => void;

// In store implementation (test-store.ts):
updateModuleSelection: (operations) =>
  set((state) => ({
    config: {
      ...state.config,
      url: operations[0]?.url || state.config.url,
      operations,
    },
    // activePreset NOT cleared (D4)
  })),
```

### Pattern 3: Checkbox State Derivation (No Extra State)

**What:** Derive checkbox checked/unchecked state by comparing `config.operations[].name` against the known module names from the template.
**When to use:** Every render of the module selector section.
**Why:** This avoids adding a separate `selectedModules: string[]` state that could go out of sync with `config.operations`. The operations array IS the source of truth (CONTEXT.md D3).

[VERIFIED: CONTEXT.md D3 -- "The UI compares config.operations against the full template by matching operation names"]

```typescript
// Source: CONTEXT.md D3 implementation approach

// Inside TestConfig component:
const fullTemplate = buildMistertOperations(currentBaseUrl);
const currentOpNames = new Set((config.operations || []).map((op) => op.name));

// For each module checkbox:
const isChecked = currentOpNames.has(moduleName);
```

### Pattern 4: Operation Filtering on Toggle

**What:** When toggling a module, reconstruct the operations array from the full template, keeping infrastructure ops + only checked modules.
**When to use:** Inside the checkbox onChange handler.
**Why:** Rebuilding from the template (with current base URL) ensures operations always have correct URLs and ordering, rather than manually splicing.

```typescript
// Source: derived from D3 filtering approach

const handleModuleToggle = useCallback(
  (moduleName: string, checked: boolean) => {
    const fullTemplate = buildMistertOperations(currentBaseUrl);
    const infraOps = fullTemplate.slice(0, 3); // Fixed: Login, Login POST, Menu

    // Current module selection (by name)
    const currentModuleNames = new Set(
      (config.operations || [])
        .slice(3) // skip infra
        .map((op) => op.name)
    );

    if (checked) {
      currentModuleNames.add(moduleName);
    } else {
      currentModuleNames.delete(moduleName);
    }

    // Rebuild: infra ops + checked modules in template order
    const selectedOps = fullTemplate.filter(
      (op, idx) => idx < 3 || currentModuleNames.has(op.name)
    );

    updateModuleSelection(selectedOps);
  },
  [config.operations, currentBaseUrl, updateModuleSelection]
);
```

### Pattern 5: Existing Checkbox Visual Pattern (from WelcomeOverlay)

**What:** The project already has a custom-styled checkbox in `WelcomeOverlay.tsx` using the `peer` + `sr-only` technique with an SVG checkmark.
**When to use:** Reuse this exact visual pattern for the module checkboxes to maintain UI consistency.
**Why:** Consistency with existing codebase. No need to invent a new checkbox style.

[VERIFIED: codebase -- `WelcomeOverlay.tsx` lines 251-279]

```tsx
// Source: WelcomeOverlay.tsx lines 251-279
<label className="flex items-center gap-2.5 cursor-pointer group select-none">
  <div className="relative flex items-center justify-center">
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => handleToggle(e.target.checked)}
      className="peer sr-only"
    />
    <div className="w-[18px] h-[18px] rounded-md border border-sf-border bg-sf-surface peer-checked:bg-sf-primary peer-checked:border-sf-primary peer-focus-visible:ring-2 peer-focus-visible:ring-sf-primary/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sf-bg transition-all duration-200">
      {isChecked && (
        <svg className="w-full h-full text-white p-0.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  </div>
  <span className="text-sm text-sf-text">{label}</span>
</label>
```

### Anti-Patterns to Avoid

- **Separate component file for ModuleSelector:** The selector is tightly coupled to TestConfig's state and currentBaseUrl. Extracting it to a separate file adds indirection with no reuse benefit since CONTEXT.md explicitly says module selector only works for MisterT presets.
- **Storing selected modules in a separate state field:** The operations array IS the state. Adding `selectedModules: string[]` creates sync issues and violates D3.
- **Using `updateConfig` for module toggles:** This clears `activePreset` (line 318), violating D4. Must use the dedicated `updateModuleSelection` action.
- **Hardcoding module names in TestConfig.tsx:** Use `MISTERT_MODULE_METADATA` exported from `test-presets.ts` as single source of truth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom checkbox UI | A new checkbox component from scratch | Copy the existing pattern from `WelcomeOverlay.tsx` (peer + sr-only + SVG checkmark) | Visual consistency, accessibility already handled |
| Operation filtering | Manual index-based splice/insert | Filter from `buildMistertOperations(currentBaseUrl)` by name matching | Guarantees correct URL base and operation order |

**Key insight:** This phase requires zero new abstractions. Every pattern needed already exists in the codebase. The work is purely compositional -- assembling existing patterns into a new UI section.

## Common Pitfalls

### Pitfall 1: Module Names Out of Sync with Template

**What goes wrong:** If the module metadata constant uses different names than `MISTERT_OPERATIONS_TEMPLATE`, the name-matching logic for checkbox state derivation silently fails -- checkboxes appear unchecked even when operations are present.
**Why it happens:** Copy-paste error when defining `MISTERT_MODULE_METADATA`, or future edits to the template without updating metadata.
**How to avoid:** Derive `MISTERT_MODULE_METADATA` directly from the same constant, or verify at development time that names match. The metadata `name` field must exactly match the `name` field in `MISTERT_OPERATIONS_TEMPLATE`.
**Warning signs:** Checkboxes always appear unchecked after loading a preset, or toggling has no effect.

### Pitfall 2: Checkbox Toggle Doesn't Update URL

**What goes wrong:** `config.url` (the top-level URL field) stays stale after toggling modules. Since `config.url` is set from `operations[0].url`, and infra ops never change, this is actually safe. However, if all modules are unchecked and the operations list only has infra ops, the URL still points to the login page -- which is correct.
**Why it happens:** Misunderstanding that `config.url` needs to match a "selected module" URL.
**How to avoid:** Always set `config.url = operations[0]?.url` in `updateModuleSelection`, which is the login page GET URL. This matches existing behavior.
**Warning signs:** None -- this pitfall is about over-engineering a fix that isn't needed.

### Pitfall 3: Empty Module Selection (All Unchecked)

**What goes wrong:** User unchecks all 7 modules. The test would run with only infra ops (login + menu) -- a valid but potentially confusing scenario (the test "succeeds" but doesn't test any business module).
**Why it happens:** No guard prevents deselecting all modules.
**How to avoid:** Allow it (it's technically valid -- login stress test), but consider adding a subtle warning text like "Nenhum modulo selecionado -- o teste executara apenas login e menu" when all modules are unchecked. This is a UX enhancement within Claude's discretion.
**Warning signs:** User confusion when results show only 3 operations.

### Pitfall 4: useCallback Dependencies

**What goes wrong:** The `handleModuleToggle` callback captures stale `config.operations` due to missing or incorrect dependency array.
**Why it happens:** `config.operations` is an array reference that changes on every toggle.
**How to avoid:** Include `config.operations` in the useCallback dependency array. Or, better: read from the store inside the callback using `useTestStore.getState()` to avoid stale closures.
**Warning signs:** Toggling one module resets another module's state.

### Pitfall 5: Selector Visibility for Non-MisterT Presets

**What goes wrong:** The module selector grid shows up when a custom user preset (non-MisterT) is active, but the checkbox logic doesn't match any operations because they have different names.
**Why it happens:** No condition gates the selector visibility to MisterT-style operations.
**How to avoid:** Show the module selector section ONLY when the current operations include at least one operation whose name matches a `MISTERT_MODULE_METADATA` entry. This aligns with CONTEXT.md: "the selector only works for MisterT preset operations."
**Warning signs:** Checkboxes all unchecked with a non-MisterT preset, confusing the user.

## Code Examples

### Complete Module Toggle Handler

```typescript
// Source: synthesized from CONTEXT.md D3/D4 + existing codebase patterns

const updateModuleSelection = useTestStore((s) => s.updateModuleSelection);

const handleModuleToggle = useCallback(
  (moduleName: string, checked: boolean) => {
    const fullTemplate = buildMistertOperations(currentBaseUrl);
    const currentOps = config.operations || [];

    const currentModuleNames = new Set(
      currentOps.filter((_, idx) => idx >= 3).map((op) => op.name)
    );

    if (checked) {
      currentModuleNames.add(moduleName);
    } else {
      currentModuleNames.delete(moduleName);
    }

    // Rebuild maintaining template order
    const newOps = fullTemplate.filter(
      (op, idx) => idx < 3 || currentModuleNames.has(op.name)
    );

    updateModuleSelection(newOps);
  },
  [config.operations, currentBaseUrl, updateModuleSelection]
);
```

### Select All / Deselect All

```typescript
// Source: synthesized from D2 optional feature

const handleSelectAll = useCallback(
  (selectAll: boolean) => {
    const fullTemplate = buildMistertOperations(currentBaseUrl);
    if (selectAll) {
      updateModuleSelection(fullTemplate);
    } else {
      // Keep only infra ops
      updateModuleSelection(fullTemplate.slice(0, 3));
    }
  },
  [currentBaseUrl, updateModuleSelection]
);
```

### MisterT Operations Detection (Gate Selector Visibility)

```typescript
// Source: synthesized from CONTEXT.md D3 key implementation detail

const MISTERT_MODULE_NAMES = new Set(
  MISTERT_MODULE_METADATA.map((m) => m.name)
);

const isMistertPreset = (config.operations || []).some(
  (op) => MISTERT_MODULE_NAMES.has(op.name)
);

// Only render module selector when MisterT operations are detected
{isMistertPreset && (
  <fieldset className="mb-4">
    {/* Module selector grid */}
  </fieldset>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Edit JSON manually to remove operations | Checkbox grid in UI | Phase 4 (this phase) | Users can customize MisterT tests without technical knowledge |

**No deprecated patterns apply** -- this phase introduces new UI on a stable foundation.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Using `slice(0, 3)` reliably isolates infra ops -- assumes template order never changes | Architecture Patterns | LOW -- template is hardcoded constant, order is intentional and documented |
| A2 | Name-based matching is sufficient for operation identity | Architecture Patterns | LOW -- operation names are unique within the template and unlikely to collide with user-created operations |
| A3 | lucide-react 0.468.0 has the `Boxes` or `LayoutGrid` icon for section header | Code Examples | VERY LOW -- if not, `Layers` icon already imported in TestConfig.tsx can be reused |

All major claims are verified from codebase and CONTEXT.md. No high-risk assumptions.

## Open Questions (RESOLVED)

1. **Grid column count (2 vs 3)** — RESOLVED: 3 colunas (`grid-cols-3`) per UI-SPEC.md (Claude's discretion) e Plan 04-02.
   - What we know: D2 says "Grid of 2-3 columns". The TestConfig form has max-w-2xl (672px).
   - What's unclear: Whether 3 columns would be too tight for label text (longest: "CPX-Rastreio", "Faturamento")
   - Recommendation: Use 3 columns (`grid-cols-3`) since labels are short (max ~14 chars). This keeps the section compact. Planner can decide.

2. **"Selecionar Todos/Nenhum" toggle** — RESOLVED: Implementar per UI-SPEC.md (Claude's discretion) e Plan 04-02.
   - What we know: D2 marks this as "Optional"
   - What's unclear: Whether the added complexity is justified for 7 checkboxes
   - Recommendation: Implement it as a small text link above the grid. Cost is minimal (one extra callback) and it's a nice UX touch for "deselect all, then pick 2" workflows.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None configured (CLAUDE.md: "No Test Framework Currently") |
| Config file | none |
| Quick run command | `npm run build` (type-check + build) |
| Full suite command | `npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRESET-03-a | Checkboxes visible, all checked by default when MisterT preset active | manual-only | Visual inspection in Electron | N/A |
| PRESET-03-b | Unchecking module removes only that operation from config.operations | manual-only | Toggle checkbox, verify via "Ver Operacoes" section | N/A |
| PRESET-03-c | Partial selection starts test with Login + selected modules only | manual-only | Start test with 2 modules, verify result operationMetrics | N/A |
| PRESET-03-d | No regression: default behavior = all 7 modules included | smoke | `npm run build` (type safety) | N/A |

**Justification for manual-only:** No test framework configured. The project explicitly notes this in CLAUDE.md. Adding a test framework is out of scope for this phase.

### Sampling Rate
- **Per task commit:** `npm run build` (TypeScript compilation catches type errors)
- **Per wave merge:** Visual smoke test in Electron dev mode (`npm run dev`)
- **Phase gate:** Manual walkthrough of all 4 success criteria

### Wave 0 Gaps
- None required -- no test framework means no test files to create. Build verification is sufficient for type safety.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | no | Checkbox toggles are boolean; operation names are from a hardcoded constant, not user input |
| V6 Cryptography | no | N/A |

**Security assessment:** This phase is pure UI state manipulation within the renderer process. No user input is accepted (checkboxes toggle between predefined values). No IPC channels are added. No data crosses trust boundaries. The attack surface is zero.

### Known Threat Patterns

None applicable. The module selector operates entirely within the renderer process on hardcoded operation metadata. No injection vectors, no new IPC surface, no file I/O.

## Sources

### Primary (HIGH confidence)
- Codebase: `src/constants/test-presets.ts` -- operation template (10 ops, names, indices)
- Codebase: `src/stores/test-store.ts` -- store structure, `updateConfig` clears `activePreset` (line 318)
- Codebase: `src/components/TestConfig.tsx` -- current form layout, section ordering
- Codebase: `src/components/WelcomeOverlay.tsx` -- existing checkbox visual pattern (lines 251-279)
- Codebase: `src/types/index.ts` -- `TestActions` interface, `TestConfig` interface
- Phase context: `04-CONTEXT.md` -- all 4 locked decisions (D1-D4)

### Secondary (MEDIUM confidence)
- Codebase: `tailwind.config.mjs` -- sf-* color tokens, animation utilities, grid support

### Tertiary (LOW confidence)
- None -- all claims verified from codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing
- Architecture: HIGH -- 4 files modified, patterns verified in codebase
- Pitfalls: HIGH -- derived from concrete code analysis (store behavior, name matching)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable -- no external dependencies to go stale)
