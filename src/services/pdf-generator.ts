/**
 * ============================================================================
 * StressFlow - Gerador de Relatorio PDF
 * ============================================================================
 *
 * Este arquivo e responsavel por gerar o relatorio em PDF dos testes de
 * estresse realizados pelo StressFlow. O relatorio inclui:
 *
 *   1. Capa com informacoes gerais do teste
 *   2. Resumo simplificado (para leitores nao-tecnicos)
 *   3. Resumo executivo com metricas principais
 *   4. Graficos de evolucao do teste ao longo do tempo
 *   5. Tabela detalhada de metricas e codigos de resposta
 *   6. Analise de protecao (WAF, CDN, Rate Limiting, etc.)
 *   7. Conclusoes e recomendacoes priorizadas
 *   8. Glossario de termos tecnicos
 *
 * O objetivo e produzir um documento profissional que possa ser entregue
 * tanto para equipes tecnicas quanto para gestores e stakeholders.
 * ============================================================================
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TestResult, ProtectionReport } from '@/types'

// ============================================================================
// Constantes de Layout e Cores
// ============================================================================
// Aqui definimos todas as cores e estilos usados no relatorio.
// Centralizar essas definicoes facilita a manutencao e garante consistencia
// visual em todo o documento.

/** Cor principal da marca StressFlow (roxo/indigo) */
const BRAND_COLOR: [number, number, number] = [79, 70, 229]

/** Cor de destaque secundaria (ciano) */
const ACCENT_COLOR: [number, number, number] = [34, 211, 238]

/** Cores de texto em diferentes niveis de enfase */
const TEXT_PRIMARY: [number, number, number] = [30, 41, 59]
const TEXT_SECONDARY: [number, number, number] = [51, 65, 85]
const TEXT_MUTED: [number, number, number] = [100, 116, 139]
const TEXT_FAINT: [number, number, number] = [148, 163, 184]

/** Cores de fundo e borda para cards e tabelas */
const BG_CARD: [number, number, number] = [241, 245, 249]
const BG_ALTERNATE_ROW: [number, number, number] = [248, 250, 252]
const BORDER_LIGHT: [number, number, number] = [226, 232, 240]

/** Cores para os diferentes niveis de saude/risco */
const COLOR_SUCCESS: [number, number, number] = [34, 197, 94]
const COLOR_INFO: [number, number, number] = [59, 130, 246]
const COLOR_WARNING: [number, number, number] = [245, 158, 11]
const COLOR_ORANGE: [number, number, number] = [249, 115, 22]
const COLOR_DANGER: [number, number, number] = [239, 68, 68]

/** Margem padrao das paginas (em milimetros) */
const PAGE_MARGIN = 20

/** Altura da faixa decorativa no topo de cada pagina */
const TOP_STRIPE_HEIGHT = 4

// ============================================================================
// Estilos padrao para tabelas (jspdf-autotable)
// ============================================================================
// Estas configuracoes sao reutilizadas em todas as tabelas do relatorio
// para manter um visual consistente e profissional.

const TABLE_STYLES = {
  theme: 'plain' as const,
  styles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: TEXT_PRIMARY,
    fontSize: 9,
    cellPadding: 4,
    lineColor: BORDER_LIGHT,
    lineWidth: 0.3,
  },
  headStyles: {
    fillColor: BRAND_COLOR,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 10,
  },
  alternateRowStyles: {
    fillColor: BG_ALTERNATE_ROW,
  },
}

// ============================================================================
// Mapeamentos de labels para o PDF (portugues)
// ============================================================================
// Traduzimos todos os termos tecnicos para portugues, facilitando a
// compreensao por leitores que nao dominam ingles tecnico.

/** Labels para os niveis de risco de protecao */
const RISK_LABELS: Record<string, string> = {
  none: 'Nenhum',
  low: 'Baixo',
  medium: 'M\u00e9dio',
  high: 'Alto',
  critical: 'Cr\u00edtico',
}

/** Cores associadas a cada nivel de risco */
const RISK_COLORS: Record<string, [number, number, number]> = {
  none: COLOR_SUCCESS,
  low: COLOR_INFO,
  medium: COLOR_WARNING,
  high: COLOR_ORANGE,
  critical: COLOR_DANGER,
}

/** Labels para os tipos de protecao detectados */
const PROTECTION_TYPE_LABELS: Record<string, string> = {
  'waf': 'WAF',
  'cdn': 'CDN',
  'rate-limiter': 'Rate Limiting',
  'anti-bot': 'Anti-Bot',
  'ddos-protection': 'DDoS Protection',
  'captcha': 'CAPTCHA/Challenge',
  'unknown': 'Desconhecido',
}

/** Labels para os tipos de padrao comportamental */
const BEHAVIORAL_PATTERN_LABELS: Record<string, string> = {
  throttling: 'Throttling',
  blocking: 'Bloqueio',
  challenge: 'Challenge',
  degradation: 'Degrada\u00e7\u00e3o',
  normal: 'Normal',
}

/** Cores para os niveis de prioridade das recomendacoes */
const PRIORITY_COLORS: Record<string, [number, number, number]> = {
  urgent: COLOR_DANGER,
  important: COLOR_WARNING,
  info: COLOR_INFO,
}

// ============================================================================
// Funcoes Utilitarias de Formatacao
// ============================================================================

/**
 * Formata um valor em bytes para uma unidade legivel (B, KB, MB, GB).
 *
 * Exemplo: 1536 -> "1.50 KB"
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const base = 1024
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1)
  const value = bytes / Math.pow(base, exponent)
  return `${value.toFixed(2)} ${units[exponent]}`
}

/**
 * Formata um valor em milissegundos para a unidade mais adequada.
 *
 * - Menor que 1ms -> microssegundos (ex: "450 us")
 * - Entre 1ms e 1000ms -> milissegundos (ex: "123.45 ms")
 * - Acima de 1000ms -> segundos (ex: "2.35 s")
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} \u03BCs`
  if (ms < 1000) return `${ms.toFixed(2)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/**
 * Extrai o valor final de Y apos uma tabela do autoTable.
 *
 * O jspdf-autotable armazena a posicao final em `doc.lastAutoTable.finalY`,
 * mas essa propriedade nao esta no tipo oficial. Usamos esta funcao para
 * encapsular o acesso e fornecer um valor padrao seguro.
 */
function getLastTableY(doc: jsPDF, fallback: number): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastTable = (doc as any).lastAutoTable
  return (lastTable?.finalY as number) ?? fallback
}

// ============================================================================
// Calculo do Score de Saude
// ============================================================================
// O score de saude (0-100) e a metrica central do relatorio. Ele avalia
// o desempenho geral do site durante o teste, considerando:
//   - Taxa de erros de conexao
//   - Erros HTTP (403, 429, 5xx)
//   - Tempo de resposta (latencia P95)
//   - Disparidade de latencia (P99 vs P50)
//   - Ausencia de dados transferidos (possivel bloqueio)

/** Resultado da avaliacao de saude do site */
interface HealthAssessment {
  /** Score numerico de 0 a 100 */
  score: number
  /** Label legivel: "Excelente", "Bom", "Regular" ou "Critico" */
  label: string
  /** Cor RGB associada ao nivel de saude */
  color: [number, number, number]
  /** Recomendacao tecnica baseada no score */
  recommendation: string
  /** Texto simplificado para leitores nao-tecnicos */
  laypersonText: string
}

/**
 * Calcula o score de saude do site com base nos resultados do teste.
 *
 * O calculo funciona por penalizacoes: comecamos em 100 e subtraimos
 * pontos conforme problemas sao detectados. Quanto mais grave o
 * problema, maior a penalizacao.
 */
