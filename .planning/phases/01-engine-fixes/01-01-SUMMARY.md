---
phase: 01-engine-fixes
plan: 01
subsystem: engine
tags: [bugfix, ssrf, memory, reservoir-sampling]
dependency_graph:
  requires: []
  provides: [STRESSFLOW_ALLOW_INTERNAL guard, per-operation reservoir sampling]
  affects: [electron/engine/stress-engine.ts]
tech_stack:
  added: []
  patterns: [reservoir sampling per-operation, env-var opt-in guard]
key_files:
  modified:
    - electron/engine/stress-engine.ts
decisions:
  - STRESSFLOW_ALLOW_INTERNAL bypasses ALL SSRF checks (not just RFC-1918) because it is opt-in, main-process only, and the tool is for authorized internal use
  - Reuse existing RESERVOIR_MAX (100,000) constant for per-operation cap, matching global reservoir behavior
metrics:
  duration: 121s
  completed: 2026-04-06T14:07:58Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 01 Plan 01: ENGINE-01 + ENGINE-04 Bugfixes Summary

Guard SSRF com STRESSFLOW_ALLOW_INTERNAL para desbloquear testes em rede interna + reservoir sampling por operacao para prevenir crescimento ilimitado de memoria em opMet.latencies.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ENGINE-01 -- Guard SSRF + branding User-Agent | d4592c0 | electron/engine/stress-engine.ts |
| 2 | ENGINE-04 -- Reservoir sampling per-operation latencies | 74f6c77 | electron/engine/stress-engine.ts |

## Changes Applied

### Task 1: ENGINE-01 -- Guard SSRF para rede interna corporativa

**Mudanca 1 -- Guard em validateTargetHost():**
- Inseridas 2 linhas no inicio do corpo de `validateTargetHost()` (antes de `const normalizedHostname`):
  - `const allowInternal = process.env.STRESSFLOW_ALLOW_INTERNAL === 'true';`
  - `if (allowInternal) return;`
- Quando `STRESSFLOW_ALLOW_INTERNAL=true` esta no `.env`, a funcao retorna imediatamente sem executar DNS resolution ou verificacao de IP
- Sem a variavel (ou com valor diferente de `'true'`), o comportamento e identico ao anterior

**Mudanca 2 -- Correcao de branding User-Agent:**
- `"User-Agent": "StressFlow/1.0"` alterado para `"User-Agent": "CPX-MisterT-Stress/1.0"` em `makeRequest()`

### Task 2: ENGINE-04 -- Reservoir sampling para arrays de latencia por operacao

**Mudanca 1 -- Tipo do Map opMetrics:**
- Adicionado campo `latencySampleCount: number` ao tipo inline do Map, logo apos `latencies: number[]`

**Mudanca 2 -- Inicializador opMetrics.set():**
- Adicionado `latencySampleCount: 0` na inicializacao de cada operacao

**Mudanca 3 -- Reservoir sampling no handleResponse:**
- Substituido `opMet.latencies.push(latency)` (push simples ilimitado) pelo bloco de reservoir sampling:
  - Incrementa `opMet.latencySampleCount`
  - Se `opMet.latencies.length < RESERVOIR_MAX`: push normal
  - Senao: swap aleatorio com probabilidade `RESERVOIR_MAX / latencySampleCount`
- Padrao identico ao reservoir global ja existente (linhas 744-752)
- Arrays de latencia por operacao nunca excedem 100.000 entradas

## Verification Results

### TypeScript Build
- `npx tsc --noEmit` -- sem erros

### Grep Verification
1. `STRESSFLOW_ALLOW_INTERNAL` em stress-engine.ts: 1 resultado (linha 222, dentro de validateTargetHost)
2. `opMet.latencySampleCount`: 2 resultados (incremento linha 767, divisor linha 771)
3. `CPX-MisterT-Stress/1.0`: 1 resultado (linha 1249, dentro de makeRequest)
4. `StressFlow/1.0`: 0 resultados (branding antigo removido)
5. `opMet.latencies[j]`: 1 resultado (swap do reservoir, linha 773)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **SSRF bypass scope:** O guard `STRESSFLOW_ALLOW_INTERNAL=true` bypassa TODAS as verificacoes SSRF (incluindo loopback), nao apenas RFC-1918. Justificativa: opt-in explicito via .env, renderer nunca controla este env var (contextIsolation preservado), ferramenta para uso interno autorizado.

2. **Reutilizacao de RESERVOIR_MAX:** O limite de 100.000 entradas ja existente para o reservoir global foi reutilizado para os reservoirs por operacao, garantindo consistencia e sem necessidade de nova constante.

## Self-Check: PASSED

- FOUND: electron/engine/stress-engine.ts
- FOUND: commit d4592c0 (Task 1)
- FOUND: commit 74f6c77 (Task 2)
- FOUND: .planning/phases/01-engine-fixes/01-01-SUMMARY.md
