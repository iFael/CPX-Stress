# Phase 2: Credentials System - Research

**Researched:** 2026-04-06
**Domain:** Electron IPC, .env file I/O, secure credential management, React UI
**Confidence:** HIGH

## Summary

Phase 2 adds a graphical interface for MisterT ERP credential management (username, password, base URL) and a visual alert when required credentials are missing. The core technical challenge is maintaining the existing security model: the renderer process MUST NEVER see credential values -- only boolean status and key names traverse the IPC bridge.

The existing infrastructure provides a solid foundation. `loadEnvFile()` in `electron/main.ts` already reads `.env` files, `resolveEnvPlaceholders()` already injects `STRESSFLOW_*` values into test configs, and the test preset template already uses `{{STRESSFLOW_USER}}` and `{{STRESSFLOW_PASS}}` placeholders. What is missing is: (1) the ability to WRITE to the `.env` file from the main process via IPC, (2) a status-check IPC channel that returns boolean presence (not values), and (3) the renderer UI components -- a settings screen and a missing-credentials alert banner.

The prior architecture research (`.planning/research/ARCHITECTURE.md` lines 128-176) already designed the IPC protocol for this feature. This research validates and extends that design with implementation-level detail specific to the planner's needs.

**Primary recommendation:** Add 3 new IPC channels (`credentials:status`, `credentials:save`, `credentials:load`), a new `AppView = "settings"` with a `CredentialsSettings.tsx` component, and a `CredentialAlert.tsx` banner in the test config view. Write `.env` exclusively to `app.getPath("userData")/.env`. Reload `envVars` in-memory after every save.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRED-01 | User configures MisterT credentials (user, password, base URL) via GUI without manually editing .env; credentials persist in .env in the app data directory securely (renderer never sees values, only key names) | IPC channels `credentials:save` and `credentials:load` in main process; .env merge-write strategy; `CredentialsSettings.tsx` component with password-masked inputs; key whitelist validation `^STRESSFLOW_\w+$` |
| CRED-02 | Main screen shows visible alert when required credentials are missing, with direct path to the settings screen | IPC channel `credentials:status` returning boolean map; `CredentialAlert.tsx` banner in TestConfig; startup check in App.tsx via `useEffect`; Zustand `credentialStatus` state slice |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **IPC Security:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` -- never relax
- **New IPC channel = 4 atomic file updates:** `preload.ts` (whitelist), `preload.ts` (api), `src/types/index.ts` (Window.stressflow), `main.ts` (handler)
- **Credentials via .env:** Only `STRESSFLOW_*` prefix resolved; renderer never sees secret values
- **UI text in pt-BR:** All labels, tooltips, messages, errors in Brazilian Portuguese
- **Colors:** `sf-*` tokens only, never raw Tailwind colors
- **Types centralized:** All shared types in `src/types/index.ts`
- **Path alias:** `@/*` for `src/*` in all renderer imports
- **Zustand selectors:** Always use `useTestStore((s) => s.field)`, never call without selector
- **No test framework configured:** No automated tests required for this phase

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Electron | 28.3.x | Main process: .env file I/O, IPC handlers | Already installed [VERIFIED: CLAUDE.md] |
| React | 18.3.x | Renderer: credential form, alert banner | Already installed [VERIFIED: CLAUDE.md] |
| Zustand | 4.5.x | Store: credential status state | Already installed [VERIFIED: CLAUDE.md] |
| Tailwind CSS | 3.4.x | Styling with sf-* tokens | Already installed [VERIFIED: CLAUDE.md] |
| lucide-react | 0.468.x | Icons (Settings, AlertTriangle, Eye, EyeOff, Save, Check) | Already installed [VERIFIED: CLAUDE.md] |

### No New Dependencies

This phase requires **zero new npm packages**. All functionality is built with:
- Node.js `fs` (already used in main process for .env reading)
- Electron `app.getPath("userData")` (already used for data path)
- Existing IPC infrastructure (contextBridge, ipcMain.handle)

**Installation:** None required.

## Architecture Patterns

### Recommended File Changes

```
electron/
  main.ts              # ADD: 3 IPC handlers (credentials:status, credentials:save, credentials:load)
                       # ADD: saveEnvFile() helper, mergeEnvEntries() helper
                       # MODIFY: envVars reload after save

electron/
  preload.ts           # ADD: 3 channels to ALLOWED_INVOKE_CHANNELS
                       # ADD: credentials namespace in api object

src/
  types/index.ts       # ADD: CredentialStatus interface
                       # ADD: 'settings' to AppView union
                       # ADD: credentials namespace to Window.stressflow

  stores/test-store.ts # ADD: credentialStatus state + setCredentialStatus action + checkCredentials action

  components/
    CredentialsSettings.tsx  # NEW: Settings screen with credential form
    CredentialAlert.tsx      # NEW: Missing-credentials alert banner

  App.tsx              # MODIFY: add 'settings' view routing, startup credential check
  components/Sidebar.tsx     # MODIFY: add "Configuracoes" nav item
```

### Pattern 1: IPC Channel for Credential Status (boolean-only)

**What:** A channel that returns which STRESSFLOW_* keys are configured, WITHOUT exposing values.
**When to use:** App startup and after credential save, to determine alert visibility.
**Example:**

```typescript
// electron/main.ts — handler
// Source: project convention from existing IPC handlers [VERIFIED: electron/main.ts]
ipcMain.handle("credentials:status", async () => {
  try {
    const requiredKeys = ["STRESSFLOW_USER", "STRESSFLOW_PASS"];
    const status: Record<string, boolean> = {};
    for (const key of requiredKeys) {
      status[key] = !!(envVars[key] && envVars[key].trim() !== "");
    }
    return status;
  } catch (error) {
    console.error("[StressFlow] Erro ao verificar credenciais:", error);
    throw new Error("Nao foi possivel verificar o status das credenciais.");
  }
});
```

**Security:** Returns `{ STRESSFLOW_USER: true, STRESSFLOW_PASS: false }` -- booleans only, never values. [VERIFIED: security constraint from REQUIREMENTS.md CRED-01]

### Pattern 2: .env Merge-Write Strategy

**What:** Writing credentials to `.env` while preserving existing entries and comments.
**When to use:** `credentials:save` handler.
**Example:**

```typescript
// electron/main.ts — .env write helper
// Source: design from .planning/research/ARCHITECTURE.md lines 151-156 [VERIFIED: codebase]
function saveEnvFile(entries: Array<{ key: string; value: string }>): string {
  const envPath = path.join(app.getPath("userData"), ".env");

  // Validar chaves: apenas STRESSFLOW_* permitidas
  for (const entry of entries) {
    if (!/^STRESSFLOW_\w+$/.test(entry.key)) {
      throw new Error(`Chave invalida: ${entry.key}`);
    }
  }

  // Ler .env existente (se houver)
  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  }

  // Criar mapa das novas entradas
  const newEntries = new Map(entries.map((e) => [e.key, e.value]));
  const written = new Set<string>();

  // Substituir valores existentes in-place
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return line;
    const key = trimmed.substring(0, eqIndex).trim();
    if (newEntries.has(key)) {
      written.add(key);
      return `${key}=${newEntries.get(key)}`;
    }
    return line;
  });

  // Append chaves novas que nao existiam no arquivo
  for (const [key, value] of newEntries) {
    if (!written.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, updatedLines.join("\n"), "utf-8");

  // Recarregar variaveis em memoria
  envVars = loadEnvFile();

  return envPath;
}
```

**Critical detail:** After `fs.writeFileSync`, MUST call `envVars = loadEnvFile()` to reload the in-memory cache. Otherwise the next test run uses stale values. [VERIFIED: envVars is a module-level var at line 65 of main.ts, loaded once at line 848]

### Pattern 3: Credential Form in Renderer (values never leave local state)

**What:** Password-masked inputs where values exist only in component-local `useState`, submitted via IPC, then cleared from state.
**When to use:** `CredentialsSettings.tsx` component.
**Example:**

```typescript
// src/components/CredentialsSettings.tsx
// Source: existing input patterns from TestConfig.tsx [VERIFIED: src/components/TestConfig.tsx]
const [user, setUser] = useState("");      // Local state ONLY
const [pass, setPass] = useState("");      // Never stored in Zustand

const handleSave = useCallback(async () => {
  try {
    await window.stressflow.credentials.save([
      { key: "STRESSFLOW_USER", value: user },
      { key: "STRESSFLOW_PASS", value: pass },
    ]);
    // Limpar valores da memoria local
    setUser("");
    setPass("");
    toast.success("Credenciais salvas com sucesso!");
    // Atualizar status no store
    const status = await window.stressflow.credentials.status();
    setCredentialStatus(status);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Erro ao salvar credenciais.");
  }
}, [user, pass, toast, setCredentialStatus]);
```

**Security invariant:** Credential values exist ONLY in:
1. Component-local `useState` (cleared after save)
2. IPC message transit (transient)
3. Main process memory (`envVars` dict)
4. `.env` file on disk

They NEVER exist in: Zustand store, localStorage, DevTools-accessible global state. [VERIFIED: REQUIREMENTS.md CRED-01 + STATE.md key decisions]

### Pattern 4: Alert Banner with Navigation Action

**What:** A dismissible warning banner in the test config view when credentials are missing.
**When to use:** `TestConfig` view when `credentialStatus` has any `false` value.
**Example:**

```typescript
// src/components/CredentialAlert.tsx
// Source: existing error alert pattern from TestConfig.tsx lines 426-446 [VERIFIED: codebase]
export function CredentialAlert({ onNavigateToSettings }: { onNavigateToSettings: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 p-4 bg-sf-warning/10 border border-sf-warning/30 rounded-xl flex items-start gap-3"
    >
      <AlertTriangle className="w-5 h-5 text-sf-warning shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium text-sf-warning">
          Credenciais MisterT nao configuradas
        </p>
        <p className="text-sm text-sf-warning/80 mt-1">
          Configure usuario e senha para executar testes autenticados no MisterT ERP.
        </p>
      </div>
      <button
        type="button"
        onClick={onNavigateToSettings}
        className="text-sm text-sf-warning hover:text-sf-warning/80 font-medium underline shrink-0"
      >
        Configurar
      </button>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Storing credential VALUES in Zustand:** Never. Store only `credentialStatus: Record<string, boolean>`. [VERIFIED: .planning/research/ARCHITECTURE.md line 259-264]
- **Writing .env to app.getAppPath():** In production, the ASAR bundle is read-only. Always write to `app.getPath("userData")/.env`. [VERIFIED: .planning/research/ARCHITECTURE.md line 274-279]
- **Exposing credential values via IPC load channel:** The `credentials:load` channel returns key NAMES only (`string[]`), never values. [VERIFIED: .planning/research/ARCHITECTURE.md line 137-140]
- **Using type="text" for password field:** Must use `type="password"` with an optional eye toggle icon for the password input. Username can be `type="text"`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env parsing | Custom parser from scratch | Extend existing `loadEnvFile()` in main.ts | Already handles quoting, comments, blank lines correctly [VERIFIED: main.ts lines 32-62] |
| Toast notifications | Custom notification system | Existing `useToast()` from `Toast.tsx` | Already has success/error/warning/info variants with sf-* styling [VERIFIED: src/components/Toast.tsx] |
| Icon library | SVG icons inline | lucide-react (already installed) | `Settings`, `Eye`, `EyeOff`, `Save`, `AlertTriangle`, `Check`, `KeyRound` already available [VERIFIED: CLAUDE.md] |
| Form input styling | Custom CSS | Existing `inputBaseClass` constant from TestConfig.tsx | Maintains visual consistency [VERIFIED: TestConfig.tsx line 46-48] |

**Key insight:** The existing codebase provides all infrastructure. This phase is purely additive -- no new dependencies, no architectural changes, just new IPC channels + new components following established patterns.

## Common Pitfalls

### Pitfall 1: Forgetting to Reload envVars After Save

**What goes wrong:** User saves credentials via GUI, starts test immediately -- but `envVars` still holds old (empty) values. Placeholders `{{STRESSFLOW_USER}}` resolve to empty strings. Test sends requests with blank credentials.
**Why it happens:** `envVars` is a module-level variable loaded once at startup (`envVars = loadEnvFile()` at line 848 of main.ts). Without explicit reload, it never updates.
**How to avoid:** The `credentials:save` handler MUST call `envVars = loadEnvFile()` after writing the file. This is the single most critical line in the entire phase.
**Warning signs:** Test runs produce 401/403 errors despite credentials being visibly "saved" in the UI.

### Pitfall 2: Writing .env to the Wrong Path

**What goes wrong:** Credentials are saved to `app.getAppPath()/.env` which is inside the ASAR bundle in production. Write fails silently or throws EACCES.
**Why it happens:** `loadEnvFile()` reads from TWO paths (app path + userData path), but the write target must ALWAYS be userData.
**How to avoid:** `saveEnvFile()` must exclusively use `path.join(app.getPath("userData"), ".env")`. Never write to `app.getAppPath()`.
**Warning signs:** Works in `npm run dev` but fails silently after `npm run dist`.

### Pitfall 3: Exposing Credential Values to Renderer

**What goes wrong:** A `credentials:load` handler that returns `{ key: "STRESSFLOW_PASS", value: "s3cret" }` violates the security model.
**Why it happens:** Developer wants to pre-fill form fields for editing convenience.
**How to avoid:** The load channel returns ONLY key names (`string[]`). The status channel returns ONLY booleans (`Record<string, boolean>`). Form fields for editing always start EMPTY -- user re-types to update. This is the security-correct UX.
**Warning signs:** Credential strings visible in DevTools Network or Console tab.

### Pitfall 4: Race Condition Between Status Check and Save

**What goes wrong:** User opens app, credential check returns "missing", user fills form and saves. Meanwhile another component also checked status. Store gets stale boolean.
**Why it happens:** Multiple async calls to `credentials:status` without coordinated state.
**How to avoid:** Centralize status in Zustand. After save, call `credentials:status` once and update the store. All components read from store, never call IPC directly for status.
**Warning signs:** Alert banner stays visible after successful save, or disappears then reappears.

### Pitfall 5: Forgetting the 4-File IPC Checklist

**What goes wrong:** Channel works in main process but renderer gets "Canal IPC nao permitido" error.
**Why it happens:** New channel added to `main.ts` handler but not added to `ALLOWED_INVOKE_CHANNELS` in `preload.ts`.
**How to avoid:** For each of the 3 new channels, update ALL 4 files atomically: preload.ts (whitelist array), preload.ts (api object), src/types/index.ts (Window.stressflow), main.ts (handler). [VERIFIED: CLAUDE.md IPC pattern]
**Warning signs:** `Promise.reject(new Error("Canal IPC nao permitido"))` in console.

### Pitfall 6: .env Line Ending Corruption on Windows

**What goes wrong:** Writing with `\n` on Windows produces files that some text editors show as single-line. Or mixing `\r\n` and `\n` creates parsing issues.
**Why it happens:** Node.js `fs.writeFileSync` writes exactly what you give it. Windows editors expect `\r\n`.
**How to avoid:** When reading, split on `/\r?\n/` (already done by `loadEnvFile`). When writing, join with `\n` (Unix-style). This is safe because `loadEnvFile` handles both, and the .env file is never opened by users in this phase (the whole point is avoiding manual editing).
**Warning signs:** Credentials appear missing after save on Windows.

## Code Examples

### Complete IPC Channel Addition (credentials:status)

All 4 files that must be updated for a single channel:

**File 1: electron/preload.ts** -- Add to whitelist
```typescript
// Source: existing pattern [VERIFIED: preload.ts line 44-58]
const ALLOWED_INVOKE_CHANNELS = [
  // ... existing channels ...
  "credentials:status",
  "credentials:save",
  "credentials:load",
] as const;
```

**File 2: electron/preload.ts** -- Add to api object
```typescript
// Source: existing namespace pattern [VERIFIED: preload.ts lines 112-218]
credentials: {
  /** Verifica quais credenciais obrigatorias estao configuradas (retorna booleanos, nunca valores) */
  status: (): Promise<Record<string, boolean>> =>
    safeInvoke("credentials:status") as Promise<Record<string, boolean>>,

  /** Retorna lista de nomes de chaves STRESSFLOW_* configuradas (nunca valores) */
  load: (): Promise<string[]> =>
    safeInvoke("credentials:load") as Promise<string[]>,

  /** Salva credenciais no .env (main process escreve o arquivo) */
  save: (entries: Array<{ key: string; value: string }>): Promise<{ saved: number; path: string }> =>
    safeInvoke("credentials:save", entries) as Promise<{ saved: number; path: string }>,
},
```

**File 3: src/types/index.ts** -- Add to Window.stressflow declaration
```typescript
// Source: existing type declaration pattern [VERIFIED: src/types/index.ts lines 771-865]

