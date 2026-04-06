# Testing Patterns

**Analysis Date:** 2026-04-06

## Test Framework

**Runner:** None configured. There is no Jest, Vitest, Mocha or any other test runner in `package.json`. The project has no `*.test.ts`, `*.spec.ts` or `*.test.tsx` files.

**Assertion Library:** None.

**Run Commands:**
```bash
# No unit/integration test runner available.
# Audit and validation scripts serve as the primary quality gate:

npm run audit:ssrf          # SSRF protection smoke test (tsx audit/test-ssrf.ts)
npm run audit:engine        # Engine invariant harness against mock server
npm run audit:extreme       # Extreme load scenario against mock server
npm run verify              # lint + format:check + typecheck + build + audit:ssrf + audit:engine
```

## What Exists Instead of a Test Suite

The project uses three categories of quality tooling in `audit/` and `scripts/`:

### 1. Security Smoke Test
- File: `audit/test-ssrf.ts`
- Purpose: Verifies SSRF protection blocks all private/loopback IPs
- Runs: Direct `tsx` invocation via `npm run audit:ssrf`
- Pattern: Instantiates `StressEngine` directly, expects thrown errors with Portuguese messages containing "bloqueado" or "rede interna"
- Exit behavior: `process.exit(1)` on unexpected pass; `process.exit(0)` on all blocks confirmed

### 2. Engine Test Harness
- File: `audit/engine-test-harness.ts`
- Purpose: Validates all mathematical invariants and consistency guarantees of the stress engine
- Requires: Mock server running on `localhost:8787` (started automatically by `run-audit-with-mock.ts`)
- Scenarios:
  - A1: Baseline (10 VUs, 15s, `/ok`)
  - A2: Ramp-up (50 VUs, 20s, 10s ramp)
  - A3: Mixed errors (10 VUs, 15s, `/errors-mixed` — 33% 200 / 33% 500 / 33% 503)
  - A4: Rate limited (10 VUs, 15s, `/rate-limited` — 50% 429)
  - A5: Variable latency (5 VUs, 15s, `/random-latency` — 50–5000ms)
  - A6: High load (200 VUs, 30s)

### 3. Extreme Load Test
- File: `audit/stress-extreme-test.ts`
- Purpose: Tests engine behavior under extreme conditions

### 4. Result Validator
- File: `audit/validate-result.js`
- Purpose: Validates a JSON export file against all mathematical invariants
- Usage: `node audit/validate-result.js <path-to-result.json>`
- Checks validated (PASS/FAIL/WARN):
  - M-01: `sum(statusCodes) === totalRequests - totalErrors`
  - M-02: `errorRate === round2(totalErrors/totalRequests*100)`
  - M-03: Percentiles monotonically ordered `min <= p50 <= p90 <= p95 <= p99 <= max`
  - M-04: `RPS === round2(totalRequests/durationSeconds)` (±1%)
  - M-05: `throughputBytesPerSec === round2(totalBytes/durationSeconds)` (±1%)
  - M-06 / M-07: Range sanity checks
  - T-01 through T-07: Timeline consistency checks
  - S-01 through S-08: Data sanity checks
  - R-01: Reservoir sampling warning

### 5. Mock Server
- File: `audit/mock-server.js`
- A plain Node.js HTTP server (no framework)
- Port: 8787 (default)
- Endpoints:
  - `GET /ok` — 200, 1KB JSON payload
  - `GET /slow/:ms` — 200 after `:ms` delay (capped at 60000ms)
  - `GET /random-latency` — 200 after 50–5000ms random delay
  - `GET /rate-limited` — 50% 200 / 50% 429
  - `GET /errors-mixed` — 33% 200 / 33% 500 / 33% 503
  - `GET /timeout` — never responds
  - `GET /status/:code` — responds with specified HTTP code

### 6. Orchestration Script
- File: `scripts/run-audit-with-mock.ts`
- Purpose: Starts mock server, waits for it to be ready, runs the specified audit script, kills mock server, exits with audit script's exit code
- Pattern: `spawn` + polling via HTTP GET until `localhost:8787/stats` returns 200

## Test File Organization

**Location:** All audit/test code lives in `audit/` (not co-located with source).

**Naming:**
- TypeScript harnesses: `*.ts`
- JavaScript validators/utilities: `*.js`
- No `*.test.*` or `*.spec.*` naming convention

**Structure:**
```
audit/
├── engine-test-harness.ts   # Engine invariant test (TypeScript)
├── test-ssrf.ts             # SSRF security smoke test (TypeScript)
├── stress-extreme-test.ts   # Extreme scenario test (TypeScript)
├── validate-result.js       # JSON result validator (plain JS)
├── mock-server.js           # Local HTTP mock server (plain JS)
├── LAUDO-AUDITORIA.md       # Audit report document
└── results/                 # Saved JSON result files for validation

scripts/
├── run-audit-with-mock.ts   # Orchestrator: mock + audit
├── install-native.js        # Native module install script
└── fix-accents.py           # Utility script
```