function getHealthScore(result: TestResult): HealthAssessment {
  // --- Calcular taxa de erros HTTP (bloqueio por protecao) ---
  // Erros 403 (bloqueado), 429 (limite atingido) e 5xx (erro do servidor)
  // indicam que o servidor recusou ou falhou ao processar as requisicoes.
  const httpErrorCount = Object.entries(result.statusCodes || {})
    .filter(([code]) => code === '403' || code === '429' || Number(code) >= 500)
    .reduce((sum, [, count]) => sum + count, 0)

  const httpErrorRate = result.totalRequests > 0
    ? (httpErrorCount / result.totalRequests) * 100
    : 0

  // --- Caso critico: falha total de conexao ---
  // Se quase todos os acessos falharam ou o servidor nao respondeu nada,
  // o site esta efetivamente fora do ar.
  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return {
      score: 0,
      label: 'Cr\u00edtico',
      color: COLOR_DANGER,
      recommendation:
        'N\u00e3o foi poss\u00edvel conectar ao servidor. Verifique se a URL est\u00e1 correta e o servidor est\u00e1 acess\u00edvel.',
      laypersonText:
        'O site n\u00e3o conseguiu responder aos acessos e precisa de aten\u00e7\u00e3o imediata da equipe t\u00e9cnica.',
    }
  }

  // --- Caso critico: bloqueio quase total via HTTP ---
  // O servidor respondeu, mas recusou quase todas as requisicoes.
  // Isso geralmente indica protecao ativa (WAF, rate-limiter).
  if (httpErrorRate >= 90) {
    return {
      score: 5,
      label: 'Cr\u00edtico',
      color: COLOR_DANGER,
      recommendation:
        'O servidor est\u00e1 bloqueando quase todas as requisi\u00e7\u00f5es via HTTP 403/429/5xx. Prote\u00e7\u00e3o ativa detectada.',
      laypersonText:
        'O sistema de seguran\u00e7a do site bloqueou os acessos do teste. Solicite a libera\u00e7\u00e3o do IP de teste.',
    }
  }

  // --- Calculo progressivo por penalizacoes ---
  let score = 100

  // Penalizacao por taxa de erro de conexao
  if (result.errorRate > 50) score -= 60
  else if (result.errorRate > 20) score -= 40
  else if (result.errorRate > 5) score -= 25
  else if (result.errorRate > 1) score -= 15
  else if (result.errorRate > 0.5) score -= 5

  // Penalizacao por respostas HTTP de erro (WAF/rate-limit/servidor)
  if (httpErrorRate > 50) score -= 40
  else if (httpErrorRate > 20) score -= 25
  else if (httpErrorRate > 5) score -= 10

  // Penalizacao por zero throughput (servidor conectou mas nao enviou dados)
  if (result.totalBytes === 0 && result.totalRequests > 0) score -= 30

  // Penalizacao por latencia alta (tempo de resposta do percentil 95)
  if (result.latency.p95 > 10000) score -= 30
  else if (result.latency.p95 > 5000) score -= 20
  else if (result.latency.p95 > 2000) score -= 15
  else if (result.latency.p95 > 1000) score -= 10
  else if (result.latency.p95 > 500) score -= 5

  // Penalizacao por disparidade de latencia (indica instabilidade)
  // Se o P99 e muito maior que o P50, significa que alguns acessos
  // foram drasticamente mais lentos que a maioria.
  const latencyDisparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1
  if (latencyDisparity > 20) score -= 15
  else if (latencyDisparity > 10) score -= 10
  else if (latencyDisparity > 5) score -= 5

  // Garantir que o score fique entre 0 e 100
  score = Math.max(0, Math.min(100, score))

  // --- Classificacao final baseada no score ---
  if (score >= 80) {
    return {
      score,
      label: 'Excelente',
      color: COLOR_SUCCESS,
      recommendation:
        'O site apresenta performance est\u00e1vel e est\u00e1 preparado para a carga testada.',
      laypersonText:
        'O site est\u00e1 funcionando muito bem e respondeu com rapidez durante todo o teste.',
    }
  }

  if (score >= 60) {
    return {
      score,
      label: 'Bom',
      color: COLOR_INFO,
      recommendation:
        'O site apresenta performance aceit\u00e1vel, mas pode se beneficiar de otimiza\u00e7\u00f5es.',
      laypersonText:
        'O site funciona de forma aceit\u00e1vel, mas ha espaco para melhorias na velocidade.',
    }
  }

  if (score >= 40) {
    return {
      score,
      label: 'Regular',
      color: COLOR_WARNING,
      recommendation:
        'O site apresenta sinais de degrada\u00e7\u00e3o sob carga. Recomenda-se investigar gargalos.',
      laypersonText:
        'O site ficou lento ou instavel durante o teste. Recomenda-se uma revisao t\u00e9cnica.',
    }
  }

  return {
    score,
    label: 'Cr\u00edtico',
    color: COLOR_DANGER,
    recommendation:
      'O site apresenta problemas serios de performance. Acao imediata e recomendada.',
    laypersonText:
      'O site n\u00e3o conseguiu lidar com a quantidade de acessos e precisa de aten\u00e7\u00e3o urgente.',
  }
}

// ============================================================================
// Funcoes de Desenho do PDF
// ============================================================================
// Estas funcoes controlam os elementos visuais reutilizaveis do PDF,
// como fundo de pagina, titulos de secao e cards informativos.

/**
 * Desenha o fundo branco e a faixa decorativa roxa no topo da pagina.
 * Cada nova pagina do relatorio deve chamar esta funcao para manter
 * a identidade visual consistente.
 */
function drawPageBackground(doc: jsPDF): void {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()

  // Fundo branco limpo
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, width, height, 'F')

  // Faixa decorativa roxa no topo (identidade visual StressFlow)
  doc.setFillColor(...BRAND_COLOR)
  doc.rect(0, 0, width, TOP_STRIPE_HEIGHT, 'F')
}

/**
 * Desenha um titulo de secao com sublinhado na cor da marca.
 * Retorna a posicao Y atualizada para o conteudo seguinte.
 */
function drawSectionTitle(doc: jsPDF, title: string, yPos: number): number {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND_COLOR)
  doc.text(title, PAGE_MARGIN, yPos)

  // Linha de sublinhado na cor da marca
  doc.setDrawColor(...BRAND_COLOR)
  doc.setLineWidth(0.8)
  const titleWidth = doc.getTextWidth(title)
  doc.line(PAGE_MARGIN, yPos + 2, PAGE_MARGIN + titleWidth, yPos + 2)

  return yPos + 12
}

/**
 * Desenha um subtitulo menor dentro de uma secao.
 * Retorna a posicao Y atualizada.
 */
function drawSubsectionTitle(doc: jsPDF, title: string, yPos: number): number {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_PRIMARY)
  doc.text(title, PAGE_MARGIN, yPos)
  return yPos + 8
}

/**
 * Verifica se ha espaco suficiente na pagina atual. Se nao houver,
 * cria uma nova pagina e retorna a posicao Y inicial.
 * Isso evita que conteudo seja cortado entre paginas.
 */
function ensureSpace(
  doc: jsPDF,
  currentY: number,
  requiredSpace: number,
  pageHeight: number,
): number {
  if (currentY + requiredSpace > pageHeight - 20) {
    doc.addPage()
    drawPageBackground(doc)
    return 20
  }
  return currentY
}

// ============================================================================
// Secao: Capa do Relatorio
// ============================================================================
// A capa e a primeira impressao do relatorio. Ela apresenta o nome da
// ferramenta, a URL testada, data, configuracoes e o score geral de saude.

