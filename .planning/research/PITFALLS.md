# Domain Pitfalls: ASP Classic + Node.js Load Testing at 50-100 VUs

**Domain:** HTTP load testing of an ASP Classic ERP (MisterT) at 50-100+ concurrent users
**Researched:** 2026-04-06
**Scope:** Pitfalls specific to this codebase and target system

---

## Critical Pitfalls

Mistakes that cause incorrect measurements, rewrites, or silent test failures.

---

### Pitfall C1: opMetrics Latency Arrays Grow Without a Reservoir Cap

**What goes wrong:** `this.opMetrics.get(operationName).latencies.push(latency)` in `stress-engine.ts`
(line 761) has no upper bound. The global `latencyReservoir` is correctly capped at 100,000 entries,
but the per-operation metrics arrays are not.

**Why it happens:** The global reservoir exists for final percentile computation. The per-operation
arrays were added later to support `operationMetrics` reporting and were not given the same cap.

**Consequences:**
- At 100 VUs × 10 operations × 2 req/s × 600s = 1.2 million latency entries per operation
- At 8 bytes per float64 × 10 ops × 1.2M entries = approximately 96 MB of latency data in RAM
- GC pressure increases during the test, causing measurable pauses visible in the timeline as latency
  spikes that are artifacts of the test tool, not the server
- In multi-session tests (user runs several 600s tests back-to-back), the `StressEngine` instance is
  recreated each time, so RAM is released — but within a single test the growth is monotonic

**Warning signs:** Memory usage in Task Manager rising steadily throughout a long test; P99 latency
spikes that do not correlate with any change in request rate.

**Prevention:** Apply reservoir sampling to each `opMet.latencies` array with the same
`RESERVOIR_MAX` cap already used for `latencyReservoir`. The pattern is already implemented in
`handleResponse` for the global reservoir — mirror it to the per-operation path.

**Phase that must address it:** Multi-operation MisterT preset phase (before 10-operation sequences
are run at 100 VUs for 600 seconds).

**Confidence:** HIGH (code analysis, confirmed by measurement model)

---

### Pitfall C2: VU Loop Re-Authenticates on Every Iteration — Auth Storm

**What goes wrong:** The VU execution loop in `stress-worker.ts` (lines 412–427) and the equivalent
in `stress-engine.ts` (lines 1158–1174) restarts the full authentication chain (`authOps`) at the
beginning of every `while` iteration. With 100 VUs looping aggressively, this generates a continuous
flood of login POST requests throughout the entire test duration.

**Why it happens:** The loop structure models "a user finishes their task and starts over." For a
single-page load test this is acceptable. For a multi-step ERP workflow, re-login on every cycle is
architecturally wrong — a real user authenticates once and then navigates for an extended session.

**Consequences:**

1. **Auth metric pollution:** Login operation latency dominates the `operationMetrics` output because
   it is called on every loop. The metrics report appears to show the "Login" operation is the
   bottleneck even when the actual bottleneck is a specific business module.

2. **Session creation flood:** ASP Classic creates a new in-process Session object for each login
   POST. At 100 VUs × 1 login/loop × N loops/minute, hundreds of new sessions are created per
   minute. IIS stores all active sessions in memory for `sessionTimeout` minutes (default 20). This
   inflates IIS memory usage and can trigger early session eviction.

3. **CTRL extraction failure cascade (see also C3):** The login operation is expected to return an
   HTML page from which `{{CTRL}}` is extracted. If ASP Classic returns a 302 redirect instead of
   the full HTML (standard PRG pattern after POST), the extraction silently fails, the CTRL value
   stays stale, and all subsequent module operations in the same loop send the wrong CTRL parameter.

**Warning signs:** Login operation `rps` equal to total test `rps` divided by operation count;
login latency P50 significantly lower than module operation P50 (login uses keepalive warm path while
modules stall waiting for a valid CTRL).

**Prevention:** Redesign the VU loop for the MisterT preset: authenticate once at the start of the
VU lifetime, then loop only through module operations. Re-authenticate only when a module operation
returns 302 to the login page (session expiry detection). The `CookieJar` already persists across
the VU lifetime — the loop structure needs to separate the "session establishment" phase (runs once)
from the "session exercise" phase (runs in a loop).

