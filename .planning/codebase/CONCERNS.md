# Codebase Concerns

**Analysis Date:** 2026-04-06

## Tech Debt

**Duplicate type definitions between processes:**
- Issue: `ProtectionType`, `ProtectionProvider`, `ConfidenceLevel`, and related interfaces are defined twice — once in `electron/engine/protection-detector.ts` and once in `src/types/index.ts`. The comment in the detector file explicitly acknowledges this as "espelhados do renderer para isolamento entre processos".
- Files: `electron/engine/protection-detector.ts` (lines 65–96), `src/types/index.ts` (lines 512–616)
- Impact: Any update to protection types must be applied in two places. Divergence between the two definitions is silent at runtime and only caught if TypeScript is run across both tsconfig scopes.
- Fix approach: Extract shared types to `src/shared/` (which already hosts `test-analysis.ts`) and import them in both processes via a shared tsconfig path, or accept duplication and add a lint rule to detect deviation.

**`TestResult` interface duplicated between main process and renderer:**
- Issue: `stress-engine.ts` defines its own `TestResult` interface that does not include `errorBreakdown`, yet `stress-engine.ts` line 969 writes `result.errorBreakdown = { ...eb }` — assigning to a property not declared in the interface. The renderer-side `TestResult` in `src/types/index.ts` does declare `errorBreakdown?`. The assignment works at runtime via JavaScript's dynamic property setting, but TypeScript strict mode would flag it.
- Files: `electron/engine/stress-engine.ts` (lines 110–170, line 969), `src/types/index.ts` (lines 358–488)
- Impact: TypeScript type safety is bypassed for `errorBreakdown`. If the property is removed from the renderer type in the future, no compile-time error surfaces on the engine side.
- Fix approach: Add `errorBreakdown?` to the `TestResult` interface in `stress-engine.ts`, or unify the interfaces.

**Weak typing in `saveTestResult`:**
- Issue: `saveTestResult` in `electron/database/repository.ts` accepts `Record<string, unknown>` instead of the typed `TestResult`. The call site in `main.ts` (line 448) casts with `as unknown as Record<string, unknown>`. All field accesses inside `saveTestResult` use runtime casts (`r.id as string`, etc.) with no compile-time guarantees.
- Files: `electron/database/repository.ts` (lines 102–150), `electron/main.ts` (line 448)
- Impact: A typo in a field name or a schema change will fail silently at runtime rather than at compile time.
- Fix approach: Change `saveTestResult` to accept the `TestResult` type from `stress-engine.ts` and map fields explicitly.

**Orphaned `getHistoryPath()` function:**
- Issue: `getHistoryPath()` in `electron/main.ts` (lines 200–203) computes the path to the legacy `history.json` file. After migration to SQLite, nothing calls this function — it is dead code.
- Files: `electron/main.ts` (lines 200–203)
- Impact: Dead code adds noise and confusion about whether the JSON file is still in use.
- Fix approach: Delete the function.

**Out-of-order imports in `main.ts`:**
- Issue: `import type { TestConfig, TestResult, ErrorDetail }` and the database imports appear at lines 101–121, after function definitions for `loadEnvFile` and `resolveEnvPlaceholders` (lines 32–100). TypeScript hoists imports, so it works, but it violates conventional import-at-top structure and impedes readability.
- Files: `electron/main.ts` (lines 32–121)
- Impact: Readability and maintainability issue; deviation from expected module structure.
- Fix approach: Move all imports to the top of the file before any function definitions.

**Brand name inconsistency ("StressFlow" vs "CPX-MisterT Stress"):**
- Issue: All log messages in `electron/main.ts` use the prefix `[StressFlow]` (e.g., `"[StressFlow] Banco de dados SQLite inicializado com sucesso."`), the preload bridge header still reads "StressFlow", and the User-Agent header sent in HTTP requests is `"StressFlow/1.0"` (line 1235 in `stress-engine.ts`). The product was renamed to CPX-MisterT Stress.
- Files: `electron/main.ts` (all `console.error`/`console.log` calls), `electron/preload.ts` (header comment), `electron/engine/stress-engine.ts` (line 1235)
- Impact: Inconsistent branding leaks into server logs of test targets, and creates confusion in internal log analysis.
- Fix approach: Globally replace `[StressFlow]` with `[CPX-MisterT]` and update User-Agent to `"CPX-MisterT-Stress/1.0"`.

