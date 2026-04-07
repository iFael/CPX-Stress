# Phase 7 — Context (auto-mode)

> Decisions for PDF Capacity Verdict. Auto-selected by Claude based on codebase analysis.

## Phase Boundary

Modify the existing `drawLaypersonPage()` function in `src/services/pdf-generator.ts` to add an explicit capacity verdict sentence and IIS thread limit context when relevant. No new files, no UI changes, no new IPC channels.

## Decisions

### D1: Verdict Placement

**Question:** Where in the "Resumo para Gestores" page should the verdict appear?

**Decision:** Insert the verdict sentence immediately after the health score card (line ~840) and before "O que testamos?" section. The verdict is a prominent single sentence in a highlighted box — not buried in findings.

**Rationale:** The success criteria says "lendo apenas a primeira página" — the verdict must be visible without scrolling. Placing it right after the score card ensures it's the second thing the reader sees (after the score itself).

### D2: Verdict Sentence Format

**Question:** What exact template for the verdict sentence?

**Decision:** Use this template:
- **Good (errorRate < 5%):** "O sistema suportou {VUs} usuários simultâneos com tempo de resposta médio de {avg}ms e taxa de erro de {errorRate}%."
- **Warning (errorRate 5-20%):** "O sistema apresentou dificuldades com {VUs} usuários simultâneos: tempo de resposta médio de {avg}ms e taxa de erro de {errorRate}%."
- **Critical (errorRate > 20%):** "O sistema não suportou {VUs} usuários simultâneos adequadamente: tempo de resposta médio de {avg}ms e {errorRate}% das requisições falharam."

**Rationale:** Matches SC#1 template exactly. Three tiers match the existing healthScore tiers. Language is non-technical per SC#4.

### D3: IIS Thread Context Line

**Question:** When and how to show the IIS thread context?

**Decision:** When `errorRate` increases with VU count AND errorRate > 5%, add a contextual note below the verdict: "Nota: É comum que servidores web apresentem aumento de erros quando o número de acessos simultâneos ultrapassa a capacidade de processamento configurada. Isso pode ser ajustado pela equipe de infraestrutura."

**Rationale:** SC#3 requires context about IIS thread limit behavior "sem jargão técnico excessivo". Since we only have single-test data (no multi-test sweep), we can't directly detect "error rate increases with VUs." Instead, we use errorRate > 5% as a proxy — high error rates under load suggest thread exhaustion. The note is generic enough to be always correct without IIS-specific jargon.

### D4: Visual Treatment of Verdict Box

**Question:** How should the verdict box be styled?

**Decision:** Colored border box matching the health assessment color (same pattern as the score card). Background: light tint of the health color. Large text (12pt bold) for the verdict sentence, 9pt normal for the IIS context note.

**Rationale:** Reuses existing `card()` utility function and color palette. Consistent with the score card visual pattern already on the page.

## Canonical References

- `src/services/pdf-generator.ts:798` — `drawLaypersonPage()` function
- `src/services/pdf-generator.ts:169` — `healthScore()` function
- `src/services/pdf-generator.ts:873` — `buildFindings()` helper
- `src/types/index.ts:358` — `TestResult` interface (fields: `config.virtualUsers`, `latency.avg`, `errorRate`, `totalErrors`, `totalRequests`)
- `src/shared/test-analysis.ts` — `formatMs()` utility

## Claude's Discretion

- Exact padding/margins within the verdict card
- Whether to show RPS in the verdict (recommendation: no — too technical for gestores)
- Font size fine-tuning for the verdict text