/** Status das credenciais obrigatorias (chave -> configurada ou nao). */
export interface CredentialStatus {
  STRESSFLOW_USER: boolean;
  STRESSFLOW_PASS: boolean;
}

// Inside declare global > Window > stressflow:
credentials: {
  /** Verifica quais credenciais estao configuradas. Retorna booleanos, nunca valores. */
  status: () => Promise<CredentialStatus>;
  /** Lista nomes de chaves STRESSFLOW_* configuradas. Nunca retorna valores. */
  load: () => Promise<string[]>;
  /** Salva credenciais no .env do main process. */
  save: (entries: Array<{ key: string; value: string }>) => Promise<{ saved: number; path: string }>;
};
```

**File 4: electron/main.ts** -- Add handlers
```typescript
// Source: existing handler pattern [VERIFIED: main.ts lines 402-460]
// (See Pattern 1 and Pattern 2 above for full handler implementations)
```

### AppView Extension

```typescript
// src/types/index.ts — update AppView
// Source: existing type [VERIFIED: src/types/index.ts line 741]
export type AppView = "test" | "history" | "results" | "settings";
```

### Zustand Store Extension

```typescript
// src/stores/test-store.ts — add to TestState and TestActions
// Source: existing store pattern [VERIFIED: src/stores/test-store.ts]
interface TestState {
  // ... existing fields ...
  /** Status das credenciais obrigatorias (null = ainda nao verificado). */
  credentialStatus: CredentialStatus | null;
}

