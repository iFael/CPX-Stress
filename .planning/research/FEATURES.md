# Feature Landscape

**Domain:** Internal ERP load testing — desktop tool targeting MisterT (ASP Classic, cookie sessions)
**Researched:** 2026-04-06
**Research basis:** Codebase direct analysis (types, store, services, components, presets) + professional tool domain knowledge (k6, Locust, Gatling, JMeter)
**Confidence:** HIGH for what exists / MEDIUM for professional tool comparison (training data, cutoff May 2025)

---

## Current Baseline

Before categorizing new features, this is what already exists in the codebase — establishing the actual baseline:

| Capability | Status | Notes |
|------------|--------|-------|
| MisterT 10-operation sequence | Exists | Hardcoded in `src/constants/test-presets.ts` as `MISTERT_OPERATIONS_TEMPLATE` — not UI-editable |
| Error storage per test | Exists | `ErrorRecord` in SQLite with operationName, statusCode, errorType, message, responseSnippet |
| Error Explorer component | Exists | `ErrorExplorer.tsx` with filter by statusCode and errorType; pagination; summary cards |
| Error IPC bridge | Exists | `errors.search`, `errors.byStatusCode`, `errors.byErrorType` — operationName filter NOT yet in IPC params |
| PDF report | Exists | 11 sections including "Resumo Executivo", "Resumo para Gestores" (layperson), recommendations, glossary |
| Health score | Exists | Calculated 0-100 in `shared/test-analysis.ts`, used in PDF cover and executive summary |
| Measurement reliability | Exists | `MeasurementReliability` type + levels (high/degraded/generator-saturated) |
| Credentials | Exists | `.env` file with `STRESSFLOW_USER` / `STRESSFLOW_PASS` — no UI, manual editing only |
| Environments | Exists | Two environments hardcoded in TestConfig: dev (enabled) and prod (disabled) |

---

## Table Stakes

Features users expect. Missing = tool feels incomplete or forces manual workarounds.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Named preset save/load | Every repeated-use testing tool has test definition persistence. Without it, users re-enter the same VU count, duration, and operation set every session. JMeter (.jmx), Gatling (simulation files), k6 (JS files) — all persist test definitions. | Medium | Needs new SQLite table or JSON file, UI for CRUD, 2–3 new IPC channels |
| Preset selection inline in TestConfig | Users expect to pick a scenario and run it in one action. The current UX re-presents the full form every time. | Low | Depends on preset save/load existing first |
| Credentials write via UI | Engineers without .env knowledge cannot configure the tool. Asking them to edit a hidden file is a support barrier. This is the first-run blocker. | Medium | New IPC channel `credentials:save` + `credentials:status`; main process writes `.env`; renderer never holds values |
| Credentials status indicator | Users cannot tell if credentials are set. No feedback = silent failures during test execution. | Low | Read-only: is STRESSFLOW_USER configured? (boolean, no value exposure) |
| Error filter by operationName | The most useful filter in multi-operation tests. "Which MisterT module is generating 500 errors?" is the immediate engineering question. The data exists in SQLite (`operationName` column) but is not surfaced in the UI or IPC. | Low | Add `operationName` param to `errors.search` IPC call + SQLite query; add dropdown to ErrorExplorer |

---

## Differentiators

