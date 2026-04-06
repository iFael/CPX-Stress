# Roadmap — CPX-MisterT Stress

## Milestone 1: MisterT ERP Stress Testing

### Phases

- [x] **Phase 1: Engine Fixes** - Corrige os 4 bugs críticos que invalidam resultados de teste
- [ ] **Phase 2: Credentials System** - Interface gráfica para configuração de credenciais MisterT
- [ ] **Phase 3: Preset System** - Preset MisterT Completo built-in e CRUD de presets do usuário
- [ ] **Phase 4: Module Selector** - Seleção granular de módulos via checkboxes no preset MisterT
- [ ] **Phase 5: Error Filters** - Filtros de operação e período de tempo no ErrorExplorer
- [ ] **Phase 6: Cross-Test Analysis** - Análise comparativa de erros entre múltiplos testes históricos
- [ ] **Phase 7: PDF Capacity Verdict** - Veredicto explícito de capacidade no relatório PDF para liderança

---

## Phase Details

### Phase 1: Engine Fixes
**Goal:** A ferramenta produz resultados válidos ao testar o MisterT ERP — endereços internos desbloqueados, redirects seguidos corretamente, sessão autenticada reaproveitada por VU e arrays de latência com limite de memória
**Depends on:** Nothing (first phase)
**Requirements:** ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04
**Success Criteria:**
1. Usuário pode iniciar teste contra endereços 10.*/192.168.* com `STRESSFLOW_ALLOW_INTERNAL=true` sem receber erro "Endereço bloqueado" — a ferramenta envia a primeira requisição para o MisterT sem rejeição
2. O parâmetro `{{CTRL}}` é extraído corretamente após os redirects 302 do ASP Classic — URLs das requisições subsequentes contêm o valor real de CTRL (ex: `?CTRL=12345`), não a string literal `{{CTRL}}`
3. Cada usuário virtual autentica uma única vez ao iniciar seu ciclo de vida e reutiliza a sessão nas operações de módulo em loop, re-autenticando apenas quando recebe 302 redirecionando para a página de login
4. Teste de 10 minutos com 100 VUs e 10 operações completa sem crescimento anormal de memória — os arrays de latência por operação permanecem limitados a no máximo 100.000 entradas, igual ao reservoir global
**Plans:** 2/2 plans executed (COMPLETE)

Plans:
- [x] 01-01-PLAN.md — ENGINE-01 (guard SSRF rede interna) + ENGINE-04 (reservoir cap opMetrics)
- [x] 01-02-PLAN.md — ENGINE-02 (redirect following) + ENGINE-03 (VU loop reestruturado)

### Phase 2: Credentials System
**Goal:** Usuário configura credenciais MisterT (usuário, senha) diretamente na interface gráfica sem editar arquivos manualmente, e a tela principal sinaliza quando as credenciais obrigatórias estão ausentes
**Depends on:** Phase 1
**Requirements:** CRED-01, CRED-02
**Success Criteria:**
1. Usuário preenche usuário e senha em campos mascarados e clica "Salvar" — as credenciais são persistidas no `.env` sem que o usuário abra um editor de texto ou terminal
2. A tela principal exibe alerta visual visível quando as credenciais obrigatórias não estão configuradas, com caminho direto para a tela de configuração
3. Ao abrir a ferramenta com credenciais já salvas, o alerta não aparece e o botão "Iniciar Teste" está acessível
4. O renderer nunca exibe os valores das credenciais — apenas confirmação de que estão salvas; os valores trafegam exclusivamente no main process
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md — IPC infrastructure + types + Zustand store (credentials:status, credentials:save, credentials:load channels)
- [x] 02-02-PLAN.md — UI components + wiring (CredentialsSettings, CredentialAlert, Sidebar, App, TestConfig)

### Phase 3: Preset System
**Goal:** Usuário executa o fluxo MisterT completo com um clique usando o preset built-in, e pode salvar, carregar, renomear e deletar suas próprias configurações de teste recorrentes
**Depends on:** Phase 2
**Requirements:** PRESET-01, PRESET-02
**Success Criteria:**
1. O preset "MisterT Completo" aparece na lista de presets sem nenhuma configuração manual — disponível imediatamente no primeiro uso da ferramenta
2. Aplicar o preset "MisterT Completo" carrega as 10 operações corretas (Login + 9 módulos com extração de CTRL) no formulário de configuração com um único clique
3. Usuário pode salvar a configuração atual como preset nomeado, carregar, renomear e deletar presets criados por ele
4. Presets salvos pelo usuário persistem corretamente após fechar e reabrir a aplicação
**Plans:** 1/2 plans executed

