# Sumário de Pesquisa — CPX-MisterT Stress

**Compilado:** 2026-04-06
**Fontes:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md
**Confiança geral:** HIGH — todos os findings baseados em análise direta do código-fonte e documentação oficial Node.js/IIS

---

## Bloqueadores Críticos (resolver antes de qualquer feature)

Estes problemas invalidam os resultados dos testes ou impedem que o teste sequer inicie. Nenhuma feature de preset ou analytics faz sentido sem essas correções.

### B1 — SSRF block impede todo teste contra o MisterT (BLOQUEADOR TOTAL)

`validateTargetHost()` em `stress-engine.ts` bloqueia todos os ranges de IP privado (`10.*`, `192.168.*`, `172.16.*`). O MisterT ERP está na rede interna corporativa. **Sem essa correção, nenhum teste contra o MisterT é possível — o sistema lança "Endereço bloqueado" antes de uma única requisição ser enviada.**

- Fix: 1 linha em `validateTargetHost()` — se `STRESSFLOW_ALLOW_INTERNAL=true` no `.env`, pular o check. A variável já é carregada por `loadEnvFile()`. Padrão continua seguro; equipe faz opt-in explícito.
- Prioridade: resolver antes de qualquer outra coisa.

### B2 — Sem redirect following: `{{CTRL}}` nunca extraído, resultados são ruído puro

`makeRequest()` em `stress-engine.ts` e `stress-worker.ts` usa `http.request` diretamente e não segue redirects 3xx. ASP Classic retorna 302 após o login POST (padrão PRG) — o `Location` header contém `CTRL=xxxxx`. Como o redirect não é seguido, o body é vazio, o regex não extrai nada, e `{{CTRL}}` permanece sem valor. Requisições subsequentes enviam a string literal `{{CTRL}}` no URL. O MisterT responde com outro redirect ou página de erro com status 200, e a ferramenta conta como sucesso.

- Consequência: taxa de erro aparece 0% enquanto o servidor serve apenas redirects de login. O teste parece saudável enquanto mede ruído.
- Warning signs: `statusCodes` dominados por `302`; `bytesReceived` por request ~200 bytes; `{{CTRL}}` aparece literalmente nos logs de acesso do IIS.
- Fix: implementar redirect following em `makeRequest` para 301/302 com max depth 5, mantendo o mesmo `CookieJar` e `extractedVars` para extração do HTML final.
- Prioridade: resolver antes do preset MisterT ser liberado para uso.

### B3 — VU loop re-autentica a cada iteração: auth storm + métricas poluídas

O loop de VU em `stress-worker.ts` (linhas 412–427) e `stress-engine.ts` (linhas 1158–1174) roda a `authOps` completa no início de cada iteração `while`. Com 100 VUs em loop agressivo, o servidor recebe inundação contínua de login POSTs durante todo o teste, criando centenas de novas sessões ASP por minuto.

- Consequências: (1) Latência de "Login" domina `operationMetrics` — o gargalo real fica mascarado. (2) Memória do IIS cresce com sessões não expiradas. (3) Se CTRL extraction falha no login 302 (ver B2), todas as operações de módulo do mesmo loop falham silenciosamente.
- Fix: redesenhar o loop do VU para o preset MisterT — autenticar uma vez no início do VU lifetime, loopear apenas módulos. Re-autenticar somente quando um módulo retornar 302 para a login page (detecção de sessão expirada). O `CookieJar` já persiste ao longo do VU lifetime.
- Prioridade: resolver antes do preset MisterT ser liberado para uso.

### B4 — Arrays `opMetrics.latencies` sem limite: memória cresce indefinidamente em testes longos

`opMet.latencies.push(latency)` em `stress-engine.ts` (linha 761) não tem upper bound. O `latencyReservoir` global está corretamente cappado em 100.000 entries, mas os arrays por operação não.

