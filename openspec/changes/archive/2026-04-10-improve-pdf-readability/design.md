## Context

O StressFlow gera relatórios PDF via `jspdf` + `jspdf-autotable` no arquivo `src/services/pdf-generator.ts` (~950 linhas). O PDF atual usa dark theme (fundo #0F1117), terminologia exclusivamente técnica (P50, P95, RPS, WAF, throughput) e nenhum texto explicativo. O público-alvo expandiu para incluir gestores e clientes não-técnicos que precisam entender os resultados sem conhecimento de engenharia de performance.

A função `generatePDF()` mantém a mesma assinatura (`TestResult`, `chartImages`) → `base64 string`. Toda a mudança é interna ao layout e conteúdo textual do PDF.

## Goals / Non-Goals

**Goals:**
- Tornar o PDF compreensível para pessoas sem conhecimento técnico
- Manter todas as informações técnicas detalhadas para profissionais
- Adotar tema visual limpo (fundo branco) com tipografia profissional
- Adicionar página de "Resumo Simplificado" com linguagem acessível
- Incluir glossário de termos técnicos no final
- Labels bilíngues: termo técnico + explicação em linguagem simples

**Non-Goals:**
- Alterar a assinatura ou interface pública de `generatePDF()`
- Adicionar novas dependências externas
- Mudar a lógica de cálculo do health score
- Internacionalização (i18n) — o PDF permanece em pt-BR
- Exportar em outros formatos além de PDF

## Decisions

### 1. Tema claro (fundo branco) em vez de dark theme
**Escolha**: Substituir fundo escuro (#0F1117) por fundo branco com textos em cinza escuro/preto.
**Alternativa**: Manter dark theme e apenas adicionar textos explicativos.
**Razão**: Fundo branco é mais legível em impressão e telas comuns, mais profissional para relatórios corporativos, e é o padrão esperado por stakeholders não-técnicos.

### 2. Paleta de cores
**Escolha**: Fundo branco (#FFFFFF), textos em cinza escuro (#1E293B / #334155 / #64748B), accent indigo (#4F46E5) para títulos e destaques, mesma escala de cores para status (verde/azul/amarelo/vermelho).
**Razão**: Mantém identidade da marca (indigo como accent) enquanto melhora legibilidade.

### 3. Página de Resumo Simplificado após a capa
**Escolha**: Nova página "Resumo para Leigos" com 4 blocos visuais — (1) Nota geral com emoji/ícone textual e cor, (2) "O que testamos?" em linguagem simples, (3) "O que encontramos?" com 3-4 bullets em linguagem cotidiana, (4) "O que recomendamos?" com ações práticas.
**Alternativa**: Embutir explicações nas seções existentes.
**Razão**: Separar permite que leigos leiam só a primeira página após a capa, enquanto técnicos avançam para as seções detalhadas.

### 4. Labels bilíngues nas métricas
**Escolha**: Cada métrica terá label no formato "Nome Técnico — Explicação simples" (ex: "Latência P95 — 95% das respostas foram mais rápidas que este valor").
**Alternativa**: Apenas renomear para termos simples.
**Razão**: Preserva vocabulário técnico para profissionais e ao mesmo tempo educa o leitor leigo.

### 5. Glossário no final do PDF
**Escolha**: Tabela compacta com ~15 termos (Latência, RPS, P50/P95/P99, Throughput, WAF, CDN, Rate Limiting, etc.), cada um com definição de 1 linha.
**Razão**: Leigos podem consultar termos que encontram ao longo do relatório sem sair do documento.

### 6. Refatoração em funções auxiliares por seção
**Escolha**: Extrair cada seção do PDF em funções dedicadas (`addCoverPage`, `addLaypersonSummary`, `addExecutiveSummary`, `addChartsSection`, `addDetailedMetrics`, `addProtectionSection`, `addRecommendations`, `addGlossary`, `addTestConfig`).
**Alternativa**: Manter tudo em uma função monolítica.
**Razão**: O arquivo já tem ~950 linhas. Separar em funções melhora manutenibilidade e facilita revisão.

## Risks / Trade-offs

- **[Regressão visual]** → O PDF muda completamente. Testar manualmente com resultados reais antes de merge. Não há testes automatizados para layout de PDF.
- **[Tamanho do PDF]** → Adição de glossário e página de resumo aumenta o número de páginas em ~2. Impacto mínimo no tamanho do arquivo.
- **[Gráficos com fundo transparente]** → Os charts exportados como PNG podem ter fundo escuro da UI. Verificar se os charts são renderizados com fundo transparente ou tratar no PDF com fundo branco atrás.
- **[Limitação de fontes do jsPDF]** → jsPDF suporta apenas Helvetica, Courier e Times por padrão. Manter Helvetica que é limpa e profissional.
