# Phase 1: Engine Fixes — Research

**Researched:** 2026-04-06
**Domain:** Node.js HTTP engine — SSRF guards, redirect following, VU session lifecycle, memory management
**Confidence:** HIGH (all findings derived from direct codebase inspection)

---

## Summary

Phase 1 fixes four bugs in `electron/engine/stress-engine.ts` and `electron/engine/stress-worker.ts` that prevent the tool from producing valid results against MisterT ERP. All four are pure engine-level changes — no IPC channels, no renderer components, no database schema, and no new npm packages are needed.

The bugs are well-understood from prior code analysis. This research confirms exact fix locations, designs the redirect-following architecture (the most complex of the four), prescribes the correct VU loop restructure, and documents the reservoir sampling pattern to replicate. The changes are contained to two files and are fully independent of each other; they can be implemented in any order.

**Primary recommendation:** Fix in order ENGINE-04 (simplest, isolated) → ENGINE-01 (one guard) → ENGINE-03 (loop restructure, depends on ENGINE-02 design) → ENGINE-02 (most complex, needed for ENGINE-03 session expiry detection to work correctly). Or, if implementing in parallel, engineers can work on ENGINE-01 + ENGINE-04 together while the redirect design for ENGINE-02 is finalised.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Unblock internal IP ranges (10.*, 192.168.*) via `STRESSFLOW_ALLOW_INTERNAL=true` | `validateTargetHost()` already exists at line 220; guard insertion is a 2-line change |
| ENGINE-02 | Follow 3xx redirects automatically (max 5 hops), preserving CookieJar and extracted vars | `makeRequest` in both files needs an async redirect loop; returns `finalUrl` for ENGINE-03 detection |
| ENGINE-03 | Authenticate once per VU lifetime; re-auth only on session-expiry redirect | VU loop at lines 1158-1174 (engine) and 412-427 (worker) needs restructure; session expiry detected via `finalUrl` from ENGINE-02 |
| ENGINE-04 | Cap per-operation latency arrays at 100,000 entries (same as global reservoir) | `opMet.latencies.push(latency)` at line 761 has no cap; add `latencySampleCount` field + reservoir pattern |
</phase_requirements>

---

## Standard Stack

### No New Dependencies

All four fixes use existing Node.js built-ins and existing project abstractions.

| What Is Used | Already Present | Notes |
|---|---|---|
| `process.env` | Yes | ENGINE-01 reads `STRESSFLOW_ALLOW_INTERNAL` |
| `http` / `https` modules | Yes | ENGINE-02 redirect loop reuses same modules |
| `CookieJar` class | Yes — `electron/engine/cookie-jar.ts` | Has `clear()` method (line 81); needed for ENGINE-03 re-auth |
| `RESERVOIR_MAX = 100_000` | Yes — `stress-engine.ts` line 643 | ENGINE-04 uses same constant and pattern |

**Installation:** No `npm install` needed. Phase 1 has zero new dependencies.

---

## Architecture Patterns

### Affected Files (ONLY these two files change in Phase 1)

```
electron/engine/
├── stress-engine.ts    ← All 4 bug fixes (primary file)
└── stress-worker.ts    ← ENGINE-02 (makeRequest) + ENGINE-03 (VU loop)
```

No changes to:
- `electron/preload.ts`
- `electron/main.ts`
- `electron/database/`
- `src/` (any renderer file)
- `src/types/index.ts`
- `src/stores/test-store.ts`

---

### ENGINE-01: SSRF Allow-Internal Guard

**Location:** `validateTargetHost()` — `stress-engine.ts` lines 220–268

**What the function does now:** Resolves DNS for a hostname and calls `isBlockedIP()` on every resolved address. `isBlockedIP()` checks against `BLOCKED_IP_RANGES` which includes `{ prefix: "10.", type: "private" }` and `{ prefix: "192.168.", type: "private" }` (lines 191–192).