**`clearTestResults()` performs a redundant explicit delete of errors:**
- Issue: `clearTestResults()` in `electron/database/repository.ts` (lines 180–184) runs both `DELETE FROM test_results` (which CASCADE-deletes linked errors due to `ON DELETE CASCADE`) and then `DELETE FROM test_errors` explicitly. The second statement deletes rows that are already gone.
- Files: `electron/database/repository.ts` (lines 180–184)
- Impact: Cosmetic inefficiency; no functional harm.
- Fix approach: Remove the explicit `DELETE FROM test_errors` line.

**Hardcoded production-adjacent URL in default config:**
- Issue: `MISTERT_DEFAULT_BASE_URL = "https://dev-mistert.compex.com.br"` is hardcoded in `src/constants/test-presets.ts` and embedded in the store's initial config (`src/stores/test-store.ts` line 203). Any user who opens the app without configuring the URL will hit this endpoint.
- Files: `src/constants/test-presets.ts` (lines 4–5), `src/stores/test-store.ts` (line 203)
- Impact: If the default URL ever points to a non-dev environment or changes, tests will unknowingly target the wrong server. No URL validation at startup warns the user.
- Fix approach: Make the default URL configurable via a `.env` variable (e.g., `STRESSFLOW_BASE_URL`), falling back to the hardcoded dev value only when not set.

---

## Security Considerations

**DNS rebinding / SSRF TOCTOU window:**
- Risk: `validateTargetHost()` in `electron/engine/stress-engine.ts` (lines 220–268) resolves DNS at validation time, before the test starts. Thousands of subsequent requests are sent after that, potentially minutes later. A DNS rebinding attack could cause the DNS to start resolving to an internal IP after the initial check passes, directing load-test traffic at internal infrastructure.
- Files: `electron/engine/stress-engine.ts` (lines 220–268)
- Current mitigation: Validates all resolved IPv4 and IPv6 addresses at startup, including dual-stack check.
- Recommendations: For a desktop tool targeting a controlled environment, this risk is low in practice. For hardening, re-validate the resolved IP on each connection establishment by registering a custom `http.Agent` `lookup` callback that checks the resolved address before connecting.

**ReDoS via user-supplied regex in response extraction:**
- Risk: `op.extract` entries in `TestOperation` contain user-provided regex patterns. In `spawnVU` (line 1114), patterns are compiled with `new RegExp(pattern)` and executed against HTTP response bodies. A pattern with catastrophic backtracking (e.g., `(a+)+$`) can permanently hang a worker thread, consuming 100% CPU.
- Files: `electron/engine/stress-engine.ts` (lines 1112–1123), `electron/engine/stress-worker.ts` (same logic)
- Current mitigation: The error is silently ignored if the regex is invalid, but a syntactically valid catastrophic regex will not throw — it will hang.
- Recommendations: Validate regex patterns in `validateOperation()` using a safe regex complexity checker (e.g., the `safe-regex` npm package), or run extraction in a worker with a hard timeout.

**`preload.ts` channel validation is redundant but correct:**
- Risk: Low. The `safeInvoke` function validates that the channel is in `ALLOWED_INVOKE_CHANNELS` before calling `ipcRenderer.invoke`. However, because the array values are derived from TypeScript const literals and the parameter type is `InvokeChannel`, calling the function with an unlisted channel is already a compile-time error. The runtime check is a belt-and-suspenders guard.
- Files: `electron/preload.ts` (lines 75–83)
- Current mitigation: Both compile-time and runtime validation in place.
- Recommendations: No action required; the redundancy is acceptable for a security boundary.