Features that make this tool valuable for the MisterT ERP context specifically. Not table stakes because generic tools don't have them, but they are what make this tool worth building instead of using k6.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Shipped MisterT scenario presets | Users do not need to assemble the operation chain manually. "Fluxo Completo MisterT", "Login + Estoque", "Smoke Test" arrive pre-configured. No other tool ships MisterT-aware defaults. | Medium | Three baseline presets: Smoke (5 VUs, 30s, login + menu), Padrão (100 VUs, 60s, full 10-op chain), Carga Pesada (150 VUs, 120s, login + heavier modules). Stored alongside user-created presets. |
| Module checkbox selector | Instead of exposing the operations JSON array, show a toggle list of named MisterT modules (CPX-Fretes, CPX-Rastreio, Estoque, Produção, Faturamento, Financeiro, Ordens E/S, Assistência Técnica). User composes a flow without understanding URL construction or CTRL extraction. | Medium | The engine already handles the operation chain; this is a UI facade over `MISTERT_OPERATIONS_TEMPLATE`. Login + Menu Principal are always forced-on (they are prerequisites). |
| Capacity narrative in PDF | The existing "Resumo para Gestores" page has layperson text but does not make an explicit capacity claim. Leadership needs a sentence: "Com 100 usuários simultâneos, o MisterT respondeu com P95 de Xs e taxa de erro de Y% — desempenho dentro do limiar aceitável para a base atual de N usuários." This is an explicit capacity verdict, not just metrics. | Low | Extension of the existing `drawLaypersonPage` function in `pdf-generator.ts`. Uses already-available `virtualUsers`, `latency.p95`, `errorRate`, and `health.score`. No new data source needed. |
| Capacity threshold interpretation | The PDF recommendation section today generates generic advice. A MisterT-specific interpretation maps performance to ERP user capacity: "Sistema adequado para bases de até 200 usuários ativos" (derived from VU count × observed concurrency factor). Engineering teams communicate this to leadership, who understand users, not VUs. | Low | Logic addition to `buildRecs()` / `buildFindings()` using VU count and health score. |
| Error timeline in ErrorExplorer | Show at which second of the test errors occurred. Identifies whether errors cluster at ramp-up (session establishment failures) or at peak (server saturation). Critical for diagnosing MisterT CookieJar / CTRL token failure patterns. | Medium | Use `ErrorRecord.timestamp` and test `startTime` to plot a bar chart of errors per second; can use existing Recharts infrastructure. |
| Environment switcher with lock | Currently dev is enabled and prod is disabled. An explicit "Ambiente de Teste" field that requires confirmation when switching to production prevents accidental production load tests. The IPC already uses the base URL as a parameter. | Low | UI toggle with a confirmation dialog for prod; no engine changes needed. |

---

## Anti-Features

Features to explicitly NOT build. These appear reasonable but would damage the tool's focus or create disproportionate cost.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom script / code editor | This tool exists because engineers without k6/Locust/Gatling expertise need a form-based interface. Adding scripting reintroduces the exact friction the tool removes. k6 already exists for teams that want scripting. | Hard-code MisterT flows; use module checkboxes for composition |
| Distributed load generation | Requires coordination infrastructure, network topology configuration, result aggregation across machines. The target scale (50–100+ VUs) is well within single-machine capacity with worker threads already in place. | Run at higher VU counts from a single machine first; if single-machine CPU is the bottleneck, that is itself a finding |
| Third-party metrics backends | InfluxDB, Grafana, Prometheus integration would require the user to operate additional services. This is a desktop app for occasional capacity testing, not continuous monitoring. | The SQLite history + PDF export covers all use cases |
| Trend analysis / baseline auto-comparison | Automatic regression detection requires stable reference runs, version tagging, and significant logic to handle VU count variations. Engineers can compare history panel entries manually. | Expose the multi-test selection for the executive report as a manual choice |
| Browser session recording | Recording browser sessions to generate test scenarios (Gatling Recorder, k6 browser) would require an embedded proxy or Chromium. MisterT's operations are already fully known and hardcoded. | Use the module checkbox selector to compose flows |
| Penetration testing / fuzzing | Explicitly out of scope in PROJECT.md. Different legal and ethical context than authorized load testing. | Never build; if needed, use a dedicated security tool |
| Multi-user / shared presets | This is a single-engineer desktop app. Multi-user requires auth, sync, conflict resolution. | Presets stored locally in SQLite — sufficient for single-user use |
| Email / Slack notifications | Single desktop session use. The user is watching the test run. | Toast notifications within the app are sufficient |

---

## Feature Dependencies

```
credentials:status (read) → credentials:save (write exists)
preset selector UI → preset CRUD (save/load/delete)
shipped MisterT presets → preset CRUD (presets stored via same mechanism)
module checkbox selector → preset CRUD (selecting modules → save as preset)
capacity narrative in PDF → no new infrastructure (uses existing result fields)
error filter by operationName → operationName in errors.search IPC params
error timeline → ErrorExplorer (extends existing component; uses Recharts)
```

