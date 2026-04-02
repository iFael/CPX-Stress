/**
 * MetricCard.tsx
 *
 * Componente reutilizavel para exibir uma unica métrica com valor,
 * rótulo, icone, tendencia e area opcional de mini-gráfico (sparkline).
 *
 * Projetado para o tema escuro do StressFlow, utilizando a paleta sf-*.
 * As descrições e rótulos estao em português para manter consistencia
 * com o restante da aplicação.
 *
 * -- Exemplos de uso --
 *
 *   <MetricCard
 *     label="Capacidade"
 *     value="1.250"
 *     unit="req/s"
 *     icon={<Gauge className="w-4 h-4" />}
 *     status="success"
 *     trend="up"
 *     description="Quantidade de requisições atendidas por segundo."
 *   />
 *
 *   <MetricCard
 *     label="Taxa de Erro"
 *     value="12.3"
 *     unit="%"
 *     icon={<AlertTriangle className="w-4 h-4" />}
 *     status="danger"
 *     trend="up"
 *     description="Porcentagem de requisições que falharam."
 *     sparklineData={[0, 1, 2, 4, 8, 12]}
 *   />
 */

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/**
 * Define a severidade/cor do cartao.
 *
 * - success  = verde  — valor dentro do esperado (bom)
 * - warning  = amarelo — merece atenção (alerta)
 * - danger   = vermelho — valor critico (ruim)
 * - neutral  = cor padrão do tema (sem classificação)
 * - primary  = roxo primário da marca
 * - accent   = ciano de destaque
 */
export type MetricCardStatus =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "primary"
  | "accent";

/**
 * Direcao da tendencia do valor.
 *
 * - up      = valor esta subindo
 * - down    = valor esta descendo
 * - neutral = valor estável
 */
export type MetricCardTrend = "up" | "down" | "neutral";

/**
 * Propriedades aceitas pelo componente MetricCard.
 */
export interface MetricCardProps {
  /** Rótulo descritivo da métrica (ex: "Capacidade", "Latência") */
  label: string;

  /** Valor principal exibido em destaque (ex: "1.250", "42.5") */
  value: string | number;

  /** Unidade de medida exibida ao lado do valor (ex: "ms", "req/s", "%") */
  unit?: string;

  /** Icone Lucide exibido ao lado do rótulo */
  icon?: ReactNode;

  /** Classificação visual de severidade/cor */
  status?: MetricCardStatus;

  /** Direcao da tendencia (seta para cima, para baixo ou estável) */
  trend?: MetricCardTrend;

  /** Texto descritivo exibido no tooltip ao passar o mouse ou focar */
  description?: string;

  /** Sub-rótulo exibido abaixo do rótulo principal (ex: "Latência P95") */
  subLabel?: string;

  /** Informação secundaria abaixo do valor (ex: "1.500 total") */
  subValue?: string;

  /** Dados numericos para o mini-gráfico sparkline */
  sparklineData?: number[];

  /** Cor do traço da sparkline — usa a cor do status se omitido */
  sparklineColor?: string;

  /** Classes CSS extras para o container raiz */
  className?: string;
}

// ---------------------------------------------------------------------------
// Mapeamento de status para classes Tailwind
// ---------------------------------------------------------------------------

/** Cores do texto por status */
const STATUS_TEXT: Record<MetricCardStatus, string> = {
  success: "text-sf-success",
  warning: "text-sf-warning",
  danger: "text-sf-danger",
  neutral: "text-sf-textSecondary",
  primary: "text-sf-primary",
  accent: "text-sf-accent",
};

/** Fundo sutil por status (usado no hover) */
const STATUS_BG_HOVER: Record<MetricCardStatus, string> = {
  success: "group-hover:border-sf-success/25",
  warning: "group-hover:border-sf-warning/25",
  danger: "group-hover:border-sf-danger/25",
  neutral: "group-hover:border-sf-border",
  primary: "group-hover:border-sf-primary/25",
  accent: "group-hover:border-sf-accent/25",
};

