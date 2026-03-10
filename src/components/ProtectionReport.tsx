/**
 * ProtectionReport.tsx
 *
 * Seção do relatório que mostra as proteções de segurança detectadas no site testado.
 *
 * O que este componente faz:
 * - Mostra o nível de risco que as proteções representam para o teste de estresse
 * - Lista cada proteção encontrada (ex: Cloudflare, AWS WAF) com explicações simples
 * - Exibe informações de rate limiting (limite de requisições por tempo)
 * - Mostra padrões de comportamento observados (bloqueio, lentidão, etc.)
 *
 * Todas as explicações são escritas para serem compreensíveis por pessoas
 * que não são da área técnica.
 */

import { useState } from 'react'
import {
  Shield,
  AlertTriangle,
  Eye,
  Lock,
  Globe,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import type {
  ProtectionReport,
  ProtectionDetection,
  BehavioralPattern,
  RateLimitInfo,
} from '@/types'

/* ============================================================================
 * CONSTANTES — Configurações visuais e textos explicativos
 * ========================================================================= */

/**
 * Configuração visual de cada nível de risco.
 * "Risco" aqui significa: quanto as proteções podem atrapalhar o teste de estresse.
 * - none:     Nenhuma proteção detectada, teste livre
 * - low:      Proteção leve, teste praticamente não é afetado
 * - medium:   Proteção moderada, pode interferir em parte dos resultados
 * - high:     Proteção forte, resultados podem não refletir a capacidade real do servidor
 * - critical: Proteção muito agressiva, a maioria das requisições é bloqueada
 */
const RISK_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  none: {
    label: 'Nenhum',
    color: 'text-sf-success',
    bg: 'bg-sf-success/10',
    border: 'border-sf-success/30',
    icon: '\u2713',
  },
  low: {
    label: 'Baixo',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/30',
    icon: '\u2139',
  },
  medium: {
    label: 'M\u00e9dio',
    color: 'text-sf-warning',
    bg: 'bg-sf-warning/10',
    border: 'border-sf-warning/30',
    icon: '!',
  },
  high: {
    label: 'Alto',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/30',
    icon: '\u26a0',
  },
  critical: {
    label: 'Cr\u00edtico',
    color: 'text-sf-danger',
    bg: 'bg-sf-danger/10',
    border: 'border-sf-danger/30',
    icon: '\u2717',
  },
}

/**
 * Explicacao amigavel de cada nivel de risco para quem nao e tecnico.
 * Aparece como texto auxiliar abaixo do indicador de risco.
 */
const RISK_DESCRIPTIONS: Record<string, string> = {
  none: 'Nenhuma prote\u00e7\u00e3o de seguran\u00e7a detectada. Os resultados refletem o desempenho real do servidor.',
  low: 'Prote\u00e7\u00e3o de baixo impacto detectada. Interfer\u00eancia m\u00ednima nos resultados do teste.',
  medium:
    'Prote\u00e7\u00f5es moderadas detectadas. Os resultados podem estar parcialmente comprometidos. Recomenda-se whitelist para testes precisos.',
  high: 'Prote\u00e7\u00f5es de alto impacto detectadas. Os resultados provavelmente n\u00e3o refletem a capacidade real do servidor.',
  critical:
    'Prote\u00e7\u00f5es bloquearam a maioria das requisi\u00e7\u00f5es. Resultados n\u00e3o confi\u00e1veis \u2014 configure whitelist antes de repetir o teste.',
}

/** Classe Tailwind de largura da barra de risco para cada nivel */
const RISK_BAR_WIDTH: Record<string, string> = {
  none: 'w-0',
  low: 'w-1/4',
  medium: 'w-1/2',
  high: 'w-3/4',
  critical: 'w-full',
}

/**
 * Icone associado a cada tipo de protecao.
 * Usado nos cards de deteccao para facilitar a identificacao visual.
 */
