# Project State

## Current Status
Phase: Planning complete
Last updated: 2026-04-06

## Project Reference
See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** Simular carga realista no MisterT ERP com sessões autenticadas e operações encadeadas, validando a capacidade do sistema antes de crises em produção.
**Current focus:** Phase 1 — Engine Fixes

## Completed Phases
(none)

## Active Phase
Phase 1: Engine Fixes — ready to execute (2 plans, 2 waves)

## Backlog Phases
- Phase 2: Credentials System
- Phase 3: Preset System
- Phase 4: Module Selector
- Phase 5: Error Filters
- Phase 6: Cross-Test Analysis
- Phase 7: PDF Capacity Verdict

---

## Performance Metrics
- Phases completed: 0/7
- Requirements delivered: 0/13
- Plans executed: 0

## Accumulated Context

### Key Decisions (recorded)
- SQLite para persistência de erros individuais — escalável para 10k+ erros sem overhead de rede
- Worker threads com WORKER_THREAD_THRESHOLD=256 — 50-100 VU tests rodam single-threaded (correto para I/O-bound)
- CookieJar custom por VU — não substituir por tough-cookie (ASP Classic usa semântica pre-RFC 6265)
- Credentials via .env com prefixo STRESSFLOW_* — renderer nunca vê valores de segredos
- Preset storage em SQLite — seed do built-in embute JSON inline, nunca importar de src/

### Critical Constraints
- Todo novo canal IPC: atualização atômica de 4 arquivos (preload whitelist, preload api, src/types/index.ts, main.ts)
- Anti-padrão: nunca importar src/constants/test-presets.ts do código electron/ (quebra no build empacotado)
- Próxima migração SQLite: v3 (tabela test_presets com flag is_builtin)

### Active Blockers
(none — not started)

### Pending Todos
(none — not started)

## Session Continuity
- Last session: 2026-04-06 (phase 1 planning)
- Next action: `/gsd-execute-phase 1` to execute Engine Fixes (2 plans, 2 waves)
