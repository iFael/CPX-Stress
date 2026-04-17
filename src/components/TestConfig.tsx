import { useState, useCallback, useEffect } from "react";
import {
  Play,
  Globe,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Layers,
  Server,
  BookOpen,
  Save,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { InfoTooltip } from "@/components/InfoTooltip";
import { CredentialAlert } from "@/components/CredentialAlert";
import { MistertOperationsPanel } from "@/components/MistertOperationsPanel";
import { PresetModal } from "@/components/PresetModal";
import { SavePresetDialog } from "@/components/SavePresetDialog";
import type {
  FlowSelectionMode,
  MistertValidationResult,
  ProgressData,
  TestPreset,
} from "@/types";
import {
  getMistertModuleByName,
  isMistertModuleOperationName,
  MISTERT_DEFAULT_BASE_URL,
  buildMistertOperations,
  formatFlowSelectionModeLabel,
  formatPresetTimeoutLabel,
  formatRampUpLabel,
  MISTERT_MODULE_METADATA,
} from "@/constants/test-presets";
import compexLogo from "@/assets/compex-logo.gif";

/* =====================================================================
   CONSTANTES
   ===================================================================== */

/** Limites mínimos e máximos aceitos pelo formulario */
const LIMITS = {
  users: { min: 1, max: 10_000 },
  duration: { min: 5, max: 600 },
  rampUp: { min: 0 },
  timeout: { min: 1 },
} as const;

/** Ambientes MisterT pre-configurados */
const MISTERT_ENVIRONMENTS = [
  { label: "Desenvolvimento", url: "https://dev-mistert.compex.com.br", disabled: false },
  { label: "Produção", url: "https://mistert.compex.com.br", disabled: true },
] as const;

const BENCHMARK_PROFILES = [
  {
    id: "legacy",
    label: "Uso real",
    description: "Aleatório com timeout padrão da engine",
    flowSelectionMode: "random" as FlowSelectionMode,
    requestTimeoutMs: undefined,
  },
  {
    id: "stable",
    label: "Convergência estável",
    description: "Round-robin determinístico com 3000 ms",
    flowSelectionMode: "deterministic" as FlowSelectionMode,
    requestTimeoutMs: 3000,
  },
  {
    id: "timeout",
    label: "Timeout curto",
    description: "Round-robin determinístico com 750 ms",
    flowSelectionMode: "deterministic" as FlowSelectionMode,
    requestTimeoutMs: 750,
  },
] as const;

/* =====================================================================
   ESTILOS REUTILIZAVEIS
   Classes Tailwind agrupadas para manter consistencia e evitar repeticao.
   ===================================================================== */

const inputBaseClass =
  "w-full px-4 py-2.5 bg-sf-surface border border-sf-border rounded-xl text-sf-text " +
  "focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all";

const labelClass = "flex items-center gap-2 text-sm text-sf-textSecondary mb-2";

const helpTextClass = "text-xs text-sf-textMuted mt-1";

const advancedInputClass =
  "w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text " +
  "focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all disabled:cursor-not-allowed disabled:opacity-60";

/* =====================================================================
   COMPONENTE PRINCIPAL — Configuração do Teste MisterT ERP
   O usuário escolhe o ambiente, ajusta usuários/duração e inicia.
   O fluxo MisterT base e os módulos selecionáveis já vêm configurados.
   ===================================================================== */

export function TestConfig() {
  /* ---- Estado global (Zustand store) ---- */
  const config = useTestStore((s) => s.config);
  const updateConfig = useTestStore((s) => s.updateConfig);
  const setStatus = useTestStore((s) => s.setStatus);
  const setProgress = useTestStore((s) => s.setProgress);
  const clearProgress = useTestStore((s) => s.clearProgress);
  const setCurrentResult = useTestStore((s) => s.setCurrentResult);
  const addToHistory = useTestStore((s) => s.addToHistory);
  const setBenchmarkRun = useTestStore((s) => s.setBenchmarkRun);
  const error = useTestStore((s) => s.error);
  const setError = useTestStore((s) => s.setError);
  const credentialStatus = useTestStore((s) => s.credentialStatus);
  const activePreset = useTestStore((s) => s.activePreset);
  const clearActivePreset = useTestStore((s) => s.clearActivePreset);
  const setPresets = useTestStore((s) => s.setPresets);
  const updateModuleSelection = useTestStore((s) => s.updateModuleSelection);

  /* ---- Estado local do formulario ---- */
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOperations, setShowOperations] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [validationResult, setValidationResult] =
    useState<MistertValidationResult | null>(null);

  // Campos numéricos: estado local em string para permitir edição livre;
  // sincroniza com a store apenas no blur (clampeado).
  const [usersStr, setUsersStr] = useState(String(config.virtualUsers));
  const [durationStr, setDurationStr] = useState(String(config.duration));
  const [rampUpStr, setRampUpStr] = useState(String(config.rampUp || 0));
  const [timeoutStr, setTimeoutStr] = useState(
    config.requestTimeoutMs ? String(config.requestTimeoutMs) : "",
  );

  // Sincronizar se o store mudar por fora (ex: reset ou aplicação de preset)
  useEffect(() => setUsersStr(String(config.virtualUsers)), [config.virtualUsers]);
  useEffect(() => setDurationStr(String(config.duration)), [config.duration]);
  useEffect(() => setRampUpStr(String(config.rampUp || 0)), [config.rampUp]);
  useEffect(
    () =>
      setTimeoutStr(
        config.requestTimeoutMs ? String(config.requestTimeoutMs) : "",
      ),
    [config.requestTimeoutMs],
  );

  // Carregar presets do banco na inicialização (para SavePresetDialog validar nomes)
  useEffect(() => {
    window.stressflow.presets.list()
      .then((data) => setPresets(data as TestPreset[]))
      .catch(() => console.warn("[CPX-Stress] Erro ao carregar presets na inicialização"));
  }, [setPresets]);

  // Mostrar alerta quando credenciais foram verificadas e alguma está ausente
  const showCredentialAlert =
    credentialStatus !== null &&
    (!credentialStatus.STRESSFLOW_USER || !credentialStatus.STRESSFLOW_PASS);

  // Detectar a URL base atual a partir das operações
  const configuredOperations = config.operations ?? [];
  const currentBaseUrl = (() => {
    const firstOperationUrl = configuredOperations[0]?.url;
    if (!firstOperationUrl) return MISTERT_DEFAULT_BASE_URL;

    return firstOperationUrl
      .replace(/\/MisterT\.asp.*$/, "")
      .replace(/\/+$/, "");
  })();

  // Detecção de preset MisterT e estado de seleção dos módulos
  const isMistertPreset =
    configuredOperations.some((op) => isMistertModuleOperationName(op.name)) ||
    configuredOperations[0]?.name === "Página de Login";
  const selectedModuleNames = new Set(
    MISTERT_MODULE_METADATA.filter((module) =>
      module.operationNames.every((operationName) =>
        configuredOperations.some((operation) => operation.name === operationName),
      ),
    ).map((module) => module.name)
  );
  const allModulesSelected = selectedModuleNames.size === MISTERT_MODULE_METADATA.length;
  const noModulesSelected = isMistertPreset && selectedModuleNames.size === 0;
  const hasValidationFailures =
    validationResult !== null && !validationResult.canRunStressTest;
  const isBusy = isValidating || isStarting;
  const isAdvancedLocked = activePreset !== null;
  const effectiveFlowSelectionMode = config.flowSelectionMode ?? "random";
  const currentBenchmarkProfile =
    BENCHMARK_PROFILES.find(
      (profile) =>
        profile.flowSelectionMode === effectiveFlowSelectionMode &&
        profile.requestTimeoutMs === config.requestTimeoutMs,
    ) ?? null;
  const activePresetSummary = activePreset
    ? {
        flowSelectionModeLabel: formatFlowSelectionModeLabel(
          config.flowSelectionMode,
        ),
        requestTimeoutLabel: formatPresetTimeoutLabel(config.requestTimeoutMs),
        rampUpLabel: formatRampUpLabel(config.rampUp),
      }
    : null;

  useEffect(() => {
    setValidationResult(null);
  }, [
    currentBaseUrl,
    config.operations,
    config.virtualUsers,
    config.duration,
    config.rampUp,
    credentialStatus,
  ]);

  /**
   * Atualiza o ambiente MisterT: troca a URL base de todas as operações.
   */
  const handleEnvironmentChange = useCallback(
    (newBaseUrl: string) => {
      const ops = buildMistertOperations(newBaseUrl);
      updateConfig({
        url: ops[0].url,
        operations: ops,
      });
    },
    [updateConfig],
  );

  /**
   * Toggle de módulo individual: reconstrói operations[] do template,
   * mantendo infra ops [0-2] e filtrando módulos pela nova seleção.
   */
  const handleModuleToggle = useCallback(
    (moduleName: string, checked: boolean) => {
      const allOps = buildMistertOperations(currentBaseUrl);
      const infraOps = allOps.slice(0, 3); // Página de Login, Login, Menu Principal (fixos)
      const newSelectedNames = new Set(
        checked
          ? [...selectedModuleNames, moduleName]
          : [...selectedModuleNames].filter((n) => n !== moduleName)
      );
      const selectedOperationNames = new Set<string>(
        [...newSelectedNames].flatMap((name) =>
          getMistertModuleByName(name)?.operationNames ?? [],
        ),
      );
      const moduleOps = allOps
        .slice(3)
        .filter((op) => selectedOperationNames.has(op.name));
      updateModuleSelection([...infraOps, ...moduleOps]);
    },
    [currentBaseUrl, selectedModuleNames, updateModuleSelection],
  );

  /** Seleciona todos os módulos disponíveis (restaura o template completo). */
  const handleSelectAll = useCallback(() => {
    updateModuleSelection(buildMistertOperations(currentBaseUrl));
  }, [currentBaseUrl, updateModuleSelection]);

  /** Desmarca todos os módulos — mantém apenas as 3 infra ops fixas. */
  const handleClearAll = useCallback(() => {
    const allOps = buildMistertOperations(currentBaseUrl);
    updateModuleSelection(allOps.slice(0, 3));
  }, [currentBaseUrl, updateModuleSelection]);

  /** Aplica um perfil rápido de benchmark sem alterar a lista de operações. */
  const handleBenchmarkProfileSelect = useCallback(
    (profileId: (typeof BENCHMARK_PROFILES)[number]["id"]) => {
      const profile = BENCHMARK_PROFILES.find((entry) => entry.id === profileId);
      if (!profile) return;

      setTimeoutStr(
        profile.requestTimeoutMs ? String(profile.requestTimeoutMs) : "",
      );
      updateConfig({
        flowSelectionMode: profile.flowSelectionMode,
        requestTimeoutMs: profile.requestTimeoutMs,
      });
    },
    [updateConfig],
  );

  const handleDisablePreset = useCallback(() => {
    clearActivePreset();
    setShowAdvanced(true);
  }, [clearActivePreset]);

  /* ---------------------------------------------------------------
     handleStart — Valida e inicia o teste de estresse MisterT.
     --------------------------------------------------------------- */
  const handleStart = useCallback(async () => {
    const effectiveConfig =
      configuredOperations.length > 0
        ? config
        : (() => {
            const ops = buildMistertOperations(currentBaseUrl);
            updateConfig({ url: ops[0].url, operations: ops });
            return { ...config, url: ops[0].url, operations: ops };
          })();

    setUrlError("");
    setError(null);
    setValidationResult(null);
    clearProgress();
    setStatus("idle");

    try {
      setIsValidating(true);
      const validation = await window.stressflow.validation.run(effectiveConfig);
      setValidationResult(validation);

      if (!validation.canRunStressTest) {
        setStatus("idle");
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro inesperado ao validar o fluxo. Tente novamente.",
      );
      setStatus("error");
      return;
    } finally {
      setIsValidating(false);
    }

    setIsStarting(true);
    setBenchmarkRun(`live-${Date.now()}`);
    setStatus("running");

    const unsubscribe = window.stressflow.test.onProgress((data) => {
      setProgress(data as ProgressData);
    });

    try {
      const result = await window.stressflow.test.start(effectiveConfig);
      setCurrentResult(result);
      addToHistory(result);
      setStatus(result.status === "cancelled" ? "cancelled" : "completed");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro inesperado ao executar o teste. Tente novamente.",
      );
      setStatus("error");
    } finally {
      unsubscribe();
      setIsStarting(false);
    }
  }, [
    config,
    config.operations,
    currentBaseUrl,
    setUrlError,
    setError,
    clearProgress,
    setStatus,
    setProgress,
    setCurrentResult,
    addToHistory,
    setBenchmarkRun,
    updateConfig,
  ]);

  /**
   * Escuta Ctrl+Enter para iniciar teste rapidamente.
   */
  useEffect(() => {
    const handleShortcutStart = () => handleStart();
    window.addEventListener("stressflow:start-test", handleShortcutStart);
    return () =>
      window.removeEventListener("stressflow:start-test", handleShortcutStart);
  }, [handleStart]);

  /* =================================================================
     RENDERIZAÇÃO
     ================================================================= */
  return (
    <div
      className="max-w-2xl mx-auto animate-slide-up"
      role="form"
      aria-label="Configuração do teste de estresse MisterT ERP"
    >
      {/* ---- HERO — Logo Compex + Título ---- */}
      <div className="mb-6 text-center">
        <div className="flex justify-center mb-3">
          <div className="relative">
            {/* Glow sutil atras da logo */}
            <div
              className="absolute inset-0 blur-xl opacity-20 bg-sf-primary rounded-full scale-150"
              aria-hidden="true"
            />
            <img
              src={compexLogo}
              alt="Compex"
              className="compex-logo-base compex-logo-glow relative h-12 w-auto opacity-90 transition-opacity duration-300 hover:opacity-100 select-none"
              draggable={false}
            />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-sf-text select-none cursor-default">
          CPX-Stress
        </h2>
      </div>

      {/* ---- TOOLBAR: Presets ---- */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setShowPresetModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sf-surface border border-sf-border rounded-xl text-sm text-sf-textSecondary hover:text-sf-text hover:border-sf-textMuted transition-all"
        >
          <BookOpen size={16} aria-hidden="true" />
          Presets
        </button>

        <button
          type="button"
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sf-surface border border-sf-border rounded-xl text-sm text-sf-textSecondary hover:text-sf-text hover:border-sf-textMuted transition-all"
        >
          <Save size={16} aria-hidden="true" />
          Salvar Preset
        </button>
      </div>

      {activePreset && activePresetSummary && (
        <div className="mb-4 rounded-xl border border-sf-primary/20 bg-sf-primary/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-sf-text">
                Preset ativo: <span className="font-semibold">{activePreset.name}</span>
              </p>
              <p className="mt-1 text-xs text-sf-textMuted">
                As configurações avançadas foram bloqueadas para preservar o cenário selecionado.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-md border border-sf-primary/20 bg-sf-surface/80 px-2 py-1 text-[10px] font-medium text-sf-textSecondary">
                  {activePresetSummary.flowSelectionModeLabel}
                </span>
                <span className="rounded-md border border-sf-primary/20 bg-sf-surface/80 px-2 py-1 text-[10px] font-medium text-sf-textSecondary">
                  Timeout {activePresetSummary.requestTimeoutLabel}
                </span>
                <span className="rounded-md border border-sf-primary/20 bg-sf-surface/80 px-2 py-1 text-[10px] font-medium text-sf-textSecondary">
                  {activePresetSummary.rampUpLabel}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDisablePreset}
              className="rounded-xl border border-sf-border bg-sf-surface px-4 py-2 text-sm font-medium text-sf-textSecondary transition-all hover:border-sf-textMuted hover:text-sf-text"
            >
              Desabilitar preset
            </button>
          </div>
        </div>
      )}

      {/* ---- AMBIENTE MISTERT ---- */}
      <fieldset className="mb-4">
        <legend className={labelClass}>
          <Server className="w-4 h-4" aria-hidden="true" />
          Ambiente MisterT
          <InfoTooltip text="Selecione o ambiente do MisterT que sera testado. O fluxo de operações sera ajustado automaticamente para a URL escolhida." />
        </legend>

        <div className="grid grid-cols-2 gap-2 mb-2">
          {MISTERT_ENVIRONMENTS.map((env) => {
            const isSelected = currentBaseUrl === env.url;
            const isDisabled = env.disabled;
            return (
              <button
                key={env.url}
                type="button"
                onClick={() => !isDisabled && handleEnvironmentChange(env.url)}
                disabled={isDisabled}
                className={`px-3 py-2.5 rounded-xl text-sm border transition-all text-left ${
                  isDisabled
                    ? "bg-sf-surface/50 border-sf-border/50 text-sf-textMuted opacity-50 blur-[0.5px] cursor-not-allowed"
                    : isSelected
                      ? "bg-sf-primary/10 border-sf-primary text-sf-primary ring-1 ring-sf-primary/30 font-medium"
                      : "bg-sf-surface border-sf-border text-sf-textSecondary hover:border-sf-textMuted"
                }`}
              >
                <div className="font-medium">{env.label}</div>
                <div className="text-xs mt-0.5 opacity-60 truncate">
                  {env.url.replace("https://", "")}
                </div>
              </button>
            );
          })}
        </div>

        {/* Campo para URL customizada */}
        <div className="relative">
          <Globe
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sf-textMuted"
            aria-hidden="true"
          />
          <input
            type="url"
            value={currentBaseUrl}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val) handleEnvironmentChange(val);
            }}
            placeholder="https://mistert.suaempresa.com.br"
            aria-label="URL base do ambiente MisterT"
            className="w-full pl-11 pr-4 py-2 bg-sf-surface border border-sf-border rounded-xl text-sf-text text-sm placeholder:text-sf-textMuted focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all"
          />
        </div>
        <p className={helpTextClass}>
          URL base do servidor MisterT (sem /MisterT.asp)
        </p>
      </fieldset>

      {/* ---- CONFIGURAÇÃO DE CARGA ---- */}
      <fieldset className="grid grid-cols-2 gap-3 mb-4">
        <legend className="sr-only">Configuração de carga</legend>

        <div>
          <label htmlFor="input-users" className={labelClass}>
            <Users className="w-4 h-4" aria-hidden="true" />
            Usuários Simultâneos
            <InfoTooltip text="Quantidade de usuários virtuais fazendo login e navegando ao mesmo tempo no MisterT. Cada VU executa o fluxo completo de forma independente." />
          </label>
          <input
            id="input-users"
            type="number"
            value={usersStr}
            onChange={(e) => setUsersStr(e.target.value)}
            onBlur={() => {
              const n = Number(usersStr);
              const clamped = Number.isNaN(n) || usersStr.trim() === ""
                ? LIMITS.users.min
                : Math.max(LIMITS.users.min, Math.min(LIMITS.users.max, n));
              setUsersStr(String(clamped));
              updateConfig({ virtualUsers: clamped });
            }}
            min={LIMITS.users.min}
            max={LIMITS.users.max}
            className={inputBaseClass}
          />
          <p className={helpTextClass}>1 a 10.000 usuários</p>
        </div>

        <div>
          <label htmlFor="input-duration" className={labelClass}>
            <Clock className="w-4 h-4" aria-hidden="true" />
            Duração do Teste
            <InfoTooltip text="Tempo total que o teste ficará rodando. Cada usuário repete o fluxo até o tempo acabar." />
          </label>
          <input
            id="input-duration"
            type="number"
            value={durationStr}
            onChange={(e) => setDurationStr(e.target.value)}
            onBlur={() => {
              const n = Number(durationStr);
              const clamped = Number.isNaN(n) || durationStr.trim() === ""
                ? LIMITS.duration.min
                : Math.max(LIMITS.duration.min, Math.min(LIMITS.duration.max, n));
              setDurationStr(String(clamped));
              updateConfig({ duration: clamped });
            }}
            min={LIMITS.duration.min}
            max={LIMITS.duration.max}
            className={inputBaseClass}
          />
          <p className={helpTextClass}>
            5s a 10 min ({LIMITS.duration.min}s a {LIMITS.duration.max}s)
          </p>
        </div>
      </fieldset>

      {/* ---- CONFIGURAÇÕES AVANÇADAS ---- */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-controls="advanced-settings"
          className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary transition-colors rounded-lg px-2 py-1"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
          Configurações Avançadas
          {isAdvancedLocked && (
            <span className="text-[11px] text-sf-primary/80">
              bloqueadas pelo preset
            </span>
          )}
        </button>

        {showAdvanced && (
          <div
            id="advanced-settings"
            className="mt-3 space-y-4 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up"
          >
            {isAdvancedLocked && activePreset && (
              <div className="rounded-xl border border-sf-primary/20 bg-sf-primary/5 p-3">
                <p className="text-sm text-sf-text">
                  O preset <span className="font-semibold">{activePreset.name}</span> está controlando ramp-up, modo de fluxo e timeout.
                </p>
                <p className="mt-1 text-xs text-sf-textMuted">
                  Use o botão &quot;Desabilitar preset&quot; acima para editar essas opções manualmente.
                </p>
              </div>
            )}

            <fieldset
              disabled={isAdvancedLocked}
              className={`space-y-4 ${isAdvancedLocked ? "opacity-60" : ""}`}
            >
            <div>
              <label
                htmlFor="input-rampup"
                className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2"
              >
                Tempo de Subida (ramp-up)
                <InfoTooltip text="Adiciona os usuários gradualmente ao invés de todos de uma vez. Simula crescimento real de carga." />
              </label>
              <input
                id="input-rampup"
                type="number"
                value={rampUpStr}
                onChange={(e) => setRampUpStr(e.target.value)}
                onBlur={() => {
                  const n = Number(rampUpStr);
                  const clamped = Number.isNaN(n) || rampUpStr.trim() === ""
                    ? LIMITS.rampUp.min
                    : Math.max(LIMITS.rampUp.min, n);
                  setRampUpStr(String(clamped));
                  updateConfig({ rampUp: clamped });
                }}
                min={LIMITS.rampUp.min}
                className={advancedInputClass}
              />
              <p className={helpTextClass}>0 = todos de uma vez</p>
            </div>

            <div className="space-y-3 rounded-xl border border-sf-border bg-sf-bg/40 p-3">
              <div>
                <p className="text-sm text-sf-textSecondary mb-1 flex items-center gap-2">
                  Perfis rápidos de benchmark
                  <InfoTooltip text="Ajusta seleção de fluxo e timeout para facilitar comparações externas. As operações escolhidas acima continuam as mesmas." />
                </p>
                <p className={helpTextClass}>
                  Útil para alternar entre uso real e execuções mais auditáveis.
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                {BENCHMARK_PROFILES.map((profile) => {
                  const isSelected = currentBenchmarkProfile?.id === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => handleBenchmarkProfileSelect(profile.id)}
                      disabled={isAdvancedLocked}
                      className={`rounded-xl border px-3 py-3 text-left transition-all ${
                        isSelected
                          ? "border-sf-primary bg-sf-primary/10 text-sf-text ring-1 ring-sf-primary/30"
                          : "border-sf-border bg-sf-surface text-sf-textSecondary hover:border-sf-textMuted"
                      }`}
                    >
                      <div className="text-sm font-medium">{profile.label}</div>
                      <div className="mt-1 text-[11px] opacity-80">
                        {profile.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label
                  htmlFor="select-flow-mode"
                  className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2"
                >
                  Seleção de fluxo
                  <InfoTooltip text="No modo determinístico, cada usuário virtual alterna os módulos em round-robin. Isso reduz ruído ao comparar CPX, k6, Locust e JMeter." />
                </label>
                <select
                  id="select-flow-mode"
                  value={effectiveFlowSelectionMode}
                  onChange={(e) =>
                    updateConfig({
                      flowSelectionMode: e.target.value as FlowSelectionMode,
                    })
                  }
                  className={advancedInputClass}
                >
                  <option value="random">Aleatório</option>
                  <option value="deterministic">Determinístico</option>
                </select>
                <p className={helpTextClass}>
                  Aleatório preserva o comportamento legado. Determinístico é o
                  modo mais estável para convergência entre engines.
                </p>
              </div>

              <div>
                <label
                  htmlFor="input-request-timeout"
                  className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2"
                >
                  Timeout por requisição
                  <InfoTooltip text="Sobrescreve o timeout individual das requisições em todas as engines. Ajuda a reproduzir cenários controlados de timeout e convergência." />
                </label>
                <input
                  id="input-request-timeout"
                  type="number"
                  inputMode="numeric"
                  placeholder="Padrão da engine"
                  value={timeoutStr}
                  onChange={(e) => setTimeoutStr(e.target.value)}
                  onBlur={() => {
                    const trimmed = timeoutStr.trim();
                    if (!trimmed) {
                      setTimeoutStr("");
                      updateConfig({ requestTimeoutMs: undefined });
                      return;
                    }

                    const parsed = Number(trimmed);
                    const normalized =
                      Number.isFinite(parsed) && parsed > 0
                        ? Math.round(parsed)
                        : 3000;

                    setTimeoutStr(String(normalized));
                    updateConfig({ requestTimeoutMs: normalized });
                  }}
                  min={LIMITS.timeout.min}
                  className={advancedInputClass}
                />
                <p className={helpTextClass}>
                  Deixe vazio para usar o padrão interno. Para convergência
                  estável, use 3000 ms. Para timeout curto, 750 ms.
                </p>
              </div>
            </div>
            </fieldset>
          </div>
        )}
      </div>

      {/* ---- VISUALIZAR OPERAÇÕES ---- */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowOperations((prev) => !prev)}
          className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary transition-colors rounded-lg px-2 py-1"
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
          {showOperations ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
          Ver Operações ({configuredOperations.length} etapas)
        </button>

        {showOperations && (
          <MistertOperationsPanel
            operations={configuredOperations}
            isMistertPreset={isMistertPreset}
            selectedModuleNames={selectedModuleNames}
            allModulesSelected={allModulesSelected}
            noModulesSelected={noModulesSelected}
            onClearAll={handleClearAll}
            onSelectAll={handleSelectAll}
            onToggleModule={handleModuleToggle}
          />
        )}
      </div>

      {/* ---- ALERTA DE CREDENCIAIS AUSENTES ---- */}
      {showCredentialAlert && <CredentialAlert />}

      {/* ---- MENSAGEM DE ERRO GLOBAL ---- */}
      {error && (
        <div
          role="alert"
          className="mb-4 p-4 bg-sf-danger/10 border border-sf-danger/30 rounded-xl flex items-start gap-3"
        >
          <AlertCircle
            className="w-5 h-5 text-sf-danger shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-sf-danger">
              Não foi possível completar o teste
            </p>
            <p className="text-sm text-sf-danger/80 mt-1">{error}</p>
            <p className="text-xs text-sf-textMuted mt-2">
              Verifique se o servidor MisterT está acessível e se as credenciais
              no arquivo .env estão corretas.
            </p>
          </div>
        </div>
      )}

      {/* ---- DIAGNÓSTICO DE VALIDAÇÃO ---- */}
      {hasValidationFailures && validationResult && (
        <div
          role="alert"
          className="mb-4 p-4 bg-sf-warning/10 border border-sf-warning/30 rounded-xl flex items-start gap-3"
        >
          <AlertCircle
            className="w-5 h-5 text-sf-warning shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="w-full space-y-3">
            <div>
              <p className="text-sm font-medium text-sf-warning">
                A validação do fluxo MisterT falhou
              </p>
              <p className="text-sm text-sf-textSecondary mt-1">
                Técnico: {validationResult.summary.technicalPassed}/
                {validationResult.summary.totalOperations} etapas
                {validationResult.summary.technicalBlocked > 0
                  ? ` (${validationResult.summary.technicalBlocked} bloqueadas)`
                  : ""}
                . Funcional:{" "}
                {validationResult.summary.functionalPassed}/
                {validationResult.summary.totalOperations} etapas
                {validationResult.summary.functionalBlocked > 0
                  ? ` (${validationResult.summary.functionalBlocked} bloqueadas)`
                  : ""}
                .
              </p>
              {validationResult.missingEnvKeys.length > 0 && (
                <p className="text-xs text-sf-warning mt-2">
                  Credenciais ausentes no .env:{" "}
                  {validationResult.missingEnvKeys.join(", ")}
                </p>
              )}
              <p className="text-xs text-sf-textMuted mt-2">
                Ajuste credenciais, ambiente ou módulos e tente novamente. O
                teste de estresse permanece bloqueado enquanto alguma etapa
                falhar.
              </p>
            </div>

            <div className="space-y-2">
              {validationResult.operations.map((operation) => {
                const hasTechnicalFailure = operation.technicalStatus === "fail";
                const hasFunctionalFailure = operation.functionalStatus === "fail";
                const isTechnicalBlocked = operation.technicalStatus === "blocked";
                const isFunctionalBlocked = operation.functionalStatus === "blocked";

                return (
                  <div
                    key={`${operation.name}-${operation.requestedUrl}`}
                    className="rounded-xl border border-sf-border bg-sf-surface px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          operation.method === "POST"
                            ? "bg-sf-warning/10 text-sf-warning"
                            : "bg-sf-accent/10 text-sf-accent"
                        }`}
                      >
                        {operation.method}
                      </span>
                      <span className="text-sm font-medium text-sf-text">
                        {operation.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          hasTechnicalFailure
                            ? "bg-sf-danger/10 text-sf-danger"
                            : isTechnicalBlocked
                              ? "bg-sf-warning/10 text-sf-warning"
                            : "bg-sf-success/10 text-sf-success"
                        }`}
                      >
                        Técnico{" "}
                        {hasTechnicalFailure
                          ? "falhou"
                          : isTechnicalBlocked
                            ? "bloqueado"
                            : "ok"}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          hasFunctionalFailure
                            ? "bg-sf-danger/10 text-sf-danger"
                            : isFunctionalBlocked
                              ? "bg-sf-warning/10 text-sf-warning"
                            : "bg-sf-success/10 text-sf-success"
                        }`}
                      >
                        Funcional{" "}
                        {hasFunctionalFailure
                          ? "falhou"
                          : isFunctionalBlocked
                            ? "bloqueado"
                            : "ok"}
                      </span>
                    </div>

                    <p className="text-xs text-sf-textMuted mt-2 break-all">
                      Status {operation.statusCode || 0} · URL final{" "}
                      {operation.finalUrl}
                    </p>

                    {operation.technicalReasons.length > 0 && (
                      <p
                        className={`text-xs mt-2 ${
                          isTechnicalBlocked ? "text-sf-warning" : "text-sf-danger"
                        }`}
                      >
                        Técnico: {operation.technicalReasons.join(" ")}
                      </p>
                    )}

                    {operation.functionalReasons.length > 0 && (
                      <p
                        className={`text-xs mt-1 ${
                          isFunctionalBlocked ? "text-sf-warning" : "text-sf-danger"
                        }`}
                      >
                        Funcional: {operation.functionalReasons.join(" ")}
                      </p>
                    )}

                    {operation.bodySnippet && (
                      <p className="text-xs text-sf-textMuted mt-2">
                        Trecho retornado: {operation.bodySnippet}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- URL ERROR ---- */}
      {urlError && (
        <div
          role="alert"
          className="mb-4 p-3 bg-sf-danger/10 border border-sf-danger/30 rounded-xl text-sm text-sf-danger flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {urlError}
        </div>
      )}

      {/* ---- BOTÃO EXECUTAR ---- */}
      <button
        type="button"
        onClick={handleStart}
        disabled={isBusy}
        className="w-full max-w-xs mx-auto py-2.5 bg-sf-accent hover:bg-sf-accentMuted text-sf-bg font-semibold rounded-xl text-sm transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-sf-accent/20 focus:outline-none focus:ring-2 focus:ring-sf-accent/50 focus:ring-offset-2 focus:ring-offset-sf-bg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        aria-label={
          isValidating
            ? "Validando..."
            : isStarting
              ? "Executando..."
            : `Executar teste MisterT com ${config.virtualUsers.toLocaleString("pt-BR")} usuários por ${config.duration}s`
        }
      >
        {isBusy ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4" aria-hidden="true" />
        )}
        {isValidating ? "Validando..." : isStarting ? "Executando..." : "Executar"}
      </button>

      {/* ---- INFO ---- */}

      {/* ---- Modais de Presets ---- */}
      <PresetModal
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        currentBaseUrl={currentBaseUrl}
      />

      <SavePresetDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        activePreset={activePreset}
      />
    </div>
  );
}
