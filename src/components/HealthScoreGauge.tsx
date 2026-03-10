import { useEffect, useRef, useState, useId } from 'react'

// ─────────────────────────────────────────────────────────────
// HealthScoreGauge — Indicador visual circular de saude do site
//
// Renderiza um medidor (gauge) SVG em arco de 240 graus com:
//   • Gradiente de cor: vermelho (0-25) → laranja (25-50) →
//     amarelo (50-75) → verde (75-100)
//   • Animacao de preenchimento ao montar o componente
//   • Numero central animado (contagem progressiva)
//   • Marcas de referencia (ticks) em 0, 25, 50, 75 e 100
//   • Marcador opcional de score pre-bloqueio
//   • Design responsivo (escala com o container pai)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Tipos publicos
// ─────────────────────────────────────────────────────────────

export interface HealthScoreGaugeProps {
  /** Score de saude de 0 a 100 (valores fora do intervalo sao limitados) */
  score: number
  /** Rotulo da categoria em portugues: "Critico", "Regular", "Bom" ou "Excelente" */
  label: string
  /** Score opcional pre-bloqueio, exibido como marcador secundario no arco */
  preBlockingScore?: number
  /** Rotulo da categoria pre-bloqueio (ex.: "Bom") */
  preBlockingLabel?: string
  /** Classes CSS/Tailwind adicionais para o wrapper externo */
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Constantes de geometria do gauge
//
// O arco ocupa 240 graus (2/3 do circulo), com uma abertura
// de 120 graus na parte inferior. A rotacao de 150 graus
// posiciona o inicio do arco no canto inferior-esquerdo e
// o fim no canto inferior-direito.
// ─────────────────────────────────────────────────────────────

/** Largura do viewBox SVG */
const VIEW_W = 220
/** Altura do viewBox SVG (recortada para remover espaco vazio inferior) */
const VIEW_H = 186
/** Centro horizontal do gauge */
const CX = VIEW_W / 2
/** Centro vertical (ligeiramente acima do meio para acomodar o rotulo inferior) */
const CY = 108
/** Raio do arco principal */
const R = 76
/** Espessura do tracado do arco */
const STROKE = 12
/** Circunferencia total do circulo */
const CIRC = 2 * Math.PI * R
/** Extensao do arco visivel em graus */
const ARC_DEG = 240
/** Comprimento do arco visivel em unidades SVG */
const ARC_LEN = (ARC_DEG / 360) * CIRC
/** Angulo de rotacao inicial (graus a partir das 3 horas, sentido horario) */
const START_ROT = 150

// Geometria das marcas de referencia (ticks)
const TICK_R_INNER = R + STROKE / 2 + 3
const TICK_R_OUTER = R + STROKE / 2 + 9
const TICK_LABEL_R = R + STROKE / 2 + 18

/** Valores de referencia exibidos como marcas ao redor do arco */
const TICK_VALUES = [0, 25, 50, 75, 100] as const

// ─────────────────────────────────────────────────────────────
// Funcoes auxiliares
// ─────────────────────────────────────────────────────────────

/** Limita um valor ao intervalo 0-100 */
const clamp = (v: number): number => Math.min(100, Math.max(0, v))

/** Converte graus para radianos */
const toRad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Retorna as coordenadas (x, y) de um ponto no circulo
 * para um dado angulo em graus e raio.
 */
function polarPoint(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = toRad(angleDeg)
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  }
}

/**
 * Converte um score (0-100) no angulo correspondente
 * sobre o arco do gauge.
 */
function scoreToAngle(score: number): number {
  return START_ROT + (clamp(score) / 100) * ARC_DEG
}

/**
 * Retorna a cor hexadecimal correspondente a faixa do score.
 *
 * - 75-100  →  verde   (#22c55e — sf-success)
 * - 50-74   →  amarelo (#eab308)
 * - 25-49   →  laranja (#f97316)
 * -  0-24   →  vermelho(#ef4444 — sf-danger)
 */