const TYPE_ICONS: Record<string, typeof Shield> = {
  waf: Shield,
  cdn: Globe,
  'rate-limiter': Zap,
  'anti-bot': Eye,
  'ddos-protection': Lock,
  captcha: AlertTriangle,
  unknown: Shield,
}

/**
 * Nome curto (tecnico) de cada tipo de protecao.
 * Mostrado como titulo do card de deteccao.
 */
const TYPE_LABELS: Record<string, string> = {
  waf: 'WAF (Firewall)',
  cdn: 'CDN',
  'rate-limiter': 'Rate Limiting',
  'anti-bot': 'Anti-Bot',
  'ddos-protection': 'Prote\u00e7\u00e3o DDoS',
  captcha: 'CAPTCHA / Challenge',
  unknown: 'Desconhecido',
}

/**
 * Explicacao em linguagem simples do que cada tipo de protecao faz.
 * Destinada a pessoas que nao conhecem termos tecnicos como WAF ou CDN.
 *
 * - WAF: e como um "seguranca de boate" que barra acessos suspeitos
 * - CDN: e uma rede de servidores espalhados pelo mundo que acelera o site
 * - Rate Limiter: limita quantas vezes voce pode acessar o site por minuto
 * - Anti-Bot: detecta se o acesso vem de um robo ou de uma pessoa real
 * - DDoS Protection: protege contra ataques que tentam derrubar o site
 * - CAPTCHA: aquele teste de "selecione os semaforos" para provar que voce e humano
 */
const TYPE_FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  waf: 'Firewall de aplica\u00e7\u00e3o web (WAF) \u2014 inspeciona requisi\u00e7\u00f5es HTTP e bloqueia padr\u00f5es classificados como suspeitos ou maliciosos.',
  cdn: 'Rede de distribui\u00e7\u00e3o de conte\u00fado (CDN) \u2014 distribui a carga entre servidores geogr\u00e1ficos, o que pode interferir na medi\u00e7\u00e3o de desempenho.',
  'rate-limiter':
    'Limitador de requisi\u00e7\u00f5es \u2014 restringe o n\u00famero de acessos permitidos por intervalo de tempo. Requisi\u00e7\u00f5es excedentes s\u00e3o rejeitadas.',
  'anti-bot':
    'Sistema anti-automa\u00e7\u00e3o \u2014 identifica acessos origin\u00e1rios de clientes automatizados e pode bloque\u00e1-los para proteger o servidor.',
  'ddos-protection':
    'Prote\u00e7\u00e3o contra sobrecarga (DDoS) \u2014 descarta tr\u00e1fego excessivo para manter a disponibilidade do servi\u00e7o.',
  captcha:
    'Desafio de verifica\u00e7\u00e3o (CAPTCHA) \u2014 exige intera\u00e7\u00e3o humana antes de processar a requisi\u00e7\u00e3o, bloqueando clientes automatizados.',
  unknown:
    'Prote\u00e7\u00e3o de seguran\u00e7a detectada, por\u00e9m n\u00e3o foi poss\u00edvel identificar o tipo espec\u00edfico.',
}

/** Cores do badge de confianca (alta, media, baixa) */
const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-sf-success bg-sf-success/10',
  medium: 'text-sf-warning bg-sf-warning/10',
  low: 'text-sf-textMuted bg-sf-surface',
}

/**
 * Explicacoes amigaveis para cada tipo de padrao comportamental.
 * Mostradas nos cards de padroes para ajudar o leitor a entender o que aconteceu.
 */
const BEHAVIOR_FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  throttling:
    'O servidor reduziu intencionalmente a velocidade de resposta para limitar a carga.',
  blocking:
    'O servidor passou a rejeitar requisi\u00e7\u00f5es, retornando erros de bloqueio.',
  challenge:
    'O servidor exigiu verifica\u00e7\u00e3o adicional (CAPTCHA ou challenge) antes de processar requisi\u00e7\u00f5es.',
  degradation:
    'Degrada\u00e7\u00e3o progressiva da qualidade de resposta (aumento de lat\u00eancia e/ou taxa de erros).',
  normal: 'Comportamento dentro do esperado durante o per\u00edodo analisado.',
}