**Phase that must address it:** Multi-operation MisterT preset implementation.

**Confidence:** HIGH (code analysis)

---

### Pitfall C3: No HTTP Redirect Following — Breaks ASP Classic Workflow Silently

**What goes wrong:** `makeRequest` in both `stress-engine.ts` and `stress-worker.ts` uses
`http.request` directly. Node.js `http.request` does not follow 3xx redirects. When ASP Classic
returns a 302 response, the VU receives the redirect, counts it as a success (HTTP 302 < 400),
reads the `Location` header, but does nothing with it.

**Why it happens:** Redirect following adds complexity and was not required for the original
single-URL test mode. With the MisterT multi-op preset, ASP Classic's response patterns make
redirects a normal part of every authenticated workflow.

**ASP Classic 302 patterns that break extraction:**

| Scenario | ASP Classic Response | Impact on Tool |
|----------|---------------------|----------------|
| Successful login POST | 302 → `/dashboard.asp?CTRL=xxxxx` | CTRL not extracted from empty body |
| Session expired mid-test | 302 → `/login.asp` | Module metrics show "success" while VU is unauthenticated |
| POST-Redirect-Get after data write | 302 → result page | Operation counted as success but CTRL not refreshed |

**Consequences:**
- `{{CTRL}}` placeholder is never populated after a redirect response. Subsequent requests send
  the literal string `{{CTRL}}` in the URL. MisterT interprets this as an invalid CTRL and returns
  another 302 redirect or an error page. The error page gets a 200 status (ASP Classic often returns
  200 even for error pages), so it is counted as a success.
- Error rates appear low while the server is actually serving nothing but error or login pages.
- The test result looks healthy while it is measuring noise.

**Warning signs:** `{{CTRL}}` appearing in IIS access logs as a literal query string value; 302
count in `statusCodes` equals or exceeds successful-module-operation count.

**Prevention:** Implement redirect following in `makeRequest` for 301 and 302 responses with a
maximum redirect depth (recommend 5). The `Location` response header gives the redirect target.
The VU should follow the redirect with the same `CookieJar` and `extractedVars` context so that
CTRL can be extracted from the final destination HTML. This must be added before the MisterT preset
is shipped as it affects every authenticated operation.

**Phase that must address it:** Multi-operation MisterT preset implementation.

**Confidence:** HIGH (code analysis + ASP Classic behavior is well-documented)

---

### Pitfall C4: Node.js HTTP Agent maxSockets Queue Inflates Measured Latency

**What goes wrong:** When all sockets in the HTTP agent are active, Node.js queues subsequent
requests in `agent.requests` (confirmed in official Node.js docs). The queue wait time is included
in the tool's latency measurement because `performance.now()` is captured before calling
`makeRequest`, not after a socket is assigned.

**Measured latency = socket queue wait + TCP handshake + server processing + network round-trip**

The `timeout: 30000` option in `reqOptions` only starts counting AFTER a socket is assigned. A
request can wait 20 seconds in the agent queue and then receive a 5-second server response without
triggering the timeout, yet the tool reports 25-second latency. This is invisible to the
`ProtectionDetector` and to the `MeasurementReliability` signals.

**Current agent configuration:**
- Single-threaded mode (50-100 VUs): `maxSockets = Math.min(virtualUsers * 2, 10000)` → 200 for
  100 VUs
- 100 VUs × 10 sequential operations = up to 1000 HTTP requests pending simultaneously in the
  Node.js sense (each VU awaiting its current op completes before issuing the next)
- In practice, sequential `await` per VU limits concurrency to one-request-per-VU, so peak
  in-flight requests = 100, which is below `maxSockets = 200`. This looks fine.
- BUT: the `keepAlive: true` setting means sockets are reused. When the socket pool is warm, there
  is no queue. When the test starts cold (no established connections), all 100 VUs attempt TCP
  connections simultaneously, and the first-second latency spike is real but artificially large.

