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
import { PresetModal } from "@/components/PresetModal";
import { SavePresetDialog } from "@/components/SavePresetDialog";
import type { ProgressData } from "@/types";
import {
  MISTERT_OPERATION_COUNT,
  MISTERT_DEFAULT_BASE_URL,
  buildMistertOperations,
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
} as const;

/** Ambientes MisterT pre-configurados */
const MISTERT_ENVIRONMENTS = [
  { label: "Desenvolvimento", url: "https://dev-mistert.compex.com.br", disabled: false },
  { label: "Produção", url: "https://mistert.compex.com.br", disabled: true },
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

/* =====================================================================
   COMPONENTE PRINCIPAL — Configuração do Teste MisterT ERP
   O usuário escolhe o ambiente, ajusta usuários/duração e inicia.
   O fluxo de 10 operações (login + módulos) ja vem configurado.
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
  const error = useTestStore((s) => s.error);
  const setError = useTestStore((s) => s.setError);
  const credentialStatus = useTestStore((s) => s.credentialStatus);
  const activePreset = useTestStore((s) => s.activePreset);
  const setPresets = useTestStore((s) => s.setPresets);

  /* ---- Estado local do formulario ---- */
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showOperations, setShowOperations] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Campos numéricos: estado local em string para permitir edição livre;
  // sincroniza com a store apenas no blur (clampeado).
  const [usersStr, setUsersStr] = useState(String(config.virtualUsers));
  const [durationStr, setDurationStr] = useState(String(config.duration));
  const [rampUpStr, setRampUpStr] = useState(String(config.rampUp || 0));

  // Sincronizar se o store mudar por fora (ex: reset ou aplicacao de preset)
  useEffect(() => setUsersStr(String(config.virtualUsers)), [config.virtualUsers]);
  useEffect(() => setDurationStr(String(config.duration)), [config.duration]);
  useEffect(() => setRampUpStr(String(config.rampUp || 0)), [config.rampUp]);

  // Carregar presets do banco na inicializacao (para SavePresetDialog validar nomes)
  useEffect(() => {
    window.stressflow.presets.list()
      .then((data) => setPresets(data as import("@/types").TestPreset[]))
      .catch(() => console.warn("[StressFlow] Erro ao carregar presets na inicializacao"));
  }, [setPresets]);

  // Mostrar alerta quando credenciais foram verificadas e alguma esta ausente
  const showCredentialAlert =
    credentialStatus !== null &&
    (!credentialStatus.STRESSFLOW_USER || !credentialStatus.STRESSFLOW_PASS);

  // Detectar a URL base atual a partir das operações
  const currentBaseUrl =
    config.operations?.[0]?.url
      .replace(/\/MisterT\.asp.*$/, "")
      .replace(/\/+$/, "") || MISTERT_DEFAULT_BASE_URL;

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

  /* ---------------------------------------------------------------
     handleStart — Valida e inicia o teste de estresse MisterT.
     --------------------------------------------------------------- */
  const handleStart = useCallback(async () => {
    // Garantir que temos operações MisterT configuradas
    if (!config.operations || config.operations.length === 0) {
      const ops = buildMistertOperations(currentBaseUrl);
      updateConfig({ url: ops[0].url, operations: ops });
    }

    setUrlError("");
    setError(null);
    setIsStarting(true);
    clearProgress();
    setStatus("running");

    const unsubscribe = window.stressflow.test.onProgress((data) => {
      setProgress(data as ProgressData);
    });

    try {
      const result = await window.stressflow.test.start(config);
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
    currentBaseUrl,
    setUrlError,
    setError,
    clearProgress,
    setStatus,
    setProgress,
    setCurrentResult,
    addToHistory,
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
              className="compex-logo-glow relative h-12 w-auto opacity-90 transition-opacity duration-300 hover:opacity-100 select-none"
              style={{ filter: "brightness(0) invert(1)", cursor: "default" }}
              draggable={false}
            />
          </div>
        </div>
        <h2 className="text-lg font-semibold text-sf-text select-none cursor-default">
          CPX — MisterT Stress
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

        {activePreset && (
          <span className="text-xs text-sf-textMuted ml-auto">
            Preset ativo: <span className="text-sf-text font-semibold">{activePreset.name}</span>
          </span>
        )}
      </div>

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
                aria-pressed={isSelected}
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
            <InfoTooltip text="Tempo total que o teste ficara rodando. Cada usuário repete o fluxo ate o tempo acabar." />
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
          aria-expanded={showAdvanced}
          aria-controls="advanced-settings"
          className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary transition-colors rounded-lg px-2 py-1"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
          Configurações Avançadas
        </button>

        {showAdvanced && (
          <div
            id="advanced-settings"
            className="mt-3 space-y-4 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up"
          >
            <div>
              <label
                htmlFor="input-rampup"
                className="text-sm text-sf-textSecondary mb-2 flex items-center gap-2"
              >
                Tempo de Subida (ramp-up)
                <InfoTooltip text="Adiciona os usuários gradualmente ao inves de todos de uma vez. Simula crescimento real de carga." />
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
                className="w-full px-4 py-3 bg-sf-bg border border-sf-border rounded-xl text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 transition-all"
              />
              <p className={helpTextClass}>0 = todos de uma vez</p>
            </div>
          </div>
        )}
      </div>

      {/* ---- VISUALIZAR OPERAÇÕES ---- */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowOperations((prev) => !prev)}
          aria-expanded={showOperations}
          className="flex items-center gap-2 text-sm text-sf-textMuted hover:text-sf-textSecondary transition-colors rounded-lg px-2 py-1"
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
          {showOperations ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
          Ver Operações ({MISTERT_OPERATION_COUNT} etapas)
        </button>

        {showOperations && (
          <div className="mt-3 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up space-y-2">
            <p className="text-xs text-sf-textMuted mb-3">
              Cada usuário virtual executa estas operações em sequência,
              propagando cookies de sessão ASP e extraindo tokens CTRL
              dinamicamente.
            </p>
            {(config.operations || []).map((op, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2 bg-sf-bg border border-sf-border rounded-lg text-sm"
              >
                <span className="text-xs text-sf-textMuted w-5 text-right shrink-0">
                  {idx + 1}.
                </span>
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    op.method === "POST"
                      ? "bg-sf-warning/10 text-sf-warning"
                      : "bg-sf-accent/10 text-sf-accent"
                  }`}
                >
                  {op.method}
                </span>
                <span className="text-sf-text font-medium truncate">
                  {op.name}
                </span>
                {op.extract && (
                  <span className="ml-auto text-[10px] text-sf-accent/70 bg-sf-accent/5 px-1.5 py-0.5 rounded">
                    extrai CTRL
                  </span>
                )}
              </div>
            ))}
          </div>
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
              Verifique se o servidor MisterT esta acessível e se as credenciais
              no arquivo .env estao corretas.
            </p>
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
        disabled={isStarting}
        className="w-full max-w-xs mx-auto py-2.5 bg-sf-accent hover:bg-sf-accentMuted text-sf-bg font-semibold rounded-xl text-sm transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-sf-accent/20 focus:outline-none focus:ring-2 focus:ring-sf-accent/50 focus:ring-offset-2 focus:ring-offset-sf-bg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        aria-label={
          isStarting
            ? "Executando..."
            : `Executar teste MisterT com ${config.virtualUsers.toLocaleString("pt-BR")} usuários por ${config.duration}s`
        }
      >
        {isStarting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="w-4 h-4" aria-hidden="true" />
        )}
        {isStarting ? "Executando..." : "Executar"}
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