function drawCoverPage(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  drawPageBackground(doc)

  // --- Elementos decorativos (circulos da identidade visual) ---
  doc.setFillColor(...BRAND_COLOR)
  doc.circle(pageWidth / 2 - 15, 70, 12, 'F')
  doc.setFillColor(...ACCENT_COLOR)
  doc.circle(pageWidth / 2 + 5, 65, 8, 'F')

  // --- Titulo principal ---
  doc.setTextColor(...TEXT_PRIMARY)
  doc.setFontSize(36)
  doc.setFont('helvetica', 'bold')
  doc.text('StressFlow', pageWidth / 2, 105, { align: 'center' })

  // --- Subtitulo ---
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Relatorio de Teste de Estresse', pageWidth / 2, 118, {
    align: 'center',
  })

  // --- Separador horizontal ---
  doc.setDrawColor(...BORDER_LIGHT)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN + 30, 135, pageWidth - PAGE_MARGIN - 30, 135)

  // --- Informacoes do teste ---
  doc.setFontSize(11)
  doc.setTextColor(...TEXT_MUTED)

  const formattedDate = format(
    new Date(result.startTime),
    "dd 'de' MMMM 'de' yyyy 'as' HH:mm",
    { locale: ptBR },
  )

  const coverLines = [
    `URL: ${result.url}`,
    `Data: ${formattedDate}`,
    `Usuarios Virtuais: ${result.config.virtualUsers}`,
    `Duracao: ${result.config.duration}s`,
  ]

  let y = 150
  for (const line of coverLines) {
    doc.text(line, pageWidth / 2, y, { align: 'center' })
    y += 8
  }

  // --- Badge do score de saude ---
  y += 10
  const badgeWidth = 60
  doc.setFillColor(...health.color)
  doc.roundedRect(
    pageWidth / 2 - badgeWidth / 2,
    y - 6,
    badgeWidth,
    16,
    3,
    3,
    'F',
  )
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`${health.label} (${health.score}/100)`, pageWidth / 2, y + 4, {
    align: 'center',
  })

  // --- Rodape da capa ---
  doc.setTextColor(...TEXT_FAINT)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Gerado por StressFlow v1.0', pageWidth / 2, pageHeight - 15, {
    align: 'center',
  })
}

// ============================================================================
// Secao: Resumo Simplificado (para leitores nao-tecnicos)
// ============================================================================
// Esta secao foi pensada para gestores, diretores e qualquer pessoa que
// precise entender os resultados sem conhecimento tecnico. Usa linguagem
// simples, evita jargoes e foca no impacto pratico para o negocio.

function addLaypersonSummary(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  contentWidth: number,
): void {
  doc.addPage()
  drawPageBackground(doc)
  let y = 20

  y = drawSectionTitle(doc, 'Resumo Simplificado', y)

  // --- Card com o score de saude ---
  // Mostra de forma visual e imediata se o site esta bem ou nao.
  doc.setFillColor(...BG_CARD)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 32, 3, 3, 'F')
  doc.setDrawColor(...BORDER_LIGHT)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 32, 3, 3, 'S')

  // Badge com a nota
  doc.setFillColor(...health.color)
  doc.roundedRect(PAGE_MARGIN + 6, y + 6, 50, 20, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`${health.score}/100`, PAGE_MARGIN + 31, y + 19, { align: 'center' })

  // Label e descricao ao lado da nota
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...health.color)
  doc.text(health.label, PAGE_MARGIN + 64, y + 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_SECONDARY)
  const laypersonDescWidth = contentWidth - 64 - 4
  const laypersonLines = doc.splitTextToSize(health.laypersonText, laypersonDescWidth) as string[]
  doc.text(laypersonLines, PAGE_MARGIN + 64, y + 24)

  y += 40

  // --- O que testamos? ---
  // Explicamos em linguagem simples o que foi feito durante o teste.
  y = drawSubsectionTitle(doc, 'O que testamos?', y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_SECONDARY)

  const testDescription =
    `Simulamos ${result.config.virtualUsers} pessoas acessando o site ` +
    `${result.url} ao mesmo tempo, durante ${result.config.duration} segundos. ` +
    `O objetivo e verificar se o site consegue atender todos esses acessos ` +
    `sem ficar lento ou apresentar erros.`

  const descLines = doc.splitTextToSize(testDescription, contentWidth) as string[]
  doc.text(descLines, PAGE_MARGIN, y)
  y += descLines.length * 5 + 10

  // --- O que encontramos? ---
  // Apresentamos os resultados usando analogias do dia a dia.
  y = drawSubsectionTitle(doc, 'O que encontramos?', y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_SECONDARY)

  const findings = buildLaypersonFindings(result)

  for (const finding of findings) {
    const bulletText = '  \u2022  ' + finding
    const lines = doc.splitTextToSize(bulletText, contentWidth - 4) as string[]
    doc.text(lines, PAGE_MARGIN, y)
    y += lines.length * 5 + 3
  }

  y += 7

  // --- O que recomendamos? ---
  // Sugestoes praticas que nao exigem conhecimento tecnico para entender.
  y = drawSubsectionTitle(doc, 'O que recomendamos?', y)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_SECONDARY)

  const recommendations = buildLaypersonRecommendations(health.score)

  for (const rec of recommendations) {
    const bulletText = '  \u2022  ' + rec
    const lines = doc.splitTextToSize(bulletText, contentWidth - 4) as string[]
    doc.text(lines, PAGE_MARGIN, y)
    y += lines.length * 5 + 3
  }
}

/**
 * Gera a lista de achados do teste em linguagem simples.
 * Cada item explica um aspecto do resultado usando termos do cotidiano.
 */
function buildLaypersonFindings(result: TestResult): string[] {
  const findings: string[] = []

  // Avaliacao da velocidade de resposta
  if (result.latency.avg < 500) {
    findings.push(
      'Velocidade: O site respondeu r\u00e1pido, com tempo m\u00e9dio de resposta de ' +
      formatMs(result.latency.avg) + '. ' +
      'Isso significa que os usuarios n\u00e3o percebem espera ao navegar.',
    )
  } else if (result.latency.avg < 2000) {
    findings.push(
      'Velocidade: O site apresentou alguma lentidao, levando em media ' +
      formatMs(result.latency.avg) + ' para responder. ' +
      'Os usuarios podem notar uma leve demora ao acessar paginas.',
    )
  } else {
    findings.push(
      'Velocidade: O site ficou lento, levando em media ' +
      formatMs(result.latency.avg) + ' para responder cada acesso. ' +
      'Isso causa uma experiencia ruim para os usuarios, que podem desistir de esperar.',
    )
  }

  // Avaliacao da estabilidade (taxa de erros)
  if (result.errorRate < 1) {
    findings.push(
      'Estabilidade: O site se manteve est\u00e1vel durante todo o teste ' +
      '- praticamente nenhum erro foi detectado.',
    )
  } else if (result.errorRate < 5) {
    findings.push(
      `Estabilidade: Alguns erros foram detectados (${result.errorRate}% dos ` +
      `acessos falharam). Isso pode afetar uma parcela pequena dos usuarios.`,
    )
  } else {
    findings.push(
      `Estabilidade: O site apresentou muitos erros - ${result.errorRate}% dos ` +
      `acessos falharam. Isso significa que uma parte significativa dos ` +
      `usuarios n\u00e3o conseguiu acessar o site.`,
    )
  }

  // Capacidade de atendimento
  findings.push(
    `Capacidade: O site processou ${result.rps.toLocaleString('pt-BR')} ` +
    `acessos por segundo, totalizando ` +
    `${result.totalRequests.toLocaleString('pt-BR')} acessos durante o teste.`,
  )

  // Deteccao de protecao
  if (result.protectionReport && result.protectionReport.overallRisk !== 'none') {
    findings.push(
      'Prote\u00e7\u00e3o: Foram detectadas camadas de seguran\u00e7a no site que podem ter ' +
      'interferido nos resultados do teste. Isso n\u00e3o e necessariamente um ' +
      'problema - significa que o site tem mecanismos de defesa ativos.',
    )
  }

  return findings
}

