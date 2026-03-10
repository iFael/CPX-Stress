## Why

A tela de resultados do StressFlow exibe dados técnicos (P50, P90, P95, P99, RPS, throughput, status codes HTTP) que são incompreensíveis para usuários leigos. Termos como "latência P99", "throughput em bytes/s" e "status code 429" não comunicam nada para quem não é desenvolvedor ou engenheiro de infraestrutura. O objetivo é tornar os resultados acessíveis a qualquer pessoa, mantendo os dados técnicos disponíveis para quem precisa.

## What Changes

- Additional um **resumo executivo em linguagem natural** no topo dos resultados, explicando em português claro o que aconteceu no teste (ex: "Seu site respondeu bem sob carga de 100 usuários simultâneos, com tempo de resposta rápido e sem erros")
- Substituir o health score numérico por um **indicador visual intuitivo** com ícone grande, cor clara e explicação textual do que o score significa na prática
- Adicionar **tooltips explicativos** em todos os termos técnicos (latência, P95, RPS, throughput, status codes) com linguagem simples
- Criar cards de métricas com **analogias do mundo real** (ex: latência → "tempo de espera", throughput → "velocidade de download", RPS → "capacidade de atendimento")
- Reformular a seção de **status codes HTTP** usando linguagem humana (200 → "Sucesso", 403 → "Bloqueado", 429 → "Limite atingido", 500 → "Erro do servidor")
- Adicionar uma seção de **veredicto/conclusões** ao final com recomendações simples baseadas nos resultados
- Manter dados técnicos detalhados disponíveis em seções colapsáveis para usuários avançados

## Capabilities

### New Capabilities
- `friendly-results-summary`: Resumo executivo em linguagem natural no topo dos resultados, com veredicto e recomendações
- `metric-tooltips`: Sistema de tooltips explicativos para termos técnicos em toda a tela de resultados
- `human-readable-metrics`: Apresentação de métricas com labels amigáveis, analogias e formatação acessível

### Modified Capabilities

## Impact

- **Componentes afetados**: `TestResults.tsx` (refatoração significativa da apresentação), `ProtectionReport.tsx` (labels mais claros)
- **Novos componentes**: possíveis componentes de tooltip reutilizável e resumo executivo
- **Sem breaking changes**: dados internos e engine não são alterados, apenas a camada de apresentação
- **Sem impacto em APIs/dependências**: mudanças puramente visuais/textuais no frontend