Plans:
- [x] 03-01-PLAN.md — Backend infrastructure: types, Zustand store, migration v3, repository CRUD, IPC bridge (4 channels)
- [ ] 03-02-PLAN.md — UI components: PresetModal, SavePresetDialog, TestConfig toolbar integration + human verification

### Phase 4: Module Selector
**Goal:** Usuário seleciona via checkboxes quais módulos do MisterT incluir em um teste específico, sem precisar criar um preset do zero ou editar JSON
**Depends on:** Phase 3
**Requirements:** PRESET-03
**Success Criteria:**
1. Ao selecionar o preset MisterT, checkboxes individuais para cada um dos 9 módulos ficam visíveis e todos marcados por padrão
2. Desmarcar um módulo remove apenas a operação desse módulo do teste sem afetar os demais módulos selecionados
3. Aplicar seleção parcial (ex: apenas Estoque + Financeiro) inicia o teste com as operações de Login seguidas apenas dos módulos selecionados — o JSON de configuração não contém os módulos desmarcados
4. O comportamento sem seleção explícita é idêntico ao preset anterior: todos os 9 módulos incluídos, sem regressão
**Plans:** TBD
**UI hint:** yes

### Phase 5: Error Filters
**Goal:** Usuário localiza erros específicos no ErrorExplorer filtrando por nome de operação e por intervalo de data/hora, sem navegar por resultados irrelevantes de outros testes ou operações
**Depends on:** Phase 1
**Requirements:** ANALYTICS-01, ANALYTICS-02
**Success Criteria:**
1. Dropdown "Operação" no ErrorExplorer lista os nomes de operação distintos presentes nos erros armazenados — selecionar "Login" exibe apenas erros originados na operação de Login
2. Usuário pode definir data/hora de início e fim para limitar os erros exibidos ao período de execução de um teste específico
3. Combinar os filtros de operação + período + status HTTP retorna corretamente a interseção dos critérios, sem resultados duplicados ou ausentes
4. Os novos filtros não quebram os filtros existentes de status HTTP e tipo de erro — nenhuma regressão no comportamento anterior do ErrorExplorer
**Plans:** TBD
**UI hint:** yes

### Phase 6: Cross-Test Analysis
**Goal:** Usuário compara a distribuição de erros entre múltiplos testes históricos para identificar se erros em uma operação específica estão piorando com o tempo ou com o aumento de carga
**Depends on:** Phase 5
**Requirements:** ANALYTICS-03
**Success Criteria:**
1. Nova entrada "Análise de Erros" na sidebar navega para a tela de análise cross-test sem perder o estado da tela atual
2. Usuário pode selecionar dois ou mais testes do histórico para comparar a distribuição de erros lado a lado
3. A tela exibe a contagem de erros por operação para cada teste selecionado, permitindo identificar operações com degradação crescente entre execuções
4. Erros de uma operação que crescem proporcionalmente com o número de VUs ficam imediatamente distinguíveis na comparação visual — o padrão de degradação é acionável sem precisar exportar dados
**Plans:** TBD
**UI hint:** yes

### Phase 7: PDF Capacity Verdict
**Goal:** O relatório PDF inclui veredicto explícito de capacidade com linguagem executiva, eliminando a necessidade de interpretação técnica para apresentação à liderança
**Depends on:** Phase 1
**Requirements:** ANALYTICS-04
**Success Criteria:**
1. A página "Resumo para Gestores" do PDF contém frase explícita de veredicto: "O sistema suportou X usuários simultâneos com tempo de resposta médio de Yms e taxa de erro de Z%"
2. O veredicto é gerado automaticamente a partir dos campos do `TestResult` existente — o usuário não precisa configurar nada adicional para obtê-lo
3. Quando a taxa de erro aumenta com o número de VUs, o relatório inclui uma linha de contexto sobre o comportamento esperado do limite de threads do IIS, sem jargão técnico excessivo
4. Um gestor não-técnico consegue entender a conclusão de capacidade lendo apenas a primeira página do PDF, sem precisar consultar os gráficos de percentis
**Plans:** TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Engine Fixes | 2/2 | Complete | 2026-04-06 |
| 2. Credentials System | 0/2 | Planned | - |
| 3. Preset System | 1/2 | In Progress|  |
| 4. Module Selector | 0/0 | Not started | - |
| 5. Error Filters | 0/0 | Not started | - |
| 6. Cross-Test Analysis | 0/0 | Not started | - |
| 7. PDF Capacity Verdict | 0/0 | Not started | - |

---

*Roadmap criado em 2026-04-06 — Milestone 1: MisterT ERP Stress Testing*
*Atualizado via `/gsd-transition` após cada transição de fase*