/**
 * Gera recomendacoes em linguagem simples com base no score de saude.
 * As sugestoes sao praticas e voltadas para decisores de negocio.
 */
function buildLaypersonRecommendations(score: number): string[] {
  const recs: string[] = []

  if (score >= 80) {
    recs.push(
      'O site est\u00e1 saudavel. Continue monitorando periodicamente para ' +
      'garantir que o desempenho se mantenha ao longo do tempo.',
    )
    recs.push(
      'Considere testar com mais acessos simultaneos para descobrir o ' +
      'limite m\u00e1ximo de capacidade do site antes de campanhas ou eventos.',
    )
  } else if (score >= 60) {
    recs.push(
      'O site funciona, mas ha espaco para melhoria. Solicite uma revisao ' +
      't\u00e9cnica para otimizar a velocidade de carregamento das paginas.',
    )
    recs.push(
      'Monitore o site em horarios de pico para identificar se o desempenho ' +
      'cai em momentos criticos para o seu negocio.',
    )
  } else if (score >= 40) {
    recs.push(
      'O site apresenta problemas que podem afetar seus usuarios. ' +
      'Recomenda-se solicitar uma analise t\u00e9cnica detalhada.',
    )
    recs.push(
      'Verifique com sua equipe t\u00e9cnica se o servidor tem recursos suficientes ' +
      '(capacidade de processamento e memoria) para o volume de acessos esperado.',
    )
  } else {
    recs.push(
      'O site precisa de aten\u00e7\u00e3o urgente. Os problemas encontrados podem ' +
      'estar impactando seus usuarios neste momento.',
    )
    recs.push(
      'Solicite imediatamente uma revisao t\u00e9cnica completa do servidor e ' +
      'da infraestrutura do site.',
    )
    recs.push(
      'Considere investir em melhorias de infraestrutura para suportar o ' +
      'volume de acessos desejado.',
    )
  }

  return recs
}

// ============================================================================
// Secao: Resumo Executivo
// ============================================================================
// O resumo executivo apresenta as metricas principais em cards visuais,
// seguido da avaliacao de saude com barra de progresso. E voltado para
// leitores que querem uma visao rapida dos numeros.

function addExecutiveSummary(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  contentWidth: number,
  pageHeight: number,
): number {
  doc.addPage()
  drawPageBackground(doc)

  let y = 20
  y = drawSectionTitle(doc, 'Resumo Executivo', y)

  // --- Cards com metricas principais ---
  // Apresentamos os 6 indicadores-chave em um grid 3x2.
  const cardData = [
    {
      label: 'Total de Requests',
      sublabel: 'Quantidade total de acessos realizados',
      value: result.totalRequests.toLocaleString('pt-BR'),
    },
    {
      label: 'Requests/segundo (RPS)',
      sublabel: 'Acessos processados por segundo',
      value: result.rps.toLocaleString('pt-BR'),
    },
    {
      label: 'Taxa de Erro',
      sublabel: 'Porcentagem de acessos que falharam',
      value: `${result.errorRate}%`,
    },
    {
      label: 'Lat\u00eancia M\u00e9dia',
      sublabel: 'Tempo m\u00e9dio de resposta do site',
      value: formatMs(result.latency.avg),
    },
    {
      label: 'Lat\u00eancia P95',
      sublabel: '95% dos acessos responderam neste tempo',
      value: formatMs(result.latency.p95),
    },
    {
      label: 'Throughput',
      sublabel: 'Volume de dados transferidos por segundo',
      value: `${formatBytes(result.throughputBytesPerSec)}/s`,
    },
  ]

  const cardWidth = (contentWidth - 10) / 3
  const cardHeight = 28

  for (let i = 0; i < cardData.length; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const cx = PAGE_MARGIN + col * (cardWidth + 5)
    const cy = y + row * (cardHeight + 5)

    // Fundo do card
    doc.setFillColor(...BG_CARD)
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, 'F')
    doc.setDrawColor(...BORDER_LIGHT)
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, 'S')

    // Label do card
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.setFont('helvetica', 'normal')
    doc.text(cardData[i].label, cx + 4, cy + 7)

    // Sublabel explicativo
    doc.setFontSize(6)
    doc.setTextColor(...TEXT_FAINT)
    doc.text(cardData[i].sublabel, cx + 4, cy + 12)

    // Valor em destaque
    doc.setFontSize(14)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.setFont('helvetica', 'bold')
    doc.text(cardData[i].value, cx + 4, cy + 23)
  }

  y += Math.ceil(cardData.length / 3) * (cardHeight + 5) + 10

  // --- Avaliacao de saude com barra de progresso ---
  y = drawSectionTitle(doc, 'Avaliacao de Saude', y)

  doc.setFillColor(...BG_CARD)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, 'F')
  doc.setDrawColor(...BORDER_LIGHT)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, 'S')

  // Barra de progresso
  const barWidth = contentWidth - 80
  const barX = PAGE_MARGIN + 70
  doc.setFillColor(...BORDER_LIGHT)
  doc.roundedRect(barX, y + 6, barWidth, 8, 2, 2, 'F')
  doc.setFillColor(...health.color)
  doc.roundedRect(barX, y + 6, barWidth * (health.score / 100), 8, 2, 2, 'F')

  // Score numerico
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...health.color)
  doc.text(`${health.score}`, PAGE_MARGIN + 8, y + 15)
  doc.setFontSize(8)
  doc.text('/100', PAGE_MARGIN + 30, y + 15)

  // Texto da recomendacao
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text(health.recommendation, PAGE_MARGIN + 4, y + 26)

  y += 40

  // --- Score pre-bloqueio (quando protecao interferiu) ---
  // Se o teste detectou que uma protecao bloqueou o trafego a partir de
  // determinado segundo, calculamos o score considerando apenas os dados
  // anteriores ao bloqueio. Isso da uma visao mais justa da performance
  // real do servidor, sem a interferencia da protecao.
  y = addPreBlockingScore(doc, result, y, contentWidth, pageHeight)

  return y
}

/**
 * Adiciona o score pre-bloqueio ao relatorio, se aplicavel.
 * Retorna a posicao Y atualizada.
 */