**Fix pattern:**
```typescript
// Source: codebase analysis — STACK.md research + direct inspection
async function validateTargetHost(hostname: string): Promise<void> {
  // NOVO: allow internal network testing when explicitly opted in
  const allowInternal = process.env.STRESSFLOW_ALLOW_INTERNAL === 'true';
  if (allowInternal) return; // skip ALL SSRF checks for authorized internal targets

  const normalizedHostname = /* ... existing code unchanged ... */;
  // ... rest of function unchanged
}
```

**Design decision (ASSUMED):** The guard bypasses ALL SSRF checks (including loopback and cloud metadata), not just RFC-1918 private ranges. This matches the simpler approach in STACK.md and is appropriate because the team is testing their own internal ERP. A more surgical guard would be to only skip private range checks while keeping loopback (`127.*`) and cloud metadata (`169.254.169.254`) blocked. Either design satisfies ENGINE-01 requirements; the planner should choose based on the security risk tolerance for an internal tool.

**Worker impact:** `validateTargetHost()` is only called in `stress-engine.ts` (line 636). The worker file does not call it. No changes needed in `stress-worker.ts` for this fix.

**Env file requirement:** The user must add `STRESSFLOW_ALLOW_INTERNAL=true` to `%APPDATA%/stressflow/stressflow-data/.env`. This is a runtime configuration change, not a code change. The planner should note this as a documentation task.

---

### ENGINE-02: Redirect Following in `makeRequest`

**Why this is the most complex fix:** Both `stress-engine.ts` (class method, lines 1206–1377) and `stress-worker.ts` (module-level function, lines 126–310) have their own `makeRequest` implementation. Both return a `new Promise(resolve, reject)` without redirect logic. Both need updating to the same redirect contract.

#### Recommended Refactor: Split into `makeSingleRequest` + `makeRequest` wrapper

**Step 1:** Rename the existing `makeRequest` body to a new private helper `makeSingleRequest`. Modify it to return `locationHeader?: string` in addition to current return fields.

```typescript
// Source: codebase analysis
// Signature change only — body unchanged except adding locationHeader to resolve()
private makeSingleRequest(
  opts: { /* same as current makeRequest opts */ },
  captureSample: boolean,
): Promise<{
  statusCode: number;
  bytes: number;
  sample?: ResponseSample;
  bodyText?: string;
  locationHeader?: string;  // NEW — captured from res.headers['location']
}>
```

Inside `makeSingleRequest`, in the `res.on('end', ...)` handler:
```typescript
const locationHeader = typeof res.headers['location'] === 'string'
  ? res.headers['location']
  : undefined;
resolve({ statusCode: res.statusCode ?? 0, bytes, sample, bodyText, locationHeader });
```

**Step 2:** Create new `makeRequest` as an async method (or function in worker) that loops:

```typescript
// Source: codebase analysis + Node.js HTTP docs
private async makeRequest(
  opts: { /* same as before */ },
  captureSample: boolean = false,
): Promise<{
  statusCode: number;
  bytes: number;
  sample?: ResponseSample;
  bodyText?: string;
  finalUrl: URL;             // NEW — URL after following all redirects
}> {
  const MAX_REDIRECT_HOPS = 5;
  let currentUrl = opts.url;
  let currentIsHttps = opts.isHttps;
  let currentMethod = opts.method;
  let currentBody = opts.body;
  let lastResult: Awaited<ReturnType<typeof this.makeSingleRequest>> | null = null;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const isLastHop = hop === MAX_REDIRECT_HOPS;
    lastResult = await this.makeSingleRequest(
      {
        ...opts,
        url: currentUrl,
        isHttps: currentIsHttps,
        method: currentMethod,
        body: currentMethod === 'GET' ? undefined : currentBody,
        // agent selection: use this.activeAgents based on currentIsHttps
        agent: currentIsHttps ? this.activeAgents.https! : this.activeAgents.http!,
      },
      // Only capture sample on final hop
      captureSample && (isLastHop || !isRedirect(lastResult?.statusCode)),
    );

    const { statusCode, locationHeader } = lastResult;
    const isRedirectStatus = statusCode >= 300 && statusCode <= 308 && statusCode !== 304;

    if (!isRedirectStatus || !locationHeader || isLastHop) {
      break;
    }

    // Resolve relative Location against current URL
    const redirectUrl = new URL(locationHeader, currentUrl.toString());

    // RFC 7231: 302/303 always switch to GET and drop body
    if (statusCode === 302 || statusCode === 303) {
      currentMethod = 'GET';
      currentBody = undefined;
    }
    // 307/308: preserve original method + body

    currentUrl = redirectUrl;
    currentIsHttps = redirectUrl.protocol === 'https:';
  }

  return {
    statusCode: lastResult!.statusCode,
    bytes: lastResult!.bytes,
    sample: lastResult!.sample,
    bodyText: lastResult!.bodyText,
    finalUrl: currentUrl,
  };
}
```

