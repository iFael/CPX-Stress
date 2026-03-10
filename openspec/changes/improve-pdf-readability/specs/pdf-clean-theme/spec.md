## ADDED Requirements

### Requirement: Fundo branco em todas as páginas
O PDF SHALL usar fundo branco (#FFFFFF) em todas as páginas, substituindo o fundo escuro (#0F1117) atual.

#### Scenario: Fundo branco aplicado
- **WHEN** o PDF é gerado
- **THEN** todas as páginas MUST ter fundo branco em vez de fundo escuro

### Requirement: Tipografia em cores escuras
Todo texto primário SHALL usar cor escura (#1E293B), texto secundário SHALL usar cinza médio (#64748B), e labels/captions SHALL usar cinza claro (#94A3B8).

#### Scenario: Cores de texto adequadas para fundo branco
- **WHEN** o PDF é renderizado
- **THEN** textos primários MUST ser legíveis em fundo branco com contraste adequado (ratio >= 4.5:1)

### Requirement: Accent color indigo mantido
A cor de destaque (accent) SHALL permanecer indigo (#4F46E5) para títulos de seção, barras de cabeçalho de tabela e elementos de destaque.

#### Scenario: Títulos de seção com accent indigo
- **WHEN** um título de seção é renderizado
- **THEN** MUST usar cor indigo (#4F46E5) com fonte bold e sublinhado

### Requirement: Cards de métricas com fundo neutro
Os cards de métricas no Resumo Executivo SHALL usar fundo cinza claro (#F1F5F9) com bordas sutis em vez do fundo escuro (#1A1D27) atual.

#### Scenario: Cards renderizados com tema claro
- **WHEN** os cards de métricas são desenhados
- **THEN** MUST usar background #F1F5F9, texto escuro e borda #E2E8F0

### Requirement: Tabelas com tema claro
Todas as tabelas `autoTable` SHALL usar fundo branco/cinza alternado (#FFFFFF/#F8FAFC), cabeçalho indigo (#4F46E5) com texto branco, e bordas cinza claro (#E2E8F0).

#### Scenario: Tabela de métricas detalhadas com tema claro
- **WHEN** a tabela de métricas é renderizada
- **THEN** MUST usar linhas alternadas branco/cinza com cabeçalho indigo

### Requirement: Labels bilíngues nas métricas
Cada métrica nas tabelas e cards SHALL incluir o termo técnico seguido de uma explicação curta entre parênteses ou em subtítulo.

#### Scenario: Label bilíngue para Latência P95
- **WHEN** a métrica P95 é exibida
- **THEN** o label MUST ser "Latência P95 — 95% das respostas foram mais rápidas que este valor" ou formato equivalente

#### Scenario: Label bilíngue para RPS
- **WHEN** a métrica RPS é exibida
- **THEN** o label MUST incluir explicação como "Requests/segundo — Quantas solicitações o site processou por segundo"

### Requirement: Barra de accent no topo de cada página
Cada página SHALL manter uma barra fina de cor indigo (#4F46E5) no topo (4mm de altura) como elemento de identidade visual.

#### Scenario: Barra indigo presente no topo
- **WHEN** qualquer página do PDF é renderizada
- **THEN** MUST conter uma barra horizontal indigo de 4mm no topo da página

### Requirement: Recomendações com indicadores visuais de prioridade
A seção de Conclusão e Recomendações SHALL usar prefixos visuais para indicar prioridade: marcador vermelho para urgente, amarelo para importante, azul para informativo.

#### Scenario: Recomendação urgente com indicador vermelho
- **WHEN** uma recomendação é sobre erro rate > 5% ou score crítico
- **THEN** MUST ser prefixada com indicador de cor vermelha

#### Scenario: Recomendação informativa com indicador azul
- **WHEN** uma recomendação é genérica (ex: "monitore periodicamente")
- **THEN** MUST ser prefixada com indicador de cor azul