- Impacto: 100 VUs × 10 operações × 2 req/s × 600s = 1,2 M entries por operação. 8 bytes × 10 ops × 1,2M ≈ 96 MB só em latency data. GC pressure cresce monotonicamente, causando pauses visíveis no timeline como spikes artificiais de latência — artefato da ferramenta, não do servidor.
- Fix: aplicar reservoir sampling `RESERVOIR_MAX` em cada `opMet.latencies` — o padrão já está implementado no `handleResponse` para o reservoir global. Replicar para o path por operação.
- Prioridade: resolver antes de qualquer teste de 600 segundos com 10 operações.

---

## Arquitetura (o que já existe vs. o que precisa ser construído)

### O que já existe (não reconstruir)

| Componente | Localização | Status |
|---|---|---|
| Worker thread pool (threshold 256 VUs) | `electron/engine/stress-engine.ts` | Funcional |
| Per-VU CookieJar (compatível ASP Classic) | `electron/engine/cookie-jar.ts` | Funcional — não substituir por `tough-cookie` |
| CTRL extraction via regex + `{{VAR}}` | `TestOperation.extract` + engine | Correto — quebrado apenas pela falta de redirect following (B2) |
| HTTP Agent com keepAlive | `stress-engine.ts` + `stress-worker.ts` | Parcial — falta `scheduling: 'fifo'` |
| Auth chain sequencing (`authOps` + `moduleOps`) | Engine | Correto na separação — loop usa incorretamente (B3) |
| Error search IPC: `errors:search`, `errors:byStatusCode`, `errors:byErrorType` | `preload.ts` + `main.ts` + `repository.ts` | Funcional — falta `operationName` como parâmetro |
| `ErrorExplorer` com paginação + filtros | `src/components/ErrorExplorer.tsx` | Funcional |
| `.env` loading + `{{STRESSFLOW_*}}` placeholder resolution | `electron/main.ts` | Funcional |
| MisterT 10-operation template | `src/constants/test-presets.ts` (`buildMistertOperations`) | Hardcoded — não configurável via UI |
| SQLite schema v2 + migrações versionadas | `electron/database/database.ts` | Funcional; próxima migração é v3 |
| IPC bridge com whitelist | `electron/preload.ts` | Funcional; estender por adição, nunca modificar canais existentes |
| PDF com "Resumo para Gestores" + health score | `src/services/pdf-generator.ts` | Funcional — falta verdict explícito de capacidade |

### O que precisa ser construído

| Componente | Fase | Escopo resumido |
|---|---|---|
| SSRF internal-network guard | Fase 0 — Engine | 1 linha em `validateTargetHost()` |
| `scheduling: 'fifo'` nos Agents | Fase 0 — Engine | 2 sites de instanciação de Agent |
| Reservoir cap em `opMetrics.latencies` | Fase 0 — Engine | Espelhar padrão do `latencyReservoir` global |
| Redirect following em `makeRequest` | Fase 0 — Engine | Ambos engine e worker; depth ≤ 5 |
| Redesenho do loop do VU | Fase 0 — Engine | Auth once, loop módulos, re-auth em 302-to-login |
| Credentials UI + 3 handlers IPC | Fase 1 | `CredentialsSetup.tsx` modal + `saveEnvKeys()` + env reload |
| Sistema de presets (migration v3, CRUD, IPC) | Fase 2 | `PresetPanel.tsx` + tabela `test_presets` + seed built-in |
| Error analytics enhancements | Fase 3 | `operationName` filter + `ErrorAnalytics.tsx` cross-test |
| PDF capacity verdict + contexto IIS | Fase 3 | Extensão de `drawLaypersonPage()` — sem nova infraestrutura |

**Regra invariante:** Todo novo canal IPC requer atualização atômica de 4 arquivos: `preload.ts` (whitelist), `preload.ts` (api object), `src/types/index.ts` (Window.stressflow), `main.ts` (handler).