**Worker file adaptation:** `stress-worker.ts` uses module-level `agents` (no class). The same split applies but as module-level functions (`makeSingleRequest` + `makeRequest`). The agent selection inside the redirect loop uses the module-level `agents.http` / `agents.https` directly.

**Cookie capture on redirects:** The existing `cookieJar.addFromSetCookieHeaders()` call at the start of the response handler in `makeSingleRequest` already captures cookies from intermediate redirect responses. This behavior is preserved because `makeSingleRequest` still executes for each hop, including redirect hops. No additional cookie logic is needed.

**Cross-scheme redirects (http → https or https → http):** The agent is selected per-hop based on `currentIsHttps`. In `stress-engine.ts`, `this.activeAgents` holds both agents. In `stress-worker.ts`, the module-level `agents` object holds both.

**`collectBody` on redirects:** `collectBody: true` signals that we need the body for `{{VAR}}` extraction. For intermediate redirect hops, we do not need to collect the body (redirect responses are tiny and contain no useful extraction targets). Pass `collectBody: false` for intermediate hops; only the final hop should collect the body. Adjust by passing `opts.collectBody && isLastHopOrNotRedirect`.

**Impact on `executeOp`:** The `executeOp` function calls `makeRequest` and currently uses `result.statusCode`. After the change, `result.finalUrl` is also available. `executeOp` does not need its return type changed for ENGINE-02 alone, but ENGINE-03 needs it to expose `finalUrl`.

---

### ENGINE-03: VU Session Lifecycle Restructure

**Depends on ENGINE-02** because session-expiry detection reads `finalUrl` from `makeRequest`.

**Location in `stress-engine.ts`:** Lines 1142–1174 (the `spawnVU()` function, inner VU loop)
**Location in `stress-worker.ts`:** Lines 396–427 (the `runVU()` function, inner VU loop)

**Current loop (BROKEN):**
```typescript
// Runs authOps on EVERY iteration — causes auth storm
while (Date.now() < opts.endTime && !opts.signal.aborted) {
  for (const op of authOps) { await executeOp(op); }  // re-auth every loop
  const randomModule = moduleOps[Math.floor(Math.random() * moduleOps.length)];
  await executeOp(randomModule);
}
```

**Fixed loop:**
```typescript
// Source: codebase analysis — restructure required by ENGINE-03

// Authenticate ONCE at VU startup
for (const op of authOps) {
  await executeOp(op);
}

// Derive login URL pathname for session-expiry detection
const loginPathname = authOps.length > 0
  ? new URL(authOps[0].url).pathname.toLowerCase()
  : null;

// Module loop — runs for VU lifetime
while (Date.now() < opts.endTime && !opts.signal.aborted) {
  if (moduleOps.length === 0) {
    // Single-op or auth-only test — loop through auth ops (original behavior)
    for (const op of authOps) {
      await executeOp(op);
    }
    continue;
  }

  const randomModule = moduleOps[Math.floor(Math.random() * moduleOps.length)];
  const finalUrl = await executeOp(randomModule);

  // Session expiry: module op followed a redirect back to the login page
  const sessionExpired =
    loginPathname !== null &&
    finalUrl !== undefined &&
    finalUrl.pathname.toLowerCase() === loginPathname;

  if (sessionExpired) {
    // Clear stale session state and re-authenticate
    cookieJar.clear();
    extractedVars.clear();
    for (const op of authOps) {
      await executeOp(op);
    }
  }
}
```

