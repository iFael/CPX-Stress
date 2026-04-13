import fs from "node:fs";
import {
  runMistertValidation,
  resolveConfigEnvPlaceholders,
} from "../electron/engine/mistert-validation";
import {
  validateTestConfig,
  type TestConfig,
  type TestOperation,
} from "../electron/engine/stress-engine";
import {
  buildMistertOperations,
  MISTERT_DEFAULT_BASE_URL,
} from "../src/constants/test-presets";

interface CliOptions {
  baseUrl: string;
  selectedModules: Set<string>;
  timeoutMs: number;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: MISTERT_DEFAULT_BASE_URL,
    selectedModules: new Set<string>(),
    timeoutMs: 30_000,
  };

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length).trim();
      continue;
    }

    if (arg.startsWith("--modules=")) {
      const modules = arg
        .slice("--modules=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      options.selectedModules = new Set(modules);
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      const timeout = Number(arg.slice("--timeout-ms=".length));
      if (Number.isFinite(timeout) && timeout > 0) {
        options.timeoutMs = timeout;
      }
    }
  }

  return options;
}

function loadEnvFile(): Record<string, string> {
  const envPath = ".env";
  if (!fs.existsSync(envPath)) return {};

  const env: Record<string, string> = {};
  const content = fs.readFileSync(envPath, "utf-8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function buildAuditOperations(
  baseUrl: string,
  selectedModules: Set<string>,
): TestOperation[] {
  const allOperations = buildMistertOperations(baseUrl) as TestOperation[];
  if (selectedModules.size === 0) return allOperations;

  const fixedOperations = allOperations.slice(0, 3);
  const moduleOperations = allOperations
    .slice(3)
    .filter((operation) => selectedModules.has(operation.name));

  return [...fixedOperations, ...moduleOperations];
}

function buildAuditConfig(options: CliOptions): TestConfig {
  const operations = buildAuditOperations(
    options.baseUrl,
    options.selectedModules,
  );

  return {
    url: operations[0]?.url ?? `${options.baseUrl}/MisterT.asp?MF=Y`,
    virtualUsers: 1,
    duration: 5,
    method: "GET",
    operations,
  };
}

function printUsage(): void {
  console.log(
    [
      "Uso: npm run audit:mistert -- [--base-url=https://host] [--modules=CPX-Fretes,Financeiro] [--timeout-ms=30000]",
      "",
      "Exemplos:",
      "  npm run audit:mistert",
      "  npm run audit:mistert -- --base-url=https://mistert.empresa.com.br",
      "  npm run audit:mistert -- --modules=CPX-Fretes,Financeiro",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseCli(process.argv.slice(2));
  const envVars = loadEnvFile();
  const config = buildAuditConfig(options);
  const { config: resolvedConfig } = resolveConfigEnvPlaceholders(config, envVars);

  validateTestConfig(resolvedConfig);

  const validation = await runMistertValidation(config, envVars, {
    timeoutMs: options.timeoutMs,
  });

  console.log(
    `\n[CPX-Stress] Validacao MisterT: ${
      validation.canRunStressTest ? "APROVADA" : "REPROVADA"
    }`,
  );
  console.log(
    `Tecnico ${validation.summary.technicalPassed}/${validation.summary.totalOperations} | Funcional ${validation.summary.functionalPassed}/${validation.summary.totalOperations}`,
  );

  if (validation.missingEnvKeys.length > 0) {
    console.log(
      `Credenciais ausentes no .env: ${validation.missingEnvKeys.join(", ")}`,
    );
  }

  for (const operation of validation.operations) {
    console.log(
      `\n- ${operation.name} [${operation.method}] | tecnico=${operation.technicalStatus} funcional=${operation.functionalStatus} | status=${operation.statusCode || 0}`,
    );
    console.log(`  URL final: ${operation.finalUrl}`);

    if (operation.technicalReasons.length > 0) {
      console.log(`  Tecnico: ${operation.technicalReasons.join(" ")}`);
    }

    if (operation.functionalReasons.length > 0) {
      console.log(`  Funcional: ${operation.functionalReasons.join(" ")}`);
    }

    if (operation.bodySnippet) {
      console.log(`  Trecho: ${operation.bodySnippet}`);
    }
  }

  if (!validation.canRunStressTest) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[CPX-Stress] Falha ao validar fluxo MisterT: ${message}`);
  process.exit(1);
});
