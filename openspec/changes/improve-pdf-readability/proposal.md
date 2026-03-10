## Why

O relatório PDF gerado pelo StressFlow é altamente técnico, repleto de jargões como P50, P95, P99, throughput, RPS, status codes HTTP, e termos de proteção (WAF, CDN, rate-limiter). Pessoas leigas — como gestores, clientes ou stakeholders não-técnicos — não conseguem interpretar os resultados. O PDF precisa ser reformulado para comunicar os resultados de forma clara, visual e acessível, sem perder a profundidade técnica para quem precisa.

## What Changes

- Substituir o fundo escuro (dark theme) por um layout limpo com fundo branco, tipografia clara e hierarquia visual bem definida
- Adicionar uma página de "Resumo para Leigos" logo após a capa, com linguagem simples, ícones/indicadores visuais e analogias do dia-a-dia para explicar os resultados
- Reformular o Resumo Executivo com cards mais descritivos — cada métrica terá um subtítulo explicativo (ex: "Latência Média — Tempo médio de resposta do site")
- Substituir labels técnicos puros por labels bilíngues (técnico + explicação), ex: "P95 (95% das respostas foram mais rápidas que este tempo)"
- Melhorar a seção de Avaliação de Saúde com um gauge visual maior e texto explicativo contextual
- Reformular a seção de Conclusão e Recomendações com linguagem prática, orientada a ações concretas e com priorização visual (cores/ícones por severidade)
- Adicionar um glossário compacto no final do PDF com os termos técnicos usados no relatório

## Capabilities

### New Capabilities
- `pdf-layperson-summary`: Página de resumo com linguagem simplificada e indicadores visuais para leigos, inserida após a capa
- `pdf-glossary`: Glossário compacto de termos técnicos no final do relatório
- `pdf-clean-theme`: Tema visual limpo (fundo branco, tipografia profissional, hierarquia clara) substituindo o dark theme atual

### Modified Capabilities

## Impact

- **Código afetado**: `src/services/pdf-generator.ts` — reescrita substancial do layout, cores, fontes e estrutura de todas as seções
- **Dependências**: Nenhuma nova dependência; continua usando `jspdf` e `jspdf-autotable`
- **APIs**: Nenhuma mudança na interface `generatePDF()` — mantém mesma assinatura e retorno
- **UX**: O PDF resultante terá aparência e estrutura completamente diferentes, mas todas as informações técnicas permanecem disponíveis