**Change to `executeOp` return type:** `executeOp` currently returns `Promise<void>`. It must be changed to return `Promise<URL | undefined>` — the `finalUrl` from `makeRequest`. This requires modifying the `try/catch` block inside `executeOp` to capture and return `result.finalUrl`:

```typescript
// Inside executeOp — current:
// opts.onResponse(latency, result.statusCode, result.bytes, op.name, ...)

// After change — also capture finalUrl:
const latency = performance.now() - start;
opts.onResponse(latency, result.statusCode, result.bytes, op.name, op.captureSession !== false, result.sample);
return result.finalUrl;
```

**`extractedVars.clear()` on re-auth:** When session expires, the old CTRL value is invalid. `extractedVars.clear()` ensures the auth chain's `extract` patterns populate fresh CTRL values. Without this, the first module op after re-auth would use a stale CTRL.

**Worker file:** The same restructure applies to `runVU()` in `stress-worker.ts`. The `executeOp` inner function there also returns `void` and needs to return `URL | undefined`. The `agents.http` / `agents.https` are already accessible for cross-protocol redirect support.

**Session expiry detection accuracy:** The detection compares `finalUrl.pathname` (lowercased) against the login pathname. This works for MisterT's standard ASP Classic pattern (`/login.asp` → `/Login.asp` normalises to same). If the login page is served from a subdirectory (e.g., `/auth/login.asp`), the comparison still works because `pathname` includes the full path. [ASSUMED: MisterT's login URL pathname is consistent across session expiry redirects — this needs to be confirmed against the actual ERP]

---

### ENGINE-04: Per-Operation Latency Reservoir Cap

**Location:** `stress-engine.ts` — `handleResponse` callback, line 761 + `opMetrics.set()` initializer, line 620

**Step 1:** Add `latencySampleCount` to the opMetrics initialization block:

```typescript
// Source: codebase analysis — mirrors latencySampleCount pattern at line 644
this.opMetrics.set(op.name, {
  latencies: [],
  latencySampleCount: 0,  // NEW — tracks total samples for reservoir algorithm
  requests: 0,
  errors: 0,
  statusCodes: {},
  session: { authenticatedRequests: 0, sessionFailures: 0, sessionExpiredErrors: 0 },
});
```

The inline type in the `opMetrics` Map declaration (lines 460–469) also needs `latencySampleCount: number` added.

**Step 2:** Replace the unbounded `push` at line 761 with the reservoir sampling pattern:

```typescript
// Current (BROKEN — unbounded):
opMet.latencies.push(latency);

// Fixed — mirrors global latencyReservoir pattern at lines 740-748:
opMet.latencySampleCount++;
if (opMet.latencies.length < RESERVOIR_MAX) {
  opMet.latencies.push(latency);
} else {
  const j = Math.floor(Math.random() * opMet.latencySampleCount);
  if (j < RESERVOIR_MAX) {
    opMet.latencies[j] = latency;
  }
}
```

**Why not use `opMet.requests` as the counter:** `opMet.requests` is incremented in both `handleResponse` (success) AND `handleError` (errors). Error responses don't push to `latencies`. Using `opMet.requests` as the divisor would produce a biased reservoir (requests that errored are counted in the denominator but have no corresponding latency entry). A dedicated `latencySampleCount` counter is statistically correct.

**Worker file impact:** Workers do not maintain `opMetrics`. The worker only reports `responseBatch` (with latency, statusCode, opName) back to the main engine, which aggregates into `opMetrics`. ENGINE-04 change is ONLY in `stress-engine.ts`. [VERIFIED: codebase — `stress-worker.ts` has no `opMetrics` Map]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Redirect following | Custom recursive HTTP client | Extend existing `makeRequest` | `http`/`https` modules are already integrated; replacing them adds refactoring risk |
| Cookie management | `tough-cookie` library | Existing `CookieJar` with `.clear()` | ASP Classic uses pre-RFC 6265 semantics; tough-cookie RFC compliance breaks compatibility |
| HTTP client | `undici`, `axios`, `got` | Built-in `http`/`https` | I/O-bound workload; one target host; refactoring cost exceeds marginal gain |
| Session expiry detection | Pattern scanning response HTML | `finalUrl` pathname comparison after redirect following | Pathname match is deterministic; HTML scanning requires fragile server-specific patterns |
| Reservoir sampling | Custom approximation algorithm | Mirror existing `latencyReservoir` pattern (line 740-748) | Pattern is already validated and in use; reservoir sampling is a known-correct algorithm |

