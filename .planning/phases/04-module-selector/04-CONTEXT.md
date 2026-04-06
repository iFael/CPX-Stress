# Phase 4 — Module Selector: Context & Decisions

**Phase:** 4 — Module Selector
**Requirement:** PRESET-03
**Created:** 2026-04-06
**Status:** Decisions complete — ready for planning

---

## Requirement (PRESET-03)

Usuário pode selecionar via checkboxes quais módulos do preset MisterT incluir em um teste específico (ex: apenas Estoque + Financeiro), sem precisar editar JSON ou criar um preset do zero.

---

## Prior Decisions (Inherited)

| Source | Decision | Impact on Phase 4 |
|--------|----------|-------------------|
| D1 (Phase 3) | Preset persists full `TestConfig` including `operations[]` | Module selection modifies `operations[]` directly |
| D5 (Phase 3) | URL base replaced on apply via `replaceBaseUrl()` | Module selector operates on ops already URL-adjusted |
| Store (existing) | `updateConfig()` clears `activePreset` (line 318) | New dedicated action needed for module toggles |
| Template (existing) | 10 ops hardcoded in `test-presets.ts` | Source of truth for available modules |

---

## Decisions

### D1: Selectable Operations — 7 business modules

**Operations 0-2 are fixed infrastructure** (invisible to the selector):
- `[0]` Página de Login (GET)
- `[1]` Login POST
- `[2]` Menu Principal (GET)

**Operations 3-9 are selectable modules** (7 checkboxes):
- `[3]` CPX-Fretes (R=89)
- `[4]` CPX-Rastreio (R=90)
- `[5]` Estoque (R=122)
- `[6]` Ordens E/S (R=102)
- `[7]` Produção (R=84)
- `[8]` Faturamento (R=206)
- `[9]` Financeiro (R=250)

**Note:** REQUIREMENTS.md says "9 módulos" but the actual template has 7 business modules + 3 infra ops. The requirement text counts Login and Menu as "modules" loosely. The selector exposes exactly 7 checkboxes.

**Rationale:** Menu Principal is infrastructure needed for CTRL extraction flow — disabling it could break the session chain. Business modules are independent GET requests that can be freely toggled.

### D2: UI Placement — Always-visible section in TestConfig

The module selector is a **new always-visible section** placed between "Configuração de carga" (VUs/duration) and "Configurações Avançadas" (ramp-up collapsible).

**Layout:**
- Section label: "Módulos do Teste" with icon and InfoTooltip
- Grid of 2-3 columns with compact checkboxes (sf-* styled)
- All 7 checkboxes checked by default
- Optional: "Selecionar Todos/Nenhum" toggle link

**Rationale:** The module selector is the core feature of this phase — hiding it behind a collapsible reduces discoverability. An always-visible grid of checkboxes is compact enough not to bloat the form.

### D3: Storage — Filter operations[] directly

Unchecking a module **removes its operation from `config.operations[]`**. The engine receives only the selected operations (infra ops + checked modules).

**No changes needed to:**
- `TestConfig` interface (no new fields)
- `TestOperation` interface
- Engine execution logic
- SQLite schema
- IPC channels

**How the selector knows which modules are active:**
The UI compares `config.operations` against the full template (`buildMistertOperations(currentBaseUrl)`) by matching operation names. If an operation name from the template exists in the config, its checkbox is checked.

**Preset save with partial selection:** Saves the filtered `operations[]` as-is. Loading the preset shows only the modules present in the saved operations.

### D4: Preset Interaction — Preserve activePreset on module toggle

**New store action:** `updateModuleSelection(operations: TestOperation[])` updates `config.operations` and `config.url` (first op URL) **without clearing `activePreset`**.

The existing `updateConfig(partial)` continues to clear `activePreset` for all other changes (VUs, duration, URL, ramp-up).

**Behavior matrix:**
| Action | Clears activePreset? |
|--------|---------------------|
| Toggle module checkbox | No (via `updateModuleSelection`) |
| Change VUs/duration | Yes (via `updateConfig`) |
| Change environment URL | Yes (via `handleEnvironmentChange`) |
| Load a preset | No (sets new `activePreset`) |
| Save preset | No (preserves current) |

**Rationale:** Module selection is a temporary customization of the active preset for a specific test run. The user loads "MisterT Completo", unchecks 4 modules for a focused test, runs it, then can "Salvar Preset" to persist this selection as a new preset or "Atualizar" the active one. Clearing the preset reference on every checkbox toggle would be disruptive.

---

## Implementation Strategy

### Files to modify:
1. **`src/stores/test-store.ts`** — Add `updateModuleSelection` action
2. **`src/components/TestConfig.tsx`** — Add module selector section with checkboxes
3. **`src/constants/test-presets.ts`** — Export module metadata (names for matching)
4. **`src/types/index.ts`** — Add `TestActions.updateModuleSelection` to interface (if needed)

### Files NOT modified:
- Engine (`electron/engine/stress-engine.ts`) — receives filtered operations, no change
- Database/repository — no schema changes
- IPC/preload — no new channels
- PresetModal/SavePresetDialog — work with operations[] as-is

### Key implementation detail:
The selector derives checkbox state by comparing `config.operations[].name` against the known module names from the template. This means the selector only works for MisterT preset operations (which is the scope of PRESET-03). Custom user presets without standard MisterT operation names won't show the module selector.

---

## Success Criteria (from ROADMAP.md)

1. Ao selecionar o preset MisterT, checkboxes individuais para cada um dos 7 módulos ficam visíveis e todos marcados por padrão
2. Desmarcar um módulo remove apenas a operação desse módulo do teste sem afetar os demais
3. Aplicar seleção parcial inicia o teste com Login + Menu + apenas módulos selecionados
4. Sem seleção explícita = todos os 7 módulos incluídos (sem regressão)

---

## Deferred Ideas

- Module grouping (ex: "Logística" = Fretes + Rastreio) — v2
- Per-module weight/repetition count — v2
- Module selector for custom (non-MisterT) presets — requires generic operation tagging
