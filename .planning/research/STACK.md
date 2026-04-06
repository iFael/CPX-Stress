# Technology Stack — Research

**Project:** CPX-MisterT Stress
**Scope:** Brownfield additions for 50-100+ VU scaling, ASP Classic session management, and preset configuration system
**Researched:** 2026-04-06
**Overall confidence:** HIGH (primary findings from direct codebase analysis + official Node.js docs)

---

## Context: What Already Exists

Before prescribing additions, the existing engine was analyzed in full. Several assumptions about "what needs to be built" are invalidated by what is already implemented.

| Component | Status | Location |
|-----------|--------|----------|
| Worker thread pool | Existing, correct | `electron/engine/stress-engine.ts` — threshold 256 VUs |
| Per-VU CookieJar | Existing, correct | `electron/engine/cookie-jar.ts` |
| CTRL parameter extraction | Existing, correct | `TestOperation.extract` + `{{VAR}}` placeholder system |
| HTTP Agent with keepAlive | Existing, partial | Missing `scheduling: 'fifo'` |
| Async VU coroutines | Existing, correct | `spawnVU()` async Promises in single-threaded mode |
| Auth chain sequencing | Existing, correct | `authOps` (sequential) + `moduleOps` (random) split |

The fundamental architecture for 50-100 VUs is already sound. The milestone work is targeted additions, not rewrites.

---

## Recommended Additions

### 1. HTTP Agent Scheduling Fix

**What:** Add `scheduling: 'fifo'` to all `http.Agent` and `https.Agent` instantiations.

**Why:** The default is `'lifo'` (changed in Node.js v15.6.0), which is optimal for production applications that want to reuse the fewest sockets. For a load tester, `'fifo'` is correct — it spreads load across more open sockets, maximizing TCP connection utilization.

From Node.js docs (HIGH confidence, verified against nodejs.org):
> "In case of a high rate of request per second, the 'fifo' scheduling will maximize the number of open sockets, while the 'lifo' scheduling will keep it as low as possible."

**Files to change:**
- `electron/engine/stress-engine.ts` — lines 590-600 (single-threaded mode Agent)
- `electron/engine/stress-worker.ts` — lines 91-101 (worker thread Agent)

**Pattern:**
```typescript
new http.Agent({
  keepAlive: true,
  maxSockets: maxSockets,
  maxFreeSockets: Math.min(maxSockets, 50),
  scheduling: 'fifo',
  timeout: 30000,
})
```

**No version bump needed.** `scheduling` option exists in Node.js >=16 (Electron 28 uses Node.js 20). HIGH confidence.

---

### 2. SSRF Whitelist for Internal Network (Critical Bug Fix)

**What:** The `validateTargetHost()` function in `stress-engine.ts` blocks all private IP ranges including `10.*` and `192.168.*`. MisterT ERP is hosted on the internal corporate network, which resolves to one of these ranges.

**Impact:** Without this fix, the preset system cannot function — every test against MisterT will throw "Endereço bloqueado" before a single request is sent.

**Fix approach:** Honor a `STRESSFLOW_ALLOW_INTERNAL=true` env variable to bypass the private IP block. The variable is already loaded at startup from `.env` via `loadEnvFile()`. This maintains the security architecture (renderer never sees env values) while enabling internal use.

**Implementation pattern:**
```typescript
// In validateTargetHost() — check if internal network testing is allowed
const allowInternal = process.env.STRESSFLOW_ALLOW_INTERNAL === 'true';
if (allowInternal) return; // skip SSRF check for authorized internal targets
```

This is a targeted one-line guard, not a removal of the SSRF protection. The default remains safe (block private IPs). The team opts in explicitly via `.env`.

**Why not remove entirely:** The SSRF protection is a documented security feature. Removing it entirely for an "internal-only" tool still creates risk if the tool is ever accidentally used against unintended targets.

---

### 3. Preset Configuration System

**What:** New `TestPreset` type + storage + IPC + UI for saving and loading named operation sequences.

**Why needed:** The 10 MisterT operations (Login, Dashboard, Consulta de Estoque, etc.) require manual configuration of `TestOperation[]` on every test run. Presets eliminate this friction and are the primary feature request from Engineering.

**Stack additions:**

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Preset storage | JSON files in `userData` via `fs/promises` | Already used for `.env` and SQLite data; no new libraries needed |
| Preset IPC | New channels on existing bridge | Follows existing `history:*` pattern exactly |
| Preset types | New `TestPreset` interface in `src/types/index.ts` | Centralized types convention |
| Built-in MisterT preset | Hardcoded constant in main process | The 10 operations are known and static; no external file needed at first |