interface TestActions {
  // ... existing actions ...
  /** Atualiza o status das credenciais no store. */
  setCredentialStatus: (status: CredentialStatus | null) => void;
}
```

### Sidebar Navigation Addition

```typescript
// src/components/Sidebar.tsx — add to NAV_ITEMS array
// Source: existing nav pattern [VERIFIED: Sidebar.tsx lines 43-58]
{
  id: "settings" as AppView,
  label: "Configuracoes",
  description: "Credenciais e ambiente",
  icon: Settings,  // from lucide-react
  ariaLabel: "Ir para a tela de configuracoes e credenciais",
},
```

### App.tsx View Routing Addition

```typescript
// src/App.tsx — add to MainContent routing
// Source: existing routing pattern [VERIFIED: App.tsx lines 132-198]
if (view === "settings") {
  return <CredentialsSettings />;
}
```

### Startup Credential Check

```typescript
// src/App.tsx — add after history load
// Source: existing useEffect pattern [VERIFIED: App.tsx lines 68-82]
const setCredentialStatus = useTestStore((s) => s.setCredentialStatus);

const checkCredentials = useCallback(async () => {
  try {
    const status = await window.stressflow.credentials.status();
    setCredentialStatus(status);
  } catch (err) {
    console.warn("[StressFlow] Nao foi possivel verificar credenciais:", err);
  }
}, [setCredentialStatus]);

