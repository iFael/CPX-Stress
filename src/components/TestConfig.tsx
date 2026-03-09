import { useState } from 'react'
import {
  Play,
  Globe,
  Users,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useTestStore } from '@/stores/test-store'
import type { ProgressData, TestConfig as TestConfigType } from '@/types'

export function TestConfig() {
  const config = useTestStore((s) => s.config)
  const updateConfig = useTestStore((s) => s.updateConfig)
  const setStatus = useTestStore((s) => s.setStatus)
  const setProgress = useTestStore((s) => s.setProgress)
  const clearProgress = useTestStore((s) => s.clearProgress)
  const setCurrentResult = useTestStore((s) => s.setCurrentResult)
  const addToHistory = useTestStore((s) => s.addToHistory)
  const error = useTestStore((s) => s.error)
  const setError = useTestStore((s) => s.setError)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [urlError, setUrlError] = useState('')

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  const handleStart = async () => {
    if (!config.url.trim()) {
      setUrlError('Cole a URL do site para testar')
      return
    }
    if (!validateUrl(config.url)) {
      setUrlError('URL inválida. Use o formato: https://www.exemplo.com.br')
      return
    }

    setUrlError('')
    setError(null)
    clearProgress()
    setStatus('running')

    const unsubscribe = window.stressflow.test.onProgress((data) => {
      setProgress(data as ProgressData)
    })

    try {
      const result = await window.stressflow.test.start(config)
      setCurrentResult(result)
      addToHistory(result)
      setStatus(result.status === 'cancelled' ? 'cancelled' : 'completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar o teste')
      setStatus('error')
    } finally {
      unsubscribe()
    }
  }

  const presets = [
    { label: 'Leve', users: 10, duration: 15 },
    { label: 'Moderado', users: 100, duration: 30 },
    { label: 'Pesado', users: 500, duration: 60 },
    { label: 'Extremo', users: 2000, duration: 120 },
  ]

  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sf-primary/10 mb-4">
          <Zap className="w-8 h-8 text-sf-primary" />
        </div>
        <h1 className="text-2xl font-bold text-sf-text mb-2">
          Teste de Estresse
        </h1>
        <p className="text-sf-textSecondary">
          Cole o link do site e clique em iniciar
        </p>
      </div>

      {/* URL Input */}
      <div className="mb-6">
        <div className="relative">
          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sf-textMuted" />
          <input
            type="url"
            value={config.url}
            onChange={(e) => {
              updateConfig({ url: e.target.value })
              setUrlError('')
            }}
            placeholder="https://www.exemplo.com.br"
            className={`w-full pl-12 pr-4 py-4 bg-sf-surface border rounded-xl text-sf-text placeholder:text-sf-textMuted focus:outline-none focus:ring-2 text-lg transition-all ${
              urlError
                ? 'border-sf-danger focus:ring-sf-danger/30'
                : 'border-sf-border focus:ring-sf-primary/30 focus:border-sf-primary'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStart()
            }}
          />
        </div>
        {urlError && (
          <p className="mt-2 text-sm text-sf-danger">{urlError}</p>
        )}
      </div>

      {/* Presets */}
      <div className="mb-6">
        <label className="text-sm text-sf-textSecondary mb-2 block">
          Presets Rápidos
        </label>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() =>
                updateConfig({
                  virtualUsers: preset.users,
                  duration: preset.duration,
                })
              }
              className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                config.virtualUsers === preset.users &&
                config.duration === preset.duration
                  ? 'bg-sf-primary/10 border-sf-primary text-sf-primary'
                  : 'bg-sf-surface border-sf-border text-sf-textSecondary hover:border-sf-textMuted'
              }`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-xs mt-0.5 opacity-70">
                {preset.users} usr · {preset.duration}s
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main settings */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="flex items-center gap-2 text-sm text-sf-textSecondary mb-2">
            <Users className="w-4 h-4" />
            Usuários Simultâneos
          </label>
          <input
            type="number"
            value={config.virtualUsers}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) {
                updateConfig({
                  virtualUsers: Math.max(1, Math.min(10000, n)),
                })
              }
            }}
            min={1}
            max={10000}
            className="w-full px-4 py-3 bg-sf-surface border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all"
          />
          <p className="text-xs text-sf-textMuted mt-1">1 a 10.000 usuários</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-sf-textSecondary mb-2">
            <Clock className="w-4 h-4" />
            Duração (segundos)
          </label>
          <input
            type="number"
            value={config.duration}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) {
                updateConfig({
                  duration: Math.max(5, Math.min(600, n)),
                })
              }
            }}
            min={5}
            max={600}
            className="w-full px-4 py-3 bg-sf-surface border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all"
          />
          <p className="text-xs text-sf-textMuted mt-1">5 a 600 segundos</p>
        </div>
      </div>

      {/* Advanced */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary mb-4 transition-colors"
      >
        {showAdvanced ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        Configurações Avançadas
      </button>

      {showAdvanced && (
        <div className="mb-6 space-y-4 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up">
          <div>
            <label className="text-sm text-sf-textSecondary mb-2 block">
              Método HTTP
            </label>
            <select
              value={config.method}
              onChange={(e) =>
                updateConfig({
                  method: e.target.value as TestConfigType['method'],
                })
              }
              className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-sf-textSecondary mb-2 block">
              Ramp-up (segundos)
            </label>
            <input
              type="number"
              value={config.rampUp || 0}
              onChange={(e) =>
                updateConfig({ rampUp: Math.max(0, Number(e.target.value)) })
              }
              min={0}
              className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all"
            />
            <p className="text-xs text-sf-textMuted mt-1">
              Tempo até atingir todos os usuários (0 = imediato)
            </p>
          </div>

          {config.method !== 'GET' && (
            <div>
              <label className="text-sm text-sf-textSecondary mb-2 block">
                Body (JSON)
              </label>
              <textarea
                value={config.body || ''}
                onChange={(e) => updateConfig({ body: e.target.value })}
                placeholder='{"key": "value"}'
                rows={4}
                className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all resize-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-sf-danger/10 border border-sf-danger/30 rounded-xl">
          <p className="text-sm text-sf-danger">{error}</p>
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleStart}
        className="w-full py-4 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 shadow-lg shadow-sf-primary/20"
      >
        <Play className="w-5 h-5" />
        Iniciar Teste
      </button>

      <p className="text-center text-xs text-sf-textMuted mt-4">
        O teste enviará requisições HTTP para a URL informada.
        <br />
        Use apenas em sites que você tem autorização para testar.
      </p>
    </div>
  )
}

