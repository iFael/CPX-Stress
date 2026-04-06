# Requisitos v1 — CPX-MisterT Stress

**Baseado em:** Solicitação de Engenharia (Marcel, 23/02/2026) + análise de codebase + pesquisa de ecossistema
**Data:** 2026-04-06
**Contexto:** Brownfield — infraestrutura base já implementada. v1 = correções críticas de engine + features de usabilidade MisterT.

---

## v1 Requirements

### Engine Fixes (pré-requisito para resultados válidos)

- [ ] **ENGINE-01**: Usuário pode configurar a ferramenta para testar hosts em rede interna corporativa (`STRESSFLOW_ALLOW_INTERNAL=true`), desbloqueando o MisterT ERP em endereços `10.*`, `192.168.*`, sem desabilitar a proteção SSRF para uso externo
- [ ] **ENGINE-02**: A ferramenta segue automaticamente redirects 3xx (max 5 hops) em cada requisição, preservando o `CookieJar` e as variáveis extraídas, de modo que `{{CTRL}}` e outros tokens dinâmicos sejam corretamente capturados do HTML final da cadeia de redirects
- [ ] **ENGINE-03**: Cada usuário virtual autentica-se uma única vez ao início do seu ciclo de vida, repete apenas as operações de módulo em loop, e re-autentica automaticamente apenas quando detecta que a sessão expirou (resposta 302 redirecionando para a página de login)
- [ ] **ENGINE-04**: A ferramenta aplica reservoir sampling nos arrays de latência por operação (`opMetrics.latencies`), limitando cada array a no máximo 100.000 entradas — o mesmo comportamento já existente no reservoir global — prevenindo crescimento ilimitado de memória em testes longos

### Credenciais

- [ ] **CRED-01**: Usuário pode preencher credenciais MisterT (usuário, senha, URL base) em uma interface gráfica sem precisar editar manualmente arquivos `.env`, e a ferramenta persiste essas credenciais no arquivo `.env` no diretório de dados da aplicação de forma segura (renderer nunca vê os valores, apenas os nomes das chaves)
- [ ] **CRED-02**: A tela principal exibe indicador visual visível quando as credenciais obrigatórias não estão configuradas, guiando o usuário diretamente para a tela de configuração de credenciais antes de tentar iniciar um teste

### Preset System

- [ ] **PRESET-01**: A ferramenta disponibiliza um preset built-in nomeado "MisterT Completo" com as 10 operações padrão do ERP (Login + 9 módulos com extração de CTRL) configurado e pronto para uso com 1 clique, sem precisar configurar cada operação manualmente
- [ ] **PRESET-02**: Usuário pode salvar a configuração de teste atual como um preset nomeado, carregar, renomear e deletar presets salvos anteriormente, de modo que configurações frequentes não precisem ser reconfiguradas a cada sessão
- [ ] **PRESET-03**: Usuário pode selecionar via checkboxes quais dos 9 módulos do preset MisterT incluir em um teste específico (ex: apenas Estoque + Financeiro), sem precisar editar JSON ou criar um preset do zero

### Analytics e Reporting

- [ ] **ANALYTICS-01**: Usuário pode filtrar os erros armazenados no ErrorExplorer por nome de operação (ex: "Login", "Consulta Estoque"), além dos filtros existentes por status HTTP e tipo de erro
- [ ] **ANALYTICS-02**: Usuário pode filtrar os erros armazenados no ErrorExplorer por intervalo de tempo (data/hora de início e fim do teste)
- [ ] **ANALYTICS-03**: Usuário pode visualizar uma tela de análise cross-test que compara a distribuição de erros entre múltiplos testes históricos, identificando se erros de uma operação específica pioram com o tempo ou com aumento de carga
- [ ] **ANALYTICS-04**: O relatório PDF inclui uma frase explícita de veredicto de capacidade (ex: "O sistema suportou X usuários simultâneos com tempo de resposta médio de Yms e taxa de erro de Z%") adequada para apresentação direta à liderança, como extensão da página "Resumo para Gestores" existente

---

## v2 Requirements (deferred)

- Relatório de capacidade multi-teste com sweep de VUs (ex: 10→25→50→100 usuários) mostrando curva de degradação — requer design decision sobre seleção múltipla no histórico
- Configuração de session affinity para ambientes MisterT com IIS Web Garden (múltiplos worker processes) — depende de confirmação da topologia do servidor
- Notificação ao time via webhook quando um teste excede thresholds configurados (latência P95 > N ms, taxa de erro > X%)
- Dark/light theme toggle — tema dark-only é suficiente para uso interno

---

## Out of Scope

- Testes contra sistemas externos ao ambiente MisterT — ferramenta autorizada exclusivamente para uso interno corporativo
- Suporte a protocolos além de HTTP/HTTPS (WebSocket, gRPC, FTP) — MisterT é ASP Classic sobre HTTP
- Modo cliente-servidor ou uso multi-usuário simultâneo — desktop app para uso individual pela Engenharia
- Autenticação OAuth, SAML, ou outros provedores de identidade — fora do escopo do MisterT ERP
- Testes de penetração ou fuzzing de segurança — ferramenta de carga, não de segurança ofensiva
- Dashboard web ou acesso remoto a resultados — os dados ficam locais no desktop

---

## Traceability

> Preenchido pelo roadmapper ao criar ROADMAP.md

| REQ-ID | Phase | Plans |
|--------|-------|-------|
| ENGINE-01 | — | — |
| ENGINE-02 | — | — |
| ENGINE-03 | — | — |
| ENGINE-04 | — | — |
| CRED-01 | — | — |
| CRED-02 | — | — |
| PRESET-01 | — | — |
| PRESET-02 | — | — |
| PRESET-03 | — | — |
| ANALYTICS-01 | — | — |
| ANALYTICS-02 | — | — |
| ANALYTICS-03 | — | — |
| ANALYTICS-04 | — | — |

---

*Gerado em 2026-04-06 — revisão via `/gsd-transition` após cada fase*
