import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { K6Config, K6Summary } from "./k6-types";
import { generateFlowScript, generateSimpleScript } from "./k6-script-generator";

const OUTPUT_PREVIEW_LIMIT = 4_000;

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createArtifactsDir(): string {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(app.getPath("temp"), "cpx-stress-k6", runId);
  ensureDir(dir);
  return dir;
}

function getK6Binary(): string {
  if (process.env.K6_PATH && process.env.K6_PATH.trim() !== "") {
    return process.env.K6_PATH.trim();
  }

  if (app.isPackaged) {
    const ext = process.platform === "win32" ? ".exe" : "";
    return path.join(process.resourcesPath, `k6${ext}`);
  }

  return "k6";
}

function getK6Version(): string {
  try {
    return execSync(`"${getK6Binary()}" version`, {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "k6 (versão indisponível)";
  }
}

export function isK6Available(): boolean {
  try {
    execSync(`"${getK6Binary()}" version`, {
      stdio: "ignore",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
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
  const failureValues = summary.metrics?.http_req_failed?.values ?? {};

  const statusCodes: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary.metrics ?? {})) {
    const match = key.match(/^cpx_status_(\d+|other)$/);
    if (match) {
      statusCodes[match[1]] = value.values?.count ?? 0;
    }
  }

  return {
    avgLatency: durationValues.avg ?? 0,
    minLatency: durationValues.min ?? 0,
    p50Latency: durationValues["p(50)"] ?? durationValues.med ?? 0,
    p90Latency: durationValues["p(90)"] ?? 0,
    p95Latency: durationValues["p(95)"] ?? 0,
    p99Latency: durationValues["p(99)"] ?? 0,
    maxLatency: durationValues.max ?? 0,
    rps: requestValues.rate ?? 0,
    totalReqs: requestValues.count ?? 0,
    errorRate: failureValues.rate ?? 0,
    statusCodes,
    duration: config.duration,
    vus: config.vus,
  };
}

export async function runK6(
  config: K6Config,
  onProgress?: (line: string) => void,
): Promise<K6Summary> {
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
      getK6Binary(),
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
        summary.executable = getK6Binary();
        summary.version = getK6Version();
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
