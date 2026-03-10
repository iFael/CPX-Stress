## 1. Refatoração base e tema claro

- [x] 1.1 Substituir `drawPageBg` para usar fundo branco (#FFFFFF) com barra indigo (#4F46E5) de 4mm no topo
- [x] 1.2 Atualizar todas as cores de texto: primário (#1E293B), secundário (#64748B), caption (#94A3B8)
- [x] 1.3 Atualizar estilo dos títulos de seção (`sectionTitle`) para usar indigo (#4F46E5) com fonte bold
- [x] 1.4 Atualizar tema base de todas as tabelas `autoTable` para fundo branco/cinza alternado (#FFFFFF/#F8FAFC), cabeçalho indigo, bordas #E2E8F0

## 2. Reestruturar capa

- [x] 2.1 Redesenhar página de capa com fundo branco, tipografia escura e badge de health score atualizado para tema claro

## 3. Página de Resumo Simplificado (nova)

- [x] 3.1 Criar função `addLaypersonSummary` que gera página com bloco de nota geral (indicador visual colorido + texto descritivo por faixa de score)
- [x] 3.2 Adicionar seção "O que testamos?" com descrição em linguagem simples (URL, usuários simulados, duração)
- [x] 3.3 Adicionar seção "O que encontramos?" com 3-4 bullets contextuais baseados nos resultados (velocidade, erros, capacidade)
- [x] 3.4 Adicionar seção "O que recomendamos?" com 2-3 ações práticas em linguagem acessível
- [x] 3.5 Inserir chamada de `addLaypersonSummary` na função `generatePDF` logo após a capa

## 4. Reformular Resumo Executivo

- [x] 4.1 Atualizar cards de métricas para usar fundo #F1F5F9, bordas #E2E8F0 e texto escuro
- [x] 4.2 Adicionar labels bilíngues nos cards (ex: "Latência Média — Tempo médio de resposta do site")
- [x] 4.3 Atualizar barra de health score para tema claro com cores contrastantes

## 5. Reformular Métricas Detalhadas

- [x] 5.1 Adicionar explicações curtas ao lado dos nomes das métricas na tabela (ex: "P95 — 95% dos acessos responderam em menos que este tempo")
- [x] 5.2 Aplicar tema claro na tabela de métricas e na tabela de status codes

## 6. Reformular seção de Proteção

- [x] 6.1 Atualizar `addProtectionSection` para usar tema claro em todas as tabelas e cards
- [x] 6.2 Atualizar cores de badge de risco e tabelas de detecção para contraste em fundo branco

## 7. Reformular Conclusão e Recomendações

- [x] 7.1 Adicionar indicadores visuais de prioridade nas recomendações (vermelho=urgente, amarelo=importante, azul=informativo)
- [x] 7.2 Reescrever recomendações com linguagem mais prática e acessível
- [x] 7.3 Aplicar tema claro na tabela de configuração do teste

## 8. Glossário (novo)

- [x] 8.1 Criar função `addGlossary` com tabela de ~15 termos técnicos e definições em linguagem simples
- [x] 8.2 Inserir chamada de `addGlossary` na função `generatePDF` como última seção antes dos rodapés

## 9. Rodapés e finalização

- [x] 9.1 Atualizar rodapés de página para tema claro (texto cinza em fundo branco)
- [x] 9.2 Testar geração do PDF completo e validar layout visual de todas as seções
