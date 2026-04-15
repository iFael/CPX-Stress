import type { ArtilleryConfig } from "./artillery-types";

function toYamlScalar(value: string): string {
  return JSON.stringify(value);
}

function toYamlObject(
  obj: Record<string, string> | undefined,
  indent: number,
): string[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  const prefix = " ".repeat(indent);
  return Object.entries(obj).map(([key, value]) => `${prefix}${key}: ${toYamlScalar(value)}`);
}

function deriveTarget(config: ArtilleryConfig): string {
  const firstUrl = config.flowOperations?.[0]?.url || config.url;
  try {
    return new URL(firstUrl).origin;
  } catch {
    return config.url;
  }
}

function buildRequestStep(
  operation: NonNullable<ArtilleryConfig["flowOperations"]>[number],
): string[] {
  const method = operation.method.toLowerCase();
  const lines = [`- ${method}:`, `    name: ${toYamlScalar(operation.name)}`];

  try {
    const parsed = new URL(operation.url);
    const relativeUrl = `${parsed.pathname}${parsed.search}`;
    lines.push(`    url: ${toYamlScalar(relativeUrl)}`);
  } catch {
    lines.push(`    url: ${toYamlScalar(operation.url)}`);
  }

  if (operation.headers && Object.keys(operation.headers).length > 0) {
    lines.push("    headers:");
    lines.push(...toYamlObject(operation.headers, 6));
  }

  if (operation.body) {
    lines.push(`    body: ${toYamlScalar(operation.body)}`);
  }

  if (operation.extractors && operation.extractors.length > 0) {
    lines.push("    capture:");
    for (const extractor of operation.extractors) {
      lines.push("      - regexp: " + toYamlScalar(extractor.regex));
      lines.push("        as: " + extractor.varName);
      lines.push("        strict: false");
    }
  }

  return lines;
}

function buildScenarioBlocks(config: ArtilleryConfig): string[] {
  const operations = config.flowOperations;
  if (!operations || operations.length === 0) {
    return [
      "  - name: generated-flow",
      "    flow:",
      `      - ${(config.method || "GET").toLowerCase()}:`,
      `          name: ${toYamlScalar("Requisição Principal")}`,
      `          url: ${toYamlScalar(config.url)}`,
      ...(config.headers && Object.keys(config.headers).length > 0
        ? ["          headers:", ...toYamlObject(config.headers, 12)]
        : []),
      ...(config.body ? [`          body: ${toYamlScalar(config.body)}`] : []),
    ];
  }

  const firstModuleIndex = operations.findIndex(
    (operation) =>
      typeof operation.moduleGroup === "string" && operation.moduleGroup.trim() !== "",
  );

  const authOps = firstModuleIndex >= 0 ? operations.slice(0, firstModuleIndex) : operations;
  const moduleOps = firstModuleIndex >= 0 ? operations.slice(firstModuleIndex) : [];
  const moduleFlows: typeof operations[] = [];

  for (const operation of moduleOps) {
    const groupName = operation.moduleGroup || operation.name;
    const currentFlow = moduleFlows[moduleFlows.length - 1];
    const currentName =
      currentFlow && currentFlow.length > 0
        ? currentFlow[0].moduleGroup || currentFlow[0].name
        : null;

    if (currentFlow && currentName === groupName) {
      currentFlow.push(operation);
    } else {
      moduleFlows.push([operation]);
    }
  }

  const scenarioFlows = moduleFlows.length > 0 ? moduleFlows : [authOps];
  const blocks: string[] = [];

  scenarioFlows.forEach((flow, index) => {
    const scenarioOps = moduleFlows.length > 0 ? [...authOps, ...flow] : flow;
    const scenarioName =
      moduleFlows.length > 0
        ? flow[0]?.moduleGroup || flow[0]?.name || `flow-${index + 1}`
        : "generated-flow";

    blocks.push(`  - name: ${toYamlScalar(String(scenarioName))}`);
    blocks.push("    weight: 1");
    blocks.push("    flow:");
    for (const operation of scenarioOps) {
      blocks.push(...buildRequestStep(operation).map((line) => `      ${line}`));
    }
  });

  return blocks;
}

export function generateArtilleryScript(config: ArtilleryConfig): string {
  const target = deriveTarget(config);
  const arrivalRate = Math.max(1, config.vus);
  const maxVusers = Math.max(1, config.vus);

  const lines = [
    "config:",
    `  target: ${toYamlScalar(target)}`,
    "  phases:",
    "    - duration: " + config.duration,
    "      arrivalRate: " + arrivalRate,
    "      maxVusers: " + maxVusers,
    "  http:",
    "    timeout: 30",
    "    pool: " + maxVusers,
    "scenarios:",
    ...buildScenarioBlocks(config),
  ];

  return `${lines.join("\n")}\n`;
}
