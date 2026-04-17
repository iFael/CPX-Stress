import type {
  K6Config,
  JMeterConfig,
  LocustConfig,
  TestConfig,
  TestOperation,
  TestResult,
} from "@/types";

function buildExternalFlowOperationsFromOperations(operations?: TestOperation[]) {
  return operations?.map((operation) => ({
    name: operation.name,
    method: operation.method,
    url: operation.url,
    headers: operation.headers,
    body: operation.body,
    moduleGroup: operation.moduleGroup,
    captureSession: operation.captureSession,
    extractors: operation.extract
      ? Object.entries(operation.extract).map(([varName, regex]) => ({
          varName,
          regex,
        }))
      : undefined,
    expectedTexts: operation.validation?.expectedAnyText,
    rejectLoginLikeContent: operation.validation?.rejectLoginLikeContent,
    rejectTexts: operation.validation?.rejectOnAnyText,
  }));
}

export function buildExternalFlowOperations(result: TestResult) {
  return buildExternalFlowOperationsFromOperations(result.config.operations);
}

export function buildK6ConfigFromTestResult(result: TestResult): K6Config {
  return buildK6ConfigFromTestConfig(result.config, result.url);
}

export function buildLocustConfigFromTestResult(result: TestResult): LocustConfig {
  return buildLocustConfigFromTestConfig(result.config, result.url);
}

export function buildJMeterConfigFromTestResult(result: TestResult): JMeterConfig {
  return buildJMeterConfigFromTestConfig(result.config, result.url);
}

export function buildK6ConfigFromTestConfig(
  config: TestConfig,
  fallbackUrl?: string,
): K6Config {
  return {
    url: fallbackUrl || config.url,
    vus: config.virtualUsers,
    duration: config.duration,
    rampUpSeconds: config.rampUp,
    method: config.method,
    flowSelectionMode: config.flowSelectionMode,
    deterministicStartOffsetStrategy: config.deterministicStartOffsetStrategy,
    requestTimeoutMs: config.requestTimeoutMs,
    headers: config.headers,
    body: config.body,
    flowOperations: buildExternalFlowOperationsFromOperations(config.operations),
  };
}

export function buildLocustConfigFromTestConfig(
  config: TestConfig,
  fallbackUrl?: string,
): LocustConfig {
  return {
    url: fallbackUrl || config.url,
    vus: config.virtualUsers,
    duration: config.duration,
    method: config.method,
    flowSelectionMode: config.flowSelectionMode,
    deterministicStartOffsetStrategy: config.deterministicStartOffsetStrategy,
    requestTimeoutMs: config.requestTimeoutMs,
    headers: config.headers,
    body: config.body,
    rampUpSeconds: config.rampUp,
    flowOperations: buildExternalFlowOperationsFromOperations(config.operations),
  };
}

export function buildJMeterConfigFromTestConfig(
  config: TestConfig,
  fallbackUrl?: string,
): JMeterConfig {
  return {
    url: fallbackUrl || config.url,
    vus: config.virtualUsers,
    duration: config.duration,
    method: config.method,
    flowSelectionMode: config.flowSelectionMode,
    deterministicStartOffsetStrategy: config.deterministicStartOffsetStrategy,
    requestTimeoutMs: config.requestTimeoutMs,
    headers: config.headers,
    body: config.body,
    rampUpSeconds: config.rampUp,
    flowOperations: buildExternalFlowOperationsFromOperations(config.operations),
  };
}
