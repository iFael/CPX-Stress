import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { Info } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// InfoTooltip — Componente de dica informativa reutilizável
//
// Exibe um pequeno icone de "informacao" (i). Quando o usuario
// passa o mouse por cima ou clica, aparece uma caixa com texto
// explicativo. Funciona bem com teclado e leitores de tela.
// ─────────────────────────────────────────────────────────────

/**
 * Propriedades aceitas pelo componente InfoTooltip.
 *
 * - text: o texto explicativo que sera mostrado na caixa flutuante
 * - className: classes CSS extras para posicionamento no layout pai
 */
interface InfoTooltipProps {
  text: string
  className?: string
}

/**
 * Posicao calculada do tooltip em relacao ao icone.
 * O tooltip tenta aparecer acima; se nao houver espaco,
 * aparece abaixo. Tambem se ajusta horizontalmente para
 * nao sair da tela.
 */
interface TooltipPosition {
  /** 'top' = acima do icone, 'bottom' = abaixo do icone */
  vertical: 'top' | 'bottom'
  /** Deslocamento horizontal em pixels (para nao vazar da tela) */
  horizontalOffset: number
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  // Controla se o tooltip esta visivel ou nao
  const [visible, setVisible] = useState(false)

  // Posicao calculada dinamicamente (acima/abaixo, deslocamento lateral)
  const [position, setPosition] = useState<TooltipPosition>({
    vertical: 'top',
    horizontalOffset: 0,
  })

  // Referencia ao balao do tooltip (para medir tamanho e posicao)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Referencia ao botao que aciona o tooltip
  const triggerRef = useRef<HTMLButtonElement>(null)

  // ID unico para conectar o botao ao tooltip (acessibilidade)
  const tooltipId = useId()

  // ── Calcular posicao ideal do tooltip ──────────────────────
  // Verifica se o tooltip cabe acima do icone. Se nao couber,
  // posiciona abaixo. Tambem ajusta o eixo horizontal para que
  // o conteudo nao saia da area visivel da janela.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tooltip = tooltipRef.current
    if (!trigger || !tooltip) return

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()

    // Margem de seguranca para nao encostar na borda da janela
    const VIEWPORT_PADDING = 12

    // Decide se mostra acima ou abaixo
    const spaceAbove = triggerRect.top
    const vertical: TooltipPosition['vertical'] =
      spaceAbove < tooltipRect.height + VIEWPORT_PADDING ? 'bottom' : 'top'

    // Calcula se o tooltip vaza para a esquerda ou direita
    const tooltipCenter = triggerRect.left + triggerRect.width / 2
    const halfTooltip = tooltipRect.width / 2
    let horizontalOffset = 0

    // Se vazar pela esquerda, empurra para a direita
    if (tooltipCenter - halfTooltip < VIEWPORT_PADDING) {
      horizontalOffset = VIEWPORT_PADDING - (tooltipCenter - halfTooltip)
    }
    // Se vazar pela direita, empurra para a esquerda
    else if (tooltipCenter + halfTooltip > window.innerWidth - VIEWPORT_PADDING) {
      horizontalOffset = window.innerWidth - VIEWPORT_PADDING - (tooltipCenter + halfTooltip)
    }

