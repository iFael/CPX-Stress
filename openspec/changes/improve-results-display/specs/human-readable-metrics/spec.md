## ADDED Requirements

### Requirement: Labels amigáveis para métricas
O sistema SHALL exibir labels em linguagem acessível para as três métricas principais na tela de resultados, substituindo ou complementando os termos técnicos.

#### Scenario: Label de RPS amigável
- **WHEN** a tela de resultados renderiza o card de RPS
- **THEN** SHALL exibir "Capacidade de Atendimento" como label principal, com "Requests/segundo" como sublabel técnica

#### Scenario: Label de latência amigável
- **WHEN** a tela de resultados renderiza o card de latência
- **THEN** SHALL exibir "Tempo de Resposta" como label principal, com "Latência Média" como sublabel técnica

#### Scenario: Label de erros amigável
- **WHEN** a tela de resultados renderiza o card de taxa de erro
- **THEN** SHALL exibir "Falhas" como label principal, com "Taxa de Erro" como sublabel técnica

### Requirement: Status codes HTTP com descrições em português
O sistema SHALL exibir descrições textuais em português ao lado de cada código de status HTTP na seção de distribuição de status codes.

#### Scenario: Status code de sucesso
- **WHEN** o resultado contém status code 200
- **THEN** SHALL exibir "200 — Sucesso" com estilo visual positivo (verde)

#### Scenario: Status code de redirecionamento
- **WHEN** o resultado contém status code 301 ou 302
- **THEN** SHALL exibir "301 — Redirecionamento" ou "302 — Redirecionamento Temporário"

#### Scenario: Status code de bloqueio
- **WHEN** o resultado contém status code 403
- **THEN** SHALL exibir "403 — Acesso Bloqueado" com estilo visual de alerta (amarelo/laranja)

#### Scenario: Status code de rate-limiting
- **WHEN** o resultado contém status code 429
- **THEN** SHALL exibir "429 — Limite de Requisições Atingido" com estilo visual de alerta

#### Scenario: Status code de erro do servidor
- **WHEN** o resultado contém status code 500, 502, 503 ou 504
- **THEN** SHALL exibir descrição como "500 — Erro Interno do Servidor", "502 — Gateway Inválido", "503 — Serviço Indisponível", "504 — Timeout do Gateway" com estilo visual de erro (vermelho)

### Requirement: Seções técnicas detalhadas colapsáveis
O sistema SHALL renderizar as seções de "Distribuição de Latência" (percentis) e "Configuração do Teste" como seções colapsáveis, inicialmente fechadas.

#### Scenario: Estado inicial colapsado
- **WHEN** a tela de resultados é exibida
- **THEN** as seções "Distribuição de Latência" e "Configuração do Teste" SHALL estar colapsadas por padrão

#### Scenario: Expandir seção técnica
- **WHEN** o usuário clica no header de uma seção colapsada
- **THEN** a seção SHALL expandir com animação suave, exibindo o conteúdo técnico detalhado

#### Scenario: Colapsar seção técnica
- **WHEN** o usuário clica no header de uma seção expandida
- **THEN** a seção SHALL colapsar com animação suave, ocultando o conteúdo
