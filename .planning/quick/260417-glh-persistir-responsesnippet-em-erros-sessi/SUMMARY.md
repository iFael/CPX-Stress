## Resultado

- Runner temporário executado com configuração equivalente ao preset built-in `builtin-mistert-01-baseline-10vus`.
- A execução completa gerou o arquivo `rerun-preset1-output.json` nesta pasta com o resultado bruto, erros e snippets.
- O run novo (`881cdfc7-b634-4b2e-a62e-e4c300b7ad8d`) continuou `degraded`, mas melhorou em relação ao último persistido (`6ae58379-3070-4fa5-8058-c8e654ccebe7`):
  - requests: 263 -> 252 (`-11`)
  - errors: 53 -> 40 (`-13`)
  - error_rate: 20.15% -> 15.87% (`-4.28 pp`)
- A correção de Financeiro reduziu o problema mais grave anterior:
  - antes: 16 erros / 100% / 13 `sessionExpiredErrors`
  - agora: 5 erros / 21.74% / 0 `sessionExpiredErrors`
- A nova persistência de `responseSnippet` em `sessionInvalid` provou o novo foco residual:
  - `Sessões Especiais` gerou 2 erros `unknown` com snippet não vazio.
  - O conteúdo retornado não parece página de login nem a tela esperada de Sessões Especiais; o snippet mostra carregamento de scripts AQM (`_32_13_AQM_CONTE.js`, `_32_21_AQM_REQUI.js`, `CnfAqmOpUpLoad`), indicando resposta de contexto incorreto/bootstrap alternativo com HTTP 200.

## Implicação

- O ajuste de validação de Financeiro removeu o falso positivo dominante.
- A degradação geral do alvo continua existindo pelos 38 timeouts.
- O próximo alvo técnico a investigar é `Sessões Especiais`, agora com evidência concreta de conteúdo retornado.

## Atualização Pós-Paridade da Engine

- A engine foi alinhada com o validador em dois pontos estruturais:
  - limite de body para extração/validação passou a compartilhar o mesmo teto de `2.097.152` bytes;
  - o caminho com worker thread passou a aplicar `expectedAnyText`, `rejectLoginLikeContent` e `failureMessage`, como já ocorria no caminho single-thread.
- Nova rerun do mesmo cenário equivalente ao preset 1 gerou o resultado `8ce1fb10-c85d-4114-a8d2-57987ec7ae31`.
- Resultado comparado ao baseline anterior da quick task (`881cdfc7-b634-4b2e-a62e-e4c300b7ad8d`):
  - requests: 252 -> 263 (`+11`)
  - errors: 40 -> 40 (`estável`)
  - error_rate: 15.87% -> 15.21% (`-0.66 pp`)
- O principal ganho de validade foi qualitativo:
  - `Sessões Especiais` permaneceu sem `unknown` com snippet AQM.
  - a rerun inteira caiu para apenas `1` erro `unknown` residual, em `CPX-Rastreio`.
  - todo o restante passou a ser majoritariamente `connect ETIMEDOUT 136.248.76.127:443`, reforçando que o ruído lógico da engine caiu e o residual está concentrado no alvo.

## Atualização com Run Real no App

- Um run real do aplicativo persistido no SQLite (`9a3c26bb-ebc7-4c8d-948a-1e13da8cd7fc`) confirmou que a bateria built-in `MisterT 01 - Baseline (10 VUs)` já está saindo com reancoragem por menu em produção:
  - `flowSelectionMode = deterministic`
  - `requestTimeoutMs = 30000`
  - operações em sequência do tipo `Menu Principal -> CPX-Fretes`, `Menu Principal -> CPX-Rastreio`, `Menu Principal -> Estoque` etc.
- Resultado bruto do run real:
  - `211` requests
  - `41` erros
  - `19,43%` de error rate
  - `40` erros `timeout`
  - `1` erro `unknown`
- O `unknown` residual ficou em `CPX-Rastreio` e o snippet voltou com bootstrap/menu home (`CnfAppMenuFrames`, `obMTMenuHome`), não com AQM.
- As piores operações do run real passaram a ser principalmente os passos de reancoragem:
  - `Menu Principal -> Sessões Especiais`: `6/9` erros
  - `Menu Principal -> Estoque`: `5/14`
  - `Envio de GNREs`: `4/9`
  - `Menu Principal -> Produção`: `4/12`