**App icon loaded as GIF:**
- Risk: Low. `electron/main.ts` (line 289) loads the app icon as `icon.gif` using `nativeImage.createFromPath`. GIF is not a standard icon format for Electron. Windows expects `.ico`, macOS expects `.icns`. Electron may silently fail to set the icon or produce a degraded result.
- Files: `electron/main.ts` (lines 289–293)
- Current mitigation: The code guards with `!appIcon.isEmpty()` before applying the icon, so it degrades gracefully.
- Recommendations: Convert to PNG (cross-platform) or provide `.ico` / `.icns` platform-specific icons via `electron-builder.json5`.

---

## Performance Bottlenecks

**Large timeline JSON blob in SQLite:**
- Problem: The `timeline_json` column in `test_results` stores the full per-second metrics as a single TEXT value. For a 600-second test, this JSON array contains 600 `SecondMetrics` objects, each with ~12 numeric fields plus a `statusCodes` map. At high cardinality (many distinct status codes), this can reach several hundred KB per test.
- Files: `electron/database/repository.ts` (lines 108–149, line 86), `electron/database/database.ts` (schema, line 102)
- Cause: Denormalized storage chosen for simplicity. No index on timeline data.
- Improvement path: If timeline data grows to a performance concern, extract it to a dedicated `test_timeline` table (one row per second). For current test durations (max 600s), the blob approach is acceptable.

**`listTestResults` hardcoded to 100 items:**
- Problem: `listTestResults()` in `electron/database/repository.ts` (line 153) defaults to returning the last 100 results. Users who run many tests over time will silently lose visibility into older tests. There is no pagination UI in `HistoryPanel`.
- Files: `electron/database/repository.ts` (line 153), `src/components/HistoryPanel.tsx`
- Cause: Limit hardcoded without a user-facing pagination or load-more mechanism.
- Improvement path: Add a "carregar mais" / infinite scroll to `HistoryPanel.tsx` and expose an `offset` parameter through the `history:list` IPC channel.

**Per-second interval uses full array copy for sorting:**
- Problem: In `stress-engine.ts` (line 674), every second the engine does `[...secLatencies].sort(...)` to compute percentiles. For very high VU counts in single-threaded mode (e.g., 256 VUs × 30+ req/s each = 7000+ samples per second), this is a large array copy + sort each tick.
- Files: `electron/engine/stress-engine.ts` (lines 663–712)
- Cause: Per-second percentile calculation via full sort is O(n log n) where n grows with VU count.
- Improvement path: For the per-second display, approximate percentiles using a reservoir or an online histogram (t-digest). The global latency is already guarded by reservoir sampling (`RESERVOIR_MAX = 100_000`).

---

## Fragile Areas

**Worker thread `testId` is empty string:**
- Files: `electron/engine/stress-engine.ts` (line 1664)
- Why fragile: `workerData.testId` is always `""` when passed to workers. Workers call back with error data (`networkErrors`), but those errors are then handled by `handleError` in the main engine which uses the outer `testId` variable from closure. This works correctly at runtime, but the explicit `testId: ""` is misleading and breaks if workers ever try to include `testId` in their reported data directly.
- Safe modification: Always pass the real `testId` to workers, even if they don't use it currently.
- Test coverage: None — no automated tests exist.

**`saveErrorBatch` count check is not transactional:**
- Files: `electron/database/repository.ts` (lines 194–231)
- Why fragile: The function queries `COUNT(*)` then inserts in a separate transaction. In worker mode, multiple batch flushes from different worker threads can interleave: each reads a count below the limit, then all insert, collectively exceeding `MAX_ERRORS_PER_TEST`. The `INSERT OR IGNORE` only prevents UUID collisions, not count overflow.
- Safe modification: Wrap the count check and insert in a single transaction, or use a `LIMIT` inside the INSERT via a subquery.
- Test coverage: None.