## Test Structure Pattern

**Harness pattern (engine-test-harness.ts):**
```typescript
// 1. Patch dependencies before imports if needed (e.g., dns.resolve4 for SSRF bypass in tests)
dns.resolve4 = ((hostname, cb) => {
  if (hostname === "localhost") return cb(null, ["93.184.216.34"]);
  return originalResolve4.call(dns, hostname, cb);
}) as typeof dns.resolve4;

// 2. Import engine directly
import { StressEngine } from "../electron/engine/stress-engine";

// 3. Define check function
function check(id: string, description: string, passed: boolean | "warn", detail = "") {
  const status = passed === true ? "PASS" : passed === "warn" ? "WARN" : "FAIL";
  allResults.push({ id: `${currentScenario}:${id}`, description, status, detail });
}

// 4. Run scenario, then validate invariants
const engine = new StressEngine();
const result = await engine.run(config, onProgress);
validateMathInvariants(result);
```

**SSRF test pattern:**
```typescript
for (const target of blockedTargets) {
  const engine = new StressEngine();
  try {
    await engine.run({ url: target, virtualUsers: 1, duration: 5, method: "GET" }, () => {});
    console.log("FAIL: target should have been blocked:", target);
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes("bloqueado") || err.message.includes("rede interna")) {
      console.log("SSRF_BLOCKED_OK:", target);
      continue;
    }
    process.exit(1);
  }
}
```

## Mocking

**Framework:** None. Mocking is done by monkey-patching Node.js built-ins at the module level before imports.

**Patterns:**
```typescript
// DNS resolution patching for SSRF bypass in test context
const originalResolve4 = dns.resolve4;
dns.resolve4 = ((hostname, cb) => {
  if (hostname === "localhost") return cb(null, ["93.184.216.34"]);
  return originalResolve4.call(dns, hostname, cb);
}) as typeof dns.resolve4;
```

**Network mocking:** Via the local `audit/mock-server.js` HTTP server — not in-process mocking.

**What gets mocked:**
- DNS resolution for `localhost` (to allow SSRF-protected engine to reach mock server)
- HTTP responses (via mock server endpoints)

**What is NOT mocked:**
- The engine's HTTP client itself
- The database layer
- The Electron IPC layer (not testable without Electron in this setup)

## Fixtures and Factories

**Test Data:** Config objects are constructed inline in each scenario:
```typescript
const configA1: TestConfig = {
  url: "http://localhost:8787/ok",
  virtualUsers: 10,
  duration: 15,
  method: "GET",
};
```

**No factory functions or shared fixtures exist.**

**Saved results:** JSON files in `audit/results/` serve as fixture snapshots for `validate-result.js`.

## Coverage

**Requirements:** None enforced. No coverage tooling configured.

**View Coverage:**
```bash
# Not available — no test runner configured
```

## Test Types

**Unit Tests:** Not present.

**Integration Tests:**
- `audit/engine-test-harness.ts` is the closest equivalent — tests the engine end-to-end against a real HTTP server with mathematical invariant validation.

**E2E Tests:** Not configured.

**Security Tests:**
- `audit/test-ssrf.ts` validates SSRF protection across 10 blocked targets (localhost, RFC1918 ranges, link-local, IPv6 loopback).

## Common Patterns

**Async execution:**
```typescript
async function main(): Promise<void> {
  const engine = new StressEngine();
  const result = await engine.run(config, (progress) => { /* ... */ });
  // then validate result
}
main().catch((err) => {
  console.error("[StressFlow] ...", err);
  process.exit(1);
});
```

**Error assertion:**
```typescript
try {
  await engine.run(config, () => {});
  console.log("FAIL: should have thrown");
  process.exit(1);
} catch (err: any) {
  if (err.message.includes("expected phrase")) {
    console.log("OK:", target);
  } else {
    console.log("UNEXPECTED_ERROR:", err.message);
    process.exit(1);
  }
}
```

## Adding Tests (Recommended Path)

The project has no test runner. If adding one, the team should evaluate:
- **Vitest** — preferred for Vite + TypeScript projects; minimal config, native ESM support
- Config would go at project root: `vitest.config.ts`
- Unit tests should co-locate with source: `src/shared/test-analysis.test.ts`
- Integration tests for the engine should live in `audit/` or a new `tests/` directory
- The existing `audit/` harnesses can be adapted to Vitest with minimal changes

---

*Testing analysis: 2026-04-06*