---

## Common Pitfalls

### Pitfall 1: Forgetting to drain the redirect response body before following

**What goes wrong:** Node.js HTTP responses must be consumed before the underlying socket is released. If `makeSingleRequest` returns without reading the body on a 302 response, the socket is held and may interfere with the HTTP Agent's connection pool.

**How to avoid:** `makeSingleRequest` always reads data via `res.on('data')` regardless of status code — the existing `bytes += chunk.length` listener already does this. The body will be consumed on every hop. No additional change needed.

**Warning signs:** Socket pool exhaustion warnings; HTTP Agent `requests` queue growing during redirect chains.

---

### Pitfall 2: Resolving relative Location URLs against the wrong base

**What goes wrong:** ASP Classic sometimes returns relative `Location` headers (e.g., `Location: /dashboard.asp?CTRL=12345`) without a scheme or host. Naively parsing this as a new URL will throw `TypeError: Invalid URL`.

**How to avoid:** Always use `new URL(location, currentUrl.toString())` — the second argument resolves relative URLs against the current base URL. This is the standard Node.js/browser approach. [VERIFIED: MDN URL API — second parameter acts as base for relative URLs]

**Warning signs:** `TypeError: Invalid URL` thrown inside `makeRequest` when redirects are enabled.

---

### Pitfall 3: Not clearing `extractedVars` before re-authentication in ENGINE-03

**What goes wrong:** After a session expires, `extractedVars` still contains the old CTRL value. The re-authentication sequence re-runs `authOps`, which includes the login POST that extracts a new CTRL. But if the old CTRL is still in the Map, and the login redirect is followed (ENGINE-02), the extraction regex may not match (or may match the wrong pattern), leaving a stale CTRL that causes all subsequent module ops to use the wrong parameter.

**How to avoid:** Call `extractedVars.clear()` BEFORE re-running authOps. Then the auth chain operates on a clean variable map.

**Warning signs:** Module operations fail with CTRL-not-found errors immediately after re-authentication in long-running tests.

---

### Pitfall 4: `authBoundary === 0` causes empty `authOps` — VU loop regression

**What goes wrong:** When no POST/PUT operations exist (`lastMutationIndex === -1`), `authBoundary = 0`, `authOps = []`, and `moduleOps = all ops`. The fixed ENGINE-03 loop starts by running `authOps` once (an empty array — no-op) and then loops over `moduleOps`. This is correct and preserves the original behavior.

**The regression risk:** If `moduleOps.length === 0` AND `authOps.length === 0` (config with zero operations), the while loop would spin without doing anything except burning CPU on `Date.now()` comparisons. This edge case is prevented upstream by `validateTestConfig()` which requires at least one operation.

**How to avoid:** No additional guard needed; `validateTestConfig()` already ensures at least one operation exists.

---

### Pitfall 5: Worker file makeRequest uses closure-captured `signal` — scope issue in async wrapper

**What goes wrong:** The current `makeRequest` in `stress-worker.ts` captures `signal` and `agents` from the outer closure. When refactoring to `makeSingleRequest` + `makeRequest` (both module-level functions), the closure access still works because both functions are defined at the same scope level.

**How to avoid:** Keep both `makeSingleRequest` and `makeRequest` as module-level functions (not moved inside `runVU`). The `signal` and `agents` module-level variables remain accessible.

---

### Pitfall 6: Testing ENGINE-02 + ENGINE-03 interaction — wrong login URL assumption

**What goes wrong:** The session expiry detection compares `finalUrl.pathname` against `authOps[0].url`'s pathname. If the login endpoint is a POST to a different URL than the redirect target (e.g., login POST to `/login.asp` but ASP Classic redirects session-expired requests to `/auth/login.asp`), the pathname comparison fails and sessions are never refreshed.

