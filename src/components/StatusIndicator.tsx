/**
 * StatusIndicator.tsx — Indicador de status do aplicativo StressFlow
 *
 * Exibe um pequeno indicador visual no cabecalho mostrando o estado
 * atual da aplicacao: Pronto, Testando, Concluido ou Erro.
 *
 * Caracteristicas:
 *   - Codigo de cores: verde (pronto), azul pulsante (testando),
 *     verde com check (concluido), vermelho (erro)
 *   - Animacao de pulso durante execucao de teste
 *   - Rotulos em portugues
 *   - Compacto e discreto — projetado para caber no header
 */

import { useTestStore } from '@/stores/test-store'
import {
  Circle,
  Loader,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { TestStatus } from '@/types'

/* -------------------------------------------------------------------------- */
/*  Configuracao de cada estado                                               */
/* -------------------------------------------------------------------------- */

interface StatusConfig {
  /** Rotulo exibido ao lado do indicador */
  label: string
  /** Classe de cor do ponto/icone */
  iconColor: string
  /** Classe de cor do texto do rotulo */
  textColor: string
  /** Icone Lucide a ser renderizado */
  icon: typeof Circle
  /** Se deve aplicar animacao de pulso */
  pulse: boolean
  /** Classe de cor do anel de fundo (glow sutil) */
  glowColor: string
}

/**
 * Mapa de configuracao para cada status possivel.
 *
 * Os estados 'cancelled' e 'completed' compartilham a mesma aparencia
 * visual (Concluido), pois ambos representam um teste finalizado.
 */
const STATUS_MAP: Record<TestStatus, StatusConfig> = {
  idle: {
    label: 'Pronto',
    iconColor: 'text-sf-success',
    textColor: 'text-sf-textMuted',
    icon: Circle,
    pulse: false,
    glowColor: 'bg-sf-success/10',
  },
  running: {
    label: 'Testando...',
    iconColor: 'text-sf-primary',
    textColor: 'text-sf-primary',
    icon: Loader,
    pulse: true,
    glowColor: 'bg-sf-primary/10',
  },
  completed: {
    label: 'Concluido',
    iconColor: 'text-sf-success',
    textColor: 'text-sf-textMuted',
    icon: CheckCircle2,
    pulse: false,
    glowColor: 'bg-sf-success/10',
  },
  cancelled: {
    label: 'Concluido',
    iconColor: 'text-sf-success',
    textColor: 'text-sf-textMuted',
    icon: CheckCircle2,
    pulse: false,
    glowColor: 'bg-sf-success/10',
  },
  error: {
    label: 'Erro',
    iconColor: 'text-sf-danger',
    textColor: 'text-sf-danger',
    icon: AlertCircle,
    pulse: false,
    glowColor: 'bg-sf-danger/10',
  },
}

/* -------------------------------------------------------------------------- */
/*  Componente StatusIndicator                                                */
/* -------------------------------------------------------------------------- */

/**
 * Indicador compacto de status da aplicacao.
 *
 * Projetado para ser inserido no cabecalho (header) do Layout.
 * Le o status diretamente do store global, entao nao precisa de props.
 *
 * Uso:
 *   <StatusIndicator />
 */
export function StatusIndicator() {
  const status = useTestStore((s) => s.status)
  const cfg = STATUS_MAP[status]
  const Icon = cfg.icon

  return (
    <div
      className="flex items-center gap-1.5"
      role="status"
      aria-live="polite"
      aria-label={`Status do aplicativo: ${cfg.label}`}
    >
      {/* Ponto indicador com glow sutil de fundo */}
      <span
        className={`
          relative flex items-center justify-center
          w-5 h-5 rounded-full
          ${cfg.glowColor}
        `}
      >
        {/* Anel de pulso animado — visivel apenas durante execucao */}
        {cfg.pulse && (
          <span
            className="
              absolute inset-0
              rounded-full
              bg-sf-primary/20
              animate-ping
            "
            aria-hidden="true"
          />
        )}

        {/* Icone principal */}
        <Icon
          className={`
            relative w-3 h-3
            ${cfg.iconColor}
            ${cfg.pulse ? 'animate-spin-slow' : ''}
          `}
          aria-hidden="true"
        />
      </span>

      {/* Rotulo textual */}
      <span className={`text-xs font-medium ${cfg.textColor}`}>
        {cfg.label}
      </span>
    </div>
  )
}