**The more serious risk emerges when the server is slow (> 1s/req):**
- 100 VUs × 1 req/s × 3s server latency = 300 concurrent in-flight requests
- Only 200 sockets available → 100 requests queued
- Queued requests show 3s server time + 1-2s queue wait = 4-5s measured latency
- The tool reports P99 degradation that is half due to server load and half due to insufficient
  socket allocation

**Warning signs:** P50 latency flat while P95/P99 diverges sharply; first 5 seconds of test show
anomalously high latency that normalizes after connections warm up.

**Prevention:**
- Set `maxSockets` higher than the peak in-flight request estimate: for 100 VUs with 10 ops and
  expected server latency of 500ms, peak in-flight ≈ 100 VUs × 500ms = ~50 concurrent sockets needed.
  Current formula `virtualUsers * 2` is generous enough for sequential VU behavior.
- Add agent queue depth monitoring: expose `agent.requests` count as a diagnostic metric so high
  queue depth can be flagged in the reliability report.
- Set `scheduling: 'fifo'` on agents to minimize socket starvation for oldest-queued requests.

**Phase that must address it:** 50-100 VU scalability phase; specifically the reliability report
implementation.

**Confidence:** HIGH (confirmed with official Node.js documentation)

---

### Pitfall C5: ASP Classic processorThreadMax = 25/CPU — Thread Pool Saturates Before Target VU Count

**What goes wrong:** IIS ASP Classic's `processorThreadMax` defaults to **25 worker threads per
processor** (confirmed in official Microsoft IIS configuration reference). On a 4-core server, the
ASP execution thread pool is capped at 100 threads. Requests beyond that cap queue in IIS's internal
request queue (`requestQueueMax`, default 3000).

**Why it matters:**
- 100 VUs sending 1-2 req/s each = 100-200 concurrent requests reaching the ASP thread pool
- A 4-core server's default pool of 100 threads is fully saturated at exactly 100 VUs
- Requests start queueing inside IIS at the test's own target VU count
- Response latency rises sharply — not because the application logic is slow, but because requests
  are waiting for an available thread

**This is the correct behavior of a capacity test.** The problem is the tool's interpretation:
- The existing `MeasurementReliability` signals do not distinguish between "IIS thread pool queuing"
  and "application-level slowness"
- The report cannot currently tell the user: "the server hits its thread pool limit at N VUs, and
  latency is dominated by IIS queuing at that point"

**Consequences:**
- P50 latency may be acceptable (first requests get threads immediately) while P95/P99 is 10-30x
  higher (tail requests waited in queue)
- Results are valid as a capacity finding but cannot be interpreted correctly without this context

**Warning signs:** Step-function latency increase at a specific VU count; 5xx errors only after
sustained load (IIS returns HTTP 500 "Server Too Busy" when `requestQueueMax` is exhausted with
default `queueConnectionTestTime = 3s`).

**Prevention:** The tool itself does not need to avoid this — it is measuring real server behavior.
The deliverable change needed is in the **capacity report**: add a section that explains IIS thread
pool limits and maps the measured latency curves to the expected saturation point. The
`operationalWarnings` field in `TestResult` is the right place to surface this.

**Phase that must address it:** Capacity report / leadership presentation phase.