**How to avoid:** Verify the actual MisterT session-expiry redirect URL before finalising the pathname comparison logic. The planner should include a task to confirm the login redirect URL pattern against the actual ERP.

**Warning signs:** After session-expiry, module operations continue receiving login page HTML instead of module content, but `sessionExpired` is never true.

---

## Code Examples

### ENGINE-01: SSRF Guard (complete change)

```typescript
// Source: codebase analysis — stress-engine.ts line 220
async function validateTargetHost(hostname: string): Promise<void> {
  // Guard: permite rede interna quando opt-in explícito via .env
  const allowInternal = process.env.STRESSFLOW_ALLOW_INTERNAL === 'true';
  if (allowInternal) return;

  // ... resto do corpo da função existente, sem alterações
}
```

### ENGINE-04: Reservoir sampling for opMetrics (the two-line replacement at line 761)

```typescript
// Source: codebase analysis — mirrors pattern at lines 740-748
// ANTES (linha 761):
opMet.latencies.push(latency);

// DEPOIS:
opMet.latencySampleCount++;
if (opMet.latencies.length < RESERVOIR_MAX) {
  opMet.latencies.push(latency);
} else {
  const j = Math.floor(Math.random() * opMet.latencySampleCount);
  if (j < RESERVOIR_MAX) {
    opMet.latencies[j] = latency;
  }
}
```

### ENGINE-03: VU loop skeleton (stress-engine.ts spawnVU)

```typescript
// Source: codebase analysis — replaces lines 1158-1174
// authOps e moduleOps are computed the same way as before (lines 1147-1156)

// Fase de autenticação inicial — executa UMA VEZ por VU
for (const op of authOps) {
  await executeOp(op);
}

const loginPathname = authOps.length > 0
  ? new URL(authOps[0].url).pathname.toLowerCase()
  : null;

// Loop principal — apenas operações de módulo
while (Date.now() < opts.endTime && !opts.signal.aborted) {
  if (moduleOps.length === 0) {
    // Modo single-op ou auth-only: mantém comportamento original
    for (const op of authOps) {
      await executeOp(op);
    }
    continue;
  }

  const randomModule = moduleOps[Math.floor(Math.random() * moduleOps.length)];
  const finalUrl = await executeOp(randomModule); // executeOp agora retorna URL | undefined

  const sessionExpired =
    loginPathname !== null &&
    finalUrl !== undefined &&
    finalUrl.pathname.toLowerCase() === loginPathname;

  if (sessionExpired) {
    cookieJar.clear();
    extractedVars.clear();
    for (const op of authOps) {
      await executeOp(op);
    }
  }
}
```

---

## State of the Art

| Old Behavior | Fixed Behavior | Requirement |
|---|---|---|
| `validateTargetHost()` blocks ALL private IPs unconditionally | Same function, skips checks when `STRESSFLOW_ALLOW_INTERNAL=true` | ENGINE-01 |
| `makeRequest` returns immediately on 302, `finalUrl` = initial URL | `makeRequest` follows up to 5 redirect hops, returns `finalUrl` after all hops | ENGINE-02 |
| `{{CTRL}}` never extracted from ASP Classic PRG pattern (empty body on 302) | CTRL extracted from final response HTML after following redirect | ENGINE-02 consequence |
| VU re-authenticates every loop iteration (auth storm at 100 VUs) | VU authenticates once at startup; re-authenticates only on detected session expiry | ENGINE-03 |
| `opMet.latencies` grows to ~1.2M entries in 600s/100VU/10op test (~96MB) | `opMet.latencies` capped at 100,000 entries via reservoir sampling | ENGINE-04 |

