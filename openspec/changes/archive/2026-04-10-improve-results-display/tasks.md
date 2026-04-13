## 1. Componente InfoTooltip

- [x] 1.1 Criar componente `src/components/InfoTooltip.tsx` com ícone ℹ e popover ao hover/click
- [x] 1.2 Estilizar tooltip com tema da aplicação (fundo escuro, texto claro, bordas consistentes)

## 2. Constantes de explicações e labels

- [x] 2.1 Criar mapa `METRIC_EXPLANATIONS` com textos explicativos para todos os termos técnicos (latência, P50/P90/P95/P99, RPS, throughput, taxa de erro)
- [x] 2.2 Criar mapa `STATUS_CODE_LABELS` com descrições em português para status codes HTTP (200, 301, 302, 403, 429, 500, 502, 503, 504)
- [x] 2.3 Criar mapa `HEALTH_EXPLANATIONS` com frases explicativas para cada faixa de health score

## 3. Resumo executivo

- [x] 3.1 Criar componente `src/components/ResultsSummary.tsx` que recebe `TestResult` e gera texto em linguagem natural
- [x] 3.2 Implementar lógica de geração de texto com thresholds (excelente/mediano/crítico) baseados em health score, error rate e latência P95
- [x] 3.3 Implementar detecção de proteção no resumo (mensagem explicativa quando blocking/rate-limiting detectado)

## 4. Métricas com labels amigáveis

- [x] 4.1 Atualizar cards de métricas em `TestResults.tsx` para exibir labels amigáveis ("Capacidade de Atendimento", "Tempo de Resposta", "Falhas") com sublabels técnicas
- [x] 4.2 Adicionar `InfoTooltip` ao lado de cada label de métrica nos cards principais
- [x] 4.3 Atualizar seção de status codes HTTP para exibir descrições em português ao lado dos códigos numéricos

## 5. Health score com explicação

- [x] 5.1 Adicionar frase explicativa abaixo do health score numérico baseada na faixa (Excelente/Bom/Regular/Crítico)

## 6. Seções colapsáveis

- [x] 6.1 Tornar seção "Distribuição de Latência" colapsável, inicialmente fechada
- [x] 6.2 Tornar seção "Configuração do Teste" colapsável, inicialmente fechada
- [x] 6.3 Adicionar `InfoTooltip` nos labels de percentis dentro da seção expandida de latência

## 7. Veredicto e recomendações

- [x] 7.1 Adicionar seção "Conclusões e Recomendações" ao final dos resultados em `TestResults.tsx`
- [x] 7.2 Implementar lógica de geração de recomendações baseada em latência alta, taxa de erro, proteção bloqueando e resultado positivo

## 8. Integração e ajustes finais

- [x] 8.1 Integrar `ResultsSummary` no topo de `TestResults.tsx` entre header e health score
- [x] 8.2 Adicionar `InfoTooltip` na seção de throughput
- [x] 8.3 Verificar consistência visual e responsividade de todos os novos componentes