    setPosition({ vertical, horizontalOffset })
  }, [])

  // ── Recalcula posicao quando o tooltip aparece ─────────────
  useEffect(() => {
    if (!visible) return
    // Pequeno atraso para garantir que o tooltip ja foi renderizado
    requestAnimationFrame(updatePosition)
  }, [visible, updatePosition])

  // ── Fechar ao clicar fora do tooltip ou do icone ───────────
  // Isso permite que o usuario feche o tooltip clicando em
  // qualquer outro lugar da pagina.
  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedOutsideTooltip = tooltipRef.current && !tooltipRef.current.contains(target)
      const clickedOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target)

      if (clickedOutsideTooltip && clickedOutsideTrigger) {
        setVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible])

  // ── Fechar com a tecla Escape ──────────────────────────────
  // Permite que usuarios de teclado fechem o tooltip facilmente.
  useEffect(() => {
    if (!visible) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false)
        // Devolve o foco para o botao ao fechar
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [visible])

  // ── Funcoes de interacao ───────────────────────────────────

  /** Alterna a visibilidade ao clicar (util em telas de toque) */
  const handleClick = useCallback(() => {
    setVisible((prev) => !prev)
  }, [])

  /** Mostra o tooltip quando o mouse entra na area do icone */
  const handleMouseEnter = useCallback(() => {
    setVisible(true)
  }, [])

  /** Esconde o tooltip quando o mouse sai da area do icone */
  const handleMouseLeave = useCallback(() => {
    setVisible(false)
  }, [])

  /** Mostra o tooltip quando o botao recebe foco via teclado */
  const handleFocus = useCallback(() => {
    setVisible(true)
  }, [])

  /** Esconde o tooltip quando o botao perde o foco */
  const handleBlur = useCallback(() => {
    setVisible(false)
  }, [])

  // ── Classes CSS do tooltip ─────────────────────────────────
  // Monta as classes de posicao de acordo com o calculo feito.

  // Posicao vertical: acima ou abaixo do icone
  const verticalClasses =
    position.vertical === 'top'
      ? 'bottom-full mb-2'   // Acima do icone, com espaco
      : 'top-full mt-2'      // Abaixo do icone, com espaco

  // A setinha (seta) que conecta o tooltip ao icone
  const arrowClasses =
    position.vertical === 'top'
      ? 'top-full -mt-px'    // Seta apontando para baixo
      : 'bottom-full -mb-px' // Seta apontando para cima

  const arrowRotation =
    position.vertical === 'top'
      ? 'rotate-45 -translate-y-1 border-r border-b'   // Triangulo para baixo
      : '-rotate-[135deg] translate-y-1 border-r border-b' // Triangulo para cima

  // ── Renderizacao ───────────────────────────────────────────

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {/* Botao com icone de informacao */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={[
          // Tamanho e formato do botao
          'inline-flex items-center justify-center',
          'w-5 h-5 rounded-full',
          // Cores: muda ao passar o mouse ou quando ativo
          'text-sf-textMuted',
          'hover:text-sf-primary hover:bg-sf-primary/10',
          'focus-visible:text-sf-primary focus-visible:bg-sf-primary/10',
          // Anel de foco visivel para navegacao por teclado
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-sf-primary/50 focus-visible:ring-offset-1',
          'focus-visible:ring-offset-sf-bg',
          // Transicao suave para todas as mudancas visuais
          'transition-all duration-200 ease-out',
          // Cursor de ajuda indica que ha informacao extra
          'cursor-help',
        ].join(' ')}
        aria-label="Mais informacoes"
        aria-describedby={visible ? tooltipId : undefined}
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2.25} />
      </button>

      {/* Caixa flutuante com o texto explicativo */}
      {visible && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          // Estilo inline necessario: o deslocamento horizontal e calculado
          // dinamicamente em tempo de execucao com base na posicao do tooltip
          // na viewport, portanto nao pode ser expresso como classe Tailwind.
          style={{
            transform: `translateX(calc(-50% + ${position.horizontalOffset}px))`,
          }}
          className={[
            // Posicao flutuante sobre o conteudo
            'absolute left-1/2 z-50',
            verticalClasses,
            // Tamanho e espacamento interno
            'w-64 max-w-[calc(100vw-24px)] px-3.5 py-2.5',
            // Aparencia: fundo escuro, borda sutil, cantos arredondados
            'bg-sf-surface border border-sf-border rounded-xl',
            // Sombra pronunciada para destacar do fundo
            'shadow-xl shadow-black/30',
            // Texto legivel e bem espacado
            'text-xs leading-relaxed text-sf-text',
            // Animacao de entrada: surge suavemente
            'animate-[tooltip-enter_150ms_ease-out_forwards]',
          ].join(' ')}
        >
          {/* Texto explicativo */}
          {text}

          {/* Seta decorativa que aponta para o icone */}
          <div className={`absolute left-1/2 -translate-x-1/2 ${arrowClasses}`}>
            <div
              className={`w-2 h-2 bg-sf-surface border-sf-border ${arrowRotation}`}
            />
          </div>
        </div>
      )}
    </span>
  )
}