function addPreBlockingScore(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  let y = startY

  if (!result.protectionReport) return y

  // Procurar o padrao de bloqueio com segundo de inicio definido
  const blockingPattern = result.protectionReport.behavioralPatterns.find(
    (p) => p.type === 'blocking' && p.startSecond !== undefined,
  )

  if (!blockingPattern || blockingPattern.startSecond === undefined) return y

  const blockSecond = blockingPattern.startSecond
  const preBlockTimeline = result.timeline.filter((s) => s.second < blockSecond)

  // Precisamos de pelo menos 2 segundos de dados para uma avaliacao confiavel
  if (preBlockTimeline.length < 2) return y

  // Calcular metricas apenas do periodo pre-bloqueio
  const totalReqs = preBlockTimeline.reduce((sum, s) => sum + s.requests, 0)
  const totalErrs = preBlockTimeline.reduce((sum, s) => sum + s.errors, 0)
  const safeTotalReqs = Math.max(totalReqs, 1)

  const preErrorRate = totalReqs > 0
    ? Math.round((totalErrs / totalReqs) * 10000) / 100
    : 0
  const preTotalBytes = preBlockTimeline.reduce(
    (sum, s) => sum + s.bytesReceived, 0,
  )

  // Calcular latencias ponderadas pelo numero de requests por segundo
  const preAvg = preBlockTimeline.reduce(
    (sum, s) => sum + s.latencyAvg * s.requests, 0,
  ) / safeTotalReqs
  const preP50 = preBlockTimeline.reduce(
    (sum, s) => sum + s.latencyP50 * s.requests, 0,
  ) / safeTotalReqs
  const preP90 = preBlockTimeline.reduce(
    (sum, s) => sum + s.latencyP90 * s.requests, 0,
  ) / safeTotalReqs
  const preP95 = preBlockTimeline.reduce(
    (sum, s) => sum + s.latencyP95 * s.requests, 0,
  ) / safeTotalReqs
  const preP99 = preBlockTimeline.reduce(
    (sum, s) => sum + s.latencyP99 * s.requests, 0,
  ) / safeTotalReqs

  const nonEmptySeconds = preBlockTimeline.filter((s) => s.requests > 0)
  const preMin = nonEmptySeconds.length > 0
    ? Math.min(...nonEmptySeconds.map((s) => s.latencyMin))
    : 0
  const preMax = nonEmptySeconds.length > 0
    ? Math.max(...nonEmptySeconds.map((s) => s.latencyMax))
    : 0

  // Agregar status codes do periodo pre-bloqueio
  const preStatusCodes: Record<string, number> = {}
  for (const second of preBlockTimeline) {
    for (const [code, count] of Object.entries(second.statusCodes)) {
      preStatusCodes[code] = (preStatusCodes[code] || 0) + count
    }
  }

  // Criar resultado sintetico para calcular o score pre-bloqueio
  const syntheticResult: TestResult = {
    ...result,
    errorRate: preErrorRate,
    totalBytes: preTotalBytes,
    totalRequests: totalReqs,
    totalErrors: totalErrs,
    statusCodes: preStatusCodes,
    latency: {
      avg: preAvg,
      min: preMin,
      p50: preP50,
      p90: preP90,
      p95: preP95,
      p99: preP99,
      max: preMax,
    },
  }
  const preHealth = getHealthScore(syntheticResult)

  // Verificar espaco na pagina
  y = ensureSpace(doc, y, 30, pageHeight)

  // Desenhar card do score pre-bloqueio
  doc.setFillColor(...BG_CARD)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 24, 2, 2, 'F')
  doc.setDrawColor(...BORDER_LIGHT)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 24, 2, 2, 'S')

  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Score pre-bloqueio (at\u00e9 segundo ${blockSecond - 1}):`,
    PAGE_MARGIN + 4,
    y + 8,
  )

  // Mini barra de progresso
  const preBarWidth = contentWidth - 80
  const preBarX = PAGE_MARGIN + 70
  doc.setFillColor(...BORDER_LIGHT)
  doc.roundedRect(preBarX, y + 4, preBarWidth, 6, 2, 2, 'F')
  doc.setFillColor(...preHealth.color)
  doc.roundedRect(
    preBarX,
    y + 4,
    preBarWidth * (preHealth.score / 100),
    6,
    2,
    2,
    'F',
  )

  // Score e label
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...preHealth.color)
  doc.text(`${preHealth.score}/100 - ${preHealth.label}`, PAGE_MARGIN + 4, y + 20)

  // Nota explicativa
  doc.setFontSize(7)
  doc.setTextColor(...TEXT_FAINT)
  doc.setFont('helvetica', 'normal')
  doc.text(
    'Desconsidera dados ap\u00f3s prote\u00e7\u00e3o bloquear o tr\u00e1fego',
    PAGE_MARGIN + 60,
    y + 20,
  )

  y += 30

  return y
}

// ============================================================================
// Secao: Graficos de Evolucao do Teste
// ============================================================================
// Os graficos mostram como o site se comportou ao longo do tempo durante
// o teste. Sao imagens capturadas da interface e inseridas no PDF.

function addCharts(
  doc: jsPDF,
  chartImages: { rps?: string; latency?: string; errors?: string },
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  let y = startY

  // Verificar se ha pelo menos um grafico para exibir
  if (!chartImages.rps && !chartImages.latency && !chartImages.errors) {
    return y
  }

  y = drawSectionTitle(doc, 'Evolucao do Teste', y)

  const chartHeight = 45

  // Grafico de Requests por Segundo (RPS)
  if (chartImages.rps) {
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(
      'Requests por Segundo (RPS) \u2014 Quantidade de acessos processados a cada segundo',
      PAGE_MARGIN,
      y,
    )
    y += 3
    try {
      doc.addImage(chartImages.rps, 'PNG', PAGE_MARGIN, y, contentWidth, chartHeight)
    } catch {
      /* Falha ao inserir imagem do grafico - continua sem ele */
    }
    y += chartHeight + 8
  }

  // Verificar espaco antes do proximo grafico
  y = ensureSpace(doc, y, chartHeight + 20, pageHeight)

  // Grafico de Latencia
  if (chartImages.latency) {
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(
      'Lat\u00eancia (ms) \u2014 Tempo de resposta do site ao longo do teste',
      PAGE_MARGIN,
      y,
    )
    y += 3
    try {
      doc.addImage(
        chartImages.latency,
        'PNG',
        PAGE_MARGIN,
        y,
        contentWidth,
        chartHeight,
      )
    } catch {
      /* Falha ao inserir imagem do grafico - continua sem ele */
    }
    y += chartHeight + 8
  }

  // Verificar espaco antes do proximo grafico
  y = ensureSpace(doc, y, chartHeight + 20, pageHeight)

  // Grafico de Erros por Segundo
  if (chartImages.errors) {
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(
      'Erros por Segundo \u2014 Quantidade de falhas a cada segundo',
      PAGE_MARGIN,
      y,
    )
    y += 3
    try {
      doc.addImage(
        chartImages.errors,
        'PNG',
        PAGE_MARGIN,
        y,
        contentWidth,
        chartHeight,
      )
    } catch {
      /* Falha ao inserir imagem do grafico - continua sem ele */
    }
    y += chartHeight + 8
  }

  return y
}

// ============================================================================
// Secao: Metricas Detalhadas e Codigos de Status
// ============================================================================
// Estas tabelas apresentam todos os numeros do teste de forma completa.
// Sao voltadas para leitores tecnicos que precisam dos dados brutos.

function addDetailedMetrics(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  let y = ensureSpace(doc, startY, 60, pageHeight)

  y = drawSectionTitle(doc, 'M\u00e9tricas Detalhadas', y)

  // Tabela principal de metricas
  // Cada linha inclui o nome da metrica e uma breve explicacao
  autoTable(doc, {
    startY: y,
    head: [['M\u00e9trica', 'Valor']],
    body: [
      ['Lat\u00eancia M\u00e9dia \u2014 Tempo m\u00e9dio de resposta', formatMs(result.latency.avg)],
      ['Lat\u00eancia M\u00ednima \u2014 Resposta mais r\u00e1pida registrada', formatMs(result.latency.min)],
      ['Lat\u00eancia P50 \u2014 Metade dos acessos respondeu neste tempo', formatMs(result.latency.p50)],
      ['Lat\u00eancia P90 \u2014 90% dos acessos responderam neste tempo', formatMs(result.latency.p90)],
      ['Lat\u00eancia P95 \u2014 95% dos acessos responderam neste tempo', formatMs(result.latency.p95)],
      ['Lat\u00eancia P99 \u2014 99% dos acessos responderam neste tempo', formatMs(result.latency.p99)],
      ['Lat\u00eancia M\u00e1xima \u2014 Resposta mais lenta registrada', formatMs(result.latency.max)],
      ['RPS \u2014 Acessos processados por segundo', result.rps.toLocaleString('pt-BR')],
      ['Total de Requests \u2014 Total de acessos realizados', result.totalRequests.toLocaleString('pt-BR')],
      ['Total de Erros \u2014 Acessos que falharam', result.totalErrors.toLocaleString('pt-BR')],
      ['Taxa de Erro \u2014 Porcentagem de falhas', `${result.errorRate}%`],
      ['Throughput \u2014 Dados transferidos por segundo', `${formatBytes(result.throughputBytesPerSec)}/s`],
      ['Total de Dados \u2014 Volume total transferido', formatBytes(result.totalBytes)],
      ['Duracao Real \u2014 Tempo total do teste', `${result.durationSeconds}s`],
    ],
    ...TABLE_STYLES,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // --- Tabela de Status Codes HTTP ---
  // Os codigos de status indicam como o servidor respondeu a cada acesso.
  const statusCodesEntries = Object.entries(result.statusCodes)

  if (statusCodesEntries.length > 0) {
    let statusY = getLastTableY(doc, y + 80) + 10

    statusY = ensureSpace(doc, statusY, 40, pageHeight)

    statusY = drawSectionTitle(
      doc,
      'Status Codes HTTP \u2014 Codigos de resposta do site',
      statusY,
    )

    autoTable(doc, {
      startY: statusY,
      head: [['Status Code', 'Quantidade', 'Porcentagem']],
      body: statusCodesEntries.map(([code, count]) => [
        code,
        (count as number).toLocaleString('pt-BR'),
        result.totalRequests > 0
          ? `${(((count as number) / result.totalRequests) * 100).toFixed(2)}%`
          : '0%',
      ]),
      ...TABLE_STYLES,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
  }

  return y
}

// ============================================================================
// Secao: Analise de Protecao
// ============================================================================
// Quando o teste detecta que o site possui camadas de protecao ativas
// (WAF, CDN, Rate Limiting, Anti-Bot, etc.), esta secao detalha cada
// protecao encontrada e como ela afetou os resultados do teste.

function addProtectionSection(
  doc: jsPDF,
  report: ProtectionReport,
  contentWidth: number,
  pageHeight: number,
): void {
  doc.addPage()
  drawPageBackground(doc)
  let y = 20

  y = drawSectionTitle(doc, 'An\u00e1lise de Prote\u00e7\u00e3o', y)

  // --- Card do nivel de risco geral ---
  const riskColor = RISK_COLORS[report.overallRisk] ?? RISK_COLORS.none
  const riskLabel = RISK_LABELS[report.overallRisk] ?? 'Desconhecido'

  // Calcular linhas do resumo antes de desenhar o card para ajustar a altura
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const summaryLines = doc.splitTextToSize(report.summary, contentWidth - 8) as string[]
  const riskCardHeight = Math.max(24, 20 + summaryLines.length * 3 + 1)

  doc.setFillColor(...BG_CARD)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, riskCardHeight, 2, 2, 'F')
  doc.setDrawColor(...BORDER_LIGHT)
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, riskCardHeight, 2, 2, 'S')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Nivel de Risco:', PAGE_MARGIN + 4, y + 10)

  // Badge do risco
  doc.setFillColor(...riskColor)
  doc.roundedRect(PAGE_MARGIN + 42, y + 3, 30, 11, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text(riskLabel, PAGE_MARGIN + 57, y + 10, { align: 'center' })

  // Resumo textual
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.setFont('helvetica', 'normal')
  doc.text(summaryLines, PAGE_MARGIN + 4, y + 20)
  y += riskCardHeight + 4

  // --- Tabela de protecoes detectadas ---
  if (report.detections.length > 0) {
    y = ensureSpace(doc, y, 40, pageHeight)
    y = drawSectionTitle(doc, 'Protecoes Detectadas', y)

    autoTable(doc, {
      startY: y,
      head: [['Provedor', 'Tipo', 'Confianca', 'Indicadores']],
      body: report.detections.map((detection) => [
        detection.provider !== 'unknown'
          ? detection.provider.charAt(0).toUpperCase() + detection.provider.slice(1)
          : '\u2014',
        PROTECTION_TYPE_LABELS[detection.type] ?? detection.type,
        `${detection.confidence}% (${
          detection.confidenceLevel === 'high'
            ? 'Alta'
            : detection.confidenceLevel === 'medium'
              ? 'Media'
              : 'Baixa'
        })`,
        detection.indicators
          .map((ind) => `${ind.source}: ${ind.name}`)
          .join(', '),
      ]),
      ...TABLE_STYLES,
      headStyles: {
        ...TABLE_STYLES.headStyles,
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: contentWidth - 88 },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    y = getLastTableY(doc, y + 40) + 8
  }

  // --- Rate Limiting ---
  // Mostra informacoes sobre limite de requisicoes, se detectado.
  if (report.rateLimitInfo.detected) {
    y = ensureSpace(doc, y, 30, pageHeight)
    y = drawSectionTitle(doc, 'Rate Limiting', y)

    const rateLimitData: [string, string][] = [['Status', 'Detectado']]

    if (report.rateLimitInfo.limitPerWindow) {
      rateLimitData.push(['Limite por Janela', report.rateLimitInfo.limitPerWindow])
    }
    if (report.rateLimitInfo.windowSeconds !== undefined) {
      rateLimitData.push(['Janela (segundos)', String(report.rateLimitInfo.windowSeconds)])
    }
    if (report.rateLimitInfo.triggerPoint !== undefined) {
      rateLimitData.push(['Ativado no Segundo', String(report.rateLimitInfo.triggerPoint)])
    }
    if (report.rateLimitInfo.recoveryPattern) {
      rateLimitData.push(['Padrao de Recuperacao', report.rateLimitInfo.recoveryPattern])
    }

    autoTable(doc, {
      startY: y,
      head: [['Par\u00e2metro', 'Valor']],
      body: rateLimitData,
      ...TABLE_STYLES,
      headStyles: {
        fillColor: COLOR_WARNING,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold' as const,
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    y = getLastTableY(doc, y + 30) + 8
  }

  // --- Padroes comportamentais anomalos ---
  // Detecta comportamentos como throttling, bloqueio e degradacao
  // que indicam interferencia de protecao nos resultados.
  const anomalies = report.behavioralPatterns.filter((b) => b.type !== 'normal')

  if (anomalies.length > 0) {
    y = ensureSpace(doc, y, 30, pageHeight)
    y = drawSectionTitle(doc, 'Padroes Comportamentais', y)

    autoTable(doc, {
      startY: y,
      head: [['Tipo', 'Descricao', 'Evidencia']],
      body: anomalies.map((pattern) => [
        BEHAVIORAL_PATTERN_LABELS[pattern.type] ?? pattern.type,
        pattern.description,
        pattern.evidence,
      ]),
      ...TABLE_STYLES,
      headStyles: {
        fillColor: COLOR_ORANGE,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: 'bold' as const,
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: contentWidth - 65 },
        2: { cellWidth: 40 },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
  }
}

// ============================================================================
// Secao: Conclusao e Recomendacoes
// ============================================================================
// As recomendacoes sao priorizadas por urgencia (vermelho), importancia
// (amarelo) e informativo (azul). Cada recomendacao inclui uma explicacao
// acessivel para que qualquer leitor entenda o que precisa ser feito.

/** Estrutura de uma recomendacao no relatorio */
interface Recommendation {
  text: string
  priority: 'urgent' | 'important' | 'info'
}

function addRecommendations(
  doc: jsPDF,
  result: TestResult,
  contentWidth: number,
  pageHeight: number,
): number {
  doc.addPage()
  drawPageBackground(doc)
  let y = 20

  y = drawSectionTitle(doc, 'Conclus\u00e3o e Recomenda\u00e7\u00f5es', y)

  // --- Gerar recomendacoes baseadas nos resultados ---
  const recommendations = buildRecommendations(result)

  // --- Desenhar cada recomendacao ---
  for (const rec of recommendations) {
    y = ensureSpace(doc, y, 8, pageHeight)

    // Separador para recomendacoes gerais
    if (rec.text === '') {
      y += 6
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...TEXT_PRIMARY)
      doc.text('Recomenda\u00e7\u00f5es gerais:', PAGE_MARGIN, y)
      y += 6
      continue
    }

    // Indicador de prioridade (circulo colorido)
    const color = PRIORITY_COLORS[rec.priority]
    doc.setFillColor(...color)
    doc.circle(PAGE_MARGIN + 2, y - 1.5, 1.5, 'F')

    // Texto da recomendacao
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_SECONDARY)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(rec.text, contentWidth - 8) as string[]
    doc.text(lines, PAGE_MARGIN + 7, y)
    y += lines.length * 4.5 + 3
  }

  // --- Legenda de prioridades ---
  y += 4
  if (y + 10 < pageHeight - 20) {
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_FAINT)

    doc.setFillColor(...COLOR_DANGER)
    doc.circle(PAGE_MARGIN + 2, y - 1, 1.2, 'F')
    doc.text('Urgente', PAGE_MARGIN + 6, y)

    doc.setFillColor(...COLOR_WARNING)
    doc.circle(PAGE_MARGIN + 30, y - 1, 1.2, 'F')
    doc.text('Importante', PAGE_MARGIN + 34, y)

    doc.setFillColor(...COLOR_INFO)
    doc.circle(PAGE_MARGIN + 62, y - 1, 1.2, 'F')
    doc.text('Informativo', PAGE_MARGIN + 66, y)

    y += 8
  }

  return y
}

/**
 * Constroi a lista completa de recomendacoes baseada nos resultados do teste.
 *
 * As recomendacoes sao divididas em:
 *   1. Recomendacoes especificas (baseadas nos problemas detectados)
 *   2. Recomendacoes gerais (boas praticas aplicaveis a qualquer site)
 */
function buildRecommendations(result: TestResult): Recommendation[] {
  const recommendations: Recommendation[] = []

  // --- Recomendacoes especificas baseadas nos problemas detectados ---

  if (result.errorRate > 5) {
    recommendations.push({
      text:
        'Taxa de erro elevada detectada. Isso significa que muitos acessos estao ' +
        'falhando. E necessario verificar a capacidade do servidor e possiveis ' +
        'problemas de infraestrutura.',
      priority: 'urgent',
    })
  }

  if (result.latency.p95 > 2000) {
    recommendations.push({
      text:
        'O tempo de resposta est\u00e1 alto para a maioria dos usuarios (P95 acima de ' +
        '2 segundos). Solicite uma otimiza\u00e7\u00e3o t\u00e9cnica do site para melhorar a velocidade.',
      priority: 'urgent',
    })
  }

  if (result.latency.p99 / Math.max(result.latency.p50, 1) > 10) {
    recommendations.push({
      text:
        'Alguns acessos estao muito mais lentos que outros, indicando comportamento ' +
        'instavel. Isso pode significar que certos momentos ou paginas causam lentidao.',
      priority: 'important',
    })
  }

  if (result.rps < result.config.virtualUsers * 0.5) {
    recommendations.push({
      text:
        'O site n\u00e3o est\u00e1 conseguindo processar todos os acessos simultaneos. ' +
        'O servidor pode estar sobrecarregado e precisa de mais recursos.',
      priority: 'urgent',
    })
  }

  // Verificar erros internos do servidor (5xx)
  const hasServerErrors = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) >= 500,
  )
  if (hasServerErrors) {
    recommendations.push({
      text:
        'Foram detectados erros internos do servidor (codigos 5xx). Isso indica ' +
        'falhas que precisam ser investigadas nos logs do sistema.',
      priority: 'urgent',
    })
  }

  // Verificar rate limiting (429)
  const hasRateLimiting = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) === 429,
  )
  if (hasRateLimiting) {
    recommendations.push({
      text:
        'O site est\u00e1 limitando a quantidade de acessos permitidos (Rate Limiting). ' +
        'Para testes de carga mais precisos, solicite um aumento tempor\u00e1rio do limite.',
      priority: 'important',
    })
  }

  // Recomendacoes relacionadas a protecao
  if (result.protectionReport) {
    const pr = result.protectionReport

    if (pr.overallRisk === 'high' || pr.overallRisk === 'critical') {
      recommendations.push({
        text:
          'Prote\u00e7\u00f5es de seguran\u00e7a ativas estao interferindo nos resultados do teste. ' +
          'Para avaliar a performance real do site, solicite que o IP de teste seja ' +
          'liberado temporariamente.',
        priority: 'important',
      })
    }

    const providers = [
      ...new Set(
        pr.detections
          .filter((d) => d.provider !== 'unknown')
          .map((d) => d.provider),
      ),
    ]
    if (providers.length > 0) {
      recommendations.push({
        text:
          `Provedores de prote\u00e7\u00e3o detectados: ${providers.join(', ')}. ` +
          `Considere solicitar whitelist do IP de teste para resultados mais precisos.`,
        priority: 'info',
      })
    }

    if (pr.rateLimitInfo.detected) {
      recommendations.push({
        text:
          'Rate limiting ativo \u2014 reduza o n\u00famero de acessos simultaneos ou solicite ' +
          'aumento tempor\u00e1rio do limite para obter resultados validos.',
        priority: 'important',
      })
    }
  }

  // Se nenhum problema foi encontrado, parabenizar
  if (recommendations.length === 0) {
    recommendations.push({
      text: 'O site se manteve est\u00e1vel durante todo o teste de estresse. Bom trabalho!',
      priority: 'info',
    })
    recommendations.push({
      text: 'Considere testar com mais acessos simultaneos para descobrir o ponto de ruptura do site.',
      priority: 'info',
    })
    recommendations.push({
      text: 'Continue monitorando o site em producao para detectar quedas de desempenho.',
      priority: 'info',
    })
  }

  // --- Recomendacoes gerais (boas praticas) ---
  // Separador visual
  recommendations.push({ text: '', priority: 'info' })

  recommendations.push({
    text:
      'Implemente monitoramento de desempenho em tempo real para detectar ' +
      'problemas antes que afetem os usuarios.',
    priority: 'info',
  })
  recommendations.push({
    text:
      'Configure escalonamento automatico para que o servidor aumente a ' +
      'capacidade em momentos de alto tr\u00e1fego.',
    priority: 'info',
  })
  recommendations.push({
    text:
      'Realize testes de estresse periodicamente, especialmente antes de ' +
      'campanhas, eventos ou datas de alto tr\u00e1fego.',
    priority: 'info',
  })
  recommendations.push({
    text:
      'Utilize CDN para acelerar a entrega de conteudo e cache para ' +
      'respostas frequentes.',
    priority: 'info',
  })

  return recommendations
}

// ============================================================================
// Secao: Configuracao do Teste
// ============================================================================
// Registra todos os parametros usados no teste para fins de auditoria
// e reprodutibilidade.

function addTestConfiguration(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  pageHeight: number,
): void {
  let y = startY + 10

  y = ensureSpace(doc, y, 40, pageHeight)

  y = drawSectionTitle(doc, 'Configura\u00e7\u00e3o do Teste', y)

  autoTable(doc, {
    startY: y,
    head: [['Par\u00e2metro', 'Valor']],
    body: [
      ['URL', result.url],
      ['Metodo HTTP', result.config.method],
      ['Usuarios Virtuais', String(result.config.virtualUsers)],
      ['Duracao Configurada', `${result.config.duration}s`],
      [
        'Ramp-up',
        result.config.rampUp ? `${result.config.rampUp}s` : 'Desabilitado',
      ],
      [
        'Inicio',
        format(new Date(result.startTime), 'dd/MM/yyyy HH:mm:ss', {
          locale: ptBR,
        }),
      ],
      [
        'Fim',
        format(new Date(result.endTime), 'dd/MM/yyyy HH:mm:ss', {
          locale: ptBR,
        }),
      ],
      [
        'Status',
        result.status === 'completed'
          ? 'Concluido'
          : result.status === 'cancelled'
            ? 'Cancelado'
            : 'Erro',
      ],
    ],
    ...TABLE_STYLES,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })
}

// ============================================================================
// Secao: Glossario de Termos Tecnicos
// ============================================================================
// O glossario explica de forma acessivel todos os termos tecnicos usados
// no relatorio. Cada definicao usa linguagem simples e analogias do
// dia a dia para facilitar a compreensao por leitores nao-tecnicos.

function addGlossary(
  doc: jsPDF,
  contentWidth: number,
): void {
  doc.addPage()
  drawPageBackground(doc)
  let y = 20

  y = drawSectionTitle(doc, 'Glossario', y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    'Explicacao dos termos t\u00e9cnicos utilizados neste relatorio.',
    PAGE_MARGIN,
    y,
  )
  y += 8

  // Cada entrada do glossario: [Termo, Explicacao em linguagem simples]
  const glossaryData: [string, string][] = [
    [
      'Lat\u00eancia',
      'Tempo que o site leva para responder ap\u00f3s receber uma solicitacao. ' +
      'E como o tempo de espera na fila de um atendimento \u2014 quanto menor, melhor.',
    ],
    [
      'Lat\u00eancia M\u00e9dia',
      'A media de todos os tempos de resposta durante o teste. ' +
      'Representa o tempo "tipico" que um usuario espera ao acessar o site.',
    ],
    [
      'P50 (mediana)',
      'Metade dos acessos foi respondida em menos que este tempo. ' +
      'Representa a experiencia tipica de um usuario comum.',
    ],
    [
      'P90',
      '90% dos acessos foram respondidos em menos que este tempo. ' +
      'Mostra a experiencia da grande maioria dos usuarios.',
    ],
    [
      'P95',
      '95% dos acessos foram respondidos em menos que este tempo. ' +
      'Os 5% restantes foram mais lentos, possivelmente por picos de carga.',
    ],
    [
      'P99',
      '99% dos acessos foram respondidos em menos que este tempo. ' +
      'Apenas 1% dos acessos foi mais lento \u2014 mostra os piores cenarios.',
    ],
    [
      'RPS (Requests/s)',
      'Quantidade de solicita\u00e7\u00f5es que o site processou por segundo. ' +
      'Quanto maior, mais acessos simultaneos o site consegue atender.',
    ],
    [
      'Taxa de Erro',
      'Porcentagem de acessos que falharam durante o teste. ' +
      'Idealmente deve ser proxima de 0%. Acima de 5% indica problemas.',
    ],
    [
      'Throughput',
      'Volume de dados transferidos por segundo entre o servidor e os usuarios. ' +
      'Indica quanta informacao o site conseguiu entregar no tempo testado.',
    ],
    [
      'Usuarios Virtuais',
      'Quantidade de conex\u00f5es simult\u00e2neas simuladas durante o teste. ' +
      'Cada usuario virtual envia requisi\u00e7\u00f5es HTTP em paralelo.',
    ],
    [
      'Status Code HTTP',
      'Codigo numerico que o servidor retorna indicando o resultado de cada acesso. ' +
      'Exemplos: 200 = sucesso, 404 = pagina n\u00e3o encontrada, 500 = erro do servidor.',
    ],
    [
      'WAF',
      'Web Application Firewall \u2014 sistema de seguran\u00e7a que protege o site contra ' +
      'ataques. Pode bloquear acessos que parecem suspeitos, incluindo testes de carga.',
    ],
    [
      'CDN',
      'Content Delivery Network \u2014 rede de servidores distribuidos pelo mundo que ' +
      'acelera a entrega de conteudo. O usuario recebe dados do servidor mais proximo.',
    ],
    [
      'Rate Limiting',
      'Mecanismo que limita quantos acessos cada usuario pode fazer em um per\u00edodo. ' +
      'Protege o site contra sobrecarga, mas pode interferir em testes de estresse.',
    ],
    [
      'Ramp-up',
      'Per\u00edodo de aquecimento no inicio do teste onde os acessos aumentam gradualmente, ' +
      'em vez de comecar todos de uma vez. Simula um cenario mais realista.',
    ],
    [
      'DDoS Protection',
      'Sistema de defesa contra ataques de negacao de servico distribuidos. ' +
      'Detecta e bloqueia volumes anormais de tr\u00e1fego para manter o site funcionando.',
    ],
    [
      'Score de Saude',
      'Nota de 0 a 100 que avalia o desempenho geral do site durante o teste. ' +
      'Considera velocidade, estabilidade, taxa de erros e consistencia das respostas.',
    ],
    [
      'Teste de Estresse',
      'Simulacao de muitos acessos simultaneos ao site para verificar se ele ' +
      'consegue funcionar bem sob alta demanda, como em Black Friday ou eventos.',
    ],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Termo', 'O que significa']],
    body: glossaryData,
    ...TABLE_STYLES,
    styles: {
      ...TABLE_STYLES.styles,
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 35 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })
}

// ============================================================================
// Rodape de Paginas
// ============================================================================
// Adiciona rodape com numero da pagina, data e identificacao da ferramenta
// em todas as paginas do relatorio.

function addPageFooters(doc: jsPDF, result: TestResult): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const totalPages = doc.getNumberOfPages()
  const formattedDate = format(new Date(result.startTime), 'dd/MM/yyyy HH:mm')

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_FAINT)
    doc.text(
      `StressFlow Report \u2014 ${formattedDate} \u2014 Pagina ${i}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' },
    )
  }
}

