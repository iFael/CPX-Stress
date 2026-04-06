---
phase: 03-preset-system
created: 2026-04-06
status: decisions_captured
decisions: 6
deferred: 0
---

# Phase 3: Preset System — Context & Decisions

**Phase Goal:** Usuário executa o fluxo MisterT completo com um clique usando o preset built-in, e pode salvar, carregar, renomear e deletar suas próprias configurações de teste recorrentes

**Requirements:** PRESET-01 (built-in preset), PRESET-02 (user preset CRUD)

---

## Prior Decisions (from STATE.md / earlier phases)

These are locked — do not re-discuss:

1. **Preset storage in SQLite** — tabela `test_presets` com flag `is_builtin` (migration v3)
2. **Built-in seed never imports from src/** — JSON hardcoded inline na migration SQL, nunca `import` de `src/constants/test-presets.ts` (anti-pattern: quebraria no build empacotado)
3. **4-file atomic IPC update rule** — todo novo canal IPC: preload whitelist, preload api, src/types/index.ts, main.ts

---

## New Decisions (Phase 3 Discussion)

### D1: Preset Data Model — Full TestConfig

**Decision:** O preset persiste o `TestConfig` inteiro (url, virtualUsers, duration, method, headers, body, operations[]).

**Rationale:** O usuário salva a configuração exata que usou e pode reproduzir depois sem ajustar parâmetros. Presets user-created são snapshots completos.

**Schema:**
```sql
CREATE TABLE test_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  config_json TEXT NOT NULL,      -- TestConfig inteiro serializado
  is_builtin INTEGER DEFAULT 0,
  builtin_version INTEGER,        -- versão do built-in para auto-update
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### D2: UI — Modal com Overlay + Grid de Cards

**Decision:** Presets são exibidos em modal com overlay, acessível via botão "Presets" no TestConfig. Cards em grid layout.

**Behavior:**
- Botão "Presets" no topo do TestConfig abre o modal
- Grid de cards: built-in aparece primeiro com badge visual "Built-in"
- Built-in: apenas botão "Carregar" (sem editar/deletar/renomear)
- User presets: botões Carregar, Renomear, Deletar
- Selecionar um preset fecha o modal e aplica o config no formulário
- Card mostra: nome, quantidade de operações, VUs, duração

### D3: Save Flow — Save + Save As

**Decision:** Se um preset do usuário está ativo, oferece "Atualizar" (sobrescrever) ou "Salvar Como" (novo nome). Se o built-in ou nenhum preset está ativo, apenas "Salvar Como".

**Behavior:**
- Botão "Salvar Preset" no TestConfig (próximo ao botão "Presets")
- Se preset ativo é user-created: dialog com opções "Atualizar [nome]" e "Salvar Como Novo"
- Se preset ativo é built-in ou nenhum: prompt de nome para "Salvar Como"
- Nome obrigatório, não pode duplicar nome existente

### D4: Built-in Seed — Migration + Version Check

**Decision:** Migration v3 cria a tabela `test_presets` e insere o built-in "MisterT Completo" com `builtin_version=1`. Na inicialização, o main process compara a versão no DB com a versão esperada no código — se diferir, atualiza a row automaticamente.

**Implementation details:**
- Migration v3: CREATE TABLE + INSERT do built-in com JSON inline das 10 operações
- `const CURRENT_BUILTIN_VERSION = 1` declarado no arquivo de migration ou database.ts
- Startup check no `initDatabase()` ou handler dedicado: SE `builtin_version < CURRENT_BUILTIN_VERSION` THEN UPDATE row
- O JSON inline do built-in usa `MISTERT_DEFAULT_BASE_URL` como base URL

### D5: URL Base Substituída ao Aplicar

**Decision:** O built-in persiste com a URL default (`dev-mistert.compex.com.br`). Ao aplicar qualquer preset, o renderer substitui a URL base pelas do environment selector do TestConfig, usando a mesma lógica de `buildMistertOperations(baseUrl?)`.

**Implementation:** Reutilizar a lógica de replace que já existe em `buildMistertOperations` — extrair para uma utility function (`replaceBaseUrl`) ou aplicar inline no handler de "aplicar preset".

### D6: IPC Channels Required

Based on the CRUD requirements, the following new IPC channels are needed:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `presets:list` | invoke | Lista todos os presets (built-in + user) |
| `presets:save` | invoke | Salva novo preset ou atualiza existente |
| `presets:rename` | invoke | Renomeia um preset do usuário |
| `presets:delete` | invoke | Deleta um preset do usuário |

Each channel requires atomic 4-file update (D3 from prior decisions).

---

## Existing Assets to Reuse

| Asset | Location | Reuse |
|-------|----------|-------|
| `buildMistertOperations()` | `src/constants/test-presets.ts` | Fonte da verdade para as 10 operações do built-in. O JSON inline na migration deve ser uma cópia serializada deste template. |
| `MISTERT_DEFAULT_BASE_URL` | `src/constants/test-presets.ts` | URL base default usada no built-in e na lógica de replace. |
| `TestConfig` interface | `src/types/index.ts` | Tipo do `config_json` serializado. |
| SQLite migration pattern | `electron/database/database.ts` | Migration v3 segue o pattern de v1/v2 (transaction + INSERT INTO schema_version). |
| Toast system | `src/components/ToastProvider.tsx` | Feedback visual para save/delete/rename. |
| Modal pattern | Existente no codebase? | Verificar se há modal reutilizável ou criar componente `PresetModal`. |

---

## Deferred Ideas

(none — all discussed items are in scope for Phase 3)

---

## Constraints for Planning

1. **pt-BR only** — toda label, toast, placeholder em português
2. **sf-* tokens** — cores e sombras via design system existente
3. **Anti-pattern enforced** — migration SQL nunca importa de `src/`; JSON inline
4. **4-file IPC rule** — cada canal = preload whitelist + preload api + types + main.ts handler
5. **Phase 4 boundary** — module selector (checkboxes) é Phase 4, não incluir aqui
6. **PRESET-03 is Phase 4** — Phase 3 entrega PRESET-01 + PRESET-02 apenas

---

*Created: 2026-04-06 via discuss-phase workflow*