useEffect(() => {
  checkCredentials();
}, [checkCredentials]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual .env editing | GUI credential form | This phase (Phase 2) | Users no longer need terminal/editor access |
| No credential feedback | Visual alert when missing | This phase (Phase 2) | Eliminates silent test failures from blank credentials |

**Existing but needs no change:**
- `loadEnvFile()` parser: Works correctly, handles quotes/comments/multi-path [VERIFIED: main.ts lines 32-62]
- `resolveEnvPlaceholders()`: Already handles `{{STRESSFLOW_*}}` resolution [VERIFIED: main.ts lines 71-75]
- `resolveConfigPlaceholders()`: Already traverses all config fields [VERIFIED: main.ts lines 82-100]
- Preload bridge security model: Whitelisted channels, `contextIsolation: true` [VERIFIED: preload.ts]

## IPC Channel Inventory

| Channel | Direction | Input | Output | Security |
|---------|-----------|-------|--------|----------|
| `credentials:status` | renderer -> main | (none) | `CredentialStatus` (booleans) | No values exposed |
| `credentials:load` | renderer -> main | (none) | `string[]` (key names) | No values exposed |
| `credentials:save` | renderer -> main | `Array<{ key: string; value: string }>` | `{ saved: number; path: string }` | Key whitelist: `^STRESSFLOW_\w+$`; writes to userData only |

## Required Credential Keys

| Key | Purpose | Used In | Required |
|-----|---------|---------|----------|
| `STRESSFLOW_USER` | MisterT ERP username (field IN1 in login form) | `test-presets.ts` line 35: `IN1={{STRESSFLOW_USER}}` | Yes |
| `STRESSFLOW_PASS` | MisterT ERP password (field IN2 in login form) | `test-presets.ts` line 35: `IN2={{STRESSFLOW_PASS}}` | Yes |
| `STRESSFLOW_ALLOW_INTERNAL` | Bypass SSRF guard for internal network | `stress-engine.ts` line 222 | No (managed via .env only, not in GUI) |

**Note:** `STRESSFLOW_ALLOW_INTERNAL` is an infrastructure setting, not a user credential. It should NOT appear in the credentials GUI -- it remains a manual .env configuration as designed in Phase 1. [VERIFIED: STATE.md key decision: "opt-in explicito, nao exposto via IPC"]

## UI Component Design

### CredentialsSettings.tsx

**Location:** `src/components/CredentialsSettings.tsx`
**Purpose:** Full-screen settings view (replaces main content area when `view === "settings"`)

**Structure:**
1. Header: "Configuracoes" title with Settings icon
2. Section: "Credenciais MisterT" card
   - Input: "Usuario" (`type="text"`, placeholder "Usuario do MisterT")
   - Input: "Senha" (`type="password"`, with eye toggle via EyeOff/Eye icons)
   - Status indicators per field: green check when configured, grey dash when missing
3. Button: "Salvar Credenciais" (sf-primary style)
4. Info text: Path where .env is stored (from `app:getPath` IPC)
5. Success feedback via `useToast()`

**Security UX:** Fields always start EMPTY even when credentials exist. Status indicators show "Configurado" / "Nao configurado" WITHOUT revealing values. To change a credential, user types the new value and saves. Empty fields on save are SKIPPED (not saved as empty string), preserving existing values.

### CredentialAlert.tsx

**Location:** `src/components/CredentialAlert.tsx`
**Purpose:** Warning banner shown in TestConfig when credentials are missing

**Trigger:** Rendered in `TestConfig.tsx` when `credentialStatus` has any `false` value
**Action:** "Configurar" button calls `setView("settings")`
**Style:** `bg-sf-warning/10 border-sf-warning/30` (matches existing error alert pattern in TestConfig)

## Assumptions Log

> List all claims tagged [ASSUMED] in this research.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Empty credential fields on save should be SKIPPED (not overwrite with empty string) | UI Component Design | If wrong, user could accidentally blank out credentials by saving with empty fields. Low risk -- can be confirmed during implementation. |
| A2 | `STRESSFLOW_ALLOW_INTERNAL` should NOT be exposed in the credentials GUI | Required Credential Keys | If wrong (user wants it in GUI), it would need to be added to the settings form. Low risk -- STATE.md explicitly says "opt-in explicito, nao exposto via IPC". |
| A3 | A new `AppView = "settings"` is preferable over a modal overlay | Architecture Patterns | If modal is preferred, the planner would need to adjust the navigation approach. Medium risk -- architecture research suggested both options; settings view provides better discoverability per CRED-02 success criteria ("caminho direto para a tela de configuracao"). |

## Open Questions

1. **Should the base URL also be a credential field?**
   - What we know: The current URL is selected via UI buttons in TestConfig (MISTERT_ENVIRONMENTS array). The architecture research mentioned STRESSFLOW_BASE_URL as a possible key. However, the test-presets.ts does NOT use a `{{STRESSFLOW_BASE_URL}}` placeholder -- the URL is set directly in the operations config.
   - What's unclear: Whether the user wants the base URL to persist across sessions via .env.
   - Recommendation: Do NOT include base URL in credentials for Phase 2. The current UI selector works. Phase 3 (Presets) will handle persistent configs. Keep this phase minimal to its requirement scope (user + password).

2. **Should there be a "Test Connection" button?**
   - What we know: The requirement says "preenche usuario, senha e URL base em campos mascarados e clica Salvar". No mention of connection testing.
   - What's unclear: Whether verifying credentials against the MisterT server would improve UX.
   - Recommendation: Out of scope for Phase 2. A connection test would need a dedicated IPC channel and network call. The user validates credentials by running a test.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is purely code/config changes using existing project infrastructure. No new tools, CLIs, or services needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None configured |
| Config file | none |
| Quick run command | `npm run build` (TypeScript type checking) |
| Full suite command | `npm run build` (no test runner) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CRED-01 | Credentials saved to .env via GUI, renderer never sees values | manual | `npm run build` (type safety only) | N/A |
| CRED-02 | Alert visible when credentials missing, disappears when present | manual | `npm run build` (type safety only) | N/A |

### Sampling Rate

- **Per task commit:** `npm run build` -- TypeScript compilation catches type errors
- **Per wave merge:** `npm run build` + manual smoke test in `npm run dev`
- **Phase gate:** Full build green + manual verification of all 4 success criteria in running app

### Wave 0 Gaps

None -- no test infrastructure to create. Validation is manual per CLAUDE.md ("No Test Framework Currently").

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (this is credential storage, not auth verification) | N/A |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | IPC channel whitelist in preload.ts |
| V5 Input Validation | Yes | Key whitelist regex `^STRESSFLOW_\w+$` at IPC entry |
| V6 Cryptography | No (credentials stored as plaintext in .env, acceptable for internal desktop tool) | N/A |

### Known Threat Patterns for Electron + Credential Storage

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential exposure to renderer | Information Disclosure | Boolean-only IPC responses; values never cross IPC bridge |
| Path traversal in .env write | Tampering | Write exclusively to `app.getPath("userData")/.env`; validate key format |
| Arbitrary key injection via IPC | Elevation of Privilege | Whitelist regex `^STRESSFLOW_\w+$` rejects non-STRESSFLOW keys |
| .env read by other processes | Information Disclosure | Acceptable risk for internal desktop tool; OS-level file permissions apply |

## Sources

### Primary (HIGH confidence)
- `electron/main.ts` -- loadEnvFile(), resolveEnvPlaceholders(), envVars lifecycle [VERIFIED: codebase read]
- `electron/preload.ts` -- IPC channel whitelist, api object structure, safeInvoke pattern [VERIFIED: codebase read]
- `src/types/index.ts` -- AppView type, Window.stressflow declaration [VERIFIED: codebase read]
- `src/stores/test-store.ts` -- Zustand store shape, state/actions pattern [VERIFIED: codebase read]
- `src/components/TestConfig.tsx` -- Existing UI patterns, input styling, error alert [VERIFIED: codebase read]
- `src/components/Sidebar.tsx` -- NAV_ITEMS pattern, NavItem interface [VERIFIED: codebase read]
- `src/components/App.tsx` -- View routing, startup loading pattern [VERIFIED: codebase read]
- `src/constants/test-presets.ts` -- `{{STRESSFLOW_USER}}` and `{{STRESSFLOW_PASS}}` usage [VERIFIED: codebase read]
- `.planning/research/ARCHITECTURE.md` -- Prior design for credentials IPC protocol [VERIFIED: codebase read]
- `.planning/STATE.md` -- Key decisions on .env and STRESSFLOW_* prefix [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md` -- CRED-01 and CRED-02 requirement text [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- Electron `app.getPath("userData")` behavior on Windows -- returns `%APPDATA%/<app-name>` [ASSUMED: standard Electron API behavior, consistent with codebase usage in getDataPath()]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- prior architecture research validated against codebase; IPC pattern is well-established with 12 existing channels
- Pitfalls: HIGH -- each pitfall derived from actual codebase analysis (envVars lifecycle, ASAR read-only, IPC whitelist)
- Security: HIGH -- constraints explicitly documented in REQUIREMENTS.md, STATE.md, and CLAUDE.md

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (stable -- no fast-moving dependencies)