**New IPC channels required:**
```
preset:list    → Promise<PresetSummary[]>
preset:get     → Promise<TestPreset>
preset:save    → Promise<void>
preset:delete  → Promise<void>
```

**Type definition:**
```typescript
// src/types/index.ts
export interface TestPreset {
  id: string;
  name: string;
  description: string;
  operations: TestOperation[];
  defaultConfig?: Partial<TestConfig>; // optional VU count, duration overrides
  isBuiltIn: boolean;
  createdAt: string;
}
```

**No new npm packages needed.** Preset files are JSON read/written with `fs/promises` — same pattern as the existing `.env` loading. No dedicated file storage library is warranted.

---

### 4. Worker Thread Threshold for 50-100 VU Target

**What:** Keep `WORKER_THREAD_THRESHOLD = 256` as-is. Do NOT lower it to activate workers for 50-100 VUs.

**Why this is counterintuitive but correct:**

From official Node.js worker_threads documentation (HIGH confidence):
> "Workers are not beneficial for I/O-intensive work — Node's built-in async I/O is more efficient."

HTTP load testing is fundamentally I/O-bound. 100 async coroutines (`Promise.all` on 100 `spawnVU` calls) each awaiting network I/O is exactly how production load testers like autocannon work. The single event loop handles all 100 VUs through async I/O multiplexing — no CPU parallelism is needed or beneficial.

Worker threads add overhead (serialization of result batches, IPC every 100ms, thread startup cost) that would HURT, not help, 50-100 VU performance compared to the existing single-threaded async mode.

**The worker mode is correctly reserved for >256 VUs** where the aggregation work (sorting latency arrays, computing percentiles) could begin saturating the main event loop.

---

### 5. No New HTTP Client Library

**Decision:** Do NOT add undici or any other HTTP client library.

**Why undici is not needed here:**

Undici's advantages (verified against Node.js 18 release notes and architecture comparison):
- Bypasses Node.js stream overhead (relevant when CPU is bottleneck)
- Per-origin connection pool with explicit backpressure control
- True HTTP/1.1 pipelining support

None of these matter for this use case:
1. **Single target** — all 100 VUs hit the same host (MisterT ERP). The built-in `http.Agent` with `keepAlive: true` and `maxSockets` provides adequate connection pooling for one origin.
2. **I/O bottleneck, not CPU** — the bottleneck is MisterT's response time, not Node.js stream processing overhead.
3. **Refactoring cost** — replacing the built-in `http`/`https` module in both `stress-engine.ts` and `stress-worker.ts` (and maintaining the `cookieJar` integration) would be a significant rewrite for marginal gain.
4. **Cookie integration** — undici's cookie handling is separate (`undici-cookie-store`) and would require rewriting the existing `CookieJar` integration.

**What to do instead:** Apply the `scheduling: 'fifo'` + `maxFreeSockets` tuning described in Addition #1. This costs 2 lines of code and provides the connection pool optimization relevant to load testing.

---

### 6. No New Cookie Management Library

**Decision:** Do NOT add `tough-cookie` or similar library.

The existing `CookieJar` in `cookie-jar.ts` already handles:
- Multiple `ASPSESSIONID*` cookies (multiple per ASP application — explicitly documented in comments)
- `Set-Cookie` parsing with Path, Domain, Secure, HttpOnly, Max-Age, Expires attributes
- Per-VU isolation (new `CookieJar()` per VU)
- URL matching (path + domain + secure constraints)

`tough-cookie` (latest: 4.1.x) would add RFC 6265 strict compliance but MisterT is ASP Classic — it uses pre-RFC 6265 cookie semantics. Adding `tough-cookie` risks breaking compatibility with the server's non-standard cookie attributes. The custom implementation is purpose-fit for this target.

---

## ASP Classic Session Management at Scale

### How ASP Classic Session Works (IIS)

ASP Classic session state is per-client, identified by the `ASPSESSIONID*` cookie. IIS issues a unique session identifier in the response to a first request. Each subsequent request that includes the matching `ASPSESSIONID*` cookie is associated with that session's in-memory state.

**Critical IIS behavior:** IIS holds an exclusive write lock on the ASP session object during request processing. Concurrent requests with the **same** `ASPSESSIONID` are serialized — each request must wait for the previous one to release the session lock. This is by design to prevent session state corruption.

**Why this does NOT affect the current engine:** Each VU creates an independent `CookieJar` with its own `ASPSESSIONID*` cookie. 100 VUs = 100 independent ASP sessions on the server. There is no cross-VU session sharing, so there is no serialization contention between VUs.

The single-VU sequential execution model (auth chain → one module per loop iteration) is correct. A VU never fires concurrent requests — it awaits each `executeOp()` before proceeding to the next. This is the correct pattern for session-based ERP simulation.