function colorForScore(score: number): string {
  if (score >= 75) return '#22c55e'
  if (score >= 50) return '#eab308'
  if (score >= 25) return '#f97316'
  return '#ef4444'
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export function HealthScoreGauge({
  score,
  label,
  preBlockingScore,
  preBlockingLabel,
  className = '',
}: HealthScoreGaugeProps) {
  // ID unico para referenciar defs SVG (gradiente, filtro) sem
  // colisao quando multiplos gauges existirem na mesma pagina.
  const uid = useId().replace(/:/g, '')

  // ── Estado de animacao ────────────────────────────────────

  // Offset do arco — comeca em ARC_LEN (arco oculto) e transiciona
  // via CSS ate o valor final, criando o efeito de preenchimento.
  const [arcOffset, setArcOffset] = useState(ARC_LEN)

  // Contador numerico animado que sobe de 0 ate o score real.
  const [displayNumber, setDisplayNumber] = useState(0)

  // Referencia para cancelar requestAnimationFrame do contador.
  const animFrameRef = useRef(0)

  // ── Animar preenchimento do arco ──────────────────────────
  // Usa requestAnimationFrame para garantir que o estado
  // inicial (ARC_LEN = oculto) seja renderizado antes da
  // transicao CSS iniciar.
  useEffect(() => {
    const targetOffset = ARC_LEN * (1 - clamp(score) / 100)
    const frame = requestAnimationFrame(() => setArcOffset(targetOffset))
    return () => cancelAnimationFrame(frame)
  }, [score])

  // ── Animar contagem numerica ──────────────────────────────
  // Incrementa o numero de 0 ate o score usando ease-out cubico
  // para uma desaceleracao natural.
  useEffect(() => {
    const target = Math.round(clamp(score))
    const duration = 1400 // milissegundos
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubico: desacelera suavemente ao final
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayNumber(Math.round(target * eased))

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [score])

  // ── Valores derivados ─────────────────────────────────────

  const scoreColor = colorForScore(score)
  const gradientId = `gauge-grad-${uid}`
  const glowFilterId = `gauge-glow-${uid}`

  // Ponto do marcador pre-bloqueio sobre o arco
  const preBlockPoint =
    preBlockingScore != null
      ? polarPoint(scoreToAngle(preBlockingScore), R)
      : null

  // ── Renderizacao ──────────────────────────────────────────

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Container responsivo — escala ate 280px de largura */}
      <div className="w-full max-w-[280px]">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Saude do site: ${score} de 100, ${label}`}
        >
          {/* ─── Definicoes reutilizaveis ─────────────────── */}
          <defs>
            {/*
              Gradiente horizontal que simula a progressao de
              cores ao longo do arco: vermelho → laranja →
              amarelo → verde. Como o arco vai da esquerda
              para a direita (passando pelo topo), o gradiente
              L→R mapeia naturalmente.
            */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="28%" stopColor="#f97316" />
              <stop offset="52%" stopColor="#eab308" />
              <stop offset="78%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>

            {/*
              Filtro de brilho (glow) aplicado ao arco de score.
              Cria um desfoque semi-transparente atras do tracado,
              dando profundidade ao gauge no tema escuro.
            */}
            <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
              />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ─── Trilha de fundo (background track) ──────── */}

          {/* Sombra externa sutil da trilha */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#1a1d27"
            strokeWidth={STROKE + 4}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${CIRC}`}
            transform={`rotate(${START_ROT} ${CX} ${CY})`}
          />

          {/* Trilha principal — cor sf-borderSubtle */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#22252f"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${CIRC}`}
            transform={`rotate(${START_ROT} ${CX} ${CY})`}
          />

          {/* ─── Arco de score (preenchimento animado) ───── */}
          {/*
            Tecnica: stroke-dasharray define o arco total,
            stroke-dashoffset controla quanto esta visivel.
            O offset comeca em ARC_LEN (nada visivel) e
            transiciona ate o valor proporcional ao score.
          */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LEN} ${CIRC}`}
            strokeDashoffset={arcOffset}
            transform={`rotate(${START_ROT} ${CX} ${CY})`}
            filter={`url(#${glowFilterId})`}
            className="transition-[stroke-dashoffset] duration-[1.5s] ease-[cubic-bezier(0.16,1,0.3,1)]"
          />

          {/* ─── Marcas de referencia (ticks) ────────────── */}
          {TICK_VALUES.map((tick) => {
            const tickAngle = scoreToAngle(tick)
            const inner = polarPoint(tickAngle, TICK_R_INNER)
            const outer = polarPoint(tickAngle, TICK_R_OUTER)
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#475569"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            )
          })}

          {/* ─── Rotulos das marcas de referencia ────────── */}
          {TICK_VALUES.map((tick) => {
            const pos = polarPoint(scoreToAngle(tick), TICK_LABEL_R)
            return (
              <text
                key={`label-${tick}`}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#64748b"
                fontSize="10"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {tick}
              </text>
            )
          })}

          {/* ─── Marcador de score pre-bloqueio ──────────── */}
          {/*
            Ponto roxo (sf-primary) sobre o arco indicando
            onde o score ficaria se desconsiderarmos os dados
            apos a protecao bloquear. O ponto usa a mesma cor
            do indicador textual abaixo do gauge.
          */}
          {preBlockPoint != null && preBlockingScore != null && (
            <circle
              cx={preBlockPoint.x}
              cy={preBlockPoint.y}
              r={5}
              fill="#6366f1"
              stroke="#0f1117"
              strokeWidth={2}
            />
          )}

          {/* ─── Conteudo central ────────────────────────── */}

          {/* Numero grande — score animado */}
          <text
            x={CX}
            y={CY - 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill={scoreColor}
            fontSize="46"
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {displayNumber}
          </text>

          {/* Texto auxiliar "de 100" */}
          <text
            x={CX}
            y={CY + 22}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#64748b"
            fontSize="13"
            fontFamily="Inter, system-ui, sans-serif"
          >
            de 100
          </text>

          {/* ─── Rotulo da categoria (na abertura inferior) ─ */}
          <text
            x={CX}
            y={CY + 52}
            textAnchor="middle"
            dominantBaseline="central"
            fill={scoreColor}
            fontSize="16"
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label}
          </text>
        </svg>
      </div>

      {/* ─── Legenda do marcador pre-bloqueio ──────────────── */}
      {/*
        Exibida como HTML para aproveitar as classes Tailwind do
        projeto. O ponto roxo corresponde ao marcador no arco.
      */}
      {preBlockingScore != null && preBlockingLabel && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="inline-block w-2 h-2 rounded-full bg-sf-primary shrink-0" />
          <span className="text-xs text-sf-textSecondary">
            Pré-bloqueio: {preBlockingScore}/100 — {preBlockingLabel}
          </span>
        </div>
      )}
    </div>
  )
}
