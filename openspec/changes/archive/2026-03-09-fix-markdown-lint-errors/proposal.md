## Why

Os arquivos markdown gerados pelo openspec (proposals, designs, specs) disparam dezenas de warnings do markdownlint (MD041, MD022, MD032) no VS Code. Isso polui a lista de problemas, dificulta identificar erros reais no código e atrapalha o fluxo de trabalho do desenvolvedor.

## What Changes

- Adicionar um arquivo de configuração `.markdownlint.json` na raiz do projeto para desabilitar as regras que conflitam com o formato dos artefatos openspec.
- Adicionar um `.markdownlint.json` mais específico dentro de `openspec/` para regras que só se aplicam a esse diretório.

## Capabilities

### New Capabilities

- `markdownlint-config`: Configuração do markdownlint para suprimir warnings irrelevantes nos artefatos openspec, mantendo regras úteis para o restante do projeto.

### Modified Capabilities

## Impact

- Arquivos afetados: Nenhum arquivo de código existente é modificado.
- Novos arquivos: `.markdownlint.json` na raiz do projeto e/ou em `openspec/`.
- Dependências: Nenhuma nova dependência — usa configuração nativa do markdownlint já integrado ao VS Code.
- Sistemas: Apenas ambiente de desenvolvimento local (VS Code linting).