### CTRL Parameter Handling

MisterT's `CTRL` parameter changes per request. The existing `extract?: Record<string, string>` mechanism captures it via regex from the previous response body and injects it via `{{CTRL}}` placeholder in the next URL.

This pattern is architecturally correct and complete. No changes are needed to the extraction mechanism. The preset configuration system (Addition #3) just needs to pre-configure the correct regex patterns for each MisterT operation.

**Example MisterT operation preset (conceptual):**
```typescript
{
  name: "Consulta de Estoque",
  url: "http://mistert.internal/MisterT.asp?CTRL={{CTRL}}&R=89",
  method: "GET",
  captureSession: true,
  extract: {
    CTRL: /CTRL=(\d+)/
  }
}
```

### Session Affinity Consideration

If MisterT ERP runs with IIS Web Garden (multiple worker processes) or behind a load balancer, sessions must be routed to the same worker process that created them. IIS handles this via `ARR` (Application Request Routing) affinity cookie or sticky sessions.

The `CookieJar` already captures and replays ALL cookies from `Set-Cookie` headers — including any affinity cookies IIS might issue. No special handling is needed in the client. However, if session failures are seen at scale (high `sessionFailures` count in `OperationMetrics.sessionMetrics`), this is the first thing to investigate on the server side.

---

## What NOT to Build

| Temptation | Why Not |
|------------|---------|
| Lower `WORKER_THREAD_THRESHOLD` to 50 for 50-100 VU range | Worker threads are wrong for I/O-bound work; degrades performance |
| Replace `http`/`https` with undici | Refactoring cost far exceeds benefit for single-target, I/O-bound test |
| Add `tough-cookie` | Over-engineered for ASP Classic; existing implementation is purpose-fit |
| Run VUs in parallel within a single VU iteration | Breaks session isolation — ASP Classic session lock causes server-side serialization per session |
| Shared CookieJar across VUs | Catastrophic for session simulation — one VU's logout/re-login would invalidate all others' sessions |

---

## Installation (No New Dependencies Required)

The additions described above require zero new npm packages. All implementations use:
- Node.js built-in `http`/`https` (already in use)
- Node.js built-in `fs/promises` (already available, used in main process)
- Existing `electron/engine/cookie-jar.ts` (no changes to interface)
- Existing IPC pattern from `electron/preload.ts` + `electron/main.ts`

The only code changes needed are:
1. `scheduling: 'fifo'` + `maxFreeSockets` in two Agent construction sites
2. `STRESSFLOW_ALLOW_INTERNAL` env check in `validateTargetHost()`
3. New `TestPreset` type + preset IPC handlers + preset storage utilities

---

## Current Engine Assessment at 50-100 VUs

Based on the full code analysis, the existing engine handles 50-100 VUs correctly **once the SSRF bug is fixed**. The architecture is sound:

| Concern | Current State | Assessment |
|---------|---------------|------------|
| Concurrency model | 100 async Promises, single event loop | Correct for I/O-bound work |
| Connection pooling | `keepAlive: true`, `maxSockets = 200` for 100 VUs | Adequate; add `fifo` scheduling |
| Session isolation | Per-VU `CookieJar` | Correct |
| CTRL extraction | Per-VU `extractedVars` Map | Correct |
| Auth sequencing | Sequential auth chain, random module | Correct for ERP simulation |
| Metrics aggregation | Per-second sort of `secLatencies` | Fine at 100 VUs; reservoir sampling kicks in at 100k requests |
| Internal network access | BLOCKED by SSRF check | Bug — must fix before presets work |

---

## Sources

- Node.js 20 `http.Agent` options: https://nodejs.org/docs/latest-v20.x/api/http.html#new-agentoptions (HIGH confidence — official docs)
- Node.js `worker_threads` best practices: https://nodejs.org/docs/latest-v20.x/api/worker_threads.html (HIGH confidence — official docs, quote: "Workers are not beneficial for I/O-intensive work")
- Node.js `http.Agent` scheduling fifo/lifo: https://nodejs.org/docs/latest-v20.x/api/http.html#class-httpagent (HIGH confidence — official docs)
- undici vs http module architecture: synthesized from Node.js 18 release blog + undici README (MEDIUM confidence)
- ASP Classic session locking behavior: Microsoft IIS docs https://learn.microsoft.com/en-us/previous-versions/iis/6.0-sdk/ms524798(v=vs.90) (HIGH confidence — official Microsoft docs)
- Codebase analysis: direct review of `stress-engine.ts`, `stress-worker.ts`, `cookie-jar.ts` (HIGH confidence)

---

*Research: 2026-04-06*
