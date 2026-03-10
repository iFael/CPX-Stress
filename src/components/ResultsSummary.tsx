/**
 * ResultsSummary.tsx
 *
 * Componente que exibe um resumo em linguagem simples dos resultados do teste de estresse.
 * O objetivo e traduzir numeros tecnicos em frases que qualquer pessoa consiga entender,
 * como se um especialista estivesse explicando os resultados de forma amigavel.
 *
 * Funcionalidades:
 *  - Calcula uma "nota de saude" (0 a 100) para o site testado
 *  - Gera um texto explicativo baseado nessa nota
 *  - Detecta se algum sistema de protecao (firewall, anti-DDoS) interferiu no teste
 *  - Apresenta tudo com cores e icones intuitivos
 */

import {
  MessageCircle,
  ThumbsUp,
  AlertTriangle,
  XCircle,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react'
import type { TestResult } from '@/types'

/* ============================================================
   UTILITARIOS
   Funcoes auxiliares usadas por todo o componente.
   ============================================================ */

/**
 * Formata um valor em milissegundos para uma string legivel.
 * Exemplo: 0.3 -> "300us" | 250 -> "250ms" | 1500 -> "1.5s"
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}\u03bcs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Calcula a porcentagem de erros HTTP "graves" (403, 429 e 5xx).
 * Esses codigos indicam bloqueio por protecao ou falha do servidor.
 */
function calcularTaxaErrosHttp(result: TestResult): number {
  const contagemErros = Object.entries(result.statusCodes || {})
    .filter(([codigo]) => codigo === '403' || codigo === '429' || Number(codigo) >= 500)
    .reduce((soma, [, quantidade]) => soma + quantidade, 0)

  return result.totalRequests > 0
    ? (contagemErros / result.totalRequests) * 100
    : 0
}

/* ============================================================
   CALCULO DA NOTA DE SAUDE
   A nota vai de 0 (pessimo) a 100 (perfeito).
   Comecamos com 100 e vamos descontando pontos conforme
   os problemas encontrados — como uma prova escolar.
   ============================================================ */

/**
 * Limites usados para penalizar a nota.
 * Organizados em ordem decrescente de gravidade para cada categoria.
 */
const PENALIDADES_TAXA_ERRO = [
  { limite: 50, desconto: 60 },
  { limite: 20, desconto: 40 },
  { limite: 5, desconto: 25 },
  { limite: 1, desconto: 15 },
  { limite: 0.5, desconto: 5 },
] as const

const PENALIDADES_ERROS_HTTP = [
  { limite: 50, desconto: 40 },
  { limite: 20, desconto: 25 },
  { limite: 5, desconto: 10 },
] as const

const PENALIDADES_LATENCIA_P95 = [
  { limite: 10000, desconto: 30 },
  { limite: 5000, desconto: 20 },
  { limite: 2000, desconto: 15 },
  { limite: 1000, desconto: 10 },
  { limite: 500, desconto: 5 },
] as const

const PENALIDADES_DISPARIDADE = [
  { limite: 20, desconto: 15 },
  { limite: 10, desconto: 10 },
  { limite: 5, desconto: 5 },
] as const

/**
 * Aplica a primeira penalidade cujo limite e ultrapassado.
 * Percorre a lista de penalidades e retorna o desconto do primeiro match.
 */
function aplicarPenalidade(
  valor: number,
  penalidades: ReadonlyArray<{ limite: number; desconto: number }>,
): number {
  for (const { limite, desconto } of penalidades) {
    if (valor > limite) return desconto
  }
  return 0
}

/**
 * Calcula a "nota de saude" do site com base nos resultados do teste.
 *
 * Analogia simples: imagine que o site comeca com nota 100 (perfeita).
 * Cada problema encontrado desconta pontos:
 *   - Muitas falhas? Perde pontos.
 *   - Respostas lentas? Perde pontos.
 *   - Servidor bloqueando acessos? Perde pontos.
 *   - Tempo de resposta muito inconsistente? Perde pontos.
 */
function calcularNotaDeSaude(result: TestResult): number {
  const taxaErrosHttp = calcularTaxaErrosHttp(result)

  /* --- Situacoes criticas: nota minima direto --- */

  // Se quase todas as conexoes falharam, o site esta fora do ar
  const falhaTotal =
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)

  if (falhaTotal) return 0

  // Se o sistema de protecao bloqueou quase tudo (90%+), nao ha dados uteis
  if (taxaErrosHttp >= 90) return 5

  /* --- Calculo progressivo: comeca em 100 e desconta --- */
  let nota = 100

  // Desconto por taxa de erro de conexao (requisicoes que nem chegaram ao servidor)
  nota -= aplicarPenalidade(result.errorRate, PENALIDADES_TAXA_ERRO)

  // Desconto por respostas HTTP de erro (servidor respondeu, mas com erro)
  nota -= aplicarPenalidade(taxaErrosHttp, PENALIDADES_ERROS_HTTP)

  // Se o servidor nao enviou nenhum dado, algo esta muito errado
  if (result.totalBytes === 0 && result.totalRequests > 0) {
    nota -= 30
  }

  // Desconto por lentidao (baseado no percentil 95 — o tempo que 95% dos acessos ficou abaixo)
  nota -= aplicarPenalidade(result.latency.p95, PENALIDADES_LATENCIA_P95)

  // Desconto por inconsistencia: quando o tempo mais lento e muito diferente do tipico
  // (imagine uma fila de banco onde a maioria espera 5min, mas alguns esperam 2 horas)
  const disparidade = result.latency.p50 > 0
    ? result.latency.p99 / result.latency.p50
    : 1
  nota -= aplicarPenalidade(disparidade, PENALIDADES_DISPARIDADE)

  // Garante que a nota fique entre 0 e 100
  return Math.max(0, Math.min(100, nota))
}