**`lastTableY` in `pdf-generator.ts` uses `(doc as any)`:**
- Files: `src/services/pdf-generator.ts` (line 148)
- Why fragile: `((doc as any).lastAutoTable?.finalY as number)` bypasses TypeScript to read an undocumented internal property of the `jsPDF` instance set by `jspdf-autotable`. If `jspdf-autotable` changes its internal state shape, the PDF layout silently breaks (tables overlap or leave large gaps).
- Safe modification: Use the `didDrawPage` callback or the return value from `autoTable()` (it returns the final Y position since `jspdf-autotable` v3).
- Test coverage: None — PDF output is not tested.

**`preBlockingData` in `pdf-generator.ts` uses weighted-average approximation for percentiles:**
- Files: `src/services/pdf-generator.ts` (lines 244–295)
- Why fragile: The "synthetic result" for the pre-blocking period approximates `p50`, `p90`, `p95`, `p99` by a request-weighted average of per-second percentile values (e.g., `pre.reduce((s,t) => s + t.latencyP50 * t.requests, 0) / safe`). This is statistically incorrect — a weighted average of percentiles is not the percentile of the combined distribution. It produces plausible but inaccurate latency figures in the PDF.
- Safe modification: Either accept the approximation and document it, or store raw latency buckets per second in the timeline to enable true percentile computation.
- Test coverage: None.

---

## Test Coverage Gaps

**No test runner configured:**
- What's not tested: The entire codebase — stress engine logic, protection detector, repository layer, PDF generator, IPC handlers, all React components.
- Files: All files in `electron/` and `src/`
- Risk: Any refactoring or dependency upgrade can silently break core functionality. The stress engine has complex state management (timers, intervals, worker threads, abort signals) that is especially prone to regressions.
- Priority: High

**`validateTestConfig` and `validateTargetHost` are untested:**
- What's not tested: The security-critical validation functions that guard against SSRF and malformed input.
- Files: `electron/engine/stress-engine.ts` (lines 278–422, 220–268)
- Risk: Edge cases in URL parsing, boundary values for `virtualUsers`/`duration`, and private IP range detection could be missed. A regression could re-open SSRF or allow invalid configs through.
- Priority: High

**Database repository layer is untested:**
- What's not tested: `saveTestResult`, `listTestResults`, `saveErrorBatch`, `searchErrors`, migration logic in `migrateFromJsonHistory`.
- Files: `electron/database/repository.ts`, `electron/database/database.ts`
- Risk: Schema migrations could fail silently on upgrade; JSON serialization/deserialization bugs in `rowToTestResult` are undetectable without tests.
- Priority: High

**PDF generation is untested:**
- What's not tested: Layout rendering, edge cases (zero errors, cancelled tests, protection reports), chart image embedding, `preBlockingData` computation.
- Files: `src/services/pdf-generator.ts`
- Risk: Layout bugs only appear when a user generates a PDF with specific data patterns. The `(doc as any)` hack makes regression even more likely on jsPDF version updates.
- Priority: Medium

---

## Missing Critical Features

**No input sanitization or complexity check for `extract` regex patterns:**
- Problem: `validateOperation()` validates URL, method, body, and headers, but does not validate `op.extract` regex patterns. There is no protection against ReDoS patterns.
- Blocks: Safe use of the multi-operation extraction feature when test configurations come from untrusted sources.

**No pagination in history list:**
- Problem: The `history:list` IPC channel returns at most 100 results. Once a user has more than 100 saved tests, older ones are invisible with no UI affordance to load more.
- Blocks: Long-term usability for heavy users.

**Database not explicitly closed on macOS app suspend:**
- Problem: `app.on("window-all-closed")` skips `closeDatabase()` on macOS (`process.platform !== "darwin"`). The SQLite connection stays open indefinitely while the app idles in the dock.
- Files: `electron/main.ts` (lines 858–863)
- Blocks: Clean shutdown and potential WAL file accumulation on macOS.

---

*Concerns audit: 2026-04-06*