/* ============================================================================
 * SUBCOMPONENTES — Pecas menores que compoem o relatorio
 * ========================================================================= */

/**
 * Badge que indica o nivel de confianca da deteccao.
 * Exemplo: "Alta (92%)" em verde, "Media (65%)" em amarelo.
 *
 * Confianca = quao certo o sistema esta de que aquela protecao realmente existe.
 */
function ConfidenceBadge({ level, value }: { level: string; value: number }) {
  const labels: Record<string, string> = {
    high: 'Alta',
    medium: 'M\u00e9dia',
    low: 'Baixa',
  }

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.low}`}
    >
      {labels[level] || level} ({value}%)
    </span>
  )
}

/**
 * Card expansivel que mostra os detalhes de uma protecao detectada.
 *
 * Quando fechado: mostra o nome da protecao, provedor e confianca.
 * Quando aberto:  mostra explicacao amigavel, descricao tecnica e
 *                 os indicadores que levaram a deteccao.
 */
function DetectionCard({ detection }: { detection: ProtectionDetection }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TYPE_ICONS[detection.type] || Shield

  /* Nome formatado do provedor (ex: "cloudflare" -> "Cloudflare") */
  const providerName =
    detection.provider !== 'unknown'
      ? detection.provider.charAt(0).toUpperCase() + detection.provider.slice(1)
      : null

  /* Titulo do card: "Cloudflare -- WAF (Firewall)" ou apenas "WAF (Firewall)" */
  const title = providerName
    ? `${providerName} \u2014 ${TYPE_LABELS[detection.type]}`
    : TYPE_LABELS[detection.type]

  return (
    <div className="bg-sf-surface border border-sf-border rounded-lg p-3">
      {/* Cabecalho clicavel */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-sf-primary shrink-0" />
          <span className="text-sm font-medium text-sf-text truncate">
            {title}
          </span>
          <ConfidenceBadge
            level={detection.confidenceLevel}
            value={detection.confidence}
          />
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-sf-textMuted shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 text-sf-textMuted shrink-0 ml-2" />
        )}
      </button>

      {/* Conteudo expandido */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Explicacao amigavel para leigos */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-sf-primary/5 border border-sf-primary/10">
            <Info className="w-4 h-4 text-sf-primary shrink-0 mt-0.5" />
            <p className="text-xs text-sf-textSecondary leading-relaxed">
              {TYPE_FRIENDLY_DESCRIPTIONS[detection.type] ||
                TYPE_FRIENDLY_DESCRIPTIONS.unknown}
            </p>
          </div>

          {/* Descricao tecnica vinda do motor de deteccao */}
          <p className="text-xs text-sf-textSecondary">{detection.description}</p>

          {/* Indicadores: evidencias tecnicas que levaram a deteccao */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-sf-textMuted font-medium">
              Evid\u00eancias encontradas
            </span>
            {detection.indicators.map((indicator, index) => (
              <div key={index} className="flex items-start gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-sf-bg text-sf-textMuted font-mono shrink-0">
                  {indicator.source}
                </span>
                <span className="text-sf-textSecondary">
                  <span className="font-medium text-sf-text">
                    {indicator.name}
                  </span>
                  : {indicator.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Card que mostra um padrao comportamental observado durante o teste.
 *
 * Exemplos de padroes:
 * - "Bloqueio": o servidor comecou a rejeitar requisicoes no segundo 28
 * - "Throttling": o servidor comecou a responder mais devagar no segundo 15
 */
function BehaviorCard({ pattern }: { pattern: BehavioralPattern }) {
  const typeColors: Record<string, string> = {
    throttling: 'text-sf-warning',
    blocking: 'text-sf-danger',
    challenge: 'text-orange-400',
    degradation: 'text-sf-warning',
    normal: 'text-sf-success',
  }

  const typeLabels: Record<string, string> = {
    throttling: 'Throttling',
    blocking: 'Bloqueio',
    challenge: 'Challenge',
    degradation: 'Degrada\u00e7\u00e3o',
    normal: 'Normal',
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      {/* Linha principal: tipo + descricao tecnica */}
      <div className="flex items-start gap-2">
        <span
          className={`font-medium shrink-0 ${typeColors[pattern.type] || 'text-sf-text'}`}
        >
          {typeLabels[pattern.type] || pattern.type}
        </span>
        <div>
          <span className="text-sf-textSecondary">{pattern.description}</span>
          {pattern.startSecond !== undefined && (
            <span className="ml-1 text-xs text-sf-textMuted">
              (segundo {pattern.startSecond})
            </span>
          )}
        </div>
      </div>

      {/* Explicacao amigavel do que esse padrao significa */}
      {BEHAVIOR_FRIENDLY_DESCRIPTIONS[pattern.type] && (
        <p className="text-xs text-sf-textMuted ml-0 pl-0 leading-relaxed">
          {BEHAVIOR_FRIENDLY_DESCRIPTIONS[pattern.type]}
        </p>
      )}
    </div>
  )
}

/**
 * Card que mostra informacoes de Rate Limiting detectado.
 *
 * Rate Limiting = o servidor define um limite maximo de acessos por periodo.
 * Quando esse limite e atingido, novos acessos sao bloqueados temporariamente.
 *
 * Este card mostra:
 * - Quantas requisicoes sao permitidas por janela de tempo
 * - Qual o tamanho da janela de tempo (ex: 60 segundos)
 * - Em que segundo do teste o limite foi atingido
 * - Se o servidor voltou a responder depois (padrao de recuperacao)
 */
function RateLimitCard({ info }: { info: RateLimitInfo }) {
  if (!info.detected) return null

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-3">
      {/* Titulo e explicacao */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-sf-warning" />
          <span className="text-sm font-medium text-sf-text">
            Limite de Requisi\u00e7\u00f5es Detectado
          </span>
        </div>
        <p className="text-xs text-sf-textMuted leading-relaxed">
          O servidor possui um limite m\u00e1ximo de requisi\u00e7\u00f5es por intervalo de tempo. Ao
          atingir esse limite, novas requisi\u00e7\u00f5es foram rejeitadas.
        </p>
      </div>

      {/* Detalhes em grade */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {info.limitPerWindow && (
          <div className="bg-sf-bg rounded-lg p-2">
            <span className="text-sf-textMuted block mb-0.5">
              Limite por janela
            </span>
            <div className="text-sf-text font-mono font-medium">
              {info.limitPerWindow} req/janela
            </div>
          </div>
        )}
        {info.windowSeconds !== undefined && (
          <div className="bg-sf-bg rounded-lg p-2">
            <span className="text-sf-textMuted block mb-0.5">
              Janela de tempo
            </span>
            <div className="text-sf-text font-mono font-medium">
              {info.windowSeconds}s
            </div>
          </div>
        )}
        {info.triggerPoint !== undefined && (
          <div className="bg-sf-bg rounded-lg p-2">
            <span className="text-sf-textMuted block mb-0.5">
              Ativado no segundo
            </span>
            <div className="text-sf-text font-mono font-medium">
              {info.triggerPoint}
            </div>
          </div>
        )}
        {info.recoveryPattern && (
          <div className="bg-sf-bg rounded-lg p-2 col-span-2">
            <span className="text-sf-textMuted block mb-0.5">
              Padr\u00e3o de recupera\u00e7\u00e3o
            </span>
            <div className="text-sf-text">{info.recoveryPattern}</div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Barra visual que indica o nivel de risco.
 * Vai de verde (sem risco) ate vermelho (critico), preenchendo proporcionalmente.
 */
function RiskBar({ riskLevel }: { riskLevel: string }) {
  const widthClass = RISK_BAR_WIDTH[riskLevel] ?? 'w-0'
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.none

  /* Se nao ha risco, nao mostra a barra */
  if (riskLevel === 'none') return null

  return (
    <div className="mt-3 space-y-1">
      <div className="flex justify-between text-[10px] text-sf-textMuted">
        <span>Baixo</span>
        <span>Cr\u00edtico</span>
      </div>
      <div className="w-full h-2 rounded-full bg-sf-bg overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${widthClass} ${config.color.replace('text-', 'bg-')}`}
        />
      </div>
    </div>
  )
}

