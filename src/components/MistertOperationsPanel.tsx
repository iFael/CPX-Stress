import type { TestOperation } from "@/types";
import { MISTERT_MODULE_METADATA } from "@/constants/test-presets";

const MISTERT_MODULE_NAMES = new Set<string>(
  MISTERT_MODULE_METADATA.map((module) => module.name),
);

function getOperationNavigationLabel(operation: TestOperation): string {
  return operation.navigation?.accessMode === "action-driven"
    ? "acao anterior"
    : "URL direta";
}

function getOperationNavigationTone(operation: TestOperation): string {
  return operation.navigation?.accessMode === "action-driven"
    ? "bg-sf-warning/10 text-sf-warning"
    : "bg-sf-primary/10 text-sf-primary";
}

function getOperationNote(
  operation: TestOperation,
  params: { isModule: boolean; isFixed: boolean },
): string | null {
  if (operation.navigation?.accessMode === "action-driven") {
    return (
      operation.navigation.notes ||
      "Depende de uma acao anterior, como submit de formulario."
    );
  }

  if (params.isFixed && operation.navigation?.notes) {
    return operation.navigation.notes;
  }

  return null;
}

interface MistertOperationsPanelProps {
  operations: TestOperation[];
  isMistertPreset: boolean;
  selectedModuleNames: Set<string>;
  allModulesSelected: boolean;
  noModulesSelected: boolean;
  onClearAll: () => void;
  onSelectAll: () => void;
  onToggleModule: (moduleName: string, checked: boolean) => void;
}