/* ============================================================
   DETECCAO DE PROTECAO (WAF / Rate Limiter / Anti-DDoS)
   Verifica se algum sistema de seguranca interferiu no teste.
   ============================================================ */

interface InfoProtecao {
  detectada: boolean
  provedor?: string
}

/**
 * Verifica se o teste foi afetado por algum sistema de protecao.
 * Exemplo: Cloudflare bloqueando requisicoes por excesso de trafego.
 */
function verificarProtecaoAtiva(result: TestResult): InfoProtecao {
  const relatorio = result.protectionReport
  if (!relatorio) return { detectada: false }

  // Procura por padroes de bloqueio ou limitacao de trafego
  const padraoDeProtecao = relatorio.behavioralPatterns.find(
    (p) => p.type === 'blocking' || p.type === 'throttling',
  )
  const limitacaoDetectada = relatorio.rateLimitInfo.detected

  if (!padraoDeProtecao && !limitacaoDetectada) return { detectada: false }

  // Tenta identificar qual provedor de protecao esta atuando (ex: Cloudflare, Akamai)
  const provedor =
    relatorio.detections.length > 0 && relatorio.detections[0].provider !== 'unknown'
      ? relatorio.detections[0].provider.charAt(0).toUpperCase() +
        relatorio.detections[0].provider.slice(1)
      : undefined

  return { detectada: true, provedor }
}

/* ============================================================
   GERACAO DE TEXTOS EXPLICATIVOS
   Textos escritos em linguagem simples, como se um especialista
   estivesse explicando para alguem sem conhecimento tecnico.
   ============================================================ */

/**
 * Gera uma frase de destaque curta baseada na nota do site.
 * E o "titulo" do resumo — a primeira coisa que o usuario le.
 */
function gerarTituloDaNota(nota: number): string {
  if (nota >= 80) return 'Desempenho est\u00e1vel sob carga'
  if (nota >= 60) return 'Desempenho aceit\u00e1vel com ressalvas'
  if (nota >= 40) return 'Degrada\u00e7\u00e3o de desempenho detectada'
  return 'Falha sob carga aplicada'
}

