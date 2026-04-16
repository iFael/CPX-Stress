import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type { K6Config, K6Summary } from "./k6-types";
import { generateFlowScript, generateSimpleScript } from "./k6-script-generator";

const OUTPUT_PREVIEW_LIMIT = 4_000;

function toMetricSlug(name: string, index: number): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return `${normalized || "operation"}_${index + 1}`;
}

function buildOperationMetricNames(config: K6Config) {
  return (config.flowOperations || []).map((operation, index) => {
    const metricKey = toMetricSlug(operation.name, index);
    return {
      name: operation.name,
      requestMetric: `cpx_op_requests__${metricKey}`,
      errorMetric: `cpx_op_errors__${metricKey}`,
      logicalMetric: `cpx_op_logical__${metricKey}`,
    };
  });
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createArtifactsDir(): string {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const baseTempDir =
    typeof app?.getPath === "function" ? app.getPath("temp") : os.tmpdir();
  const dir = path.join(baseTempDir, "cpx-stress-k6", runId);
  ensureDir(dir);
  return dir;
}

function tryExec(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, {
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function resolveK6Binary(): string | null {
  const candidates: string[] = [];
  const isWindows = process.platform === "win32";
  const isElectronPackaged = app?.isPackaged === true;
  const pushCandidate = (candidate?: string) => {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      candidates.push(candidate);
    }
  };

  if (process.env.K6_PATH && process.env.K6_PATH.trim() !== "") {
    pushCandidate(process.env.K6_PATH.trim());
  }

  if (isElectronPackaged) {
    pushCandidate(path.join(process.resourcesPath, `k6${isWindows ? ".exe" : ""}`));
  }

  if (isWindows) {
    pushCandidate(
      process.env.ProgramFiles
        ? path.join(process.env.ProgramFiles, "k6", "k6.exe")
        : undefined,
    );
    pushCandidate(
      process.env["ProgramFiles(x86)"]
        ? path.join(process.env["ProgramFiles(x86)"], "k6", "k6.exe")
        : undefined,
    );
    pushCandidate(
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Programs", "k6", "k6.exe")
        : undefined,
    );
    pushCandidate(
      process.env.LOCALAPPDATA
        ? path.join(
            process.env.LOCALAPPDATA,
            "Microsoft",
            "WinGet",
            "Links",
            "k6.exe",
          )
        : undefined,
    );
    pushCandidate(
      process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, "scoop", "shims", "k6.exe")
        : undefined,
    );
    pushCandidate(
      process.env.ChocolateyInstall
        ? path.join(process.env.ChocolateyInstall, "bin", "k6.exe")
        : undefined,
    );
    pushCandidate(
      process.env.ProgramData
        ? path.join(process.env.ProgramData, "chocolatey", "bin", "k6.exe")
        : undefined,
    );
    pushCandidate("k6.exe");
  }

  pushCandidate("k6");

  for (const candidate of candidates) {
    if (tryExec(candidate, ["version"])) {
      return candidate;
    }
  }

  return null;
}

function getK6Version(binary: string): string {
  try {
    return execFileSync(binary, ["version"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "k6 (versão indisponível)";
  }
}

export function isK6Available(): boolean {
  return resolveK6Binary() !== null;
}

function truncateOutput(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= OUTPUT_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(-OUTPUT_PREVIEW_LIMIT)}...`;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("Summary JSON não encontrado no stdout do k6.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }

  throw new Error("Summary JSON incompleto no stdout do k6.");
}

function parseK6Summary(raw: unknown, config: K6Config): K6Summary {
  const summary = raw as {
    metrics?: Record<string, { values?: Record<string, number> }>;
  };

  const durationValues = summary.metrics?.http_req_duration?.values ?? {};
  const requestValues = summary.metrics?.http_reqs?.values ?? {};
  const logicalFailureValues =
    summary.metrics?.cpx_logical_failures?.values ?? {};

  const statusCodes: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary.metrics ?? {})) {
    const match = key.match(/^cpx_status_(\d+|other)$/);
    if (match) {
      statusCodes[match[1]] = value.values?.count ?? 0;
    }
  }

  const successStatusCodes = new Set([
    "200",
    "201",
    "204",
    "301",
    "302",
    "303",
    "304",
  ]);
  const transportAndHttpFailures = Object.entries(statusCodes).reduce(
    (sum, [code, count]) => (successStatusCodes.has(code) ? sum : sum + count),
    0,
  );
  const logicalFailures = logicalFailureValues.count ?? 0;
  const totalReqs = requestValues.count ?? 0;
  const operationStats: NonNullable<K6Summary["operationStats"]> = {};

  for (const metricNames of buildOperationMetricNames(config)) {
    const requests = summary.metrics?.[metricNames.requestMetric]?.values?.count ?? 0;
    const errors = summary.metrics?.[metricNames.errorMetric]?.values?.count ?? 0;
    const opLogicalFailures =
      summary.metrics?.[metricNames.logicalMetric]?.values?.count ?? 0;

    if (requests === 0 && errors === 0 && opLogicalFailures === 0) {
      continue;
    }

    const current = operationStats[metricNames.name] ?? {
      name: metricNames.name,
      requests: 0,
      errors: 0,
      logicalFailures: 0,
      statusCodes: {},
    };
    current.requests += requests;
    current.errors += errors;
    current.logicalFailures += opLogicalFailures;
    operationStats[metricNames.name] = current;
  }

  const result: K6Summary = {
    avgLatency: durationValues.avg ?? 0,
    minLatency: durationValues.min ?? 0,
    p50Latency: durationValues["p(50)"] ?? durationValues.med ?? 0,
    p90Latency: durationValues["p(90)"] ?? 0,
    p95Latency: durationValues["p(95)"] ?? 0,
    p99Latency: durationValues["p(99)"] ?? 0,
    maxLatency: durationValues.max ?? 0,
    rps: requestValues.rate ?? 0,
    totalReqs,
    errorRate:
      totalReqs > 0
        ? Math.min(1, (transportAndHttpFailures + logicalFailures) / totalReqs)
        : 0,
    statusCodes,
    duration: config.duration,
    vus: config.vus,
  };

  if (Object.keys(operationStats).length > 0) {
    result.operationStats = operationStats;
  }

  return result;
}

export async function runK6(
  config: K6Config,
  onProgress?: (line: string) => void,
): Promise<K6Summary> {
  const binary = resolveK6Binary();
  if (!binary) {
    throw new Error(
      "O binário do k6 não foi encontrado. Instale o k6 ou configure K6_PATH para habilitar a comparação.",
    );
  }

  const artifactsDir = createArtifactsDir();
  const scriptPath = path.join(artifactsDir, "cpx-k6-script.js");
  const stdoutPath = path.join(artifactsDir, "stdout.log");
  const stderrPath = path.join(artifactsDir, "stderr.log");

  const script = config.flowOperations?.length
    ? generateFlowScript(config)
    : generateSimpleScript(config);

  fs.writeFileSync(scriptPath, script, "utf8");

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(
      binary,
      [
        "run",
        `--vus=${config.vus}`,
        `--duration=${config.duration}s`,
        "--summary-trend-stats=avg,min,med,p(50),p(90),p(95),p(99),max",
        scriptPath,
      ],
      {
        env: { ...process.env },
        cwd: artifactsDir,
        windowsHide: true,
      },
    );

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      onProgress?.(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onProgress?.(text);
    });

    proc.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      if (code !== 0) {
        return reject(
          new Error(
            truncateOutput(stderr) ||
              `k6 encerrou com código ${code ?? "desconhecido"}.`,
          ),
        );
      }

      try {
        const parsed = JSON.parse(extractJsonObject(stdout));
        const summary = parseK6Summary(parsed, config);
        summary.duration = Number(
          ((Date.now() - startedAt) / 1000).toFixed(2),
        );
        summary.vus = config.vus;
        summary.executable = binary;
        summary.version = getK6Version(binary);
        summary.artifactsDir = artifactsDir;
        summary.scriptPath = scriptPath;
        summary.stdoutSnippet = truncateOutput(stdout);
        summary.stderrSnippet = truncateOutput(stderr);
        resolve(summary);
      } catch (error) {
        reject(
          new Error(
            `Falha ao parsear summary do k6: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });

    proc.on("error", (error) => {
      reject(
        new Error(
          `k6 não encontrado: ${error.message}. Instale o binário ou configure K6_PATH.`,
        ),
      );
    });
  });
}
