# CPX-MisterT Stress

## What This Is

Aplicação desktop Electron + React para teste de carga HTTP autorizado no ERP MisterT. Permite simular múltiplos usuários simultâneos executando sequências autenticadas de operações (login + módulos do sistema), coletar métricas em tempo real, analisar erros individuais e gerar relatórios de capacidade. Uso exclusivo interno pela equipe de Engenharia.

## Core Value

Simular carga realista no MisterT ERP com sessões autenticadas e operações encadeadas, validando a capacidade do sistema antes de crises em produção.

## Requirements

### Validated

<!-- Funcionalidades já implementadas e operacionais na codebase atual -->

- ✓ Configuração de teste HTTP (URL, método, headers, body, virtual users, duração) — existing
- ✓ Engine de stress com múltiplos usuários virtuais via worker threads — existing
- ✓ Ramp-up gradual de usuários virtuais — existing
- ✓ Sequência de múltiplas operações por VU (`TestOperation[]`) — existing
- ✓ Sessão autenticada por VU com CookieJar (compatível com ASP Classic Set-Cookie) — existing
- ✓ Extração de parâmetros dinâmicos via regex + placeholders `{{VAR}}` entre operações — existing
- ✓ Métricas em tempo real (req/s, latência P50/P95/P99, erros, throughput) — existing
- ✓ Gráficos de métricas via Recharts — existing
- ✓ Detecção de proteções do servidor (WAF, CDN, rate limiting, anti-bot) — existing
- ✓ Histórico de testes persistido em SQLite — existing
- ✓ Armazenamento individual de erros HTTP em SQLite (`test_errors`) — existing
- ✓ Exportação de relatório PDF via jsPDF — existing
- ✓ Exportação de resultados em JSON — existing
- ✓ Injeção de credenciais via `.env` com prefixo `STRESSFLOW_*` (renderer nunca vê os valores) — existing

### Active

<!-- Requisitos da solicitação de Engenharia (Marcel, 23/02/2026) ainda não entregues -->

- [ ] Preset das 10 operações do MisterT configurável via UI (Login, Dashboard, Consulta de Estoque, etc.) sem necessidade de configuração manual de cada chamada
- [ ] Escalonamento confiável para 50–100+ usuários simultâneos com relatório de medição de confiabilidade
- [ ] Interface de busca e análise dos erros armazenados no SQLite (filtrar por status HTTP, tipo de erro, operação, período)
- [ ] Configuração guiada de credenciais MisterT diretamente na UI (preenchendo o `.env` via interface, sem edição manual de arquivo)
- [ ] Relatório de capacidade consolidado adequado para apresentação à liderança (sumário executivo com interpretação dos resultados)

### Out of Scope

- Testes contra sistemas externos ao ambiente MisterT — ferramenta autorizada exclusivamente para o ERP interno corporativo
- Suporte a outros protocolos além de HTTP/HTTPS — MisterT é ASP Classic sobre HTTP
- Uso multi-usuário/servidor — desktop app para uso individual pela equipe de Engenharia
- Autenticação OAuth / serviços de identidade externos — MisterT usa login de formulário com sessão por cookie
- Testes de penetração ou fuzzing — ferramenta de carga, não de segurança ofensiva

## Context

**Origem:** Solicitação formal do time de Engenharia (Marcel, 23/02/2026). Objetivo: validar a capacidade do MisterT ERP sob carga realista com 50/100+ usuários simultâneos antes que gargalos se manifestem em produção.

**Infraestrutura base pronta:** O engine de stress (worker threads), a camada de sessão (CookieJar), a extração de parâmetros dinâmicos (regex + `{{VAR}}`), a persistência SQLite e a ponte IPC segura já estão implementados e funcionais. O trabalho restante é conectar essa infraestrutura ao fluxo específico do MisterT e expor mais das capacidades existentes na UI.

**Características do alvo (MisterT ERP):**
- ASP Classic — gerenciamento de sessão via cookies `Set-Cookie` (já suportado via `CookieJar`)
- Usa parâmetro `CTRL` dinâmico nas URLs que muda a cada requisição (já suportado via extração de regex + `{{CTRL}}`)
- Login via POST de formulário seguido de navegação em módulos (auth chain já modelado no engine)
- Hospedado em rede interna corporativa — sem exposição pública

**Codebase atual:** Electron 28 / React 18 / TypeScript 5.7 / Vite 5 / Zustand 4.5 / Tailwind CSS 3.4 / Recharts / jsPDF / better-sqlite3. Interface totalmente em pt-BR. Tema dark-only com tokens `sf-*`.

## Constraints

- **Tech Stack**: Electron + React + TypeScript — manter framework base; não migrar para outra stack
- **Idioma**: Toda interface de usuário obrigatoriamente em pt-BR (código comentado em pt-BR também)
- **Alvo**: Exclusivamente MisterT ERP interno — uso fora desse escopo é não autorizado
- **Segurança IPC**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — não relaxar essas configurações
- **Cores**: Sempre usar tokens `sf-*` do Tailwind — nunca cores raw como `bg-indigo-500`
- **Tipos**: Definições TypeScript centralizadas em `src/types/index.ts` — não espalhar tipos em arquivos de componentes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite para persistência de erros individuais | Escalável para 10k+ erros por teste sem overhead de rede; roda local no main process | — Pending |
| Worker threads para concorrência HTTP | Distribui VUs pelos núcleos de CPU; evita bloqueio do event loop do main process | — Pending |
| CookieJar por VU (não compartilhado) | Cada VU mantém sessão independente — obrigatório para simular múltiplos usuários autenticados no ASP Classic | — Pending |
| Credentials via `.env` com prefixo `STRESSFLOW_*` | Renderer nunca vê valores de segredos; injeção acontece exclusivamente no main process | — Pending |
| jsPDF client-side para PDF | Geração no renderer sem dependência de servidor; arquivo salvo via IPC no `userData` | — Pending |

## Evolution

Este documento evolui a cada transição de fase e marco de milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requisitos invalidados? → Mover para Out of Scope com motivo
2. Requisitos validados? → Mover para Validated com referência da fase
3. Novos requisitos emergiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se a descrição derivou

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Verificação do Core Value — ainda é a prioridade correta?
3. Auditoria do Out of Scope — os motivos ainda são válidos?
4. Atualizar Context com estado atual

---
*Last updated: 2026-04-06 after initialization*
