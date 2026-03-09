import { Shield, AlertTriangle, Eye, Lock, Globe, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { ProtectionReport, ProtectionDetection, BehavioralPattern, RateLimitInfo } from '@/types'

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  none: { label: 'Nenhum', color: 'text-sf-success', bg: 'bg-sf-success/10', border: 'border-sf-success/30', icon: '✓' },
  low: { label: 'Baixo', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30', icon: 'ℹ' },
  medium: { label: 'Médio', color: 'text-sf-warning', bg: 'bg-sf-warning/10', border: 'border-sf-warning/30', icon: '!' },
  high: { label: 'Alto', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30', icon: '⚠' },
  critical: { label: 'Crítico', color: 'text-sf-danger', bg: 'bg-sf-danger/10', border: 'border-sf-danger/30', icon: '✗' },
}

const TYPE_ICONS: Record<string, typeof Shield> = {
  'waf': Shield,
  'cdn': Globe,
  'rate-limiter': Zap,
  'anti-bot': Eye,
  'ddos-protection': Lock,
  'captcha': AlertTriangle,
  'unknown': Shield,
}

const TYPE_LABELS: Record<string, string> = {
  'waf': 'WAF',
  'cdn': 'CDN',
  'rate-limiter': 'Rate Limiting',
  'anti-bot': 'Anti-Bot',
  'ddos-protection': 'DDoS Protection',
  'captcha': 'CAPTCHA/Challenge',
  'unknown': 'Desconhecido',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-sf-success bg-sf-success/10',
  medium: 'text-sf-warning bg-sf-warning/10',
  low: 'text-sf-textMuted bg-sf-surface',
}

function ConfidenceBadge({ level, value }: { level: string; value: number }) {
  const labels: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[level] || CONFIDENCE_COLORS.low}`}>
      {labels[level] || level} ({value}%)
    </span>
  )
}

function DetectionCard({ detection }: { detection: ProtectionDetection }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TYPE_ICONS[detection.type] || Shield

  return (
    <div className="bg-sf-surface border border-sf-border rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-sf-primary" />
          <span className="text-sm font-medium text-sf-text">
            {detection.provider !== 'unknown'
              ? `${detection.provider.charAt(0).toUpperCase() + detection.provider.slice(1)} — ${TYPE_LABELS[detection.type]}`
              : TYPE_LABELS[detection.type]}
          </span>
          <ConfidenceBadge level={detection.confidenceLevel} value={detection.confidence} />
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-sf-textMuted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-sf-textMuted" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-sf-textSecondary">{detection.description}</p>
          <div className="space-y-1">
            {detection.indicators.map((ind, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-sf-bg text-sf-textMuted font-mono shrink-0">
                  {ind.source}
                </span>
                <span className="text-sf-textSecondary">
                  <span className="font-medium text-sf-text">{ind.name}</span>: {ind.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
    degradation: 'Degradação',
    normal: 'Normal',
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`font-medium shrink-0 ${typeColors[pattern.type] || 'text-sf-text'}`}>
        {typeLabels[pattern.type] || pattern.type}
      </span>
      <div>
        <span className="text-sf-textSecondary">{pattern.description}</span>
        {pattern.startSecond !== undefined && (
          <span className="ml-1 text-xs text-sf-textMuted">(segundo {pattern.startSecond})</span>
        )}
      </div>
    </div>
  )
}

function RateLimitCard({ info }: { info: RateLimitInfo }) {
  if (!info.detected) return null

  return (
    <div className="bg-sf-surface border border-sf-border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-sf-warning" />
        <span className="text-sm font-medium text-sf-text">Rate Limiting Detectado</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {info.limitPerWindow && (
          <div>
            <span className="text-sf-textMuted">Limite</span>
            <div className="text-sf-text font-mono">{info.limitPerWindow} req/janela</div>
          </div>
        )}
        {info.windowSeconds !== undefined && (
          <div>
            <span className="text-sf-textMuted">Janela</span>
            <div className="text-sf-text font-mono">{info.windowSeconds}s</div>
          </div>
        )}
        {info.triggerPoint !== undefined && (
          <div>
            <span className="text-sf-textMuted">Ativado no</span>
            <div className="text-sf-text font-mono">Segundo {info.triggerPoint}</div>
          </div>
        )}
        {info.recoveryPattern && (
          <div className="col-span-2">
            <span className="text-sf-textMuted">Recuperação</span>
            <div className="text-sf-text">{info.recoveryPattern}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ProtectionReportSection({ report }: { report: ProtectionReport }) {
  const risk = RISK_CONFIG[report.overallRisk] || RISK_CONFIG.none
  const hasDetections = report.detections.length > 0
  const anomalies = report.behavioralPatterns.filter(b => b.type !== 'normal')

  return (
    <div className="space-y-4">
      {/* Risk Overview */}
      <div className={`p-4 rounded-xl border ${risk.bg} ${risk.border}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${risk.color}`} />
              <span className={`text-sm font-medium ${risk.color}`}>Detecção de Proteção</span>
            </div>
            <div className={`text-xl font-bold ${risk.color} mt-1`}>
              Risco: {risk.label}
            </div>
            <p className="text-xs text-sf-textSecondary mt-2 max-w-2xl">
              {report.summary}
            </p>
          </div>
          <div className={`text-4xl font-bold ${risk.color} opacity-20`}>
            {risk.icon}
          </div>
        </div>
      </div>

      {/* Detections */}
      {hasDetections && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
            Proteções Identificadas ({report.detections.length})
          </h3>
          <div className="space-y-2">
            {report.detections.map((d, i) => (
              <DetectionCard key={i} detection={d} />
            ))}
          </div>
        </div>
      )}

      {/* Rate Limiting */}
      {report.rateLimitInfo.detected && (
        <RateLimitCard info={report.rateLimitInfo} />
      )}

      {/* Behavioral Patterns */}
      {anomalies.length > 0 && (
        <div className="bg-sf-surface border border-sf-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
            Padrões Comportamentais
          </h3>
          <div className="space-y-2">
            {anomalies.map((p, i) => (
              <BehaviorCard key={i} pattern={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