**Deprecated patterns being replaced:**
- `while (loop) { authOps; moduleOps }` — auth-every-iteration pattern (ENGINE-03 fix)
- `opMet.latencies.push(latency)` — unbounded push (ENGINE-04 fix)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The SSRF guard should bypass ALL checks (not just RFC-1918) when `STRESSFLOW_ALLOW_INTERNAL=true` | ENGINE-01 pattern | Loopback/cloud metadata could still be reached from internal test environments; unlikely but non-zero risk |
| A2 | MisterT's session-expiry redirect pathname is the same as `authOps[0].url` pathname (e.g., `/login.asp`) | ENGINE-03 session detection | If the session-expiry redirect goes to a different path than the login POST URL, session expiry is never detected and re-auth never triggers |
| A3 | Relative `Location` headers in MisterT's 302 responses are always relative to the current host | ENGINE-02 redirect resolution | If MisterT returns an absolute Location with a different hostname, `new URL(location, base)` still works correctly (absolute URL overrides the base), so this assumption carries low risk |
| A4 | `extractedVars.clear()` before re-auth does not break any state that should persist across authentication boundaries | ENGINE-03 re-auth | If any extracted var intentionally persists across sessions (e.g., a server-assigned user ID), clearing it would cause it to be lost; for MisterT where all extracted vars are per-session CTRL tokens, clearing is correct |

---

## Open Questions (RESOLVED)

1. **MisterT session-expiry redirect URL path**
   - What we know: ASP Classic returns 302 to login page when session expires mid-test
   - What's unclear: Whether the redirect targets the same pathname as `authOps[0].url` or a different path
   - **RESOLVED** — Plan 01-02 Task 2 usa `authOps[0].url` pathname (assunção A2, confiança MEDIUM). Executor deve confirmar no SUMMARY após primeiro teste real contra MisterT. Se A2 estiver errada, o sinal é claro: módulos começarão a receber HTML de login sem `sessionExpired = true` sendo detectado.

2. **Scope of `STRESSFLOW_ALLOW_INTERNAL` bypass**
   - What we know: The current implementation would bypass all SSRF checks including loopback
   - What's unclear: Team's preference — bypass all vs bypass only RFC-1918 ranges
   - **RESOLVED** — Plan 01-01 Task 1 escolheu bypass ALL checks (decisão de design documentada no plano). Justificativa: ferramenta de uso interno exclusivo da equipe de Engenharia; risco de loopback/metadata é aceitável neste contexto.

3. **User-Agent branding fix (tracked in CONCERNS.md)**
   - Both `stress-engine.ts` line 1235 and `stress-worker.ts` line 147 send `"StressFlow/1.0"`
   - This is tech debt, not a Phase 1 requirement, but is in the same two files being modified
   - **RESOLVED** — Fix incluído como bônus em Plan 01-01 Task 1 (engine) e Plan 01-02 Task 1 (worker). Ambos os arquivos já sendo modificados, custo zero adicional de contexto.

---

## Environment Availability

Step 2.6: No external service or CLI tool dependencies. Phase 1 changes are source-code edits only.

The only runtime dependency is a `STRESSFLOW_ALLOW_INTERNAL=true` line in the `.env` file at `%APPDATA%/stressflow/stressflow-data/.env`. This is a user-configuration requirement, not an environment dependency the plan must install.

---

## Validation Architecture

Framework: None configured. The project CLAUDE.md states "No Test Framework Currently: The project does not have a test runner configured. If adding tests, coordinate with the team on framework choice."

### Manual Verification Strategy

Because no test framework exists, the planner should include manual smoke test tasks as phase gates:

| Requirement | Manual Verification Steps |
|---|---|
| ENGINE-01 | Add `STRESSFLOW_ALLOW_INTERNAL=true` to `.env`; start test against `http://10.x.x.x/`; verify no "Endereço bloqueado" error appears; first request is sent |
| ENGINE-02 | Configure a test against the MisterT login endpoint; verify `{{CTRL}}` placeholder is replaced with a real numeric value in operation 2+ URLs (observable in IIS access logs or via a test with a mock server that returns 302→HTML) |
| ENGINE-03 | Run a 60s test with 10 VUs against MisterT; verify login operation RPS is constant (1 request per VU, not 10/s per VU); check `operationMetrics.Login.totalRequests ≤ 10` after 60s |
| ENGINE-04 | Run a 60s test with 10 VUs / 10 ops; monitor Electron process memory in Task Manager; verify memory growth stabilises after the first 10-20 seconds and does not grow linearly throughout the test |

