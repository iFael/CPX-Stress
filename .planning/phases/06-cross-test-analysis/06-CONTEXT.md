---
phase: 06-cross-test-analysis
created: 2026-04-07
status: decisions_captured
decisions: 4
deferred: 0
---

# Phase 6: Cross-Test Analysis — Context & Decisions

**Phase Goal:** Usuário compara a distribuição de erros entre múltiplos testes históricos para identificar se erros em uma operação específica estão piorando com o tempo ou com o aumento de carga
**Requirements:** ANALYTICS-03

---

<domain>
## Phase Boundary

Nova tela "Análise de Erros" acessível pela sidebar que permite:
1. Selecionar dois ou mais testes do histórico
2. Comparar a distribuição de erros por operação entre os testes selecionados
3. Identificar visualmente padrões de degradação (erros crescentes com VUs ou tempo)

Escopo: visualização comparativa read-only. Não inclui exportação de dados cross-test, alertas automáticos, ou métricas de performance (latência/throughput) — apenas erros.

</domain>

<decisions>
## Implementation Decisions

### D1: Seleção de testes — Lista com checkboxes do histórico

**Decision:** O usuário seleciona testes via checkboxes em uma lista que exibe nome/URL, data, e contagem de erros de cada teste. Mínimo 2 testes para habilitar comparação. A lista é carregada de `window.stressflow.history.list()` (IPC existente).

**Rationale:** Reutiliza o padrão de lista do HistoryPanel. Checkboxes são familiares e permitem seleção não-contígua.

### D2: Visualização — Tabela comparativa + gráfico de barras agrupadas

**Decision:** Dois componentes de visualização:
1. **Tabela:** Linhas = operações, Colunas = testes selecionados. Células = contagem de erros. Destaques visuais (cor) para operações com crescimento de erros entre testes.
2. **Gráfico de barras agrupadas (Recharts):** Barras agrupadas por operação, uma barra por teste. Permite identificar visualmente degradação crescente sem exportar dados.

**Rationale:** Tabela para precisão numérica (success criteria #3), gráfico para acionabilidade visual (success criteria #4). Recharts já disponível no projeto.

### D3: Navegação — Novo item na sidebar "Análise de Erros"

**Decision:** Novo item no `NAV_ITEMS[]` com `id: "analysis"` (nova entrada em `AppView`). Ícone: `BarChart3` do lucide-react. Posição: entre "Histórico" e "Configurações".

**Implementation:** Requer:
- Adicionar `"analysis"` ao type `AppView` em `src/types/index.ts`
- Novo item em `NAV_ITEMS` no `Sidebar.tsx`
- Novo branch no `App.tsx` para renderizar o componente de análise
- Novo componente `CrossTestAnalysis.tsx`

### D4: Escopo de dados — Erros por operação por teste

**Decision:** A comparação exibe a contagem de erros agrupada por `operation_name` para cada teste selecionado. Reutiliza `getErrorsByOperationName(testId)` (já implementado na Phase 5) chamando-o para cada teste selecionado.

**Rationale:** Alinhado com success criteria #3 ("contagem de erros por operação para cada teste selecionado"). Sem necessidade de nova query SQL — a agregação existente é suficiente.

### Claude's Discretion

- Estilização da tabela comparativa e gráfico seguindo sf-* tokens
- Indicador visual de degradação (cor vermelha crescente, ícone de trending-up, etc.)
- Empty state quando nenhum teste está selecionado ou quando testes não têm erros
- Ordenação das operações na tabela (por total de erros, alfabético, etc.)
- Limite máximo de testes selecionáveis para comparação (sugestão: 5-6 para legibilidade)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Navegação e views
- `src/types/index.ts` §AppView (linha ~792) — Type union que precisa de "analysis"
- `src/components/Sidebar.tsx` §NAV_ITEMS (linha ~43) — Array de itens de navegação
- `src/App.tsx` — Switch/routing de views que precisa do branch "analysis"
- `src/stores/test-store.ts` §view — Estado de navegação (setView)

### Dados de erro existentes
- `electron/database/repository.ts` §getErrorsByOperationName — Query de agregação por operação (Phase 5)
- `electron/preload.ts` §errors.byOperationName — Bridge IPC já funcional
- `src/types/index.ts` §StressFlowAPI.errors.byOperationName — Tipo da API bridge

### Histórico de testes
- `src/components/HistoryPanel.tsx` — Padrão de listagem de testes (UI de referência)
- `electron/database/repository.ts` §listTestResults — Query de listagem
- `src/types/index.ts` §TestResult — Interface do resultado de teste

### Gráficos
- `src/components/MetricsChart.tsx` — Uso existente de Recharts com sf-* tokens (padrão visual)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getErrorsByOperationName(testId)`** (repository.ts): Agregação por operação já implementada na Phase 5. Chamar para cada teste selecionado.
- **`window.stressflow.errors.byOperationName(testId)`** (preload bridge): IPC já funcional — sem nova query/canal necessário.
- **`HistoryPanel.tsx`**: Padrão de lista de testes com busca e filtro. Referência para o seletor de testes.
- **`MetricsChart.tsx`**: Uso de Recharts com BarChart/LineChart e sf-* tokens. Replicar padrão para gráfico comparativo.
- **`Recharts` (v2.15)**: BarChart com barras agrupadas (`<Bar>` múltiplos) já suportado.
- **`NAV_ITEMS[]`** no Sidebar: Padrão declarativo para adicionar nova entrada de navegação.

### Established Patterns
- `AppView` type union governa todas as telas
- `useTestStore((s) => s.view)` para seleção de tela ativa
- `setView("analysis")` para navegação
- Componentes de resultado usam props (`testId`, `result`) passados do App.tsx
- Cards e tabelas seguem padrão `bg-sf-surface border border-sf-border rounded-xl`

### Integration Points
- `AppView` em `src/types/index.ts` — adicionar "analysis"
- `NAV_ITEMS` em `Sidebar.tsx` — novo item
- `App.tsx` — novo branch no switch de views
- Novo componente `CrossTestAnalysis.tsx` em `src/components/`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. O gráfico de barras agrupadas e a tabela comparativa devem ser suficientes para o success criteria de "degradação acionável sem exportar dados".

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-cross-test-analysis*
*Context gathered: 2026-04-07*