// ============================================================================
// Funcao Principal: Gerar o PDF Completo
// ============================================================================
// Esta e a funcao exportada que orquestra toda a geracao do relatorio.
// Ela chama cada secao na ordem correta e retorna o PDF como base64.

/**
 * Gera o relatorio PDF completo a partir dos resultados do teste de estresse.
 *
 * @param result - Resultado completo do teste (metricas, timeline, etc.)
 * @param chartImages - Imagens dos graficos capturadas da interface (base64 PNG)
 * @returns O PDF codificado em base64 (sem o prefixo data URI)
 */
export async function generatePDF(
  result: TestResult,
  chartImages: { rps?: string; latency?: string; errors?: string },
): Promise<string> {
  // Inicializar documento A4 em modo retrato
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN * 2

  // Calcular o score de saude (metrica central do relatorio)
  const health = getHealthScore(result)

  // 1. Capa do relatorio
  drawCoverPage(doc, result, health)

  // 2. Resumo simplificado (para leitores nao-tecnicos)
  addLaypersonSummary(doc, result, health, contentWidth)

  // 3. Resumo executivo com metricas e score
  let y = addExecutiveSummary(doc, result, health, contentWidth, pageHeight)

  // 4. Graficos de evolucao do teste
  y = addCharts(doc, chartImages, y, contentWidth, pageHeight)

  // 5. Metricas detalhadas e codigos de status
  addDetailedMetrics(doc, result, y, contentWidth, pageHeight)

  // 6. Analise de protecao (se detectada)
  if (result.protectionReport) {
    addProtectionSection(doc, result.protectionReport, contentWidth, pageHeight)
  }

  // 7. Conclusoes e recomendacoes priorizadas
  y = addRecommendations(doc, result, contentWidth, pageHeight)

  // 8. Configuracao do teste (para auditoria)
  addTestConfiguration(doc, result, y, pageHeight)

  // 9. Glossario de termos tecnicos
  addGlossary(doc, contentWidth)

  // 10. Rodape em todas as paginas
  addPageFooters(doc, result)

  // Retornar o PDF como string base64 (sem o prefixo "data:application/pdf;base64,")
  return doc.output('datauristring').split(',')[1]
}
