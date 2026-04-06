---
phase: 01-engine-fixes
plan: 02
subsystem: engine
tags: [bugfix, redirect-following, auth-storm, vu-lifecycle]
dependency_graph:
  requires: [01-01]
  provides: [redirect following com MAX_REDIRECT_HOPS=5, VU auth-once lifecycle, session expiry detection]
  affects: [electron/engine/stress-engine.ts, electron/engine/stress-worker.ts]
tech_stack:
  added: []
  patterns: [redirect loop with RFC 7231 compliance, session expiry via loginPathname comparison]
key_files:
  modified:
    - electron/engine/stress-engine.ts
    - electron/engine/stress-worker.ts
decisions:
  - collectBody em todos os hops (nao apenas no final) porque corpo de 302 e tipicamente vazio e overhead desprezivel — simplifica logica e garante extraction correta
  - loginPathname usa authOps[0].url pathname como referencia para detectar sessao expirada — assuncao de que MisterT redireciona para mesma URL de login ao expirar sessao
metrics:
  duration: 325s
  completed: 2026-04-06T14:16:32Z
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 01 Plan 02: ENGINE-02 + ENGINE-03 Redirect Following e VU Lifecycle Summary

Redirect following com ate 5 hops para extrair {{CTRL}} do destino final do 302 ASP Classic + reestruturacao do loop de VU para auth-once eliminando auth storm em testes com 50-100+ VUs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ENGINE-02 -- Redirect following em makeRequest (engine + worker) | 87d1333 | electron/engine/stress-engine.ts, electron/engine/stress-worker.ts |
| 2 | ENGINE-03 -- Reestruturacao do loop de VU (engine + worker) | b42b01c | electron/engine/stress-engine.ts, electron/engine/stress-worker.ts |

## Changes Applied

### Task 1: ENGINE-02 -- Redirect following em makeRequest

**Mudanca 1 -- Renomear makeRequest para makeSingleRequest:**
- `private makeRequest(...)` renomeado para `private makeSingleRequest(...)` no engine
- `function makeRequest(...)` renomeado para `function makeSingleRequest(...)` no worker
- Adicionado `locationHeader?: string` ao tipo de retorno da Promise
- Captura de `res.headers['location']` no callback `res.on('end', ...)` antes do `resolve()`

**Mudanca 2 -- Novo makeRequest com loop de redirects:**
- Novo metodo privado `makeRequest()` no engine e funcao standalone no worker
- Loop de ate `MAX_REDIRECT_HOPS = 5` iteracoes seguindo Location headers
- Cookies capturados em cada hop intermediario (essencial para ASP Classic que envia Set-Cookie no 302)
- RFC 7231: statusCode 302/303 muda metodo para GET e descarta body; 307/308 preserva metodo original
- Retorna `finalUrl: URL` com a URL do destino final apos todos os redirects

**Mudanca 3 -- isRedirectStatus helper:**
- Metodo privado no engine, funcao standalone no worker
- Retorna true para status 300-308 exceto 304 (Not Modified)

**Mudanca 4 -- executeOp retorna finalUrl:**
- Tipo de retorno mudou de `Promise<void>` para `Promise<URL | undefined>` em ambos os arquivos
- `return result.finalUrl` adicionado como ultima linha do bloco try

**Mudanca 5 -- Correcao de branding no worker:**
- `"User-Agent": "StressFlow/1.0"` alterado para `"User-Agent": "CPX-MisterT-Stress/1.0"` em stress-worker.ts

### Task 2: ENGINE-03 -- Reestruturacao do loop de VU

**Mudanca 1 -- Autenticacao inicial (auth-once):**
- `authOps` executado UMA VEZ antes do while loop (nao a cada iteracao)
- Elimina "auth storm": com 100 VUs em 600s, nao gera centenas de logins/minuto

**Mudanca 2 -- Loop principal apenas com modulos:**
- While loop contem apenas selecao aleatoria de `moduleOps`
- Modo auth-only (moduleOps vazio) preserva comportamento original: authOps continua em loop

**Mudanca 3 -- Deteccao de sessao expirada:**
- `loginPathname` determinado a partir de `authOps[0].url` pathname (lowercase)
- Apos cada operacao de modulo, compara `finalUrl.pathname` com `loginPathname`
- Se match: `cookieJar.clear()` + `extractedVars.clear()` + re-execucao da cadeia de auth
- Garante estado limpo antes de re-autenticar

## Verification Results

### TypeScript Build
- `npx tsc --noEmit` -- sem erros (executado apos cada task)

### Grep Verification (10 checks do plano)
1. `makeSingleRequest` em stress-engine.ts: 3 resultados (definicao + 2 chamadas internas)
2. `makeSingleRequest` em stress-worker.ts: 3 resultados (definicao + 2 chamadas internas)
3. `finalUrl` em stress-engine.ts: 6 resultados
4. `finalUrl` em stress-worker.ts: 6 resultados
5. `loginPathname` em stress-engine.ts: 3 resultados (declaracao + 2 usos no check)
6. `loginPathname` em stress-worker.ts: 3 resultados (declaracao + 2 usos no check)
7. `cookieJar.clear()` em stress-engine.ts: 1 resultado
8. `cookieJar.clear()` em stress-worker.ts: 1 resultado
9. `StressFlow/1.0` em electron/: 0 resultados (branding eliminado)
10. While loop: primeira linha apos `while` e `if (moduleOps.length === 0)`, nao `for (const op of authOps)`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] collectBody em todos os hops (correcao da logica do plano)**
- **Found during:** Task 1
- **Issue:** O plano propunha `collectBody: opts.collectBody && (isLastHop || !isRedirectStatus(prevStatus))` que resultava em nao coletar body no hop apos um redirect (exatamente onde o body e necessario para extraction do {{CTRL}})
- **Fix:** Simplificado para `collectBody: opts.collectBody` em todos os hops — corpo de 302 e tipicamente vazio, overhead desprezivel, e garante que o body do destino final e sempre coletado
- **Files modified:** electron/engine/stress-engine.ts, electron/engine/stress-worker.ts
- **Commit:** 87d1333

## Decisions Made

1. **collectBody strategy:** Coletar body em TODOS os hops do redirect loop, nao apenas no final. Justificativa: o plano original tinha bug na logica de predicao (usava status do hop anterior para decidir se coletava body no hop atual, resultando em nao coletar no destino final). A abordagem simplificada elimina o bug sem custo mensuravel (302 bodies sao vazios).

2. **loginPathname assumption (A2):** A deteccao de sessao expirada usa `authOps[0].url` pathname como referencia. Isso assume que o MisterT redireciona para a mesma URL de login quando a sessao expira. Se o MisterT usar uma URL de expiracacao diferente (ex: `/sessao-expirada.asp`), sera necessario ajustar o check. Para a maioria dos sistemas ASP Classic, o redirect de sessao expirada aponta para a pagina de login original.

## Known Stubs

Nenhum stub encontrado. Todas as funcionalidades foram implementadas completamente.

## Self-Check: PASSED

- FOUND: electron/engine/stress-engine.ts
- FOUND: electron/engine/stress-worker.ts
- FOUND: .planning/phases/01-engine-fixes/01-02-SUMMARY.md
- FOUND: commit 87d1333 (Task 1)
- FOUND: commit b42b01c (Task 2)