export function MistertOperationsPanel({
  operations,
  isMistertPreset,
  selectedModuleNames,
  allModulesSelected,
  noModulesSelected,
  onClearAll,
  onSelectAll,
  onToggleModule,
}: MistertOperationsPanelProps) {
  const actionDrivenCount = operations.filter(
    (operation) => operation.navigation?.accessMode === "action-driven",
  ).length;
  const urlDrivenCount = operations.length - actionDrivenCount;
  const fixedOperations = operations.filter(
    (operation) => !MISTERT_MODULE_NAMES.has(operation.name),
  );
  const selectedModuleOperations = operations.filter((operation) =>
    MISTERT_MODULE_NAMES.has(operation.name)
  );

  return (
    <div className="mt-3 p-4 bg-sf-surface border border-sf-border rounded-xl animate-slide-up space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-sf-textMuted">
          Cada usuario virtual percorre este fluxo mantendo a propria sessao ASP
          e atualizando o `CTRL` entre as etapas.
          {isMistertPreset &&
            " Os modulos podem ser ligados ou desligados sem alterar as etapas fixas."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="px-3 py-2 rounded-lg bg-sf-bg border border-sf-border">
            <p className="text-[10px] uppercase tracking-wide text-sf-textMuted">
              Etapas URL
            </p>
            <p className="text-sm font-semibold text-sf-text">
              {urlDrivenCount}
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-sf-bg border border-sf-border">
            <p className="text-[10px] uppercase tracking-wide text-sf-textMuted">
              Etapas por acao
            </p>
            <p className="text-sm font-semibold text-sf-text">
              {actionDrivenCount}
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-sf-bg border border-sf-border">
            <p className="text-[10px] uppercase tracking-wide text-sf-textMuted">
              Modulos ativos
            </p>
            <p className="text-sm font-semibold text-sf-text">
              {selectedModuleNames.size} / {MISTERT_MODULE_METADATA.length}
            </p>
          </div>
        </div>
      </div>

      {isMistertPreset && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={allModulesSelected ? onClearAll : onSelectAll}
            className="text-xs font-medium text-sf-primary hover:text-sf-primaryHover transition-colors"
          >
            {allModulesSelected ? "Limpar Selecao" : "Selecionar Todos"}
          </button>
          <span className="text-xs text-sf-textMuted">
            {selectedModuleNames.size} de {MISTERT_MODULE_METADATA.length} modulos
          </span>
        </div>
      )}

      <div className="space-y-4">
        {[
          {
            title: "Etapas Fixas",
            subtitle: "Sempre executadas antes dos modulos.",
            items: fixedOperations,
          },
          {
            title: "Modulos Selecionados",
            subtitle: "Executados conforme a selecao atual.",
            items: selectedModuleOperations,
          },
        ]
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sf-textSecondary">
                    {section.title}
                  </p>
                  <p className="text-[11px] text-sf-textMuted">
                    {section.subtitle}
                  </p>
                </div>
                <span className="text-[11px] text-sf-textMuted">
                  {section.items.length} etapa(s)
                </span>
              </div>

              <div className="space-y-2">
                {section.items.map((operation) => {
                  const isModule = MISTERT_MODULE_NAMES.has(operation.name);
                  const isFixed = !isModule;
                  const isActionDriven =
                    operation.navigation?.accessMode === "action-driven";
                  const submitControlName =
                    operation.navigation?.sourceAction?.submitControlName;
                  const submitControlValue =
                    operation.navigation?.sourceAction?.submitControlValue;
                  const operationNote = getOperationNote(operation, {
                    isModule,
                    isFixed,
                  });
                  const position = operations.findIndex(
                    (candidate) => candidate.name === operation.name,
                  );

                  return (
                    <div
                      key={operation.name}
                      className="px-3 py-3 bg-sf-bg border border-sf-border rounded-lg"
                    >
                      <div className="flex items-start gap-3">
                        {isMistertPreset && isModule ? (
                          <label className="relative flex items-center justify-center shrink-0 cursor-pointer mt-0.5">
                            <input
                              type="checkbox"
                              checked={selectedModuleNames.has(operation.name)}
                              onChange={(e) =>
                                onToggleModule(operation.name, e.target.checked)}
                              className="peer sr-only"
                              aria-label={`Incluir ${operation.name}`}
                            />
                            <div className="w-[18px] h-[18px] rounded-md border border-sf-border bg-sf-surface peer-checked:bg-sf-primary peer-checked:border-sf-primary peer-focus-visible:ring-2 peer-focus-visible:ring-sf-primary/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sf-bg transition-all duration-200">
                              {selectedModuleNames.has(operation.name) && (
                                <svg
                                  className="w-full h-full text-white p-0.5"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M2.5 6L5 8.5L9.5 3.5"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </div>
                          </label>
                        ) : (
                          <span className="text-xs text-sf-textMuted w-5 text-right shrink-0 pt-1">
                            {position + 1}.
                          </span>
                        )}

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
                                operation.method === "POST"
                                  ? "bg-sf-warning/10 text-sf-warning"
                                  : "bg-sf-accent/10 text-sf-accent"
                              }`}
                            >
                              {operation.method}
                            </span>
                            <span className="text-sf-text font-medium min-w-0 truncate">
                              {operation.name}
                            </span>
                            {isFixed && (
                              <span className="text-[10px] text-sf-textMuted bg-sf-surface px-1.5 py-0.5 rounded">
                                fixo
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${getOperationNavigationTone(operation)}`}
                            >
                              {getOperationNavigationLabel(operation)}
                            </span>
                            {operation.extract && (
                              <span className="text-[10px] text-sf-accent/70 bg-sf-accent/5 px-1.5 py-0.5 rounded">
                                extrai CTRL
                              </span>
                            )}
                            {submitControlName && (
                              <span className="text-[10px] text-sf-textMuted bg-sf-surface px-1.5 py-0.5 rounded">
                                {operation.navigation?.sourceAction?.method}{" "}
                                {submitControlName}
                                {submitControlValue
                                  ? `=${submitControlValue}`
                                  : ""}
                              </span>
                            )}
                            {isActionDriven && (
                              <span className="text-[10px] text-sf-warning bg-sf-warning/10 px-1.5 py-0.5 rounded">
                                nao e copiavel por URL
                              </span>
                            )}
                          </div>

                          {operationNote && (
                            <p className="text-[11px] leading-relaxed text-sf-textMuted">
                              {operationNote}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {isMistertPreset &&
        MISTERT_MODULE_METADATA.filter(
          (module) => !selectedModuleNames.has(module.name),
        ).map((module) => (
          <div
            key={`disabled-${module.name}`}
            className="flex items-center gap-3 px-3 py-2 bg-sf-bg/50 border border-sf-border/50 rounded-lg text-sm opacity-50"
          >
            <label className="relative flex items-center justify-center shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={false}
                onChange={() => onToggleModule(module.name, true)}
                className="peer sr-only"
                aria-label={`Incluir ${module.name}`}
              />
              <div className="w-[18px] h-[18px] rounded-md border border-sf-border bg-sf-surface peer-focus-visible:ring-2 peer-focus-visible:ring-sf-primary/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sf-bg transition-all duration-200" />
            </label>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 bg-sf-textMuted/10 text-sf-textMuted">
              GET
            </span>
            <span className="text-sf-textMuted font-medium truncate line-through">
              {module.name}
            </span>
            <span className="text-[10px] text-sf-primary/80 bg-sf-primary/5 px-1.5 py-0.5 rounded">
              URL direta
            </span>
            <span className="ml-auto text-[10px] text-sf-textMuted">
              removido
            </span>
          </div>
        ))}

      {noModulesSelected && (
        <div
          role="status"
          className="mt-1 px-3 py-2 bg-sf-warning/10 rounded-lg animate-fade-in"
        >
          <p className="text-xs text-sf-warning leading-relaxed">
            Nenhum modulo selecionado — o teste executara apenas login e menu.
          </p>
        </div>
      )}
    </div>
  );
}
