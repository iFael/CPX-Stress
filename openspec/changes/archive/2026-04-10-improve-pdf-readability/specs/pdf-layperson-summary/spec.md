## ADDED Requirements

### Requirement: Página de resumo simplificado após a capa
O sistema SHALL gerar uma página de "Resumo Simplificado" imediatamente após a página de capa do PDF, destinada a leitores sem conhecimento técnico.

#### Scenario: Geração da página de resumo simplificado
- **WHEN** o PDF é gerado com um `TestResult` válido
- **THEN** a segunda página do PDF MUST conter uma seção "Resumo Simplificado" com linguagem acessível

### Requirement: Nota geral com indicador visual
A página de resumo simplificado SHALL exibir a nota geral do site (health score) com um indicador visual colorido (verde/azul/amarelo/vermelho) e um texto descritivo curto em linguagem cotidiana (ex: "O site está funcionando bem", "O site apresenta lentidão").

#### Scenario: Exibição da nota geral para score excelente
- **WHEN** o health score é >= 80
- **THEN** o resumo MUST exibir indicador verde com texto "O site está funcionando muito bem sob a carga testada"

#### Scenario: Exibição da nota geral para score bom
- **WHEN** o health score é >= 60 e < 80
- **THEN** o resumo MUST exibir indicador azul com texto "O site funciona de forma aceitável, mas pode melhorar"

#### Scenario: Exibição da nota geral para score regular
- **WHEN** o health score é >= 40 e < 60
- **THEN** o resumo MUST exibir indicador amarelo com texto "O site apresenta lentidão e instabilidade sob carga"

#### Scenario: Exibição da nota geral para score crítico
- **WHEN** o health score é < 40
- **THEN** o resumo MUST exibir indicador vermelho com texto "O site apresenta problemas sérios e precisa de atenção imediata"

### Requirement: Seção "O que testamos?"
A página SHALL conter uma seção explicando o que foi testado em linguagem simples, incluindo a URL, número de acessos simulados e duração.

#### Scenario: Descrição do teste em linguagem simples
- **WHEN** o PDF é gerado com config de 100 usuários virtuais por 30 segundos na URL example.com
- **THEN** o texto MUST explicar algo como "Simulamos 100 pessoas acessando o site example.com ao mesmo tempo, durante 30 segundos"

### Requirement: Seção "O que encontramos?"
A página SHALL conter uma seção com 3-4 descobertas principais em linguagem de fácil compreensão, cobrindo velocidade de resposta, taxa de erros e capacidade.

#### Scenario: Descobertas com resultados saudáveis
- **WHEN** o site tem latência média < 500ms e error rate < 1%
- **THEN** as descobertas MUST incluir mensagens positivas sobre velocidade e estabilidade

#### Scenario: Descobertas com problemas detectados
- **WHEN** o site tem latência média > 2000ms ou error rate > 5%
- **THEN** as descobertas MUST incluir alertas em linguagem clara sobre lentidão ou falhas

### Requirement: Seção "O que recomendamos?"
A página SHALL conter 2-3 recomendações práticas em linguagem simples, derivadas dos resultados do teste.

#### Scenario: Recomendações baseadas nos resultados
- **WHEN** o PDF é gerado com qualquer TestResult
- **THEN** as recomendações MUST ser ações concretas compreensíveis por não-técnicos (ex: "Contrate uma revisão de performance" em vez de "Otimize queries SQL")