**Anti-padrão crítico:** Nunca importar `src/constants/test-presets.ts` do código `electron/`. Funciona em dev (Vite resolve), quebra no build empacotado. Embutir o JSON do preset built-in diretamente em `electron/database/repository.ts`.

---

## Stack (decisões técnicas chave)

### Zero dependências novas necessárias

Todas as adições do milestone usam apenas o que já existe: `http`/`https` (builtin Node.js), `fs/promises` (builtin), `better-sqlite3` (já em uso), e o padrão IPC existente. Nenhum `npm install` necessário.

### Decisões confirmadas pela pesquisa (não reverter)

| Decisão | Veredicto | Justificativa |
|---|---|---|
| Manter `WORKER_THREAD_THRESHOLD = 256` | Manter | Workers são prejudiciais para trabalho I/O-bound (citação oficial Node.js docs). 100 async coroutines numa event loop é o padrão correto — igual ao autocannon. Workers adicionam overhead de serialização sem ganho para 50-100 VUs. |
| Não adicionar undici | Confirmado | Single-target, I/O-bound: custo de refactoring >> benefício marginal. `http.Agent` com `keepAlive + scheduling:'fifo'` é suficiente. |
| Não substituir CookieJar por tough-cookie | Confirmado | ASP Classic usa semântica pre-RFC 6265. `tough-cookie` pode quebrar compatibilidade com cookies não-padrão do MisterT. Implementação custom é purpose-fit. |
| Preset storage em SQLite | Confirmado | Segue padrão existente de `better-sqlite3`. Seed do built-in embute JSON inline — não importar de `src/`. |

### Única adição técnica de infra: `scheduling: 'fifo'`

O default do `http.Agent` é `'lifo'` (desde Node.js v15.6), que minimiza sockets abertos — ideal para apps de produção. Para um load tester, `'fifo'` é correto: maximiza conexões TCP abertas. Dois arquivos, uma property cada: `stress-engine.ts` linhas 590-600 e `stress-worker.ts` linhas 91-101. Node.js 20 (Electron 28) suporta nativamente.

### Alerta: event loop drift sob alta taxa de requisições

Com `WORKER_THREAD_THRESHOLD = 256`, todos os 50-100 VU tests rodam single-threaded. O `setInterval` de métricas compete com callbacks de HTTP. Com servidor rápido (100 VUs × 10 ops), `secLatencies.sort()` O(n log n) sobre 3.000-10.000 amostras por segundo adiciona 5-20ms de delay no tick, causando drift no timeline. Se observado em produção, resolver abaixando o threshold para 50 ou substituindo o sort por algoritmo de percentil aproximado.

---

## Features (prioridade e dependências)

### Ordem de prioridade (MVP do milestone)

| # | Feature | Tipo | Depende de | Esforço estimado |
|---|---|---|---|---|
| 1 | Credentials UI + status indicator | Table stakes — first-run blocker | Engine fixes (Fase 0) | Médio |
| 2 | Error filter por `operationName` | Table stakes — baixo esforço, alto valor diagnóstico | `operationName` em `errors.search` IPC | Baixo |
| 3 | Preset CRUD + presets shipped MisterT | Core request Marcel (23/02/2026) | Credentials + B1/B2/B3 fixes | Alto |
| 4 | Module checkbox selector | Diferenciador — UX sobre o preset system | Preset system existindo | Médio |
| 5 | Capacity verdict no PDF | Diferenciador — extensão de função existente | Testes válidos disponíveis | Baixo |

### Deferidos (pós-milestone)

- **Error timeline chart** — diagnóstico de clustering de erros (ramp-up vs. saturation); requer Recharts dentro do `ErrorExplorer`. Agendar após preset + credentials.
- **Multi-test capacity comparison** — UI multi-select + novo path de geração de PDF. Alta complexidade sem urgência imediata.

### Dependências entre features

