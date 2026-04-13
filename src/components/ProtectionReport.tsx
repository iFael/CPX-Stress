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

import { useState } from "react";
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
} from "lucide-react";
import type {
  ProtectionReport,
  ProtectionDetection,
  BehavioralPattern,
  RateLimitInfo,
} from "@/types";

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
  { label: string; color: string; barColor: string; bg: string; border: string; icon: string }
> = {
  none: {
    label: "Nenhum",
    color: "text-sf-success",
    barColor: "#22c55e",
    bg: "bg-sf-success/10",
    border: "border-sf-success/30",
    icon: "✓",
  },
  low: {
    label: "Baixo",
    color: "text-blue-400",
    barColor: "#60a5fa",
    bg: "bg-blue-400/10",
    border: "border-blue-400/30",
    icon: "ℹ",
  },
  medium: {
    label: "Médio",
    color: "text-sf-warning",
    barColor: "#f59e0b",
    bg: "bg-sf-warning/10",
    border: "border-sf-warning/30",
    icon: "!",
  },
  high: {
    label: "Alto",
    color: "text-orange-400",
    barColor: "#fb923c",
    bg: "bg-orange-400/10",
    border: "border-orange-400/30",
    icon: "⚠",
  },
  critical: {
    label: "Crítico",
    color: "text-sf-danger",
    barColor: "#ef4444",
    bg: "bg-sf-danger/10",
    border: "border-sf-danger/30",
    icon: "✗",
  },
};

/**
 * Explicacao amigavel de cada nivel de risco para quem não e técnico.
 * Aparece como texto auxiliar abaixo do indicador de risco.
 */
const RISK_DESCRIPTIONS: Record<string, string> = {
  none: "Nenhuma proteção de segurança detectada. Os resultados refletem o desempenho real do servidor.",
  low: "Proteção de baixo impacto detectada. Interferência mínima nos resultados do teste.",
  medium:
    "Proteções moderadas detectadas. Os resultados podem estar parcialmente comprometidos. Recomenda-se whitelist para testes precisos.",
  high: "Proteções de alto impacto detectadas. Os resultados provavelmente não refletem a capacidade real do servidor.",
  critical:
    "Proteções bloquearam a maioria das requisições. Resultados não confiáveis — configure whitelist antes de repetir o teste.",
};

/** Classe Tailwind de largura da barra de risco para cada nivel */
/** Percentual de preenchimento da barra de risco para cada nível */
const RISK_BAR_PERCENT: Record<string, number> = {
  none: 0,
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

/**
 * Icone associado a cada tipo de proteção.
 * Usado nos cards de detecção para facilitar a identificacao visual.
 */
const TYPE_ICONS: Record<string, typeof Shield> = {
  waf: Shield,
  cdn: Globe,
  "rate-limiter": Zap,
  "anti-bot": Eye,
  "ddos-protection": Lock,
  captcha: AlertTriangle,
  unknown: Shield,
};

/**
 * Nome curto (técnico) de cada tipo de proteção.
 * Mostrado como título do card de detecção.
 */
const TYPE_LABELS: Record<string, string> = {
  waf: "WAF (Firewall)",
  cdn: "CDN",
  "rate-limiter": "Rate Limiting",
  "anti-bot": "Anti-Bot",
  "ddos-protection": "Proteção DDoS",
  captcha: "CAPTCHA / Challenge",
  unknown: "Desconhecido",
};

/**
 * Explicacao em linguagem simples do que cada tipo de proteção faz.
 * Destinada a pessoas que não conhecem termos técnicos como WAF ou CDN.
 *
 * - WAF: e como um "seguranca de boate" que barra acessos suspeitos
 * - CDN: e uma rede de servidores espalhados pelo mundo que acelera o site
 * - Rate Limiter: limita quantas vezes você pode acessar o site por minuto
 * - Anti-Bot: detecta se o acesso vem de um robo ou de uma pessoa real
 * - DDoS Protection: protege contra ataques que tentam derrubar o site
 * - CAPTCHA: aquele teste de "selecione os semaforos" para provar que você e humano
 */
const TYPE_FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  waf: "Firewall de aplicação web (WAF) — inspeciona requisições HTTP e bloqueia padrões classificados como suspeitos ou maliciosos.",
  cdn: "Rede de distribuição de conteúdo (CDN) — distribui a carga entre servidores geográficos, o que pode interferir na medição de desempenho.",
  "rate-limiter":
    "Limitador de requisições — restringe o número de acessos permitidos por intervalo de tempo. Requisições excedentes são rejeitadas.",
  "anti-bot":
    "Sistema anti-automação — identifica acessos originários de clientes automatizados e pode bloqueá-los para proteger o servidor.",
  "ddos-protection":
    "Proteção contra sobrecarga (DDoS) — descarta tráfego excessivo para manter a disponibilidade do serviço.",
  captcha:
    "Desafio de verificação (CAPTCHA) — exige interação humana antes de processar a requisição, bloqueando clientes automatizados.",
  unknown:
    "Proteção de segurança detectada, porém não foi possível identificar o tipo específico.",
};

