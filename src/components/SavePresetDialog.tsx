/**
 * SavePresetDialog — Dialog para salvar/atualizar presets
 * ========================================================
 *
 * Dialog modal menor que permite ao usuario:
 * - Salvar a configuracao atual como um novo preset (nome obrigatorio)
 * - Atualizar um preset do usuario ja ativo (sobrescrever)
 * - Salvar como novo mesmo com preset ativo (escolha "Salvar Como Novo")
 *
 * Regras de modo (D3):
 * - Se preset ativo e user-created: mostra "Atualizar {nome}" + "Salvar Como Novo"
 * - Se nenhum preset ativo ou built-in ativo: mostra apenas nome input + "Salvar Preset"
 *
 * Segue o mesmo padrao de overlay/animacao do PresetModal e WelcomeOverlay.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { useToast } from "@/components/Toast";
import type { ActivePresetInfo, TestPreset } from "@/types";

/* =====================================================================
   TIPOS
   ===================================================================== */

interface SavePresetDialogProps {
  /** Controla visibilidade do dialog. */
  isOpen: boolean;
  /** Callback para fechar o dialog. */
  onClose: () => void;
  /** Preset ativo atualmente (null = nenhum ou built-in). Determina se mostra "Atualizar" ou apenas "Salvar". */
  activePreset: ActivePresetInfo | null;
}

/* =====================================================================
   CONSTANTES
   ===================================================================== */

/** Limite de caracteres para nome de preset */
const MAX_PRESET_NAME_LENGTH = 100;

/** Estilo base para input (consistente com TestConfig) */
const inputBaseClass =
  "w-full px-4 py-2.5 bg-sf-surface border border-sf-border rounded-xl text-sf-text " +
  "text-sm focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all";

/* =====================================================================
   COMPONENTE PRINCIPAL
   ===================================================================== */