/** Sombra de brilho por status (hover) */
const STATUS_GLOW: Record<MetricCardStatus, string> = {
  success: "group-hover:shadow-glow-success",
  warning: "group-hover:shadow-glow-warning",
  danger: "group-hover:shadow-glow-danger",
  neutral: "group-hover:shadow-card-hover",
  primary: "group-hover:shadow-glow",
  accent: "group-hover:shadow-glow-accent",
};

/** Cor hexadecimal do traco do sparkline por status */
const STATUS_SPARKLINE_COLOR: Record<MetricCardStatus, string> = {
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  neutral: "#64748b",
  primary: "#6366f1",
  accent: "#22d3ee",
};

/** Icone de tendencia por direcao */
const TREND_ICON: Record<MetricCardTrend, ReactNode> = {
  up: <TrendingUp className="w-3.5 h-3.5" />,
  down: <TrendingDown className="w-3.5 h-3.5" />,
  neutral: <Minus className="w-3.5 h-3.5" />,
};

/** Rótulo em português por direcao de tendencia */
const TREND_LABEL: Record<MetricCardTrend, string> = {
  up: "Subindo",
  down: "Descendo",
  neutral: "Estável",
};

/** Cor da tendencia (o significado depende do contexto, mas as cores são fixas) */
const TREND_COLOR: Record<MetricCardTrend, string> = {
  up: "text-sf-success",
  down: "text-sf-danger",
  neutral: "text-sf-textMuted",
};

// ---------------------------------------------------------------------------
// Componente Sparkline — mini-gráfico SVG embutido
// ---------------------------------------------------------------------------

/**
 * Renderiza um pequeno gráfico de linha (sparkline) a partir de um
 * array de valores numericos. O gráfico se ajusta automaticamente
 * ao intervalo dos dados e preenche toda a largura disponível.
 */
