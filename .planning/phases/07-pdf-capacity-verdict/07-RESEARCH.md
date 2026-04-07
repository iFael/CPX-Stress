# Phase 7 — Research

> Research for PDF Capacity Verdict implementation.

## Scope

Single file modification: `src/services/pdf-generator.ts`
- Modify `drawLaypersonPage()` to insert verdict section
- No new files, no UI changes, no new IPC channels

## Key Findings

### 1. `drawLaypersonPage()` Structure (line 798)

Current flow:
1. `doc.addPage()` + `pageDecor(doc)` (line 804-805)
2. `sectionTitle(doc, "Resumo para Gestores", y)` (line 807)
3. Health score card with colored border (lines 813-838) → y at ~line 840
4. "O que testamos?" section (lines 843-853)
5. "O que encontramos?" section (lines 856-861)
6. "O que recomendamos?" section (lines 865-870)

**Insertion point:** After line 840 (`y += scoreH + 12`), before line 843 ("O que testamos?").

### 2. Available Data Fields (TestResult)

- `result.config.virtualUsers` — VU count
- `result.latency.avg` — average response time in ms
- `result.errorRate` — percentage (0-100)
- `result.totalErrors` / `result.totalRequests`
- `result.rps` — requests per second

All fields needed for the verdict sentence are already available in the function signature (receives `result: TestResult` and `health: HealthAssessment`).

### 3. Utility Functions Available

- `card(doc, x, y, w, h, { border: RGB })` — draws a rounded card with colored border (line 377)
- `paragraph(doc, text, x, y, maxW, { size, color, lineH })` — renders wrapped text (line 417)
- `formatMs(ms)` — formats milliseconds for display (imported from shared)
- `needsPage(doc, y, need, pageH)` — page break if needed (line 151)

### 4. Pre-blocking Analysis

The `preBlockingData()` function (line 244) detects if the server started blocking requests mid-test. When this happens, `drawLaypersonPage()` uses the pre-blocking health score instead. The verdict should also use this adjusted data when available.

## Implementation Notes

- The verdict box should use `card()` with `{ border: health.color }` for visual consistency
- Bold text: `doc.setFont("helvetica", "bold")` then reset with `doc.setFont("helvetica", "normal")`
- The page height is `doc.internal.pageSize.height` — use `needsPage()` before the verdict card to avoid page overflow
- `formatMs()` already returns a human-readable string like "234ms" or "1.2s"

## Validation

Manual-only — no test framework configured. Verify by generating a PDF and checking the "Resumo para Gestores" page.
