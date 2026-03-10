import { useState, useRef, useEffect, useCallback } from 'react'
import { Download, FileText, FileJson } from 'lucide-react'

interface ExportOption {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  action: () => void
  disabled?: boolean
}

interface ExportMenuProps {
  onExportPDF: () => void
  onExportJSON: () => void
  exporting?: boolean
}

export function ExportMenu({ onExportPDF, onExportJSON, exporting = false }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const options: ExportOption[] = [
    {
      id: 'pdf',
      icon: <FileText className="w-5 h-5 text-sf-primary" />,
      label: 'Exportar PDF',
      description: 'Relatório completo com gráficos e análise',
      action: onExportPDF,
      disabled: exporting,
    },
    {
      id: 'json',
      icon: <FileJson className="w-5 h-5 text-sf-accent" />,
      label: 'Exportar JSON',
      description: 'Dados brutos para integração com outras ferramentas',
      action: onExportJSON,
    },
  ]

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setFocusedIndex(-1)
    triggerRef.current?.focus()
  }, [])

  const openMenu = useCallback(() => {
    setIsOpen(true)
    setFocusedIndex(0)
  }, [])

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu()
    } else {
      openMenu()
    }
  }, [isOpen, closeMenu, openMenu])

  // Focus the active menu item when focusedIndex changes
  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus()
    }
  }, [isOpen, focusedIndex])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, closeMenu])

  // Close on focus leaving the menu entirely
  useEffect(() => {
    if (!isOpen) return

    function handleFocusOut(event: FocusEvent) {
      if (menuRef.current && !menuRef.current.contains(event.relatedTarget as Node)) {
        closeMenu()
      }
    }

    const ref = menuRef.current
    ref?.addEventListener('focusout', handleFocusOut)
    return () => ref?.removeEventListener('focusout', handleFocusOut)
  }, [isOpen, closeMenu])

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault()
        openMenu()
        break
      case 'ArrowUp':
        event.preventDefault()
        setIsOpen(true)
        setFocusedIndex(options.length - 1)
        break
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % options.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + options.length) % options.length)
        break
      case 'Home':
        event.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        event.preventDefault()
        setFocusedIndex(options.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu()
        break
    }
  }

  function handleOptionSelect(option: ExportOption) {
    if (option.disabled) return
    option.action()
    closeMenu()
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="true"
        aria-expanded={!!isOpen}
        aria-controls="export-menu-dropdown"
        className={[
          'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
          'bg-sf-primary hover:bg-sf-primaryHover text-white',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-sf-primary/50 focus:ring-offset-2 focus:ring-offset-sf-bg',
          exporting ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
        disabled={exporting}
      >
        <Download className="w-4 h-4" />
        {exporting ? 'Exportando...' : 'Exportar'}
        <svg
          className={[
            'w-3.5 h-3.5 transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div
        id="export-menu-dropdown"
        role="menu"
        aria-label="Opções de exportação"
        onKeyDown={handleMenuKeyDown}
        className={[
          'absolute right-0 mt-2 w-72 z-50',
          'rounded-xl overflow-hidden',
          'border border-sf-border',
          'shadow-elevated',
          'origin-top-right',
          'transition-all duration-200 ease-out-expo',
          'bg-sf-surface',
          isOpen
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 -translate-y-1 pointer-events-none',
        ].join(' ')}
      >
        {/* Menu header */}
        <div
          className="px-4 py-2.5 border-b border-sf-border text-xs font-medium text-sf-textMuted uppercase tracking-wider"
        >
          Exportar resultados
        </div>

        {/* Menu items */}
        <div className="py-1">
          {options.map((option, index) => (
            <button
              key={option.id}
              ref={(el) => { itemRefs.current[index] = el }}
              role="menuitem"
              tabIndex={focusedIndex === index ? 0 : -1}
              aria-disabled={!!option.disabled}
              onClick={() => handleOptionSelect(option)}
              className={[
                'w-full flex items-start gap-3 px-4 py-3 text-left',
                'transition-colors duration-150',
                'focus:outline-none',
                option.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-sf-surfaceHover focus:bg-sf-surfaceHover cursor-pointer',
                focusedIndex === index ? 'bg-sf-surfaceHover' : '',
              ].join(' ')}
            >
              <div className="mt-0.5 shrink-0">{option.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-sf-text">
                  {option.id === 'pdf' && exporting ? 'Gerando PDF...' : option.label}
                </div>
                <div className="text-xs text-sf-textMuted mt-0.5 leading-relaxed">
                  {option.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