/* ============================================================================
 * COMPONENTE PRINCIPAL — Secao completa do relatorio de protecao
 * ========================================================================= */

/**
 * Secao principal do relatorio de protecao.
 *
 * Estrutura:
 * 1. Card de visao geral do risco (com barra visual)
 * 2. Lista de protecoes identificadas (expansiveis)
 * 3. Card de rate limiting (se detectado)
 * 4. Padroes comportamentais observados
 */
export function ProtectionReportSection({
  report,
}: {
  report: ProtectionReport
}) {
  const risk = RISK_CONFIG[report.overallRisk] || RISK_CONFIG.none
  const hasDetections = report.detections.length > 0
  const anomalies = report.behavioralPatterns.filter((b) => b.type !== 'normal')

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Visao geral do risco                                            */}
      {/* Mostra o nivel de risco e uma explicacao do que isso significa.     */}
      {/* ------------------------------------------------------------------ */}
      <div className={`p-4 rounded-xl border ${risk.bg} ${risk.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${risk.color}`} />
              <span className={`text-sm font-medium ${risk.color}`}>
                Detec\u00e7\u00e3o de Prote\u00e7\u00e3o
              </span>
            </div>

            {/* Nivel de risco em destaque */}
            <div className={`text-xl font-bold ${risk.color} mt-1`}>
              Risco: {risk.label}
            </div>

            {/* Barra visual do risco */}
            <RiskBar riskLevel={report.overallRisk} />

            {/* Resumo gerado pelo motor de deteccao */}
            <p className="text-xs text-sf-textSecondary mt-2 max-w-2xl">
              {report.summary}
            </p>

            {/* Explicacao amigavel do que o nivel de risco significa */}
            {RISK_DESCRIPTIONS[report.overallRisk] && (
              <p className="text-xs text-sf-textMuted mt-1.5 max-w-2xl leading-relaxed">
                {RISK_DESCRIPTIONS[report.overallRisk]}
              </p>
            )}
          </div>

          {/* Icone decorativo grande */}
          <div
            className={`text-4xl font-bold ${risk.color} opacity-20 shrink-0 ml-4`}
          >
            {risk.icon}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Protecoes identificadas                                         */}
      {/* Lista cada protecao encontrada com detalhes expansiveis.           */}
      {/* ------------------------------------------------------------------ */}
      {hasDetections && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-1">
            Prote\u00e7\u00f5es Identificadas ({report.detections.length})
          </h3>
          <p className="text-xs text-sf-textMuted mb-3 leading-relaxed">
            Clique em cada item para exibir detalhes t\u00e9cnicos.
          </p>
          <div className="space-y-2">
            {report.detections.map((detection, index) => (
              <DetectionCard key={index} detection={detection} />
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. Rate Limiting                                                   */}
      {/* Mostra se o servidor impoe limite de requisicoes por tempo.        */}
      {/* ------------------------------------------------------------------ */}
      {report.rateLimitInfo.detected && (
        <RateLimitCard info={report.rateLimitInfo} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. Padroes comportamentais                                         */}
      {/* Mostra mudancas no comportamento do servidor durante o teste.      */}
      {/* Ex: "comecou a bloquear no segundo 28"                             */}
      {/* ------------------------------------------------------------------ */}
      {anomalies.length > 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-1">
            Padr\u00f5es Comportamentais
          </h3>
          <p className="text-xs text-sf-textMuted mb-3 leading-relaxed">
            Altera\u00e7\u00f5es no comportamento do servidor identificadas durante o teste.
          </p>
          <div className="space-y-3">
            {anomalies.map((pattern, index) => (
              <BehaviorCard key={index} pattern={pattern} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
