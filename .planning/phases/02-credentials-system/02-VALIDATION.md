---
phase: 2
slug: credentials-system
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-06
---

# Phase 2 — Validation Strategy

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

**Nota:** O projeto não possui test runner configurado. A estratégia de validação para esta fase é build check (automatizado) + smoke tests manuais (por requisito).

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
| 02-01-T1 | 02-01 | 1 | CRED-01 | IPC credentials:save nunca retorna valores — apenas success boolean | manual | `npm run build` | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | CRED-01 | credentials:load retorna apenas nomes de chaves, nunca valores | manual | `npm run build` | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | CRED-02 | credentials:status retorna mapa booleano (presente/ausente), sem valores | manual | `npm run build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Nenhum — não há test runner configurado

*Infraestrutura existente: apenas `npm run build` como gate automatizado.*

---

## Manual-Only Verifications

| Comportamento | Requisito | Por que Manual | Instruções de Teste |
|---------------|-----------|----------------|---------------------|
| Credenciais salvas no .env via GUI | CRED-01 | Requer app Electron rodando com DevTools | 1. Abrir app com `npm run dev`. 2. Navegar para Settings. 3. Preencher usuário, senha, URL base. 4. Clicar "Salvar". 5. Verificar `%APPDATA%/stressflow/stressflow-data/.env` contém STRESSFLOW_USER, STRESSFLOW_PASS, STRESSFLOW_BASE_URL. |
| Renderer não exibe valores de credenciais | CRED-01 | Requer inspeção visual + DevTools React | 1. Após salvar credenciais, verificar que os campos exibem "●●●●●●" ou "Credenciais salvas". 2. No React DevTools, verificar que o Zustand store NÃO contém valores de credenciais — apenas status booleano. |
| Alerta visual quando credenciais ausentes | CRED-02 | Requer app sem credenciais configuradas | 1. Deletar ou renomear o .env em `%APPDATA%/stressflow/stressflow-data/`. 2. Iniciar app. 3. Verificar que a tela principal mostra banner de alerta visível com link para Settings. |
| Alerta some quando credenciais presentes | CRED-02 | Requer credenciais já salvas | 1. Após salvar credenciais válidas via GUI. 2. Navegar de volta para tela principal. 3. Verificar que o alerta NÃO aparece e botão "Iniciar Teste" está acessível. |

---

*Fase: 02-credentials-system*
*Estratégia de validação criada: 2026-04-06 — manual smoke tests por ausência de test runner*
