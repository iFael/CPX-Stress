/**
 * PresetModal — Modal de presets de teste
 * ========================================
 *
 * Exibe um overlay modal com grid de cards de presets.
 * O usuário pode carregar presets (built-in ou user-created),
 * renomear e deletar presets do usuário.
 *
 * O preset built-in "MisterT Completo" não pode ser editado ou deletado.
 * Ao carregar um preset, a URL base e substituida pela do ambiente
 * atualmente selecionado no TestConfig (decisao D5).
 *
 * Segue o mesmo padrão visual e de animação do WelcomeOverlay.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  BookOpen,
  Download,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  Check,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { useToast } from "@/components/Toast";
import { MISTERT_DEFAULT_BASE_URL } from "@/constants/test-presets";
import type { TestPreset, TestConfig, TestOperation } from "@/types";

/* =====================================================================
   TIPOS
   ===================================================================== */

interface PresetModalProps {
  /** Controla visibilidade do modal. */
  isOpen: boolean;
  /** Callback para fechar o modal. */
  onClose: () => void;
  /** URL base do ambiente atualmente selecionado no TestConfig (para D5 URL replacement). */
  currentBaseUrl: string;
}

/* =====================================================================
   CONSTANTES
   ===================================================================== */

/** Limite de caracteres para nome de preset (validação) */
const MAX_PRESET_NAME_LENGTH = 100;

/* =====================================================================
   UTILITARIOS
   ===================================================================== */

/**
 * Extrai a URL base de um config de preset analisando a primeira operação.
 * Retorna a parte da URL antes de "/MisterT.asp", ou a URL principal sem trailing slash.
 */
function extractBaseUrl(config: TestConfig): string {
  const firstOpUrl = config.operations?.[0]?.url || config.url;
  const match = firstOpUrl.match(/^(https?:\/\/[^/]+)/);
  return match ? match[1] : MISTERT_DEFAULT_BASE_URL;
}

/**
 * Substitui a URL base do preset pela URL do ambiente selecionado.
 * Extrai a base URL dinamicamente do config do preset (não hardcoded).
 * (Decisao D5: URL Base Substituida ao Aplicar)
 */
function replaceBaseUrl(config: TestConfig, newBaseUrl: string): TestConfig {
  const presetBase = extractBaseUrl(config);
  const newBase = newBaseUrl.replace(/\/+$/, "");
  if (presetBase === newBase) return config;
  return {
    ...config,
    url: config.url.replace(presetBase, newBase),
    operations: config.operations?.map((op: TestOperation) => ({
      ...op,
      url: op.url.replace(presetBase, newBase),
      headers: op.headers ? { ...op.headers } : undefined,
    })),
  };
}

/* =====================================================================
   COMPONENTE PRINCIPAL
   ===================================================================== */

