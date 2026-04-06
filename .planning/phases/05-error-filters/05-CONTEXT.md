---
phase: 05-error-filters
created: 2026-04-06
status: decisions_captured
decisions: 5
deferred: 0
---

# Phase 5: Error Filters — Context & Decisions

**Phase Goal:** Usuário localiza erros específicos no ErrorExplorer filtrando por nome de operação e por intervalo de data/hora, sem navegar por resultados irrelevantes
**Requirements:** ANALYTICS-01 (filtro por operação), ANALYTICS-02 (filtro por período)

---

<domain>
## Phase Boundary

Adicionar dois novos filtros ao ErrorExplorer existente:
1. Filtro por nome de operação (ANALYTICS-01)
2. Filtro por intervalo de tempo (ANALYTICS-02)

Ambos operam **dentro de um único teste** (single-test scope). Cross-test analysis é Phase 6.

Os filtros devem combinar corretamente com os filtros existentes de status HTTP e tipo de erro, sem regressão.

</domain>

<decisions>
## Implementation Decisions

### D1: Filtro de operação — Card de resumo clicável

**Decision:** Novo card de resumo "Por Operação" no grid, idêntico ao padrão dos cards "Por Tipo de Erro" e "Por Status HTTP". Lista operações com contagem de erros; click numa operação filtra a tabela.

**Implementation:** Nova query `getErrorsByOperationName(testId)` no repository retornando `Record<string, number>`. Novo state `filterOperationName` no ErrorExplorer. Chip de filtro ativo com X para limpar.

### D2: Layout dos cards — grid-cols-3

**Decision:** Grid de resumos muda de `grid-cols-2` para `grid-cols-3` para acomodar os três cards (Tipo de Erro, Status HTTP, Operação) lado a lado.

### D3: Filtro de período — Inputs datetime-local nativos

**Decision:** Dois inputs `<input type="datetime-local">` para início e fim, posicionados entre os cards de resumo e os chips de filtro ativo. Sem biblioteca externa de date picker.

**Implementation:** Novos states `filterTimeStart` e `filterTimeEnd` (strings ISO). Convertidos para timestamp Unix ms para query SQL. Backend `searchErrors()` recebe `timestampStart` e `timestampEnd` opcionais. Chips de "Período:" na barra de filtros ativos.

### D4: Combinação de filtros — Cards + período abaixo + chips ativos

**Decision:** Layout vertical mantém o padrão atual expandido:
1. Grid `grid-cols-3` com cards clicáveis (operação, tipo, status)
2. Inputs de período abaixo dos cards
3. Chips de filtro ativo abaixo dos inputs (já existente, expandido para novos filtros)
4. Tabela de erros com paginação

Todos os filtros combinados via AND na query SQL (interseção).

### D5: Escopo — Single-test

**Decision:** O ErrorExplorer continua recebendo `testId` como prop. Filtro de operação e filtro de período operam DENTRO desse teste. Filtro de período é útil para isolar erros de uma janela específica durante a execução do teste (ex: primeiros 30s vs último minuto, antes/depois de saturação).

Cross-test analysis é explicitamente Phase 6 (ANALYTICS-03).

### Claude's Discretion

- Estilização dos inputs datetime-local com sf-* tokens (dark theme styling)
- Fallback quando nenhum erro de uma operação específica existe nos filtros combinados
- Formatação de data/hora nos chips de filtro ativo (date-fns com ptBR locale)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### ErrorExplorer (componente alvo)
- `src/components/ErrorExplorer.tsx` — Componente atual com filtros status/tipo, tabela paginada, grid de resumos
- `src/types/index.ts` §ErrorRecord (linha ~78) — Interface do registro de erro com `operationName`, `timestamp`, `statusCode`, `errorType`

### Backend de erros
- `electron/database/repository.ts` §searchErrors (linha ~248) — Query builder dinâmico que precisa ser estendido com `operationName`, `timestampStart`, `timestampEnd`
- `electron/database/repository.ts` §getErrorsByStatusCode (linha ~291) — Modelo para nova query `getErrorsByOperationName`

### IPC bridge de erros
- `electron/preload.ts` — Canal `errors:search` já existe; verificar se precisa de novos canais ou se os parâmetros existentes são suficientes
- `src/types/index.ts` §StressFlowAPI.errors — Interface da bridge para erros

### Tela de resultados
- `src/components/TestResults.tsx` — Onde ErrorExplorer é renderizado (prop `testId`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Card de resumo clicável** (`ErrorExplorer.tsx` linhas 138-200): Padrão de card com botões toggle que servem de filtro. Replicar para operações.
- **Chips de filtro ativo** (`ErrorExplorer.tsx` linhas 204-226): Badge com X para remover filtro. Expandir para operação e período.
- **`searchErrors()` query builder** (`repository.ts:248`): Padrão de WHERE condicional com array de conditions. Adicionar `operation_name` e `timestamp` range.
- **`date-fns` com `ptBR`**: Já usado no projeto para formatação de datas.

### Established Patterns
- Filtros como state local do componente (`useState<T | undefined>`)
- Click-to-toggle nos cards: clica = ativa, clica de novo = desativa
- `useEffect` com reset de página quando filtros mudam
- `loadRecords()` com `useCallback` recalculado quando filtros mudam

### Integration Points
- `searchErrors()` no repository precisa aceitar `operationName`, `timestampStart`, `timestampEnd`
- A bridge IPC `errors:search` já passa parâmetros ao `searchErrors()` — pode aceitar novos campos sem novo canal
- O handler em `main.ts` que recebe `errors:search` precisa repassar os novos parâmetros

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing ErrorExplorer patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-error-filters*
*Context gathered: 2026-04-06*
