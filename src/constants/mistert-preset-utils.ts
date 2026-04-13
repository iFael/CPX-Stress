import type { TestOperation } from "@/types";

export function cloneMistertOperation(operation: TestOperation): TestOperation {
  return {
    ...operation,
    moduleGroup: operation.moduleGroup,
    headers: operation.headers ? { ...operation.headers } : undefined,
    extract: operation.extract ? { ...operation.extract } : undefined,
    validation: operation.validation
      ? {
          expectedAnyText: operation.validation.expectedAnyText
            ? [...operation.validation.expectedAnyText]
            : undefined,
          rejectLoginLikeContent: operation.validation.rejectLoginLikeContent,
          rejectOnAnyText: operation.validation.rejectOnAnyText
            ? [...operation.validation.rejectOnAnyText]
            : undefined,
        }
      : undefined,
    navigation: operation.navigation
      ? {
          accessMode: operation.navigation.accessMode,
          notes: operation.navigation.notes,
          sourceAction: operation.navigation.sourceAction
            ? {
                kind: operation.navigation.sourceAction.kind,
                method: operation.navigation.sourceAction.method,
                submitControlName: operation.navigation.sourceAction.submitControlName,
                submitControlValue:
                  operation.navigation.sourceAction.submitControlValue,
                fields: operation.navigation.sourceAction.fields
                  ? { ...operation.navigation.sourceAction.fields }
                  : undefined,
                description: operation.navigation.sourceAction.description,
              }
            : undefined,
        }
      : undefined,
  };
}

export function buildOperationsFromTemplate(
  template: readonly TestOperation[],
  defaultBaseUrl: string,
  baseUrl?: string,
): TestOperation[] {
  const base = (baseUrl || defaultBaseUrl).replace(/\/+$/, "");

  return template.map((operation) => {
    const cloned = cloneMistertOperation(operation);
    return {
      ...cloned,
      url: cloned.url.replace(defaultBaseUrl, base),
    };
  });
}
