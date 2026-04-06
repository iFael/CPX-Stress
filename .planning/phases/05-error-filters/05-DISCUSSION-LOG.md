# Phase 5: Error Filters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 05-error-filters
**Areas discussed:** Filtro de operação, Filtro de período, Combinação de filtros, Escopo cross-test

---

## Filtro de operação

| Option | Description | Selected |
|--------|-------------|----------|
| Card de resumo clicável | Terceiro card no grid de resumos, mostrando contagem de erros por operação. Click numa operação filtra a tabela. Padrão idêntico ao de tipo/status que já existe. | ✓ |
| Dropdown acima da tabela | Select/dropdown com a lista de operações. Mais compacto, mas diferente do padrão visual existente. | |
| Chips horizontais | Lista horizontal de chips/tags com os nomes das operações. Visual moderno mas diferente dos cards existentes. | |

**User's choice:** Card de resumo clicável (Recomendado)
**Notes:** Mantém consistência com o padrão visual existente no ErrorExplorer.

### Follow-up: Layout do grid

| Option | Description | Selected |
|--------|-------------|----------|
| grid-cols-3 | Três cards lado a lado. | ✓ |
| grid-cols-2, operação em linha separada | Duas colunas, card de operações em linha inteira abaixo. | |

**User's choice:** grid-cols-3 (Recomendado)

---

## Filtro de período

| Option | Description | Selected |
|--------|-------------|----------|
| Inputs datetime-local nativos | Dois campos input type=datetime-local para início e fim. Nativo do browser, sem biblioteca extra. | ✓ |
| Quick-range buttons | Botões pré-definidos: "Última hora", "Últimas 24h", etc. Rápido mas menos preciso. | |
| Quick-ranges + custom inputs | Combina quick-ranges + inputs datetime-local. Mais completo, mais espaço. | |

**User's choice:** Inputs datetime-local nativos (Recomendado)
**Notes:** Sem dependência de biblioteca externa.

---

## Combinação de filtros

| Option | Description | Selected |
|--------|-------------|----------|
| Cards + período abaixo + chips ativos | Cards clicáveis no topo + inputs de período abaixo + chips de filtro ativo combinados. Padrão atual expandido. | ✓ |
| Barra de filtros unificada | Barra única com dropdowns. Mais compacto mas perde resumo agregado. | |

**User's choice:** Cards + período abaixo + chips ativos (Recomendado)

---

## Escopo cross-test

| Option | Description | Selected |
|--------|-------------|----------|
| Single-test | ErrorExplorer continua recebendo testId fixo. Filtros operam dentro desse teste. Cross-test é Phase 6. | ✓ |
| Multi-test | ErrorExplorer sem testId fixo, usuário escolhe quais testes incluir. | |

**User's choice:** Single-test (Recomendado)
**Notes:** Cross-test analysis é explicitamente Phase 6 (ANALYTICS-03).

---

## Claude's Discretion

- Estilização dos inputs datetime-local
- Fallback para estados vazios nos novos filtros
- Formatação de data/hora nos chips ativos

## Deferred Ideas

None — discussion stayed within phase scope.
