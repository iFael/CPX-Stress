import { Feather, Flame, Zap, Skull, Users, Clock } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

/* =====================================================================
   TIPOS
   ===================================================================== */

/** Dados de um perfil pre-configurado de teste. */
interface Preset {
  /** Identificador unico (slug). */
  id: string
  /** Nome exibido no card (em portugues). */
  label: string
  /** Descricao curta e acessivel para leigos. */
  description: string
  /** Quantidade de usuarios virtuais simultaneos. */
  users: number
  /** Duracao do teste em segundos. */
  duration: number
  /** Icone Lucide que representa a intensidade. */
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>
  /** Classe Tailwind para a cor do icone no estado normal. */
  iconColor: string
  /** Classe Tailwind para o fundo sutil do icone. */
  iconBg: string
  /** Classe Tailwind para a borda do card quando selecionado. */
  selectedBorder: string
  /** Classe Tailwind para o anel (ring) quando selecionado. */
  selectedRing: string
}

/** Props aceitas pelo componente PresetSelector. */
export interface PresetSelectorProps {
  /** Numero atual de usuarios virtuais (usado para detectar selecao). */
  selectedUsers: number
  /** Duracao atual em segundos (usado para detectar selecao). */
  selectedDuration: number
  /** Callback disparado quando o usuario escolhe um preset. */
  onSelect: (users: number, duration: number) => void
}

/* =====================================================================
   CONSTANTES — PRESETS
   ===================================================================== */

const PRESETS: readonly Preset[] = [
  {
    id: 'leve',
    label: 'Leve',
    description: 'Simula poucos usuarios - ideal para testes iniciais',
    users: 10,
    duration: 15,
    Icon: Feather,
    iconColor: 'text-sf-success',
    iconBg: 'bg-sf-success/10',
    selectedBorder: 'border-sf-primary',
    selectedRing: 'ring-sf-primary/30',
  },
  {
    id: 'moderado',
    label: 'Moderado',
    description: 'Carga media - simula uso tipico do dia a dia',
    users: 100,
    duration: 30,
    Icon: Flame,
    iconColor: 'text-sf-warning',
    iconBg: 'bg-sf-warning/10',
    selectedBorder: 'border-sf-primary',
    selectedRing: 'ring-sf-primary/30',
  },
  {
    id: 'pesado',
    label: 'Pesado',
    description: 'Alta demanda - testa limites do servidor',
    users: 500,
    duration: 60,
    Icon: Zap,
    iconColor: 'text-sf-accent',
    iconBg: 'bg-sf-accent/10',
    selectedBorder: 'border-sf-primary',
    selectedRing: 'ring-sf-primary/30',
  },
  {
    id: 'extremo',
    label: 'Extremo',
    description: 'Carga maxima - descobre o ponto de ruptura',
    users: 2000,
    duration: 120,
    Icon: Skull,
    iconColor: 'text-sf-danger',
    iconBg: 'bg-sf-danger/10',
    selectedBorder: 'border-sf-primary',
    selectedRing: 'ring-sf-primary/30',
  },
] as const

/* =====================================================================
   FUNCOES AUXILIARES
   ===================================================================== */

/**
 * Converte segundos em texto legivel em portugues.
 * Ex: 90 -> "1 min 30s", 30 -> "30s", 120 -> "2 min"
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (sec === 0) return `${min} min`
  return `${min} min ${sec}s`
}

/* =====================================================================
   COMPONENTE — PresetSelector
   Exibe os perfis de intensidade como cards visuais em um grid responsivo.
   ===================================================================== */

export function PresetSelector({
  selectedUsers,
  selectedDuration,
  onSelect,
}: PresetSelectorProps) {
  /** Detecta qual preset esta selecionado com base nos valores atuais. */
  const selectedId =
    PRESETS.find(
      (p) => p.users === selectedUsers && p.duration === selectedDuration,
    )?.id ?? null

  return (
    <fieldset
      className="w-full"
      role="radiogroup"
      aria-label="Perfis de intensidade do teste"
    >
      <legend className="sr-only">
        Escolha a intensidade do teste de estresse
      </legend>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRESETS.map((preset) => {
          const isSelected = selectedId === preset.id
          const { Icon } = preset

          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={Boolean(isSelected)}
              aria-label={`${preset.label}: ${preset.users.toLocaleString('pt-BR')} usuarios virtuais por ${formatDuration(preset.duration)}`}
              onClick={() => onSelect(preset.users, preset.duration)}
              className={[
                /* --- Base --- */
                'relative flex flex-col gap-3 p-4 rounded-xl border text-left',
                'transition-all duration-200 ease-out',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sf-bg',
                'cursor-pointer group',

                /* --- Estado: selecionado vs padrao --- */
                isSelected
                  ? [
                      'bg-sf-primary/[0.07] border-sf-primary ring-1 ring-sf-primary/30',
                      'shadow-glow-sm',
                    ].join(' ')
                  : [
                      'bg-sf-surface border-sf-border',
                      'hover:border-sf-textMuted hover:bg-sf-surfaceHover hover:shadow-card-hover',
                      'active:bg-sf-surfaceActive active:scale-[0.98]',
                    ].join(' '),
              ].join(' ')}
            >
              {/* ---- Cabecalho: icone + nome ---- */}
              <div className="flex items-center gap-3">
                <div
                  className={[
                    'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
                    'transition-transform duration-200 group-hover:scale-110',
                    preset.iconBg,
                  ].join(' ')}
                  aria-hidden="true"
                >
                  <Icon className={`w-5 h-5 ${preset.iconColor}`} />
                </div>

                <span
                  className={[
                    'text-base font-semibold',
                    isSelected ? 'text-sf-primary' : 'text-sf-text',
                  ].join(' ')}
                >
                  {preset.label}
                </span>
              </div>

              {/* ---- Descricao ---- */}
              <p className="text-sm text-sf-textSecondary leading-relaxed">
                {preset.description}
              </p>

              {/* ---- Metricas: usuarios e duracao ---- */}
              <div className="flex items-center gap-4 text-xs text-sf-textMuted mt-auto pt-2 border-t border-sf-border/50">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  {preset.users.toLocaleString('pt-BR')} usuarios
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  {formatDuration(preset.duration)}
                </span>
              </div>

              {/* ---- Indicador de selecao (bolinha) ---- */}
              <span
                className={[
                  'absolute top-3 right-3 w-2.5 h-2.5 rounded-full transition-all duration-200',
                  isSelected
                    ? 'bg-sf-primary shadow-glow-sm scale-100 opacity-100'
                    : 'bg-sf-border scale-75 opacity-50 group-hover:opacity-80',
                ].join(' ')}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
