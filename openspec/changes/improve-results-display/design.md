## Context

A tela de resultados atual (`TestResults.tsx`) exibe métricas brutas de performance — percentis de latência (P50/P90/P95/P99), RPS, throughput em bytes/s, status codes HTTP numéricos e health score numérico 0-100. Essas informações são valiosas para engenheiros, mas inacessíveis para usuários leigos que precisam entender se seu site "está bem" ou "tem problemas".

Componentes existentes relevantes:
- `TestResults.tsx` (~540 linhas) — renderização principal dos resultados
- `ProtectionReport.tsx` — relatório de proteção detectada
- `MetricsChart.tsx` — gráficos de timeline (recharts)
- `ResultCard` — componente interno de cards de métrica

Stack de UI: React + Tailwind CSS + Lucide icons + Recharts.

## Goals / Non-Goals

**Goals:**
- Tornar os resultados compreensíveis para qualquer pessoa sem conhecimento técnico
- Adicionar camada de linguagem natural sobre os dados existentes, sem alterá-los
- Manter informações técnicas detalhadas acessíveis para usuários avançados via seções colapsáveis
- Criar componentes reutilizáveis (tooltips, resumo) que beneficiem toda a aplicação

**Non-Goals:**
- Alterar o engine de testes ou a coleta de dados
- Mudar a estrutura de tipos (`TestResult`, `SecondMetrics`, etc.)
- Redesenhar completamente o layout/tema visual da aplicação
- Internacionalização (i18n) — o texto será fixo em português brasileiro
- Adicionar novos gráficos ou tipos de visualização

## Decisions

### 1. Resumo executivo como componente independente `ResultsSummary`

Criar um novo componente `ResultsSummary.tsx` que recebe o `TestResult` e gera um texto em linguagem natural descrevendo o resultado. Será posicionado logo abaixo do header e acima do health score.

**Rationale**: Separar a lógica de geração de texto da UI permite testar e iterar a linguagem independentemente. Manter fora do `TestResults.tsx` evita inchaço do componente já grande (~540 linhas).

**Alternativa descartada**: Gerar o resumo inline dentro de `TestResults.tsx` — tornaria o componente ainda mais extenso.

### 2. Tooltip reutilizável como componente `InfoTooltip`

Criar um componente genérico `InfoTooltip` que recebe texto explicativo e renderiza um ícone de info (ℹ) com tooltip ao hover/click. Será usado em todas as labels técnicas (latência, P95, RPS, etc.).

**Rationale**: Tooltips são a forma menos intrusiva de explicar termos — não poluem o layout, mas estão disponíveis ao toque. Um componente genérico evita duplicação.

**Alternativa descartada**: Texto explicativo inline permanente — ocuparia muito espaço e poluiria a interface para usuários experientes.

### 3. Mapeamento de termos técnicos centralizado em constante

Criar um mapa `METRIC_EXPLANATIONS` com todas as explicações de termos técnicos e labels amigáveis. Isso garante consistência e facilita futuras alterações de texto.

### 4. Status codes com labels humanos no próprio `TestResults.tsx`

Adicionar mapeamento de códigos HTTP para labels em português (200→"Sucesso", 403→"Bloqueado", 429→"Limite atingido", 5xx→"Erro do servidor") diretamente na seção de status codes do `TestResults.tsx`.

**Rationale**: É uma mudança localizada que não justifica um componente separado. Os mapeamentos são simples e fixos.

### 5. Seções técnicas colapsáveis com estado inicial fechado

As seções de "Distribuição de Latência" (percentis detalhados) e "Configuração do Teste" serão envolvidas em disclosure/accordion, inicialmente colapsadas. Os gráficos e a seção de status codes permanecem visíveis.

**Rationale**: Reduz a quantidade de informação técnica visível por padrão sem removê-la. Quem precisa pode expandir.

### 6. Seção de veredicto/recomendações ao final

Adicionar uma seção "Conclusões e Recomendações" ao final dos resultados, com bullets simples baseados nos dados (ex: "Latência está alta — considere otimizar o backend", "Proteção WAF bloqueou parte das requisições").

**Rationale**: Fecha a experiência com ações claras. Será gerada pela mesma lógica do resumo executivo.

## Risks / Trade-offs

- **Textos genéricos demais** → As mensagens de resumo serão parametrizadas com thresholds específicos (latência >500ms = "lento", erro >5% = "preocupante") para gerar linguagem precisa, não vaga.
- **Tooltips cobrem conteúdo em mobile/telas pequenas** → Usar posicionamento inteligente (top por padrão, ajuste se fora da viewport). Como é Electron desktop, o risco é menor.
- **Manutenção de texto** → Centralizar todas as strings explicativas em constantes facilita atualização futura.
- **Componente TestResults.tsx já grande** → Extrair lógica para subcomponentes (ResultsSummary, InfoTooltip) em vez de expandir o arquivo existente.
