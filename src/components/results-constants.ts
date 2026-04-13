/**
 * Constantes de exibicao para a tela de resultados do teste de estresse.
 *
 * Todas as descrições são escritas em linguagem acessível para que
 * qualquer pessoa — tecnica ou não — consiga interpretar os resultados.
 */

// ---------------------------------------------------------------------------
// Explicacoes das métricas
// ---------------------------------------------------------------------------

export const METRIC_EXPLANATIONS: Record<string, string> = {
  rps:
    "Requisições por segundo (RPS) indicam quantas solicitações o servidor " +
    "atendeu a cada segundo durante o teste. Pense nisso como o número de " +
    "clientes que um caixa de supermercado consegue atender por minuto: " +
    "quanto maior o valor, maior a capacidade do servidor.",

  latencyAvg:
    "Latência média é o tempo que o servidor demorou, em média, para " +
    "responder a cada solicitação. É como o tempo médio de espera em uma " +
    "fila: quanto menor, mais rápida é a experiência do usuário.",

  latencyP50:
    "Metade de todas as requisições foi respondida nesse tempo ou menos. " +
    "Esse valor representa a experiência típica da maioria dos usuários — " +
    "como a nota mediana de uma turma, que mostra o desempenho do aluno " +
    "que está exatamente no meio.",

  latencyP90:
    "90% das requisições foram respondidas nesse tempo ou menos, e apenas " +
    "10% demoraram mais. É como dizer que 9 em cada 10 entregas chegaram " +
    "dentro desse prazo — um bom indicador de consistência.",

  latencyP95:
    "95% das requisições foram respondidas nesse tempo ou menos. Apenas " +
    "5% dos acessos foram mais lentos. Esse indicador ajuda a entender se " +
    "o servidor se comporta de forma estável mesmo sob pressão.",

  latencyP99:
    "99% das requisições foram respondidas nesse tempo ou menos. Esse " +
    "valor revela os piores casos de lentidão — como a última pessoa a " +
    "ser atendida em um dia de grande movimento. Se esse número for muito " +
    "alto, alguns usuários podem ter uma experiência ruim.",

  latencyMin:
    "O menor tempo de resposta registrado durante todo o teste. Representa " +
    "o melhor cenário possível — como o cliente que chegou ao caixa vazio " +
    "e foi atendido instantaneamente.",

  latencyMax:
    "O maior tempo de resposta registrado durante todo o teste. Representa " +
    "o pior cenário — como o cliente que pegou a maior fila do dia. " +
    "Valores muito altos podem indicar gargalos no servidor.",

  errorRate:
    "Porcentagem de requisições que falharam em relação ao total enviado. " +
    "É como a taxa de pedidos extraviados de uma transportadora: o ideal " +
    "é que esteja o mais próxima possível de 0%.",

  throughput:
    "Volume de dados transferidos por segundo (ex.: MB/s). Indica a " +
    "capacidade de entrega de dados do servidor sob carga.",

  healthScore:
    "Nota geral de saúde do servidor (0-100), calculada a partir da latência, " +
    "taxa de erros e estabilidade. Resume o desempenho em um indicador único.",
};

// ---------------------------------------------------------------------------
// Descrições dos códigos de status HTTP
// ---------------------------------------------------------------------------

export const STATUS_CODE_LABELS: Record<string, string> = {
  // 2xx — Respostas de sucesso
  "200": "Sucesso — o servidor respondeu corretamente",
  "201": "Criado com sucesso — um novo recurso foi gerado",
  "204": "Sucesso, mas sem conteúdo para exibir",

  // 3xx — Redirecionamentos
  "301": "Redirecionamento permanente — o endereço mudou definitivamente",
  "302": "Redirecionamento temporário — o endereço mudou por enquanto",
  "304": "Conteúdo não modificado — o navegador pode usar a versão em cache",

  // 4xx — Erros do lado do cliente
  "400": "Requisição inválida — o servidor não entendeu o que foi pedido",
  "401": "Não autorizado — é necessário fazer login para acessar",
  "403": "Acesso proibido — você não tem permissão para ver este conteúdo",
  "404": "Página não encontrada — o endereço solicitado não existe",
  "405": "Método não permitido — o tipo de requisição não é aceito aqui",
  "408": "Tempo esgotado — o servidor esperou demais por uma resposta",
  "429": "Muitas requisições — o servidor bloqueou por excesso de acessos",

  // 5xx — Erros do lado do servidor
  "500": "Erro interno — algo inesperado aconteceu no servidor",
  "502":
    "Gateway inválido — o servidor intermediário recebeu uma resposta ruim",
  "503": "Serviço indisponível — o servidor está fora do ar ou sobrecarregado",
  "504":
    "Tempo esgotado no gateway — o servidor intermediário não obteve resposta a tempo",
};

// ---------------------------------------------------------------------------
// Explicacoes do indicador de saude (Health Score)
// ---------------------------------------------------------------------------

export const HEALTH_EXPLANATIONS: Record<string, string> = {
  Excelente:
    "O servidor teve um desempenho excepcional: respondeu com rapidez, " +
    "praticamente sem erros e de forma muito estável. Ele está bem " +
    "preparado para lidar com essa carga de acessos.",

  Bom:
    "O servidor se saiu bem na maior parte do teste, com poucas falhas " +
    "e tempos de resposta aceitáveis. Ainda há espaço para melhorias, " +
    "mas o funcionamento geral é satisfatório.",

  Regular:
    "O servidor apresentou lentidões ou erros perceptíveis durante o " +
    "teste. Isso pode afetar a experiência dos usuários em horários de " +
    "pico. Recomenda-se investigar possíveis otimizações.",

  Crítico:
    "O servidor não conseguiu lidar com a carga de requisições — houve " +
    "muitas falhas ou tempos de resposta extremamente altos. É " +
    "necessário revisar a infraestrutura e aplicar melhorias urgentes.",
};