/** Cores do badge de confianca (alta, media, baixa) */
const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-sf-success bg-sf-success/10",
  medium: "text-sf-warning bg-sf-warning/10",
  low: "text-sf-textMuted bg-sf-surface",
};

/**
 * Explicacoes amigaveis para cada tipo de padrão comportamental.
 * Mostradas nos cards de padrões para ajudar o leitor a entender o que aconteceu.
 */
const BEHAVIOR_FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  throttling:
    "O servidor reduziu intencionalmente a velocidade de resposta para limitar a carga.",
  blocking:
    "O servidor passou a rejeitar requisições, retornando erros de bloqueio.",
  challenge:
    "O servidor exigiu verificação adicional (CAPTCHA ou challenge) antes de processar requisições.",
  degradation:
    "Degradação progressiva da qualidade de resposta (aumento de latência e/ou taxa de erros).",
  normal: "Comportamento dentro do esperado durante o período analisado.",
};

/* ============================================================================
 * SUBCOMPONENTES — Pecas menores que compoem o relatório
 * ========================================================================= */

/**
 * Badge que indica o nivel de confianca da detecção.
 * Exemplo: "Alta (92%)" em verde, "Media (65%)" em amarelo.
 *
 * Confianca = quao certo o sistema está de que aquela proteção realmente existe.
 */