```
credentials:status (read)   → credentials:save
preset selector UI           → preset CRUD (save/load/delete)
shipped MisterT presets      → preset CRUD (mesmo mecanismo de armazenamento)
module checkbox selector     → preset CRUD
capacity verdict PDF         → sem nova infra (usa campos já disponíveis no TestResult)
error filter operationName   → operationName adicionado em errors.search params
error timeline               → ErrorExplorer existente + Recharts
```

### Anti-features (não construir)

| Anti-feature | Motivo |
|---|---|
| Editor de scripts/código | Remove a proposta de valor central (interface sem código) |
| Load generation distribuído | Single-machine capacity é suficiente para 50-100 VUs |
| Backends externos (InfluxDB/Grafana) | Desktop app para testes ocasionais; SQLite + PDF cobre todos os casos |
| Multi-usuário / presets compartilhados | Single-engineer desktop app — auth e sync fora de escopo |
| Browser recording / proxy embutido | Operações do MisterT já são conhecidas e hardcoded |
| Fuzzing / pen testing | Explicitamente fora de escopo no PROJECT.md |

---

## Armadilhas a Evitar

### Críticas (invalidam resultados ou causam rewrites)

| ID | Armadilha | Prevenção |
|---|---|---|
| C1 | `opMetrics.latencies` sem limite de tamanho → GC pauses → spikes artificiais de latência no timeline | Aplicar `RESERVOIR_MAX` como reservoir cap em `opMet.latencies.push` — mesmo padrão do reservoir global |
| C2 | VU loop re-autentica a cada iteração → auth storm, sessões infladas, `operationMetrics` de Login domina | Separar "session establishment" (uma vez) de "session exercise" (loop); re-auth só em 302-to-login |
| C3 | Sem redirect following → `{{CTRL}}` literal no URL → 0% error rate enquanto mede redirects | Implementar redirect following (max depth 5) em `makeRequest`; mesmos `CookieJar` + `extractedVars` |
| C4 | Agent queue wait incluído na latência medida: `performance.now()` capturado antes do socket ser alocado | Expor `agent.requests` queue depth como métrica diagnóstica; surfaçar no reliability report |
| C5 | IIS `processorThreadMax = 25/CPU` → pool de 100 threads em servidor 4-core satura exatamente em 100 VUs → P50 ok, P99 10-30x maior | Não evitar — é o comportamento correto de um capacity test. Documentar no relatório com interpretação dos limites IIS |

### Moderadas (degradam precisão ou geram erros em cenários específicos)

| ID | Armadilha | Prevenção |
|---|---|---|
| M1 | `WORKER_THREAD_THRESHOLD=256` → 50-100 VU tests rodam single-threaded → drift de 50-200ms no tick de métricas | Considerar abaixar threshold para 50 se drift observado; alternativa: sort aproximado para display |
| M2 | `CookieJar` não limpa sessão anterior antes de re-login → cookies stale acumulam | `cookieJar.clear()` antes de cada re-autenticação; ou eliminar re-auth completamente (fix C2) |
| M3 | 100 VUs com mesmas credenciais podem atingir limite de sessões simultâneas por conta no MisterT | Projetar suporte a credential pool no design da credentials UI |
| M4 | `saveErrorBatch` faz COUNT(*) e INSERT em statements separados → race condition em worker mode excede `MAX_ERRORS_PER_TEST` | Envolver em `BEGIN IMMEDIATE` transaction antes de ativar worker mode |

### Menores

| ID | Armadilha | Prevenção |
|---|---|---|
| m1 | `secLatencies.sort()` O(n log n) full copy a cada segundo → 5-20ms delay com 5.000+ amostras/s | Substituir por histograma de buckets fixos para display; manter sort completo nos percentis finais |
| m2 | User-Agent `"StressFlow/1.0"` — branding errado; pode trigger IIS request filtering | Atualizar para `"CPX-MisterT-Stress/1.0"` (rastreado em CONCERNS.md) |
| m3 | `resolveExtractVars` retorna placeholder literal quando `vars.get()` é `undefined` → `{{CTRL}}` no URL sem aviso | Logar warning ao detectar placeholder não-resolvido; surfaçar em `operationalWarnings` |