- Leitura atual:
  - o fix de isolamento de agents permanece válido porque o ruído lógico despencou no app real;
  - a reancoragem por menu trocou falsos 200/contexto errado por mais custo de navegação e mais exposição a timeout;
  - ainda não há evidência suficiente para mexer no fluxo em produção. A próxima hipótese técnica, se o time quiser seguir, é testar um índice inicial determinístico deslocado por VU para reduzir hotspot sem perder cobertura completa.

## Atualização com Offset Inicial por VU

- O experimento focado foi implementado como estratégia opcional `deterministicStartOffsetStrategy = per-vu`, sem alterar o default da engine.
- O runner reduzido ancorado com offset por VU (`rerun-mixed-modules-anchor-offset-output.json`) gerou o resultado `cc6154f2-fccc-410c-9afa-d44c5c035a31`.
- Comparado ao run ancorado anterior (`4d195b72-8cc4-45f3-a3e0-989c8b72ea6b`), o sinal foi forte:
  - requests: `120` -> `176` (`+56`)
  - erros: `21` -> `12` (`-9`)
  - error_rate: `17,5%` -> `6,82%` (`-10,68 pp`)
  - timeouts: `20` -> `10`
- O custo lógico permaneceu baixo o bastante para sustentar a mudança:
  - `unknown` saiu de `1` para `2`, ainda longe do padrão antigo de contaminação ampla;
  - os passos `Menu Principal -> ...` deixaram de concentrar a degradação como no run ancorado sem offset.
- Decisão derivada:
  - a estratégia `per-vu` foi promovida de forma controlada para os presets built-in da bateria MisterT 01-04 em `electron/database/database.ts`;
  - `CURRENT_BUILTIN_VERSION` subiu para `13` para forçar sincronização no app real;
  - os builders e geradores externos (k6, Locust, JMeter) também foram alinhados para preservar a mesma semântica de fluxo quando houver benchmark comparativo.
- Próximo passo objetivo:
  - rerodar o `MisterT 01 - Baseline (10 VUs)` no app real após a sincronização da versão 13 e verificar se o ganho do runner reduzido aparece também no histórico persistido do SQLite.

## Atualização com Preset v13 do SQLite

- O preset built-in sincronizado no banco foi executado diretamente do SQLite via runtime do Electron, sem depender da UI, usando o runner `rerun-builtin-preset-db.ts`.
- O resultado persistido `aba17478-1256-450a-b450-d421d345c80b` confirmou que a versão 13 já sai com:
  - `flowSelectionMode = deterministic`
  - `deterministicStartOffsetStrategy = per-vu`
  - reancoragem por `Menu Principal -> ...`
- Comparado ao run real anterior do baseline (`9a3c26bb-ebc7-4c8d-948a-1e13da8cd7fc`), a transferência do ganho foi parcial:
  - requests: `211` -> `262` (`+51`)
  - erros: `41` -> `42` (`+1`)
  - error_rate: `19,43%` -> `16,03%` (`-3,40 pp`)
  - timeouts: `40` -> `40` (`estável`)
  - unknown: `1` -> `2`
- Leitura prática:
  - o offset por VU melhorou o rendimento global do baseline completo e reduziu a taxa relativa de erro;
  - o gargalo dominante continua sendo timeout real do alvo, não a semântica da engine;
  - o ruído lógico permaneceu baixo, mas não zerou: os 2 `unknown` vieram de `Ordens E/S` e `CPX-Fretes`, ambos com snippet AQM.
- Conclusão atual:
  - a bateria built-in v13 está mais confiável do que a anterior para medir degradação real;
  - o ganho amplo de `timeouts` observado no runner reduzido não se repetiu integralmente no baseline completo, então não há base para uma nova mudança de produção às cegas.
- Próximo experimento justificável:
  - se for necessário espremer os 2 `unknown` residuais, isolar `CPX-Fretes` + `Ordens E/S` dentro do cenário ancorado para verificar se o AQM residual depende da composição completa da bateria ou apenas da saturação global do alvo.