Note: The PDF capacity narrative and threshold interpretation are the lowest-cost features (additions to existing functions). The preset system is the highest-value / highest-effort unit and unlocks several other differentiators.

---

## Professional Tool Comparison (Informational)

This section documents what professional tools offer in these areas, to ground the decisions above. Confidence: MEDIUM (training data, not verified against current docs).

### Scenario Presets

| Tool | Mechanism | UX |
|------|-----------|-----|
| k6 | JavaScript files with named `scenarios` object in `options` | Code editor required; no GUI save/load |
| JMeter | .jmx XML files with named Thread Groups; GUI template menu | GUI only; XML visible to power users |
| Locust | Python classes (TaskSet); no UI preset saving | Requires restarting with different Python file |
| Gatling | Scala/Java simulation files; named scenario objects | IDE-based; no GUI preset management |
| **This tool** | Named presets stored in SQLite; form-based composition | Form UI — no code required |

Conclusion: Form-based preset persistence is MORE accessible than any of the professional tools. The differentiator is that this tool ships MisterT-specific presets.

### Error Analysis

| Tool | Filters Available | Granularity |
|------|------------------|-------------|
| k6 open source | None (stdout/JSON only) | None |
| k6 Cloud | Status code, tags, scenario name | Per-request with tags |
| JMeter | View Results Tree: per-request; filter by response code, sampler label | Full request/response body |
| Locust | Method, request name, exception type | Per-endpoint, not per-request |
| Gatling HTML | Failed assertions table; grouped errors | Aggregated, not individual |
| **This tool (current)** | Status code, error type, pagination | Individual records with operationName, message, snippet |

Conclusion: Adding operationName filter puts this tool above k6 OSS and Locust for multi-operation test scenarios. The `responseSnippet` field already enables more diagnostics than Gatling's HTML report.

### Executive Reporting

| Tool | What It Has | What It Lacks |
|------|------------|---------------|
| k6 Cloud | Threshold pass/fail badges, SLA dashboard | No narrative text for non-engineers |
| JMeter HTML Dashboard | Apdex score, percentile tables, error charts | No capacity interpretation; no layperson narrative |
| Locust HTML | Percentile tables, RPS chart | No scoring, no narrative |
| Gatling HTML | Response time distribution, error rate | Engineering-focused; no leadership-facing summary |
| **This tool (current)** | "Resumo para Gestores" page with layperson text + health score + findings bullet list | Missing explicit capacity verdict ("suporta X usuários") |

Conclusion: The existing "Resumo para Gestores" page is already more leadership-friendly than any open-source tool. The gap is a capacity verdict sentence, not a full redesign.

---

## MVP Recommendation for This Milestone

Prioritize in this order:

1. **Credentials UI + status indicator** — First-run blocker. Unblocks every other feature for users who have not edited .env.
2. **Error filter by operationName** — Lowest-effort, highest-diagnostic-value addition. Extends existing infrastructure with minimal changes.
3. **Preset CRUD + shipped MisterT presets** — Core request from Marcel (23/02/2026). Enables repeatable testing.
4. **Module checkbox selector** — UX layer on top of preset system. Compose flows without understanding URL construction.
5. **Capacity narrative in PDF** — Low effort (function extension). Makes existing report leadership-ready without new infrastructure.

Defer:
- **Error timeline chart** — Valuable diagnostic but requires Recharts integration inside ErrorExplorer; schedule after core preset/credentials work.
- **Multi-test capacity comparison** — High complexity (UI multi-select + new PDF generation path). Useful but not blocked by anything urgent.

---

## Sources

- Direct codebase reading: `src/types/index.ts`, `src/constants/test-presets.ts`, `src/shared/test-analysis.ts`, `src/services/pdf-generator.ts`, `src/components/ErrorExplorer.tsx`, `src/stores/test-store.ts`, `src/components/TestConfig.tsx`
- Project requirements: `.planning/PROJECT.md` (Active requirements, Out of Scope, Key Decisions)
- Domain knowledge: k6 docs (training), JMeter 5.x HTML Dashboard (training), Locust docs (training), Gatling docs (training) — MEDIUM confidence, verified against codebase structure