export function PresetModal({ isOpen, onClose, currentBaseUrl }: PresetModalProps) {
  /* ---- Store ---- */
  const applyPreset = useTestStore((s) => s.applyPreset);
  const storeSetPresets = useTestStore((s) => s.setPresets);
  const clearActivePreset = useTestStore((s) => s.clearActivePreset);
  const activePreset = useTestStore((s) => s.activePreset);

  /* ---- Toast ---- */
  const { toast } = useToast();

  /* ---- Estado local ---- */
  const [presets, setPresets] = useState<TestPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /* ---- Ref para heading (aria-labelledby) ---- */
  const headingId = "preset-modal-heading";
  const renameInputRef = useRef<HTMLInputElement>(null);

  /* ---- Carregar presets ao abrir ---- */
  const loadPresets = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await window.stressflow.presets.list();
      setPresets(data as TestPreset[]);
      storeSetPresets(data as TestPreset[]);
    } catch {
      toast.error("Não foi possível carregar os presets");
    } finally {
      setIsLoading(false);
    }
  }, [storeSetPresets, toast]);

  useEffect(() => {
    if (isOpen) {
      loadPresets();
      // Reset estados ao abrir
      setDeleteConfirmId(null);
      setRenameId(null);
      setRenameValue("");
      setRenameError("");
    }
  }, [isOpen, loadPresets]);

  /* ---- Fechar com animação de saída ---- */
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setDeleteConfirmId(null);
      setRenameId(null);
      onClose();
    }, 300);
  }, [onClose]);

  /* ---- Fechar com Escape ---- */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  /* ---- Carregar preset ---- */
  const handleLoad = useCallback(
    async (preset: TestPreset) => {
      setLoadingPresetId(preset.id);
      try {
        const adjustedConfig = replaceBaseUrl(preset.config, currentBaseUrl);
        applyPreset(adjustedConfig, {
          id: preset.id,
          name: preset.name,
          isBuiltin: preset.isBuiltin,
        });
        toast.success(`Preset '${preset.name}' carregado`);
        handleClose();
      } finally {
        setLoadingPresetId(null);
      }
    },
    [currentBaseUrl, applyPreset, handleClose, toast],
  );

  /* ---- Iniciar modo renomear ---- */
  const handleStartRename = useCallback((preset: TestPreset) => {
    setRenameId(preset.id);
    setRenameValue(preset.name);
    setRenameError("");
    // Focar no input após render
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  /* ---- Confirmar renomeacao ---- */
  const handleConfirmRename = useCallback(
    async (presetId: string) => {
      const trimmed = renameValue.trim();

      // Validacoes
      if (!trimmed) {
        setRenameError("Informe um nome para o preset");
        return;
      }
      if (trimmed.length > MAX_PRESET_NAME_LENGTH) {
        setRenameError(`Nome deve ter no máximo ${MAX_PRESET_NAME_LENGTH} caracteres`);
        return;
      }
      const isDuplicate = presets.some(
        (p) => p.id !== presetId && p.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (isDuplicate) {
        setRenameError("Já existe um preset com este nome");
        return;
      }

      setIsRenaming(true);
      try {
        await window.stressflow.presets.rename(presetId, trimmed);
        await loadPresets();
        toast.success(`Preset renomeado para '${trimmed}'`);
        setRenameId(null);
        setRenameValue("");
        setRenameError("");
      } catch {
        toast.error("Não foi possível renomear o preset");
      } finally {
        setIsRenaming(false);
      }
    },
    [renameValue, presets, loadPresets, toast],
  );

  /* ---- Cancelar renomeacao ---- */
  const handleCancelRename = useCallback(() => {
    setRenameId(null);
    setRenameValue("");
    setRenameError("");
  }, []);

  /* ---- Confirmar exclusão ---- */
  const handleConfirmDelete = useCallback(
    async (preset: TestPreset) => {
      setIsDeleting(true);
      try {
        await window.stressflow.presets.delete(preset.id);
        // Remover do estado local
        setPresets((prev) => prev.filter((p) => p.id !== preset.id));
        storeSetPresets(presets.filter((p) => p.id !== preset.id));
        // Se o preset deletado era o ativo, limpar
        if (activePreset?.id === preset.id) {
          clearActivePreset();
        }
        toast.success(`Preset '${preset.name}' excluído`);
        setDeleteConfirmId(null);
      } catch {
        toast.error("Não foi possível excluir o preset");
      } finally {
        setIsDeleting(false);
      }
    },
    [presets, activePreset, storeSetPresets, clearActivePreset, toast],
  );

  /* ---- Não renderizar se fechado ---- */
  if (!isOpen) return null;

  /* ---- Separar presets built-in e usuário ---- */
  const builtinPresets = presets.filter((p) => p.isBuiltin);
  const userPresets = presets.filter((p) => !p.isBuiltin);
  const hasOnlyBuiltin = userPresets.length === 0;

  /* =================================================================
     RENDERIZAÇÃO
     ================================================================= */
  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        isClosing ? "animate-overlay-fade-out" : "animate-overlay-fade-in"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      {/* ---- Backdrop ---- */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ---- Painel do Modal ---- */}
      <div
        className={`relative w-full max-w-2xl rounded-2xl border border-sf-border bg-sf-bg shadow-elevated overflow-hidden ${
          isClosing ? "animate-modal-scale-out" : "animate-modal-scale-in"
        }`}
      >
        {/* Barra gradiente decorativa no topo */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sf-primary via-sf-accent to-sf-primary rounded-t-2xl"
          aria-hidden="true"
        />

        {/* Botão de fechar (X) */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-sf-textMuted hover:text-sf-text hover:bg-sf-surface transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50 z-10"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ---- Cabeçalho ---- */}
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sf-primary/10 shrink-0">
              <BookOpen className="w-5 h-5 text-sf-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 id={headingId} className="text-lg font-semibold text-sf-text">
                Presets de Teste
              </h2>
              <p className="text-sm text-sf-textSecondary mt-1">
                Selecione um preset para carregar ou gerencie suas configurações salvas.
              </p>
            </div>
          </div>
        </div>

        {/* ---- Grid de Cards ---- */}
        <div className="px-8 py-6 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-sf-primary animate-spin" aria-hidden="true" />
              <span className="ml-3 text-sm text-sf-textMuted">Carregando presets...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Built-in presets primeiro */}
                {builtinPresets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    isActive={activePreset?.id === preset.id}
                    isLoadingThis={loadingPresetId === preset.id}
                    onLoad={() => handleLoad(preset)}
                  />
                ))}

                {/* User presets */}
                {userPresets.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    isActive={activePreset?.id === preset.id}
                    isLoadingThis={loadingPresetId === preset.id}
                    isRenaming={renameId === preset.id}
                    isDeleteConfirming={deleteConfirmId === preset.id}
                    renameValue={renameId === preset.id ? renameValue : ""}
                    renameError={renameId === preset.id ? renameError : ""}
                    renameInputRef={renameId === preset.id ? renameInputRef : undefined}
                    isRenamingSaving={renameId === preset.id ? isRenaming : false}
                    isDeletingSaving={deleteConfirmId === preset.id ? isDeleting : false}
                    onLoad={() => handleLoad(preset)}
                    onStartRename={() => handleStartRename(preset)}
                    onConfirmRename={() => handleConfirmRename(preset.id)}
                    onCancelRename={handleCancelRename}
                    onRenameValueChange={(v) => {
                      setRenameValue(v);
                      setRenameError("");
                    }}
                    onStartDelete={() => setDeleteConfirmId(preset.id)}
                    onConfirmDelete={() => handleConfirmDelete(preset)}
                    onCancelDelete={() => setDeleteConfirmId(null)}
                  />
                ))}
              </div>

              {/* Dica quando so tem built-in */}
              {hasOnlyBuiltin && (
                <p className="text-sm text-sf-textMuted text-center py-8">
                  Salve sua configuração atual como preset usando o botão
                  &apos;Salvar Preset&apos; na tela de configuração.
                </p>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}

/* =====================================================================
   COMPONENTE DE CARD DO PRESET
   ===================================================================== */

interface PresetCardProps {
  preset: TestPreset;
  isActive: boolean;
  isLoadingThis: boolean;
  isRenaming?: boolean;
  isDeleteConfirming?: boolean;
  renameValue?: string;
  renameError?: string;
  renameInputRef?: React.RefObject<HTMLInputElement>;
  isRenamingSaving?: boolean;
  isDeletingSaving?: boolean;
  onLoad: () => void;
  onStartRename?: () => void;
  onConfirmRename?: () => void;
  onCancelRename?: () => void;
  onRenameValueChange?: (value: string) => void;
  onStartDelete?: () => void;
  onConfirmDelete?: () => void;
  onCancelDelete?: () => void;
}

function PresetCard({
  preset,
  isActive,
  isLoadingThis,
  isRenaming = false,
  isDeleteConfirming = false,
  renameValue = "",
  renameError = "",
  renameInputRef,
  isRenamingSaving = false,
  isDeletingSaving = false,
  onLoad,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onRenameValueChange,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}: PresetCardProps) {
  const opsCount = preset.config.operations?.length ?? 0;
  const vus = preset.config.virtualUsers;
  const duration = preset.config.duration;

  return (
    <div
      className={`p-4 rounded-xl border transition-all relative ${
        isActive
          ? "ring-2 ring-sf-primary/40 border-sf-primary bg-sf-surface"
          : "border-sf-border bg-sf-surface hover:border-sf-textMuted"
      }`}
      role="group"
      aria-label={preset.name}
      aria-current={isActive ? "true" : undefined}
    >
      {/* Badge Built-in */}
      {preset.isBuiltin && (
        <span className="absolute top-3 right-3 text-xs font-semibold uppercase tracking-wider bg-sf-primary/10 text-sf-primary px-2 py-1 rounded-md">
          Built-in
        </span>
      )}

      {/* Conteúdo do card */}
      {isRenaming ? (
        /* ---- Modo de renomeacao inline ---- */
        <div className="mt-1">
          <input
            ref={renameInputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameValueChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirmRename?.();
              if (e.key === "Escape") onCancelRename?.();
            }}
            maxLength={MAX_PRESET_NAME_LENGTH}
            className="w-full px-3 py-2 bg-sf-surface border border-sf-border rounded-lg text-sm text-sf-text focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all"
            aria-label="Novo nome do preset"
          />
          {renameError && (
            <p className="text-xs text-sf-warning mt-1">{renameError}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onConfirmRename}
              disabled={isRenamingSaving}
              className="flex items-center gap-2 bg-sf-primary hover:bg-sf-primaryHover text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-60"
            >
              {isRenamingSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-3 h-3" aria-hidden="true" />
              )}
              Renomear Preset
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              className="text-sf-textMuted hover:text-sf-text text-xs px-3 py-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : isDeleteConfirming ? (
        /* ---- Confirmação de exclusão inline ---- */
        <>
          <div className="text-sm font-semibold text-sf-text mt-1 mb-2">
            {preset.name}
          </div>
          <div
            className="mt-1 p-2 rounded-lg bg-sf-danger/5 border border-sf-danger/20"
            role="alert"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-sf-danger" aria-hidden="true" />
              <span className="text-xs text-sf-textSecondary">
                Excluir este preset?
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeletingSaving}
                className="flex items-center gap-2 bg-sf-danger hover:opacity-90 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-60"
              >
                {isDeletingSaving && (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                )}
                Confirmar Exclusão
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="text-sf-textMuted hover:text-sf-text text-xs px-3 py-2 transition-colors"
              >
                Manter Preset
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ---- Modo normal ---- */
        <>
          <div className="text-sm font-semibold text-sf-text mt-1">
            {preset.name}
          </div>
          <div className="text-xs text-sf-textMuted mt-1">
            {opsCount} operações | {vus} VUs | {duration}s
          </div>

          {/* Ações */}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onLoad}
              disabled={isLoadingThis}
              className="flex-1 bg-sf-primary hover:bg-sf-primaryHover text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {isLoadingThis ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Carregar Preset
            </button>

            {/* Botões de edicao (apenas para user presets) */}
            {!preset.isBuiltin && (
              <>
                <button
                  type="button"
                  onClick={onStartRename}
                  className="p-2 rounded-md text-sf-textMuted hover:text-sf-textSecondary hover:bg-sf-surface transition-all"
                  aria-label="Renomear preset"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onStartDelete}
                  className="p-2 rounded-md text-sf-textMuted hover:text-sf-danger hover:bg-sf-danger/10 transition-all"
                  aria-label="Excluir preset"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
