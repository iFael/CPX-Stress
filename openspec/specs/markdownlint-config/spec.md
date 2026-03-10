## ADDED Requirements

### Requirement: Markdownlint ignora regras incompatíveis em openspec
O sistema SHALL incluir um arquivo `.markdownlint.json` no diretório `openspec/` que desabilite as regras MD041, MD022 e MD032 para todos os artefatos markdown dentro desse diretório.

#### Scenario: Arquivo openspec sem MD041 warning
- **WHEN** um artefato openspec começa com `## heading` em vez de `# heading`
- **THEN** o markdownlint não SHALL reportar warning MD041 para esse arquivo

#### Scenario: Arquivo openspec sem MD022 warning
- **WHEN** um artefato openspec tem headings sem linhas em branco ao redor
- **THEN** o markdownlint não SHALL reportar warning MD022 para esse arquivo

#### Scenario: Arquivo openspec sem MD032 warning
- **WHEN** um artefato openspec tem listas sem linhas em branco ao redor
- **THEN** o markdownlint não SHALL reportar warning MD032 para esse arquivo

#### Scenario: Regras permanecem ativas fora de openspec
- **WHEN** um arquivo markdown na raiz ou em `src/` viola MD041, MD022 ou MD032
- **THEN** o markdownlint SHALL reportar os warnings normalmente

#### Scenario: Config JSON é válida
- **WHEN** o VS Code carrega o workspace
- **THEN** o arquivo `openspec/.markdownlint.json` SHALL ser um JSON válido com as 3 regras definidas como `false`
