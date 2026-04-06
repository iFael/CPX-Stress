/**
 * CredentialAlert.tsx — Banner de alerta para credenciais ausentes
 *
 * Exibido na tela de configuracao de teste (TestConfig) quando as
 * credenciais obrigatorias do MisterT nao estao configuradas.
 * O botao "Configurar" navega diretamente para a tela de configuracoes.
 *
 * NAO e dismissivel — persiste ate que todas as credenciais estejam configuradas.
 */

import { useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { useTestStore } from "@/stores/test-store";

export function CredentialAlert() {
  const setView = useTestStore((s) => s.setView);

  const handleNavigateToSettings = useCallback(() => {
    setView("settings");
  }, [setView]);

  return (
    <div
      role="alert"
      className="mb-4 p-4 bg-sf-warning/10 border border-sf-warning/30 rounded-xl flex items-start gap-3 animate-fade-in"
    >
      <AlertTriangle
        className="w-5 h-5 text-sf-warning shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="text-sm font-semibold text-sf-warning">
          Credenciais MisterT nao configuradas
        </p>
        <p className="text-sm text-sf-warning/80 mt-1">
          Configure usuario e senha para executar testes autenticados no MisterT
          ERP.
        </p>
      </div>
      <button
        type="button"
        onClick={handleNavigateToSettings}
        className="text-sm text-sf-warning hover:text-sf-warning/80 font-semibold underline shrink-0"
      >
        Configurar
      </button>
    </div>
  );
}
