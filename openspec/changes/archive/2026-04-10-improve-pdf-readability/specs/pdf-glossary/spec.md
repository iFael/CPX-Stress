## ADDED Requirements

### Requirement: Glossário de termos técnicos no final do PDF
O sistema SHALL adicionar uma página de glossário como última seção do PDF (antes do rodapé), contendo definições simples dos termos técnicos usados no relatório.

#### Scenario: Glossário presente no PDF gerado
- **WHEN** o PDF é gerado com qualquer TestResult
- **THEN** o PDF MUST conter uma seção "Glossário" com tabela de termos e definições

### Requirement: Termos obrigatórios no glossário
O glossário SHALL incluir no mínimo os seguintes termos: Latência, RPS (Requests por Segundo), P50/P90/P95/P99, Throughput, Taxa de Erro, Status Code HTTP, WAF, CDN, Rate Limiting, Usuários Virtuais.

#### Scenario: Todos os termos obrigatórios presentes
- **WHEN** o glossário é renderizado
- **THEN** MUST conter pelo menos 10 termos com definições de no máximo 2 linhas cada

### Requirement: Definições em linguagem acessível
Cada definição no glossário SHALL ser escrita em linguagem compreensível por pessoas sem conhecimento técnico, usando analogias do cotidiano quando apropriado.

#### Scenario: Definição de Latência
- **WHEN** o termo "Latência" é exibido no glossário
- **THEN** a definição MUST ser algo como "Tempo que o site leva para responder após receber uma solicitação. É como o tempo de espera na fila de um atendimento."

#### Scenario: Definição de RPS
- **WHEN** o termo "RPS" é exibido no glossário
- **THEN** a definição MUST explicar em linguagem simples que é a quantidade de solicitações que o site consegue processar por segundo

### Requirement: Formatação do glossário como tabela
O glossário SHALL ser renderizado como tabela com 2 colunas: "Termo" e "O que significa".

#### Scenario: Renderização em formato tabular
- **WHEN** o glossário é gerado no PDF
- **THEN** MUST usar `jspdf-autotable` com cabeçalho "Termo" e "O que significa", seguindo o tema visual limpo do PDF