/**
 * Gera o texto principal do resumo, explicando os resultados
 * com linguagem acessivel e analogias do dia a dia.
 *
 * Cada faixa de nota tem uma explicacao adaptada aos dados reais do teste.
 */
function gerarTextoDoResumo(result: TestResult): string {
  const nota = calcularNotaDeSaude(result)
  const usuarios = result.config.virtualUsers
  const duracao = result.config.duration
  const p95 = result.latency.p95

  // Nota alta (80-100): site saudavel
  if (nota >= 80) {
    return (
      `O servidor respondeu de forma est\u00e1vel a ${usuarios} conex\u00f5es simult\u00e2neas durante ${duracao} segundos. ` +
      `Lat\u00eancia m\u00e9dia de ${formatMs(result.latency.avg)} com taxa de falha de ${result.errorRate}%. ` +
      `Desempenho dentro dos par\u00e2metros esperados para a carga aplicada.`
    )
  }

  // Nota boa (60-79): funcional, mas com ressalvas
  if (nota >= 60) {
    if (p95 > 1000) {
      return (
        `Com ${usuarios} conex\u00f5es simult\u00e2neas, o servidor manteve a disponibilidade, ` +
        `por\u00e9m apresentou degrada\u00e7\u00e3o de lat\u00eancia \u2014 P95 atingiu ${formatMs(p95)}. ` +
        `A maioria das requisi\u00e7\u00f5es foi conclu\u00edda com sucesso.`
      )
    }
    return (
      `O servidor apresentou desempenho aceit\u00e1vel com ${usuarios} conex\u00f5es simult\u00e2neas. ` +
      `Houve oscila\u00e7\u00f5es pontuais de lat\u00eancia e algumas falhas isoladas, ` +
      `mas a disponibilidade geral foi mantida.`
    )
  }

  // Nota regular (40-59): problemas perceptiveis
  if (nota >= 40) {
    return (
      `O servidor apresentou dificuldades sob carga de ${usuarios} conex\u00f5es simult\u00e2neas. ` +
      `P95 de lat\u00eancia atingiu ${formatMs(p95)} e ` +
      `${result.errorRate}% das requisi\u00e7\u00f5es resultaram em falha. ` +
      `Indica necessidade de otimiza\u00e7\u00e3o para essa faixa de carga.`
    )
  }

  // Nota critica (0-39): falha grave
  return (
    `O servidor n\u00e3o suportou a carga de ${usuarios} conex\u00f5es simult\u00e2neas. ` +
    `${result.errorRate}% das requisi\u00e7\u00f5es falharam, com P95 de lat\u00eancia em ${formatMs(p95)}. ` +
    `O servidor ficou sobrecarregado e n\u00e3o conseguiu processar as requisi\u00e7\u00f5es recebidas.`
  )
}

/**
 * Gera um texto complementar explicando a deteccao de protecao, se houver.
 * Exemplo: "Uma protecao de seguranca (Cloudflare) foi detectada..."
 */
function gerarTextoDeProtecao(result: TestResult): string | null {
  const { detectada, provedor } = verificarProtecaoAtiva(result)
  if (!detectada) return null

  const nomeProvedor = provedor ? ` (${provedor})` : ''

  return (
    `Prote\u00e7\u00e3o de seguran\u00e7a${nomeProvedor} detectada. Parte das requisi\u00e7\u00f5es foi bloqueada ` +
    `por mecanismos de defesa do servidor (WAF, rate limiter ou anti-DDoS). ` +
    `Os resultados podem n\u00e3o refletir a capacidade real da aplica\u00e7\u00e3o.`
  )
}

/* ============================================================
   ESTILOS VISUAIS
   Cores, icones e estilos baseados na nota de saude.
   ============================================================ */

/** Retorna as classes CSS de fundo e borda de acordo com a faixa de nota. */
function obterEstiloDeFundo(nota: number): string {
  if (nota >= 80) return 'bg-emerald-500/5 border-emerald-500/20'
  if (nota >= 60) return 'bg-blue-400/5 border-blue-400/20'
  if (nota >= 40) return 'bg-amber-400/5 border-amber-400/20'
  return 'bg-red-400/5 border-red-400/20'
}

