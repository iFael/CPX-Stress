## ADDED Requirements

### Requirement: Resumo executivo em linguagem natural
O sistema SHALL exibir um resumo executivo em linguagem natural no topo da tela de resultados, logo abaixo do header. O resumo SHALL descrever em português claro e não-técnico o que aconteceu durante o teste, incluindo: performance geral, capacidade de resposta e problemas encontrados.

#### Scenario: Teste com resultados excelentes
- **WHEN** o teste completa com health score >= 80, error rate < 1% e latência P95 < 500ms
- **THEN** o resumo SHALL exibir mensagem positiva como "Seu site respondeu muito bem! Com [N] usuários simultâneos durante [D] segundos, o tempo de resposta foi rápido e praticamente sem erros."

#### Scenario: Teste com resultados medianos
- **WHEN** o teste completa com health score entre 40-79 ou error rate entre 1-20% ou latência P95 entre 500ms-5s
- **THEN** o resumo SHALL exibir mensagem de atenção indicando pontos específicos que merecem cuidado, como "Seu site funcionou, mas ficou lento sob carga — o tempo de resposta subiu consideravelmente com [N] usuários."

#### Scenario: Teste com resultados críticos
- **WHEN** o teste completa com health score < 40 ou error rate > 20% ou latência P95 > 5s
- **THEN** o resumo SHALL exibir mensagem de alerta como "Seu site teve dificuldades sérias! Muitas requisições falharam ou demoraram demais sob a carga de [N] usuários."

#### Scenario: Proteção detectada bloqueando requisições
- **WHEN** o relatório de proteção detecta padrão comportamental de bloqueio (blocking) ou rate-limiting
- **THEN** o resumo SHALL incluir explicação como "Uma proteção de segurança ([provider]) foi detectada e bloqueou parte das requisições — isso é normal e significa que o site possui defesas ativas."

### Requirement: Health score com explicação textual
O health score numérico (0-100) SHALL ser acompanhado de uma frase explicativa que descreva o que o número significa na prática para um leigo.

#### Scenario: Exibição do health score com explicação
- **WHEN** a tela de resultados renderiza o health score
- **THEN** SHALL exibir abaixo do score uma frase contextual, como "O site respondeu bem à maioria das requisições, com poucos problemas" (score >= 80) ou "O site não conseguiu lidar com a carga — muitas falhas detectadas" (score < 40)

### Requirement: Seção de veredicto e recomendações
O sistema SHALL exibir ao final dos resultados uma seção "Conclusões e Recomendações" com bullets em linguagem simples baseados nos dados do teste.

#### Scenario: Recomendação por latência alta
- **WHEN** a latência P95 do teste é > 2000ms
- **THEN** a seção de recomendações SHALL incluir item como "O tempo de resposta está alto — considere otimizar o servidor ou reduzir o tamanho das páginas"

#### Scenario: Recomendação por taxa de erro alta
- **WHEN** a taxa de erro do teste é > 5%
- **THEN** a seção de recomendações SHALL incluir item como "Muitas requisições falharam — verifique se o servidor suporta a quantidade de acessos simultâneos"

#### Scenario: Recomendação por proteção bloqueando
- **WHEN** proteção detectada com padrão de blocking ou rate-limiting
- **THEN** a seção de recomendações SHALL incluir item como "O sistema de proteção do site bloqueou requisições — para testes mais precisos, considere configurar uma whitelist"

#### Scenario: Sem recomendações quando tudo está bem
- **WHEN** health score >= 80, error rate < 1%, latência P95 < 500ms e sem proteção bloqueando
- **THEN** a seção de recomendações SHALL exibir mensagem positiva como "Tudo certo! O site apresentou excelente performance sob a carga testada."