export function SavePresetDialog({ isOpen, onClose, activePreset }: SavePresetDialogProps) {
  /* ---- Store ---- */
  const config = useTestStore((s) => s.config);
  const presets = useTestStore((s) => s.presets);
  const applyPreset = useTestStore((s) => s.applyPreset);
  const storeSetPresets = useTestStore((s) => s.setPresets);

  /* ---- Toast ---- */
  const { toast } = useToast();

  /* ---- Estado local ---- */
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [mode, setMode] = useState<"save" | "update" | "choose">("save");

  /* ---- Refs ---- */
  const nameInputRef = useRef<HTMLInputElement>(null);
  const headingId = "save-preset-dialog-heading";

  /* ---- Determinar modo ao abrir ---- */
  useEffect(() => {
    if (isOpen) {
      if (activePreset && !activePreset.isBuiltin) {
        setMode("choose");
      } else {
        setMode("save");
      }
      setName("");
      setNameError("");
      setIsSaving(false);
      // Focar no input se modo save
      if (!activePreset || activePreset.isBuiltin) {
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }
    }
  }, [isOpen, activePreset]);

  /* ---- Fechar com animacao ---- */
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300);
  }, [onClose]);

  /* ---- Escape para fechar ---- */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  /* ---- Salvar como novo ---- */
  const handleSave = useCallback(
    async (presetId?: string) => {
      const trimmedName = name.trim();

      // Validacao: nome obrigatorio
      if (!trimmedName) {
        setNameError("Informe um nome para o preset");
        return;
      }
      // Validacao: tamanho maximo
      if (trimmedName.length > MAX_PRESET_NAME_LENGTH) {
        setNameError(`Nome deve ter no máximo ${MAX_PRESET_NAME_LENGTH} caracteres`);
        return;
      }
      // Validacao: duplicata
      const isDuplicate = presets.some((p) => {
        if (presetId && p.id === presetId) return false;
        return p.name.toLowerCase() === trimmedName.toLowerCase();
      });
      if (isDuplicate) {
        setNameError("Já existe um preset com este nome");
        return;
      }

      setIsSaving(true);
      try {
        const configJson = JSON.stringify(config);
        const saved = (await window.stressflow.presets.save({
          id: presetId,
          name: trimmedName,
          configJson,
        })) as TestPreset;

        // Atualizar store com lista atualizada
        const updatedPresets = (await window.stressflow.presets.list()) as TestPreset[];
        storeSetPresets(updatedPresets);

        // Marcar como preset ativo
        applyPreset(config, {
          id: saved.id,
          name: saved.name,
          isBuiltin: false,
        });

        toast.success(
          presetId
            ? `Preset '${saved.name}' atualizado`
            : `Preset '${saved.name}' salvo com sucesso`,
        );
        handleClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Ja existe")) {
          setNameError(msg);
        } else {
          toast.error("Não foi possível salvar o preset");
        }
      } finally {
        setIsSaving(false);
      }
    },
    [name, config, presets, applyPreset, storeSetPresets, toast, handleClose],
  );

  /* ---- Atualizar preset existente ---- */
  const handleUpdate = useCallback(async () => {
    if (!activePreset) return;

    setIsSaving(true);
    try {
      const configJson = JSON.stringify(config);
      await window.stressflow.presets.save({
        id: activePreset.id,
        name: activePreset.name,
        configJson,
      });

      // Atualizar store
      const updatedPresets = (await window.stressflow.presets.list()) as TestPreset[];
      storeSetPresets(updatedPresets);

      toast.success(`Preset '${activePreset.name}' atualizado`);
      handleClose();
    } catch {
      toast.error("Não foi possível salvar o preset");
    } finally {
      setIsSaving(false);
    }
  }, [activePreset, config, storeSetPresets, toast, handleClose]);

  /* ---- Trocar para modo "save" (Salvar Como Novo) ---- */
  const handleSwitchToSaveAs = useCallback(() => {
    setMode("save");
    setName("");
    setNameError("");
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, []);

  /* ---- Nao renderizar se fechado ---- */
  if (!isOpen) return null;

  /* ---- Heading dinamico ---- */
  const headingText = mode === "choose" || mode === "update"
    ? "Atualizar Preset"
    : "Salvar Preset";

  /* =================================================================
     RENDERIZACAO
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

      {/* ---- Painel ---- */}
      <div
        className={`relative w-full max-w-sm rounded-2xl border border-sf-border bg-sf-bg shadow-elevated overflow-hidden ${
          isClosing ? "animate-modal-scale-out" : "animate-modal-scale-in"
        }`}
      >
        {/* Barra gradiente */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sf-primary via-sf-accent to-sf-primary rounded-t-2xl"
          aria-hidden="true"
        />

        {/* Botao fechar */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-sf-textMuted hover:text-sf-text hover:bg-sf-surface transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sf-primary/50 z-10"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ---- Cabecalho ---- */}
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sf-primary/10 shrink-0">
              <Save className="w-5 h-5 text-sf-primary" aria-hidden="true" />
            </div>
            <h2 id={headingId} className="text-lg font-semibold text-sf-text">
              {headingText}
            </h2>
          </div>
        </div>

        {/* ---- Corpo ---- */}
        <div className="px-6 py-4 pb-6">
          {mode === "choose" && activePreset ? (
            /* ---- Modo "choose": Atualizar ou Salvar Como ---- */
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleUpdate}
                disabled={isSaving}
                className="w-full py-2.5 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                )}
                Atualizar &quot;{activePreset.name}&quot;
              </button>

              {/* Divisor "ou" */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-sf-border" />
                <span className="text-xs text-sf-textMuted">ou</span>
                <div className="flex-1 h-px bg-sf-border" />
              </div>

              <button
                type="button"
                onClick={handleSwitchToSaveAs}
                className="w-full py-2.5 border border-sf-border text-sf-textSecondary hover:text-sf-text hover:border-sf-textMuted rounded-xl text-sm transition-all"
              >
                Salvar Como Novo
              </button>
            </div>
          ) : (
            /* ---- Modo "save": Input de nome + botao salvar ---- */
            <div>
              <label
                htmlFor="preset-name-input"
                className="block text-sm text-sf-textSecondary mb-2"
              >
                Nome do preset
              </label>
              <input
                ref={nameInputRef}
                id="preset-name-input"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                placeholder="Ex: MisterT - Apenas Estoque"
                maxLength={MAX_PRESET_NAME_LENGTH}
                className={inputBaseClass}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? "preset-name-error" : undefined}
              />
              {nameError && (
                <p id="preset-name-error" className="text-xs text-sf-warning mt-1">
                  {nameError}
                </p>
              )}
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isSaving}
                className="w-full mt-4 py-2.5 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                )}
                Salvar Preset
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
