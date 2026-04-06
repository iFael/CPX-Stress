---
phase: 1
slug: engine-fixes
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Nenhum configurado (projeto sem test runner — ver CLAUDE.md) |
| **Config file** | none |
| **Quick run command** | `npm run build` (TypeScript compile + Vite build) |
| **Full suite command** | `npm run build` (único gate automatizável sem framework) |
| **Estimated runtime** | ~30 segundos |

**Nota:** O projeto não possui test runner configurado. A estratégia de validação para esta fase é build check (automatizado) + smoke tests manuais (por requisito). Se um framework for adicionado no futuro, os casos de teste manuais abaixo são os candidatos prioritários para automatização.

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build` + smoke test manual do requisito correspondente
- **Before `/gsd-verify-work`:** Build verde + todos os smoke tests manuais executados
- **Max feedback latency:** ~30 segundos (build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 01-01-T1 | 01-01 | 1 | ENGINE-01 | Guard SSRF não bypassa produção (env var explícita requerida) | manual | `npm run build` | ⬜ pending |
| 01-01-T2 | 01-01 | 1 | ENGINE-04 | Arrays de latência não crescem >100k entradas | manual | `npm run build` | ⬜ pending |
| 01-02-T1 | 01-02 | 2 | ENGINE-02 | Redirect following limitado a 5 hops (sem loop infinito) | manual | `npm run build` | ⬜ pending |
| 01-02-T2 | 01-02 | 2 | ENGINE-03 | Re-auth apenas em redirect para login page (não em toda operação 4xx) | manual | `npm run build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Nenhum — não há test runner configurado
- [ ] `audit/mock-server.js` existe mas pode não simular redirect chains 302 (verificar antes de ENGINE-02)

*Infraestrutura existente: apenas `npm run build` como gate automatizado.*

---

## Manual-Only Verifications

| Comportamento | Requisito | Por que Manual | Instruções de Teste |
|---------------|-----------|----------------|---------------------|
| Teste contra endereço interno (10.x.x.x) sem erro "Endereço bloqueado" | ENGINE-01 | Requer acesso à rede interna + MisterT rodando | 1. Adicionar `STRESSFLOW_ALLOW_INTERNAL=true` ao `.env` em `%APPDATA%/stressflow/stressflow-data/`. 2. Iniciar teste contra `http://10.x.x.x/` (qualquer IP interno). 3. Verificar que a primeira requisição é enviada sem erro de validação. |
| `{{CTRL}}` substituído por valor real nas operações 2+ | ENGINE-02 | Requer MisterT respondendo com 302→HTML com CTRL | 1. Configurar preset MisterT (Login + 1 operação com CTRL). 2. Iniciar teste com 1 VU × 60s. 3. Verificar no painel de progresso que as URLs das operações subsequentes contêm `?CTRL=12345` (valor numérico real), não `{{CTRL}}`. |
| Login executado 1x por VU, não a cada iteração | ENGINE-03 | Requer contagem de métricas por operação em tempo real | 1. Iniciar teste com 10 VUs × 60s com preset Login + 9 módulos. 2. Após teste, verificar `operationMetrics.Login.totalRequests ≤ 10` (um por VU). Se reauth storm estiver acontecendo, terá `≥ 600` (10 VUs × 60 iterações). |
| Memória do processo Electron estabiliza após warmup | ENGINE-04 | Requer observação via Task Manager ou DevTools | 1. Iniciar teste com 10 VUs × 60s × 10 operações. 2. Monitorar memória do processo Electron no Task Manager. 3. Verificar que a memória não cresce linearmente por toda a duração — deve estabilizar após ~10-20s de warmup. |

---

## Assunções de Alto Risco (para monitorar durante execução)

| ID | Assunção | Plano | Sinal de Falha |
|----|----------|-------|----------------|
| A2 | Redirect de sessão expirada do MisterT aponta para o mesmo pathname de `authOps[0].url` | 01-02 Task 2 | Módulos recebem HTML de login sem `sessionExpired=true` sendo detectado. Solução: logar `finalUrl.pathname` no primeiro redirect durante testes. |

---

*Fase: 01-engine-fixes*
*Estratégia de validação criada: 2026-04-06 — manual smoke tests por ausência de test runner*
