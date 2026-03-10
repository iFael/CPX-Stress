## Context

O projeto StressFlow usa VS Code como IDE principal. O markdownlint (extensão do VS Code) valida automaticamente todos os arquivos `.md` do workspace. Os artefatos gerados pelo openspec (proposals, designs, specs, tasks) seguem templates com estrutura própria que frequentemente conflitam com regras padrão do markdownlint:

- **MD041** (first-line-heading): Artefatos openspec não começam com `# heading` — usam `## headings` como nível principal.
- **MD022** (blanks-around-headings): Templates compactos não incluem linhas em branco ao redor de headings.
- **MD032** (blanks-around-lists): Listas logo abaixo de headings, sem linha em branco intermediária.

Atualmente não existe nenhum arquivo `.markdownlint.json` ou `.markdownlintrc` no projeto.

## Goals / Non-Goals

**Goals:**

- Eliminar warnings de markdownlint nos artefatos openspec sem alterar os templates ou arquivos existentes.
- Manter regras de lint úteis para o restante do projeto (README, docs gerais).

**Non-Goals:**

- Alterar templates do openspec CLI.
- Desabilitar markdownlint globalmente.
- Corrigir manualmente cada arquivo existente.

## Decisions

### Decisão 1: Arquivo `.markdownlint.json` dentro de `openspec/`

Criar um `.markdownlint.json` somente dentro do diretório `openspec/` para desabilitar as 3 regras problemáticas (MD041, MD022, MD032). O markdownlint do VS Code respeita configurações hierárquicas — um arquivo de config em um subdiretório sobrescreve o da raiz para arquivos dentro daquele diretório.

**Alternativa considerada**: Config na raiz do projeto. Rejeitada porque desabilitaria essas regras para todos os `.md` do projeto, incluindo README e documentação geral onde essas regras são úteis.

**Alternativa considerada**: Comentários `<!-- markdownlint-disable -->` em cada arquivo. Rejeitada porque exigiria editar todos os arquivos existentes e futuros.

## Risks / Trade-offs

- [Trade-off] Regras desabilitadas para todo `openspec/` — se alguém criar documentação manual lá, essas regras não serão verificadas. → Mitigação: `openspec/` é gerenciado por ferramentas, não por documentação manual.
- [Risco baixo] Extensão markdownlint não instalada. → Mitigação: A configuração não causa nenhum efeito negativo se a extensão não estiver presente.