function Sparkline({
  data,
  color,
  width = 100,
  height = 32,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // evita divisao por zero

  // Padding vertical para o traço não encostar nas bordas
  const paddingY = 3;

  // Gera pontos SVG normalizados entre 0 e a area util
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = paddingY + (1 - (v - min) / range) * (height - paddingY * 2);
    return `${x},${y}`;
  });

  // ID único para o gradiente — evita conflitos quando ha multiplos sparklines
  const gradientId = `spark-grad-${color.replace("#", "")}-${data.length}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        {/* Gradiente vertical para o preenchimento abaixo da linha */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Area preenchida abaixo da linha */}
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />

      {/* Linha do gráfico */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ponto no último valor (destaque) */}
      {(() => {
        const lastPoint = points[points.length - 1].split(",");
        return (
          <circle cx={lastPoint[0]} cy={lastPoint[1]} r={2} fill={color} />
        );
      })()}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tooltip interno do MetricCard
// ---------------------------------------------------------------------------

/**
 * Tooltip simples que aparece ao passar o mouse sobre o cartao.
 * Diferente do InfoTooltip global, este e posicionado em relacao
 * ao cartao inteiro e exibe a descrição da métrica.
 */
function CardTooltip({
  text,
  visible,
  parentRef,
  tooltipId,
}: {
  text: string;
  visible: boolean;
  parentRef: React.RefObject<HTMLDivElement | null>;
  tooltipId: string;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  // Ajusta a posição horizontal para não vazar da janela
  useEffect(() => {
    if (!visible) return;
    requestAnimationFrame(() => {
      const parent = parentRef.current;
      const tooltip = tooltipRef.current;
      if (!parent || !tooltip) return;

      const parentRect = parent.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const padding = 12;

      const parentCenter = parentRect.left + parentRect.width / 2;
      const halfTooltip = tooltipRect.width / 2;

      let newOffset = 0;
      if (parentCenter - halfTooltip < padding) {
        newOffset = padding - (parentCenter - halfTooltip);
      } else if (parentCenter + halfTooltip > window.innerWidth - padding) {
        newOffset = window.innerWidth - padding - (parentCenter + halfTooltip);
      }
      setOffset(newOffset);
    });
  }, [visible, parentRef]);

  if (!visible) return null;

  return (
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      style={
        offset !== 0
          ? ({
              "--tw-translate-x": `calc(-50% + ${offset}px)`,
            } as React.CSSProperties)
          : undefined
      }
      className={[
        "absolute left-1/2 -translate-x-1/2 bottom-full mb-2.5 z-50",
        "w-64 max-w-[calc(100vw-24px)] px-3.5 py-2.5",
        "bg-sf-surface border border-sf-border rounded-xl",
        "shadow-xl shadow-black/30",
        "text-xs leading-relaxed text-sf-text",
        "animate-fade-in pointer-events-none",
      ].join(" ")}
    >
      {text}
      {/* Seta apontando para baixo */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-px">
        <div className="w-2 h-2 bg-sf-surface border-sf-border rotate-45 -translate-y-1 border-r border-b" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal — MetricCard
// ---------------------------------------------------------------------------

export function MetricCard({
  label,
  value,
  unit,
  icon,
  status = "neutral",
  trend,
  description,
  subLabel,
  subValue,
  sparklineData,
  sparklineColor,
  className = "",
}: MetricCardProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const showTooltip = (hovered || focused) && !!description;

  // Cor do sparkline: usa a cor customizada, a cor do status, ou cinza padrão
  const resolvedSparklineColor =
    sparklineColor ?? STATUS_SPARKLINE_COLOR[status];

  // Handlers de interação
  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <div
      ref={cardRef}
      className={[
        // -- Container base --
        "group relative",
        "bg-sf-surface border border-sf-border rounded-xl",
        "p-4",
        // -- Transicoes suaves --
        "transition-all duration-250 ease-out",
        // -- Efeito de hover: borda colorida + sombra de brilho --
        STATUS_BG_HOVER[status],
        STATUS_GLOW[status],
        "group-hover:bg-sf-surfaceHover",
        // -- Foco acessível --
        "focus-within:outline-none focus-within:ring-2",
        "focus-within:ring-sf-primary/50 focus-within:ring-offset-1",
        "focus-within:ring-offset-sf-bg",
        // -- Classes extras --
        className,
      ].join(" ")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={description ? 0 : undefined}
      aria-describedby={description ? tooltipId : undefined}
      aria-label={
        description
          ? `${label}: ${value}${unit ? " " + unit : ""}. ${description}`
          : undefined
      }
    >
      {/* Tooltip com descrição detalhada */}
      {description && (
        <CardTooltip
          text={description}
          visible={showTooltip}
          parentRef={cardRef}
          tooltipId={tooltipId}
        />
      )}

      {/* ===== Linha superior: icone + rótulo + tendencia ===== */}
      <div className="flex items-center justify-between mb-0.5">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[status]}`}
        >
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{label}</span>
        </div>

        {/* Badge de tendencia */}
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-[10px] font-medium ${TREND_COLOR[trend]} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
            title={TREND_LABEL[trend]}
          >
            {TREND_ICON[trend]}
            <span className="sr-only">{TREND_LABEL[trend]}</span>
          </span>
        )}
      </div>

      {/* Sub-rótulo técnico (opcional) */}
      {subLabel && (
        <div className="text-[10px] text-sf-textMuted mb-1 truncate">
          {subLabel}
        </div>
      )}

      {/* ===== Valor principal ===== */}
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl font-bold text-sf-text font-mono leading-tight truncate">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium text-sf-textMuted shrink-0">
            {unit}
          </span>
        )}
      </div>

      {/* Informação secundaria (opcional) */}
      {subValue && (
        <div className="text-xs text-sf-textMuted mt-1 truncate">
          {subValue}
        </div>
      )}

      {/* ===== Area do sparkline (opcional) ===== */}
      {sparklineData && sparklineData.length >= 2 && (
        <div className="mt-2.5 -mx-1 opacity-70 group-hover:opacity-100 transition-opacity duration-200">
          <Sparkline
            data={sparklineData}
            color={resolvedSparklineColor}
            width={120}
            height={28}
          />
        </div>
      )}

      {/* Indicador visual de tendencia — barra fina na borda inferior */}
      {trend && trend !== "neutral" && (
        <div
          className={[
            "absolute bottom-0 left-3 right-3 h-0.5 rounded-full",
            "opacity-0 group-hover:opacity-100",
            "transition-opacity duration-200",
            trend === "up" ? "bg-sf-success/50" : "bg-sf-danger/50",
          ].join(" ")}
        />
      )}
    </div>
  );
}

export default MetricCard;
