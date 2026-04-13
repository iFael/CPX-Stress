## ADDED Requirements

### Requirement: Tooltips explicativos para termos técnicos
O sistema SHALL exibir um ícone de informação (ℹ) ao lado de cada termo técnico na tela de resultados. Ao interagir com o ícone (hover ou click), SHALL exibir um tooltip com explicação em linguagem simples.

#### Scenario: Tooltip para latência
- **WHEN** o usuário passa o cursor sobre o ícone de info ao lado de "Latência Média"
- **THEN** o sistema SHALL exibir tooltip com texto como "Latência é o tempo que o servidor demora para responder. Quanto menor, mais rápido o site."

#### Scenario: Tooltip para percentis de latência
- **WHEN** o usuário passa o cursor sobre o ícone de info ao lado de "P50", "P90", "P95" ou "P99"
- **THEN** o sistema SHALL exibir tooltip explicando o conceito, como "P95 significa que 95% das requisições responderam em até esse tempo. Os outros 5% demoraram mais."

#### Scenario: Tooltip para RPS
- **WHEN** o usuário passa o cursor sobre o ícone de info ao lado de "Requests/segundo"
- **THEN** o sistema SHALL exibir tooltip como "Quantas requisições por segundo o servidor conseguiu processar. Quanto maior, mais capacidade."

#### Scenario: Tooltip para taxa de erro
- **WHEN** o usuário passa o cursor sobre o ícone de info ao lado de "Taxa de Erro"
- **THEN** o sistema SHALL exibir tooltip como "Porcentagem de requisições que falharam. Idealmente deve ser próxima de 0%."

#### Scenario: Tooltip para throughput
- **WHEN** o usuário passa o cursor sobre o ícone de info ao lado de "Throughput"
- **THEN** o sistema SHALL exibir tooltip como "Volume de dados transferidos por segundo. Indica a velocidade de transferência do servidor."

### Requirement: Componente InfoTooltip reutilizável
O sistema SHALL fornecer um componente `InfoTooltip` reutilizável que aceita texto explicativo e renderiza ícone + tooltip de forma consistente em toda a aplicação.

#### Scenario: Renderização do ícone
- **WHEN** o componente InfoTooltip é renderizado com texto explicativo
- **THEN** SHALL exibir um ícone ℹ discreto (tamanho pequeno, cor muted) ao lado do conteúdo

#### Scenario: Exibição do tooltip
- **WHEN** o usuário faz hover ou click no ícone do InfoTooltip
- **THEN** SHALL exibir o texto explicativo em um popover posicionado acima do ícone, com fundo escuro e texto claro, respeitando o tema da aplicação

#### Scenario: Fechamento do tooltip
- **WHEN** o usuário move o cursor para fora do ícone ou clica em outro lugar
- **THEN** o tooltip SHALL desaparecer