### Wave 0 Gaps

- [ ] No test runner configured — if automated tests are added in the future, the following framework decision is pending: Jest (Node.js first-class support, good for engine unit tests) vs Vitest (Vite-native, but requires configuration for Node.js-only code)
- [ ] No mock HTTP server for redirect chain testing — `audit/mock-server.js` exists but may not simulate 302 redirect chains; verify or extend before automated ENGINE-02 tests can run

*If no framework decision is made before Phase 1 execution, manual smoke tests are the only validation path.*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | Engine does not implement auth — it simulates it |
| V3 Session Management | No | CookieJar is a simulation tool, not a security boundary |
| V4 Access Control | No | No authorization logic in engine changes |
| V5 Input Validation | Yes | ENGINE-01 changes URL validation (`validateTargetHost`); must not remove validation entirely |
| V6 Cryptography | No | No cryptographic operations |

### Security Considerations for Phase 1

**ENGINE-01 SSRF risk:** Adding `STRESSFLOW_ALLOW_INTERNAL` softens the SSRF protection. The mitigation is that this is a deliberate opt-in via the `.env` file (not a UI toggle the renderer controls), and the `.env` is only accessible to the local machine user. The security boundary (renderer never sees env values, STRESSFLOW_ALLOW_INTERNAL never flows through IPC) is preserved. [VERIFIED: codebase — `validateTargetHost` is called in main process only; worker file does not perform SSRF checks]

**ENGINE-02 redirect loop:** The redirect hop limit (`MAX_REDIRECT_HOPS = 5`) prevents infinite redirect loops. Redirect targets that resolve to blocked IPs — when `STRESSFLOW_ALLOW_INTERNAL=false` — are not re-validated after following the redirect. This is an acceptable risk for an internal tool; the first URL's host is validated at test startup.

**ENGINE-03 no new surface:** Restructuring the VU loop introduces no new attack surface. Cookie clearing and extractedVars clearing are purely in-memory operations within the existing main process trust boundary.

**ENGINE-04 no new surface:** Reservoir sampling replaces an unbounded push with a bounded one. No new inputs, no new parsing, no new network calls.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `electron/engine/stress-engine.ts` (all 1700+ lines read) — confirmed exact line numbers for `validateTargetHost` (220), `BLOCKED_IP_RANGES` (184), `opMetrics.set` (620), `opMet.latencies.push` (761), `RESERVOIR_MAX` (643), VU loop (1158-1174), `makeRequest` (1206-1377)
- Direct codebase inspection — `electron/engine/stress-worker.ts` — confirmed `makeRequest` (126-310), VU loop (412-427), module-level `agents` (90-101)
- Direct codebase inspection — `electron/engine/cookie-jar.ts` — confirmed `clear()` method exists at line 81
- `.planning/research/PITFALLS.md` — C1 (opMetrics unbounded), C2 (auth storm), C3 (no redirect), M2 (stale CookieJar on re-login) — HIGH confidence, derived from code analysis

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — ENGINE-01 fix pattern (`if (allowInternal) return`), decision to keep existing CookieJar, decision to NOT lower WORKER_THREAD_THRESHOLD — MEDIUM (recommendations, not verified against final implementation)
- `.planning/research/ARCHITECTURE.md` — component boundaries, IPC bridge pattern, anti-patterns — HIGH (direct codebase analysis, cited correctly)

### Tertiary (LOW confidence — requires validation)

- A2 assumption (session expiry login pathname matches authOps[0] URL) — LOW — needs verification against actual MisterT ERP 302 redirect chain

---

## Metadata

**Confidence breakdown:**
- ENGINE-01 fix: HIGH — 2-line guard, location confirmed by code inspection
- ENGINE-02 architecture: HIGH — design is clear; implementation complexity is medium
- ENGINE-03 redesign: HIGH for loop restructure; MEDIUM for session expiry detection (depends on A2 assumption)
- ENGINE-04 fix: HIGH — exact pattern to replicate identified, zero ambiguity

**Research date:** 2026-04-06
**Valid until:** Stable (these are bug fixes against a pinned codebase; no external API dependencies)