function ConfidenceBadge({ level, value }: { level: string; value: number }) {
  const labels: Record<string, string> = {
    high: "Alta",
    medium: "Média",
    low: "Baixa",
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.low}`}
    >
      {labels[level] || level} ({value}%)
    </span>
  );
}

/**
 * Card expansivel que mostra os detalhes de uma proteção detectada.
 *
 * Quando fechado: mostra o nome da proteção, provedor e confianca.
 * Quando aberto:  mostra explicacao amigavel, descrição tecnica e
 *                 os indicadores que levaram a detecção.
 */
function DetectionCard({ detection }: { detection: ProtectionDetection }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[detection.type] || Shield;

  /* Nome formatado do provedor (ex: "cloudflare" -> "Cloudflare") */
  const providerName =
    detection.provider !== "unknown"
      ? detection.provider.charAt(0).toUpperCase() + detection.provider.slice(1)
      : null;

  /* Título do card: "Cloudflare -- WAF (Firewall)" ou apenas "WAF (Firewall)" */
  const title = providerName
    ? `${providerName} — ${TYPE_LABELS[detection.type]}`
    : TYPE_LABELS[detection.type];

  return (
    <div className="bg-sf-surface border border-sf-border rounded-lg p-3">
      {/* Cabeçalho clicavel */}
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

      {/* Conteúdo expandido */}
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

          {/* Descrição tecnica vinda do motor de detecção */}
          <p className="text-xs text-sf-textSecondary">
            {detection.description}
          </p>

          {/* Indicadores: evidencias tecnicas que levaram a detecção */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-sf-textMuted font-medium">
              Evidências encontradas
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
  );
}

/**
 * Card que mostra um padrão comportamental observado durante o teste.
 *
 * Exemplos de padrões:
 * - "Bloqueio": o servidor comecou a rejeitar requisições no segundo 28
 * - "Throttling": o servidor comecou a responder mais devagar no segundo 15
 */
function BehaviorCard({ pattern }: { pattern: BehavioralPattern }) {
  const typeColors: Record<string, string> = {
    throttling: "text-sf-warning",
    blocking: "text-sf-danger",
    challenge: "text-orange-400",
    degradation: "text-sf-warning",
    normal: "text-sf-success",
  };

  const typeLabels: Record<string, string> = {
    throttling: "Throttling",
    blocking: "Bloqueio",
    challenge: "Challenge",
    degradation: "Degradação",
    normal: "Normal",
  };

  return (
    <div className="flex flex-col gap-1 text-sm">
      {/* Linha principal: tipo + descrição tecnica */}
      <div className="flex items-start gap-2">
        <span
          className={`font-medium shrink-0 ${typeColors[pattern.type] || "text-sf-text"}`}
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

      {/* Explicacao amigavel do que esse padrão significa */}
      {BEHAVIOR_FRIENDLY_DESCRIPTIONS[pattern.type] && (
        <p className="text-xs text-sf-textMuted ml-0 pl-0 leading-relaxed">
          {BEHAVIOR_FRIENDLY_DESCRIPTIONS[pattern.type]}
        </p>
      )}
    </div>
  );
}

/**
 * Card que mostra informações de Rate Limiting detectado.
 *
 * Rate Limiting = o servidor define um limite máximo de acessos por período.
 * Quando esse limite e atingido, novos acessos são bloqueados temporariamente.
 *
 * Este card mostra:
 * - Quantas requisições são permitidas por janela de tempo
 * - Qual o tamanho da janela de tempo (ex: 60 segundos)
 * - Em que segundo do teste o limite foi atingido
 * - Se o servidor voltou a responder depois (padrão de recuperação)
 */
function RateLimitCard({ info }: { info: RateLimitInfo }) {
  if (!info.detected) return null;

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-3">
      {/* Título e explicacao */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-sf-warning" />
          <span className="text-sm font-medium text-sf-text">
            Limite de Requisições Detectado
          </span>
        </div>
        <p className="text-xs text-sf-textMuted leading-relaxed">
          O servidor possui um limite máximo de requisições por
          intervalo de tempo. Ao atingir esse limite, novas
          requisições foram rejeitadas.
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
              Padrão de recuperação
            </span>
            <div className="text-sf-text">{info.recoveryPattern}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Barra visual que indica o nivel de risco.
 * Vai de verde (sem risco) até vermelho (critico), preenchendo proporcionalmente.
 */
function RiskBar({ riskLevel }: { riskLevel: string }) {
  const pct = RISK_BAR_PERCENT[riskLevel] ?? 0;
  const config = RISK_CONFIG[riskLevel] || RISK_CONFIG.none;

  /* Se não ha risco, não mostra a barra */
  if (riskLevel === "none") return null;

  return (
    <div className="mt-3 space-y-1">
      <div className="flex justify-between text-[10px] text-sf-textMuted">
        <span>Baixo</span>
        <span>Crítico</span>
      </div>
      <div className="w-full h-2 rounded-full bg-sf-bg overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: config.barColor }}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 * COMPONENTE PRINCIPAL — Seção completa do relatório de proteção
 * ========================================================================= */

/**
 * Seção principal do relatório de proteção.
 *
 * Estrutura:
 * 1. Card de visao geral do risco (com barra visual)
 * 2. Lista de protecoes identificadas (expansiveis)
 * 3. Card de rate limiting (se detectado)
 * 4. Padrões comportamentais observados
 */
export function ProtectionReportSection({
  report,
}: {
  report: ProtectionReport;
}) {
  const risk = RISK_CONFIG[report.overallRisk] || RISK_CONFIG.none;
  const hasDetections = report.detections.length > 0;
  const anomalies = report.behavioralPatterns.filter(
    (b) => b.type !== "normal",
  );

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
                Detecção de Proteção
              </span>
            </div>

            {/* Nivel de risco em destaque */}
            <div className={`text-xl font-bold ${risk.color} mt-1`}>
              Risco: {risk.label}
            </div>

            {/* Barra visual do risco */}
            <RiskBar riskLevel={report.overallRisk} />

            {/* Resumo gerado pelo motor de detecção */}
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

        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Protecoes identificadas                                         */}
      {/* Lista cada proteção encontrada com detalhes expansiveis.           */}
      {/* ------------------------------------------------------------------ */}
      {hasDetections && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-1">
            Proteções Identificadas ({report.detections.length})
          </h3>
          <p className="text-xs text-sf-textMuted mb-3 leading-relaxed">
            Clique em cada item para exibir detalhes técnicos.
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
      {/* Mostra se o servidor impoe limite de requisições por tempo.        */}
      {/* ------------------------------------------------------------------ */}
      {report.rateLimitInfo.detected && (
        <RateLimitCard info={report.rateLimitInfo} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. Padrões comportamentais                                         */}
      {/* Mostra mudancas no comportamento do servidor durante o teste.      */}
      {/* Ex: "comecou a bloquear no segundo 28"                             */}
      {/* ------------------------------------------------------------------ */}
      {anomalies.length > 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-1">
            Padrões Comportamentais
          </h3>
          <p className="text-xs text-sf-textMuted mb-3 leading-relaxed">
            Alterações no comportamento do servidor identificadas
            durante o teste.
          </p>
          <div className="space-y-3">
            {anomalies.map((pattern, index) => (
              <BehaviorCard key={index} pattern={pattern} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
