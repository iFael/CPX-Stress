import { useState, useCallback, useEffect } from 'react'
import {
  Play,
  Globe,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Shield,
  Loader2,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import { InfoTooltip } from '@/components/InfoTooltip'
import type { ProgressData, TestConfig as TestConfigType } from '@/types'

/* =====================================================================
   CONSTANTES
   Define os presets (perfis prontos) e limites de validacao do formulario.
   ===================================================================== */

/** Perfis de teste pre-configurados para facilitar a escolha do usuario */
const PRESETS = [
  {
    id: 'leve',
    label: 'Leve',
    subtitle: 'Blog ou site pessoal',
    description: 'Simula 10 visitantes ao mesmo tempo por 15 segundos. Ideal para testar sites pequenos.',
    users: 10,
    duration: 15,
  },
  {
    id: 'moderado',
    label: 'Moderado',
    subtitle: 'E-commerce ou portal',
    description: 'Simula 100 visitantes ao mesmo tempo por 30 segundos. Bom para lojas virtuais e portais.',
    users: 100,
    duration: 30,
  },
  {
    id: 'pesado',
    label: 'Pesado',
    subtitle: 'App com muito acesso',
    description: 'Simula 500 visitantes ao mesmo tempo por 1 minuto. Para aplica\u00e7\u00f5es com alto tr\u00e1fego.',
    users: 500,
    duration: 60,
  },
  {
    id: 'extremo',
    label: 'Extremo',
    subtitle: 'Teste de limite',
    description: 'Simula 2.000 visitantes ao mesmo tempo por 2 minutos. Descobre o limite m\u00e1ximo do servidor.',
    users: 2000,
    duration: 120,
  },
] as const

/** Limites minimos e maximos aceitos pelo formulario */
const LIMITS = {
  users: { min: 1, max: 10_000 },
  duration: { min: 5, max: 600 },
  rampUp: { min: 0 },
} as const

/** Opcoes de metodo HTTP disponiveis nas configuracoes avancadas */
const HTTP_METHODS: TestConfigType['method'][] = ['GET', 'POST', 'PUT', 'DELETE']

/* =====================================================================
   FUNCOES AUXILIARES
   ===================================================================== */

/**
 * Valida se uma string e uma URL acessivel (http ou https).
 * Retorna true somente para URLs com protocolo valido.
 */
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Converte segundos em texto legivel.
 * Ex: 90 -> "1 min 30s", 30 -> "30 segundos"
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds !== 1 ? 's' : ''}`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (sec === 0) return `${min} minuto${min !== 1 ? 's' : ''}`
  return `${min} min ${sec}s`
}

/**
 * Restringe um numero ao intervalo [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/* =====================================================================
   ESTILOS REUTILIZAVEIS
   Classes Tailwind agrupadas para manter consistencia e evitar repeticao.
   ===================================================================== */

const inputBaseClass =
  'w-full px-4 py-2.5 bg-sf-surface border border-sf-border rounded-xl text-sf-text ' +
  'focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all'

const labelClass = 'flex items-center gap-2 text-sm text-sf-textSecondary mb-2'

const helpTextClass = 'text-xs text-sf-textMuted mt-1'

/* =====================================================================
   COMPONENTE PRINCIPAL — Formulario de Configuracao do Teste
   Este componente permite ao usuario configurar e iniciar um teste de
   estresse. O usuario informa a URL, escolhe a intensidade e clica em
   "Iniciar Teste". Resultados aparecem em outra tela.
   ===================================================================== */

export function TestConfig() {
  /* ---- Estado global (Zustand store) ---- */
  const config = useTestStore((s) => s.config)
  const updateConfig = useTestStore((s) => s.updateConfig)
  const setStatus = useTestStore((s) => s.setStatus)
  const setProgress = useTestStore((s) => s.setProgress)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const addToHistory = useTestStore((s) => s.addToHistory)
  const error = useTestStore((s) => s.error)
  const setError = useTestStore((s) => s.setError)

  /* ---- Estado local do formulario ---- */
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  /* ---------------------------------------------------------------
     Verifica se algum preset esta selecionado (para destacar o botao).
     --------------------------------------------------------------- */
  const selectedPresetId = PRESETS.find(
    (p) => p.users === config.virtualUsers && p.duration === config.duration
  )?.id ?? null

  /* ---------------------------------------------------------------
     handleStart — Valida o formulario e inicia o teste de estresse.
     1. Verifica se a URL foi preenchida e e valida.
     2. Limpa erros anteriores e inicia o teste via API do Electron.
     3. Ao terminar, salva o resultado no historico.
     --------------------------------------------------------------- */
  const handleStart = useCallback(async () => {
    // Validacao: URL nao pode estar vazia
    const trimmedUrl = config.url.trim()
    if (!trimmedUrl) {
      setUrlError('Por favor, cole o endereco (URL) do site que deseja testar.')
      return
    }

    // Validacao: URL precisa ser valida e comecar com http(s)
    if (!isValidHttpUrl(trimmedUrl)) {
      setUrlError(
        'Este endereco nao parece valido. Verifique se comeca com https:// — exemplo: https://www.meusite.com.br'
      )
      return
    }

    // Tudo certo — limpa erros e inicia o teste
    setUrlError('')
    setError(null)
    setIsStarting(true)
    clearProgress()
    setStatus('running')

    // Inscreve-se para receber atualizacoes em tempo real do teste
    const unsubscribe = window.stressflow.test.onProgress((data) => {
      setProgress(data as ProgressData)
    })

    try {
      const result = await window.stressflow.test.start(config)
      setCurrentResult(result)
      addToHistory(result)
      setStatus(result.status === 'cancelled' ? 'cancelled' : 'completed')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ocorreu um erro inesperado ao executar o teste. Tente novamente.'
      )
      setStatus('error')
    } finally {
      unsubscribe()
      setIsStarting(false)
    }
  }, [
    config,
    setUrlError,
    setError,
    clearProgress,
    setStatus,
    setProgress,
    setCurrentResult,
    addToHistory,
  ])

  /**
   * Escuta o evento customizado disparado pelo atalho de teclado Ctrl+Enter.
   * Quando o usuario pressiona Ctrl+Enter em qualquer lugar da aplicacao
   * (estando na tela de configuracao), o teste e iniciado automaticamente.
   */
  useEffect(() => {
    const handleShortcutStart = () => handleStart()
    window.addEventListener('stressflow:start-test', handleShortcutStart)
    return () => window.removeEventListener('stressflow:start-test', handleShortcutStart)
  }, [handleStart])

  /* =================================================================
     RENDERIZACAO
     O formulario e dividido em secoes claras:
     1. Cabecalho com titulo e descricao
     2. Campo de URL
     3. Perfis de intensidade (presets)
     4. Ajuste manual de usuarios e duracao
     5. Configuracoes avancadas (expandiveis)
     6. Botao de iniciar
     ================================================================= */
  return (
    <div
      className="max-w-2xl mx-auto animate-slide-up"
      role="form"
      aria-label="Formulario de configuracao do teste de estresse"
    >

      {/* ---- CAMPO DE URL ----
          O usuario cola aqui o endereco do site que quer testar.
          Exibe mensagem de erro quando a URL e invalida. */}
      <fieldset className="mb-4">
        <legend className="sr-only">Endereco do site a ser testado</legend>
        <div className="relative">
          <Globe
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sf-textMuted"
            aria-hidden="true"
          />
          {/* eslint-disable-next-line jsx-a11y/aria-proptypes -- !!urlError ja e boolean; falso positivo do linter */}
          <input
            id="url-input"
            type="url"
            value={config.url}
            onChange={(e) => {
              updateConfig({ url: e.target.value })
              if (urlError) setUrlError('')
            }}
            placeholder="https://www.exemplo.com.br"
            aria-label="Endereco (URL) do site"
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'url-error' : 'url-hint'}
            className={`w-full pl-12 pr-4 py-3 bg-sf-surface border rounded-xl text-sf-text placeholder:text-sf-textMuted focus:outline-none focus:ring-2 text-lg transition-all ${
              urlError
                ? 'border-sf-danger focus:ring-sf-danger/30'
                : 'border-sf-border focus:ring-sf-primary/30 focus:border-sf-primary'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isStarting) handleStart()
            }}
          />
        </div>

        {/* Mensagem de erro (aparece somente quando ha problema) */}
        {urlError && (
          <p
            id="url-error"
            role="alert"
            className="mt-2 text-sm text-sf-danger flex items-center gap-1.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {urlError}
          </p>
        )}

        {/* Dica sutil quando nao ha erro */}
        {!urlError && (
          <p id="url-hint" className={`${helpTextClass} mt-2`}>
            Cole o endereco completo, incluindo https://
          </p>
        )}
      </fieldset>

      {/* ---- PERFIS DE INTENSIDADE (PRESETS) ----
          Botoes que configuram automaticamente a quantidade de usuarios
          e a duracao do teste. Cada perfil tem uma descricao para ajudar
          o usuario a entender o que esta escolhendo. */}
      <fieldset className="mb-4" role="group" aria-label="Perfis de intensidade">
        <legend className="text-sm font-medium text-sf-textSecondary mb-3 flex items-center gap-2">
          Intensidade do Teste
          <InfoTooltip text="Escolha um perfil pronto ou ajuste manualmente os valores abaixo. Quanto maior a intensidade, mais visitantes simulados acessam o site ao mesmo tempo." />
        </legend>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-stretch">
          {PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id
            /* eslint-disable jsx-a11y/aria-proptypes -- isSelected (===) ja e boolean; falso positivo do linter */
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  updateConfig({
                    virtualUsers: preset.users,
                    duration: preset.duration,
                  })
                }
                aria-pressed={isSelected}
                aria-label={`Perfil ${preset.label}: ${preset.description}`}
                title={preset.description}
                className={`relative flex flex-col justify-between px-3 py-3 rounded-xl text-left text-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-1 h-full ${
                  isSelected
                    ? 'bg-sf-primary/10 border-sf-primary text-sf-primary ring-1 ring-sf-primary/30'
                    : 'bg-sf-surface border-sf-border text-sf-textSecondary hover:border-sf-textMuted hover:bg-sf-surface/80'
                }`}
              >
                {/* Nome do perfil */}
                <div className="font-semibold">
                  {preset.label}
                </div>

                {/* Subtitulo descritivo — ex: "Blog ou site pessoal" */}
                <div className="text-xs mt-0.5 opacity-70">
                  {preset.subtitle}
                </div>

                {/* Valores tecnicos resumidos */}
                <div className="text-[11px] mt-auto pt-1.5 opacity-50">
                  {preset.users.toLocaleString('pt-BR')} usuarios &middot;{' '}
                  {formatDuration(preset.duration)}
                </div>
              </button>
            )
            /* eslint-enable jsx-a11y/aria-proptypes */
          })}
        </div>
      </fieldset>

      {/* ---- CONFIGURACAO MANUAL ----
          Permite ajustar livremente o numero de usuarios e a duracao.
          Os valores sao limitados automaticamente (clamp) para evitar
          numeros fora da faixa aceita. */}
      <fieldset className="grid grid-cols-2 gap-3 mb-3">
        <legend className="sr-only">Ajuste manual</legend>

        {/* Numero de usuarios simultaneos */}
        <div>
          <label htmlFor="input-users" className={labelClass}>
            <Users className="w-4 h-4" aria-hidden="true" />
            Visitantes Simultaneos
            <InfoTooltip text="Quantidade de visitantes virtuais que acessarao o site ao mesmo tempo. Quanto mais visitantes, maior a pressao sobre o servidor." />
          </label>
          <input
            id="input-users"
            type="number"
            value={config.virtualUsers}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) {
                updateConfig({
                  virtualUsers: clamp(n, LIMITS.users.min, LIMITS.users.max),
                })
              }
            }}
            min={LIMITS.users.min}
            max={LIMITS.users.max}
            aria-describedby="users-hint"
            className={inputBaseClass}
          />
          <p id="users-hint" className={helpTextClass}>
            De {LIMITS.users.min.toLocaleString('pt-BR')} a{' '}
            {LIMITS.users.max.toLocaleString('pt-BR')} visitantes
          </p>
        </div>

        {/* Duracao do teste */}
        <div>
          <label htmlFor="input-duration" className={labelClass}>
            <Clock className="w-4 h-4" aria-hidden="true" />
            Duracao do Teste
            <InfoTooltip text="Tempo total que o teste ficara rodando. Testes mais longos produzem resultados mais confiaveis." />
          </label>
          <input
            id="input-duration"
            type="number"
            value={config.duration}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) {
                updateConfig({
                  duration: clamp(n, LIMITS.duration.min, LIMITS.duration.max),
                })
              }
            }}
            min={LIMITS.duration.min}
            max={LIMITS.duration.max}
            aria-describedby="duration-hint"
            className={inputBaseClass}
          />
          <p id="duration-hint" className={helpTextClass}>
            {formatDuration(LIMITS.duration.min)} a{' '}
            {formatDuration(LIMITS.duration.max)} ({LIMITS.duration.min}s a{' '}
            {LIMITS.duration.max}s)
          </p>
        </div>
      </fieldset>

      {/* ---- CONFIGURACOES AVANCADAS ----
          Secao oculta por padrao. Mostra opcoes tecnicas como metodo HTTP,
          ramp-up e corpo da requisicao. Destinada a usuarios avancados. */}
      <div className="mb-4">
        {/* eslint-disable-next-line jsx-a11y/aria-proptypes -- showAdvanced (useState<boolean>) ja e boolean; falso positivo do linter */}
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-settings"
          className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary focus-visible:ring-offset-1 rounded-lg px-2 py-1"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
          Configuracoes Avancadas
        </button>

        {showAdvanced && (
          <div
            id="advanced-settings"
            className="mt-3 space-y-4 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up"
            role="region"
            aria-label="Configuracoes avancadas do teste"
          >
            {/* Metodo HTTP — tipo de requisicao enviada ao servidor */}
            <div>
              <label htmlFor="input-method" className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2">
                Metodo HTTP
                <InfoTooltip text="GET busca informacoes do site (o mais comum). POST envia dados. PUT atualiza dados. DELETE remove dados. Na duvida, mantenha em GET." />
              </label>
              <select
                id="input-method"
                value={config.method}
                onChange={(e) =>
                  updateConfig({
                    method: e.target.value as TestConfigType['method'],
                  })
                }
                className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all"
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            {/* Ramp-up — tempo para adicionar os usuarios gradualmente */}
            <div>
              <label htmlFor="input-rampup" className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2">
                Tempo de Subida (ramp-up)
                <InfoTooltip text="Em vez de enviar todos os visitantes de uma vez, voce pode adiciona-los aos poucos. Por exemplo, 10 segundos de ramp-up significa que os visitantes serao adicionados gradualmente ao longo de 10 segundos." />
              </label>
              <input
                id="input-rampup"
                type="number"
                value={config.rampUp || 0}
                onChange={(e) =>
                  updateConfig({
                    rampUp: Math.max(LIMITS.rampUp.min, Number(e.target.value)),
                  })
                }
                min={LIMITS.rampUp.min}
                aria-describedby="rampup-hint"
                className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all"
              />
              <p id="rampup-hint" className={helpTextClass}>
                Tempo em segundos para adicionar todos os visitantes (0 = todos de uma vez)
              </p>
            </div>

            {/* Body da requisicao — aparece apenas para POST, PUT e DELETE */}
            {config.method !== 'GET' && (
              <div>
                <label htmlFor="input-body" className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2">
                  Corpo da Requisicao (JSON)
                  <InfoTooltip text="Dados que serao enviados junto com cada requisicao. Deve estar no formato JSON. Deixe em branco se nao precisar enviar dados." />
                </label>
                <textarea
                  id="input-body"
                  value={config.body || ''}
                  onChange={(e) => updateConfig({ body: e.target.value })}
                  placeholder='{"chave": "valor"}'
                  rows={4}
                  aria-describedby="body-hint"
                  className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all resize-none"
                />
                <p id="body-hint" className={helpTextClass}>
                  Opcional. Utilize formato JSON valido.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- MENSAGEM DE ERRO GLOBAL ----
          Aparece quando o teste falha por algum motivo inesperado. */}
      {error && (
        <div
          role="alert"
          className="mb-4 p-4 bg-sf-danger/10 border border-sf-danger/30 rounded-xl flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-sf-danger shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-sf-danger">
              Nao foi possivel completar o teste
            </p>
            <p className="text-sm text-sf-danger/80 mt-1">{error}</p>
            <p className="text-xs text-sf-textMuted mt-2">
              Verifique sua conexao com a internet e se a URL do site esta correta. Caso o problema persista, tente reduzir o numero de visitantes simultaneos.
            </p>
          </div>
        </div>
      )}

      {/* ---- BOTAO INICIAR TESTE ---- */}
      <button
        type="button"
        onClick={handleStart}
        disabled={isStarting}
        className="w-full py-3.5 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 shadow-lg shadow-sf-primary/20 focus:outline-none focus:ring-2 focus:ring-sf-primary/50 focus:ring-offset-2 focus:ring-offset-sf-bg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        aria-label={
          isStarting
            ? 'Iniciando teste...'
            : `Iniciar teste com ${config.virtualUsers.toLocaleString('pt-BR')} visitantes por ${formatDuration(config.duration)} (atalho: Ctrl+Enter)`
        }
      >
        {isStarting ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="w-5 h-5" aria-hidden="true" />
        )}
        {isStarting ? 'Iniciando...' : 'Iniciar Teste'}
        {!isStarting && (
          <kbd className="ml-2 text-xs opacity-50 font-normal" aria-hidden="true">Ctrl+Enter</kbd>
        )}
      </button>

      {/* ---- AVISO LEGAL ---- */}
      <div className="flex items-start gap-2 justify-center mt-3">
        <Shield className="w-4 h-4 text-sf-textMuted shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-sf-textMuted leading-relaxed">
          O teste enviara varias requisicoes HTTP para a URL informada.
          <br />
          Use <strong>somente</strong> em sites que voce tem autorizacao para testar.
        </p>
      </div>
    </div>
  )
}