---

## Ordem de Build Recomendada

A sequência é ditada por dependências de bloqueio: sem os fixes de engine, nenhum resultado é válido; sem o preset, nenhum teste MisterT é repetível.

### Fase 0 — Engine Fixes (desbloqueiam toda a testagem)

1. `STRESSFLOW_ALLOW_INTERNAL` guard em `validateTargetHost()` — 1 linha
2. `scheduling: 'fifo'` + `maxFreeSockets` nos dois sites de instanciação de Agent
3. Reservoir cap em `opMet.latencies` — espelhar padrão do `latencyReservoir` global
4. Redirect following em `makeRequest` (ambos `stress-engine.ts` e `stress-worker.ts`), max depth 5
5. Redesenho do loop do VU — auth once, loop módulos, re-auth em 302-to-login
6. User-Agent `"CPX-MisterT-Stress/1.0"` — branding + prevenção de IIS filtering

### Fase 1 — Credentials Setup (desbloqueia usuários não-técnicos)

7. `credentials:hasCredentials`, `credentials:load`, `credentials:save` handlers + `saveEnvKeys()` helper em `main.ts`
8. `electron/preload.ts` — 3 channels + `credentials` api group
9. `src/types/index.ts` — `credentials` em `Window.stressflow`
10. `src/components/CredentialsSetup.tsx` — modal overlay (não nova rota `AppView`); inputs masked
11. `src/stores/test-store.ts` — slice `hasCredentials: boolean` (nunca valores de credencial)
12. `src/App.tsx` — bootstrap check + overlay condicional na ausência de credenciais

### Fase 2 — Sistema de Presets (core request do milestone)

13. Migration v3 em `electron/database/database.ts` — tabela `test_presets` com flag `is_builtin`
14. `electron/database/repository.ts` — `listPresets`, `savePreset`, `deletePreset`, `hasAnyPreset`, `seedDefaultPresets` (seed embute JSON inline — não importar de `src/`)
15. `electron/main.ts` — 3 handlers de preset + chamada de `seedDefaultPresets()` no init
16. `electron/preload.ts` — 3 channels + `presets` api group
17. `src/types/index.ts` — `TestPreset` interface + `presets` em `Window.stressflow`
18. `src/stores/test-store.ts` — slice `presets` + 3 actions (`setPresets`, `addPreset`, `removePreset`)
19. `src/components/PresetPanel.tsx` — CRUD UI + apply flow + module checkbox selector; carregado no startup para o Zustand (zero async na abertura do painel)
20. `src/App.tsx` — carregar presets no startup effect

### Fase 3 — Error Analytics + PDF (observabilidade e relatório de liderança)

21. `electron/database/repository.ts` — estender `searchErrors` com `operationName?`, `timestampFrom?`, `timestampTo?` (retrocompatível)
22. `electron/preload.ts` + `src/types/index.ts` — atualizar `errors.search` params (retrocompatível)
23. `src/components/ErrorExplorer.tsx` — adicionar dropdown `operationName`
24. `src/components/ErrorAnalytics.tsx` — nova view cross-test sem `testId` constraint; test-selector via history store
25. `src/types/index.ts` — adicionar `'errors'` ao union `AppView`
26. `src/components/Sidebar.tsx` + `src/App.tsx` — nova rota `'errors'` (Análise de Erros)
27. `src/services/pdf-generator.ts` — capacity verdict em `drawLaypersonPage()`: frase explícita de capacidade + contexto de limite IIS em `buildRecs()`

---

*Sumário compilado em 2026-04-06 a partir de análise direta do código-fonte e pesquisa de milestone.*
*Pronto para roadmap: sim.*