**Confidence:** HIGH (confirmed via official IIS configuration reference:
https://learn.microsoft.com/en-us/iis/configuration/system.webserver/asp/limits)

---

## Moderate Pitfalls

Issues that degrade measurement accuracy or cause errors in specific scenarios.

---

### Pitfall M1: WORKER_THREAD_THRESHOLD = 256 — 50-100 VU Tests Never Use Workers

**What goes wrong:** The threshold for activating worker threads is `WORKER_THREAD_THRESHOLD = 256`
in `stress-engine.ts` (line 429). All production tests at the 50-100 VU target run entirely in
the Electron main process event loop.

**Consequences:**
- All 100 VU coroutines, all HTTP response callbacks, all `handleResponse`/`handleError` calls,
  and the `setInterval` metrics tick share a single Node.js event loop thread
- Under high response volume (fast server, 100 VUs × 10 ops), the event loop processes thousands
  of callbacks per second. The 1-second metrics tick (`setInterval`) can drift by 50-200ms when
  callback queues are long.
- A drifted tick means the timeline reports "0 requests in second N" followed by "200 requests
  in second N+1" — the per-second percentiles become misleading
- The `secLatencies.sort()` on every tick copies and sorts the per-second sample array
  (`O(n log n)`). With 3000+ samples in a second (100 VUs × fast endpoint), the sort itself takes
  5-15ms, further delaying the tick

**Warning signs:** Timeline has seconds with zero requests interspersed with seconds with double
the expected count; CPU usage in the Electron process is 100% on one core while metrics are reporting.

**Prevention:** Lower `WORKER_THREAD_THRESHOLD` to 32 or 50 for the MisterT multi-op scenario so
that 50-100 VU tests use workers, freeing the main event loop for metrics aggregation. Alternatively,
move the percentile sort to a separate worker or use an approximate online algorithm (reservoir
+  one-pass P50/P95/P99 approximation).

**Phase that must address it:** 50-100 VU scalability phase.

**Confidence:** HIGH (code analysis + Node.js event loop behavior)

---

### Pitfall M2: CookieJar Does Not Clear Old Session Before Re-Login

**What goes wrong:** When the VU loop re-authenticates (see C2), it POSTs to the login endpoint
while the CookieJar still contains the previous session's `ASPSESSIONID` cookie. The login request
arrives at ASP Classic with an already-valid session cookie attached.

**ASP Classic behavior under this condition:**
- If the existing session is still valid: ASP Classic may process the login POST and simply redirect
  to the dashboard without issuing a new `Set-Cookie`. The CookieJar retains the original
  ASPSESSIONID. The VU continues with the same session, which is correct behavior — but the CTRL
  value embedded in the login redirect is not captured (redirect not followed, per C3).
- If the existing session has been invalidated by the server (e.g., admin restart, timeout): ASP
  Classic creates a new session and sends a new `Set-Cookie`. The CookieJar overwrites the entry
  because ASPSESSIONID names are unique per virtual directory and consistent across sessions. This
  is fine.
- Edge case: MisterT uses multiple application pools, each generating a different ASPSESSIONID
  suffix (e.g., `ASPSESSIONIDAABBCCDD`, `ASPSESSIONIDWWXXYYZZ`). After re-login, if a new pool-
  specific cookie is issued with a different name, the CookieJar accumulates both the old (stale)
  and new cookie. Both are sent on subsequent requests. ASP Classic uses whichever cookie matches
  the current request's pool. This is benign but contributes to CookieJar growth over a long test.

**Warning signs:** Cookie header in requests grows longer over the test duration; occasional 302s
on module operations that correlate with re-login cycles.

**Prevention:** The VU should call `cookieJar.clear()` before each re-authentication attempt.
This ensures a clean login. If session persistence across loops is desired (current behavior), the
loop should not re-authenticate at all (see C2 fix).

**Phase that must address it:** Multi-operation MisterT preset implementation.

**Confidence:** MEDIUM (ASP Classic behavior inferred from documented session model; MisterT
multi-pool specifics are unverified without direct access to the ERP config)

---

### Pitfall M3: Concurrent Same-Credential Logins May Hit MisterT Application-Level Session Limits

**What goes wrong:** All 100 VUs log in with the same set of credentials (injected via `.env`).
If MisterT enforces an application-level limit on concurrent sessions per user account (e.g., a
licensing model where each user account can have at most N active sessions), requests beyond that
limit will fail at the application level rather than at the HTTP/IIS level.

**Why it matters for measurement:** These failures return 200 with an error HTML page (typical
ASP Classic pattern), not a 4xx or 5xx. The tool counts them as successes. The protection detector
may classify them as "unusual response patterns" but the root cause (license limit) will not be
apparent in the test output.

**Warning signs:** All module operations start returning identical response sizes; no HTTP errors
but very high "session expired" rate in `operationMetrics.session.sessionExpiredErrors`.

**Prevention:** Use a pool of distinct test credentials (one per VU or one per 5 VUs) rather than
a single shared credential. The `.env` approach currently supports only one set of credentials.
For the preset implementation, consider either a credentials list in `.env` or a CSV import
for multi-user testing.

**Phase that must address it:** Multi-operation preset design (test configuration UX decision).

**Confidence:** MEDIUM (MisterT licensing model not directly verified; pattern is common in
enterprise ERPs)

---

### Pitfall M4: saveErrorBatch Non-Transactional Count Check in Worker Mode

**What goes wrong:** `saveErrorBatch` in `electron/database/repository.ts` reads `COUNT(*)` from
`test_errors` and then performs the insert in a separate statement. In worker thread mode (> 256
VUs), multiple worker threads can call back nearly simultaneously. Each reads a count below
`MAX_ERRORS_PER_TEST`, then all insert, collectively exceeding the limit.

**Why it is relevant here:** Worker mode activates at 256+ VUs. While the current target is
50-100 VUs (single-threaded path), the next scaling milestone may push toward 256+. If worker
mode is activated before this race is fixed, error storage can overflow silently.

**Warning signs:** `test_errors` table contains more rows than `MAX_ERRORS_PER_TEST` for a single
test; SQLite integrity errors in logs.

**Prevention:** Wrap the count check and insert in a single `BEGIN IMMEDIATE` transaction, or
replace the pattern with a subquery-based conditional insert:
```sql
INSERT INTO test_errors SELECT ... WHERE (SELECT COUNT(*) FROM test_errors WHERE test_id = ?) < MAX
```

**Phase that must address it:** Before worker-thread mode is used in production (WORKER_THREAD_THRESHOLD
is lowered, see M1).

**Confidence:** HIGH (code analysis — the fragile area is already documented in CONCERNS.md)

---

## Minor Pitfalls

Issues that degrade experience or cause operational confusion.

---

### Pitfall m1: secLatencies O(n log n) Full Sort Every Second Under High Throughput

**What goes wrong:** Every second, `stress-engine.ts` (line 674) executes
`[...secLatencies].sort((a, b) => a - b)`. For 100 VUs hitting a fast server endpoint, the array
can contain 3000-10000 samples per second. The sort is `O(n log n)` on a full copy of the array.

**Consequences:** At 5000 samples/second, the sort + copy takes approximately 5-20ms. The
`setInterval` callback is delayed by this duration, which pushes the next tick late. Over time,
ticks accumulate drift of up to 50ms per second on a loaded event loop, causing the timeline to
show uneven second boundaries.

**Prevention:** For the per-second display metric, replace the full sort with a T-Digest or
a fixed-bucket histogram (e.g., 0-100ms, 100-500ms, 500-1000ms, 1000ms+) that computes
approximate percentiles in O(n) with a single pass. The final global percentiles at test end
use the properly-capped `latencyReservoir` and can remain as-is.

**Phase that must address it:** Performance optimization pass.

**Confidence:** HIGH (code analysis)

---

### Pitfall m2: User-Agent "StressFlow/1.0" May Trigger IIS Request Filtering Rules

**What goes wrong:** The `User-Agent` header sent in all requests is `"StressFlow/1.0"` (hardcoded
in `stress-worker.ts` line 147 and `stress-engine.ts` line 1235). If the MisterT IIS instance has
custom request filtering rules or a WAF layer that blocks or flags unknown/tool-like User-Agent
strings, all requests will fail with 404 (IIS request filtering blocks silently with 404).

This is also a branding inconsistency: the product is CPX-MisterT Stress but identifies itself
to the server as StressFlow.

**Warning signs:** All requests return 404 immediately on test start; IIS logs show `sc-substatus`
of 14 (URL filtering) or 15 (request filtering).

**Prevention:** Update User-Agent to `"CPX-MisterT-Stress/1.0"` (already tracked in CONCERNS.md).
Coordinate with the server administrator to whitelist the tool's UA or confirm no filtering rules
apply to internal testing traffic.

**Phase that must address it:** Pre-deployment configuration (low urgency; fix alongside the
branding cleanup tracked in CONCERNS.md).

**Confidence:** MEDIUM (IIS filtering behavior confirmed; whether MisterT has such rules is
unverified)

---

### Pitfall m3: CTRL Parameter Silent Failure Is Indistinguishable from Server Error

**What goes wrong:** When `{{CTRL}}` extraction fails (empty body from redirect, regex mismatch,
or no `extract` configured for the login operation), `resolveExtractVars` returns the literal
string `"{{CTRL}}"` as the placeholder value. The request is issued with this literal string in
the URL.

ASP Classic receives a request like `MisterT.asp?CTRL={{CTRL}}&R=89`. It cannot find a matching
CTRL token, typically responds with a 302 redirect to the login page (session/context not found).
The tool counts this as a redirect (302), which is tracked as `authenticated` in the session
metrics because 302 < 400.

**Consequences:** The test appears to have a 0% error rate while the server is processing nothing
but failed CTRL lookups and serving login redirects. Per-module error rates are zero; per-module
response sizes are tiny (redirect responses). This is the worst-case false-positive scenario.

**Warning signs:** All `statusCodes` dominated by `302`; `bytesReceived` per request is very
low (~200 bytes, typical for an empty redirect response); `authenticatedRequests` count in session
metrics is high while visual inspection of any sampled response body shows login page HTML.

**Prevention:**
1. Log a warning when `{{VAR}}` is not resolved (i.e., when a placeholder is sent literally to the
   server). Surface this in the `operationalWarnings` field.
2. Implement redirect following (see C3) so that CTRL is extracted from the redirect destination.
3. Classify 302 responses differently in session metrics — treat 302 to the login page as
   `sessionExpiredErrors`, not `authenticatedRequests`.

**Phase that must address it:** Multi-operation preset implementation (detection) + redirect
following phase (prevention).

**Confidence:** HIGH (code analysis — `resolveExtractVars` returns the literal match string when
`vars.get(varName)` returns undefined)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| MisterT 10-op preset | C2 (auth storm), C3 (no redirect follow), m3 (CTRL silent failure) | Redesign VU loop; implement redirect following before preset ships |
| 50-100 VU scaling | C4 (agent queue latency inflation), C5 (IIS thread pool), M1 (single-threaded event loop) | Add agent queue depth diagnostic; lower WORKER_THREAD_THRESHOLD; improve capacity report |
| Memory/reliability | C1 (opMetrics unbounded arrays) | Apply reservoir cap to per-operation latency arrays before any 600s test |
| Error analysis UI | M4 (saveErrorBatch race) | Fix before enabling any test path that uses workers |
| Credentials config UI | M3 (single-credential concurrent logins) | Design credential pool support at the same time as credential UI |
| Report generation | C5 + C4 (interpreting results) | Document IIS thread pool limits and agent queue semantics in the capacity report |

---

## Sources

- Official IIS ASP Limits configuration reference (HIGH confidence):
  https://learn.microsoft.com/en-us/iis/configuration/system.webserver/asp/limits
  Confirms: `processorThreadMax` default = 25/CPU, `requestQueueMax` default = 3000

- Official Node.js HTTP Agent documentation (HIGH confidence):
  https://nodejs.org/api/http.html#class-httpagent
  Confirms: requests queue in `agent.requests` when `maxSockets` is reached; `request.setTimeout`
  does not activate during queue wait; `scheduling: 'fifo'` improves high-volume behavior

- Official Node.js Worker Threads documentation (HIGH confidence):
  https://nodejs.org/api/worker_threads.html
  Confirms: `postMessage` uses structured clone by default (copy, not transfer); `resourceLimits`
  can cap worker heap; `Buffer.from()` buffers cannot be transferred (full pool clone risk)

- Codebase analysis of `stress-engine.ts`, `stress-worker.ts`, `cookie-jar.ts` (HIGH confidence):
  Direct code review of `opMet.latencies.push`, VU loop structure, `makeRequest` implementation,
  `resolveExtractVars` undefined-guard behavior, and `maxSockets` formula

- CONCERNS.md (existing codebase audit, HIGH confidence):
  Confirms: `saveErrorBatch` non-transactional race, `secLatencies` sort concern, User-Agent
  branding inconsistency
