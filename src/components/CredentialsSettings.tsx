/**
 * CredentialsSettings.tsx — Tela de configuracao de credenciais MisterT
 *
 * Permite ao usuario salvar usuario e senha do MisterT ERP
 * sem editar arquivos .env manualmente. Os valores existem APENAS
 * no estado local do componente (useState) e sao limpos apos o salvamento.
 *
 * SEGURANCA:
 *   - Valores de credenciais NUNCA sao armazenados no Zustand store
 *   - Campos sempre iniciam VAZIOS (nunca pre-preenchidos com valores salvos)
 *   - Apos salvar, os valores sao limpos da memoria local do componente
 *   - O IPC credentials:save envia valores apenas no transito — main process escreve no .env
 */

import { useState, useCallback, useEffect } from "react";
import {
  Settings,
  KeyRound,
  User,
  Lock,
  Eye,
  EyeOff,
  Save,
  Check,
  Minus,
  Loader2,
} from "lucide-react";
import { useTestStore } from "@/stores/test-store";
import { useToast } from "@/components/Toast";
import { InfoTooltip } from "@/components/InfoTooltip";

/* =====================================================================
   ESTILOS REUTILIZAVEIS
   Replicados do TestConfig.tsx para manter consistencia visual.
   ===================================================================== */

const inputBaseClass =
  "w-full px-4 py-2.5 bg-sf-surface border border-sf-border rounded-xl text-sf-text " +
  "focus:outline-none focus:ring-2 focus:ring-sf-primary/30 focus:border-sf-primary transition-all";

const labelClass = "flex items-center gap-2 text-sm text-sf-textSecondary mb-2";

/* =====================================================================
   COMPONENTES INTERNOS
   ===================================================================== */

/**
 * Badge indicador de status de uma credencial individual.
 * Exibe "Configurado" (verde) ou "Nao configurado" (cinza).
 */
function StatusBadge({
  configured,
  fieldLabel,
}: {
  configured: boolean;
  fieldLabel: string;
}) {
  return configured ? (
    <span
      className="flex items-center gap-1.5 text-xs text-sf-success"
      aria-label={`Credencial de ${fieldLabel} configurada`}
    >
      <Check className="w-3.5 h-3.5" aria-hidden="true" />
      Configurado
    </span>
  ) : (
    <span
      className="flex items-center gap-1.5 text-xs text-sf-textMuted"
      aria-label={`Credencial de ${fieldLabel} nao configurada`}
    >
      <Minus className="w-3.5 h-3.5" aria-hidden="true" />
      Nao configurado
    </span>
  );
}

/* =====================================================================
   COMPONENTE PRINCIPAL — Configuracoes de Credenciais MisterT
   ===================================================================== */

export function CredentialsSettings() {
  /* ---- Estado global (Zustand store) — apenas booleanos de status ---- */
  const credentialStatus = useTestStore((s) => s.credentialStatus);
  const setCredentialStatus = useTestStore((s) => s.setCredentialStatus);

  /* ---- Estado local (valores de credenciais NUNCA no Zustand) ---- */
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [envPath, setEnvPath] = useState("");

  /* ---- Toast para feedback ---- */
  const { toast } = useToast();

  /* ---- Carregar caminho do .env ao montar ---- */
  useEffect(() => {
    window.stressflow.app
      .getPath()
      .then((p) => setEnvPath(p))
      .catch(() => {});
  }, []);

  /* ---- Handler de salvamento ---- */
  const handleSave = useCallback(async () => {
    const entries: Array<{ key: string; value: string }> = [];
    if (user.trim()) entries.push({ key: "STRESSFLOW_USER", value: user.trim() });
    if (pass.trim()) entries.push({ key: "STRESSFLOW_PASS", value: pass.trim() });

    if (entries.length === 0) {
      toast.warning("Preencha ao menos um campo para salvar.");
      return;
    }

    setIsSaving(true);

    try {
      await window.stressflow.credentials.save(entries);

      // Limpar campos imediatamente apos salvamento bem-sucedido
      setUser("");
      setPass("");

      toast.success("Credenciais salvas com sucesso!");

      // Atualizar status no Zustand (apenas booleanos)
      const status = await window.stressflow.credentials.status();
      setCredentialStatus(status);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Nao foi possivel salvar as credenciais. Verifique as permissoes do sistema.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [user, pass, toast, setCredentialStatus]);

  /* ---- Flag derivada: botao habilitado quando ha conteudo ---- */
  const canSave = user.trim() !== "" || pass.trim() !== "";

  /* =================================================================
     RENDERIZACAO
     ================================================================= */
  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      {/* ---- Cabecalho da pagina ---- */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-sf-text" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-sf-text">Configuracoes</h2>
        </div>
      </div>

      {/* ---- Card de credenciais ---- */}
      <div className="bg-sf-surface border border-sf-border rounded-xl p-6">
        {/* Titulo da secao */}
        <div className="flex items-center gap-2 text-sm font-semibold text-sf-text mb-4">
          <KeyRound className="w-4 h-4" aria-hidden="true" />
          Credenciais MisterT
          <InfoTooltip text="Os valores sao salvos no diretorio de dados da aplicacao e nunca sao exibidos na interface." />
        </div>

        {/* ---- Campo: Usuario ---- */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="input-cred-user" className={labelClass + " mb-0"}>
              <User className="w-4 h-4" aria-hidden="true" />
              Usuario
            </label>
            <StatusBadge
              configured={credentialStatus?.STRESSFLOW_USER ?? false}
              fieldLabel="usuario"
            />
          </div>
          <input
            id="input-cred-user"
            type="text"
            placeholder="Usuario do MisterT"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className={inputBaseClass}
            autoComplete="off"
          />
        </div>

        {/* ---- Campo: Senha ---- */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="input-cred-pass" className={labelClass + " mb-0"}>
              <Lock className="w-4 h-4" aria-hidden="true" />
              Senha
            </label>
            <StatusBadge
              configured={credentialStatus?.STRESSFLOW_PASS ?? false}
              fieldLabel="senha"
            />
          </div>
          <div className="relative">
            <input
              id="input-cred-pass"
              type={showPassword ? "text" : "password"}
              placeholder="Senha do MisterT"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={inputBaseClass + " pr-10"}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sf-textMuted hover:text-sf-textSecondary transition-colors"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? (
                <Eye className="w-4 h-4" aria-hidden="true" />
              ) : (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* ---- Botao Salvar ---- */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="w-full py-2.5 bg-sf-primary hover:bg-sf-primaryHover text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" aria-hidden="true" />
              Salvar Credenciais
            </>
          )}
        </button>

        {/* ---- Caminho do .env ---- */}
        {envPath && (
          <p className="text-xs text-sf-textMuted mt-4">
            Armazenado em: {envPath}
          </p>
        )}
      </div>
    </div>
  );
}