/** Retorna as classes CSS para a cor do texto de destaque. */
function obterCorDoTexto(nota: number): string {
  if (nota >= 80) return 'text-sf-success'
  if (nota >= 60) return 'text-blue-400'
  if (nota >= 40) return 'text-sf-warning'
  return 'text-sf-danger'
}

/** Retorna o icone principal que acompanha o resumo. */
function obterIcone(nota: number) {
  if (nota >= 80) return <ThumbsUp className="w-5 h-5 text-sf-success shrink-0" />
  if (nota >= 60) return <MessageCircle className="w-5 h-5 text-blue-400 shrink-0" />
  if (nota >= 40) return <AlertTriangle className="w-5 h-5 text-sf-warning shrink-0" />
  return <XCircle className="w-5 h-5 text-sf-danger shrink-0" />
}

/* ============================================================
   COMPONENTES VISUAIS AUXILIARES
   Pequenos componentes reutilizaveis para o layout do resumo.
   ============================================================ */

/** Exibe uma "pilula" com um dado rapido (ex: "120 req/s", "45ms"). */
function PilulaDeMetrica({
  icone,
  rotulo,
  valor,
}: {
  icone: React.ReactNode
  rotulo: string
  valor: string
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sf-surface/60 border border-sf-border/50">
      {icone}
      <span className="text-[11px] text-sf-textMuted">{rotulo}</span>
      <span className="text-xs font-semibold text-sf-text font-mono">{valor}</span>
    </div>
  )
}

/* ============================================================
   COMPONENTE PRINCIPAL
   O ResultsSummary e o cartao que aparece no topo dos resultados,
   dando ao usuario uma visao geral antes dos detalhes tecnicos.
   ============================================================ */

export function ResultsSummary({ result }: { result: TestResult }) {
  const nota = calcularNotaDeSaude(result)
  const titulo = gerarTituloDaNota(nota)
  const textoResumo = gerarTextoDoResumo(result)
  const textoProtecao = gerarTextoDeProtecao(result)

  return (
    <div className={`rounded-xl border ${obterEstiloDeFundo(nota)} overflow-hidden`}>
      {/* Cabecalho com icone e titulo de destaque */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{obterIcone(nota)}</div>

          <div className="flex-1 space-y-2">
            {/* Titulo principal — frase curta e direta */}
            <p className={`text-sm font-semibold ${obterCorDoTexto(nota)}`}>
              {titulo}
            </p>

            {/* Texto explicativo — a explicacao completa em linguagem simples */}
            <p className="text-sm text-sf-text leading-relaxed">
              {textoResumo}
            </p>

            {/* Metricas rapidas — dados-chave acessiveis de relance */}
            <div className="flex flex-wrap gap-2 pt-1">
              <PilulaDeMetrica
                icone={<TrendingUp className="w-3 h-3 text-sf-primary" />}
                rotulo="Velocidade"
                valor={`${result.rps.toLocaleString('pt-BR')} req/s`}
              />
              <PilulaDeMetrica
                icone={<Zap className="w-3 h-3 text-sf-accent" />}
                rotulo="Resposta"
                valor={formatMs(result.latency.avg)}
              />
              <PilulaDeMetrica
                icone={<AlertTriangle className="w-3 h-3 text-sf-warning" />}
                rotulo="Falhas"
                valor={`${result.errorRate}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de protecao — aparece somente se um sistema de seguranca foi detectado */}
      {textoProtecao && (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-lg bg-sf-surface/40 border border-sf-border/30 px-3 py-2.5">
          <Shield className="w-4 h-4 text-sf-warning shrink-0 mt-0.5" />
          <p className="text-xs text-sf-textSecondary leading-relaxed">
            {textoProtecao}
          </p>
        </div>
      )}
    </div>
  )
}
