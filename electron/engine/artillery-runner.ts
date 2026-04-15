import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { generateArtilleryScript } from "./artillery-script-generator";
import type { ArtilleryConfig, ArtillerySummary } from "./artillery-types";

const OUTPUT_PREVIEW_LIMIT = 4_000;

interface ArtilleryCommand {
  command: string;
  args: string[];
  label: string;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createArtifactsDir(): string {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(app.getPath("temp"), "cpx-stress-artillery", runId);
  ensureDir(dir);
  return dir;
}

function truncateOutput(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= OUTPUT_PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(-OUTPUT_PREVIEW_LIMIT)}...`;
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

function resolveArtilleryCommand(): ArtilleryCommand | null {
  const candidates: ArtilleryCommand[] = [];
  const localBinCandidates = [
    path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "artillery.cmd" : "artillery"),
    path.join(app.getAppPath(), "node_modules", ".bin", process.platform === "win32" ? "artillery.cmd" : "artillery"),
  ];

  if (process.env.ARTILLERY_PATH && process.env.ARTILLERY_PATH.trim() !== "") {
    candidates.push({
      command: process.env.ARTILLERY_PATH.trim(),
      args: [],
      label: process.env.ARTILLERY_PATH.trim(),
    });
  }

  for (const candidate of localBinCandidates) {
    candidates.push({
      command: candidate,
      args: [],
      label: candidate,
    });
  }

  candidates.push(
    { command: "artillery", args: [], label: "artillery" },
    { command: "npx", args: ["artillery"], label: "npx artillery" },
  );

  for (const candidate of candidates) {
    if (tryExec(candidate.command, [...candidate.args, "--version"])) {
      return candidate;
    }
  }

  return null;
}

function getArtilleryVersion(command: ArtilleryCommand): string {
  try {
    return execFileSync(command.command, [...command.args, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "artillery (versão indisponível)";
  }
}

export function isArtilleryAvailable(): boolean {
  return resolveArtilleryCommand() !== null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function parseArtillerySummary(raw: unknown, config: ArtilleryConfig): ArtillerySummary {
  const data = raw as Record<string, unknown>;

  const aggregate = (data.aggregate || data) as Record<string, unknown>;
  const counters =
    (aggregate.counters as Record<string, number> | undefined) ||
    (aggregate["counterByName"] as Record<string, number> | undefined) ||
    {};
  const rates =
    (aggregate.rates as Record<string, number> | undefined) ||
    (aggregate["ratesByName"] as Record<string, number> | undefined) ||
    {};
  const summaries =
    (aggregate.summaries as Record<string, Record<string, number>> | undefined) ||
    {};

  const latencySummary =
    summaries["http.response_time"] ||
    summaries["http.response_time.2xx"] ||
    summaries["response_time"] ||
    {};

  const latencyValues = [
    latencySummary.min,
    latencySummary.p50,
    latencySummary.p95,
    latencySummary.p99,
    latencySummary.max,
  ].filter((value): value is number => typeof value === "number");
  const sortedFallback = [...latencyValues].sort((a, b) => a - b);

  const totalRequests =
    counters["http.requests"] ??
    counters["requests"] ??
    counters["vusers.completed"] ??
    0;
  const totalErrors =
    counters["errors"] ??
    counters["http.errors"] ??
    counters["http.codes.0"] ??
    0;

  const statusCodes: Record<string, number> = {};
  for (const [key, value] of Object.entries(counters)) {
    const match = key.match(/^http\.codes\.(\d+)$/);
    if (match) {
      statusCodes[match[1]] = value;
    }
  }

  const avgLatency = latencySummary.mean ?? latencySummary.avg ?? 0;
  const minLatency = latencySummary.min ?? (sortedFallback[0] ?? 0);
  const p50Latency = latencySummary.p50 ?? percentile(sortedFallback, 50);
  const p90Latency = latencySummary.p90 ?? percentile(sortedFallback, 90);
  const p95Latency = latencySummary.p95 ?? percentile(sortedFallback, 95);
  const p99Latency = latencySummary.p99 ?? percentile(sortedFallback, 99);
  const maxLatency =
    latencySummary.max ?? (sortedFallback[sortedFallback.length - 1] ?? 0);

  const rps =
    rates["http.request_rate"] ??
    rates["http.requests"] ??
    (config.duration > 0 ? totalRequests / config.duration : 0);

  return {
    avgLatency,
    minLatency,
    p50Latency,
    p90Latency,
    p95Latency,
    p99Latency,
    maxLatency,
    rps,
    totalReqs: totalRequests,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    statusCodes,
    duration: config.duration,
    vus: config.vus,
  };
}

export async function runArtillery(
  config: ArtilleryConfig,
  onProgress?: (line: string) => void,
): Promise<ArtillerySummary> {
  const resolved = resolveArtilleryCommand();
  if (!resolved) {
    throw new Error(
      "O binário do Artillery não foi encontrado. Instale o Artillery ou configure ARTILLERY_PATH para habilitar a comparação.",
    );
  }

  const artifactsDir = createArtifactsDir();
  const scriptPath = path.join(artifactsDir, "artillery.yml");
  const outputPath = path.join(artifactsDir, "report.json");
  const stdoutPath = path.join(artifactsDir, "stdout.log");
  const stderrPath = path.join(artifactsDir, "stderr.log");

  fs.writeFileSync(scriptPath, generateArtilleryScript(config), "utf8");

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(
      resolved.command,
      [...resolved.args, "run", "--output", outputPath, scriptPath],
      {
        cwd: artifactsDir,
        env: { ...process.env },
        windowsHide: true,
      },
    );

    proc.stdout.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      onProgress?.(text);
    });

    proc.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      onProgress?.(text);
    });

    proc.on("error", (error) => {
      reject(new Error(`Não foi possível iniciar o Artillery: ${error.message}`));
    });

    proc.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      if (code !== 0) {
        return reject(
          new Error(
            truncateOutput(stderr) ||
              truncateOutput(stdout) ||
              `Artillery encerrou com código ${code ?? "desconhecido"}.`,
          ),
        );
      }

      if (!fs.existsSync(outputPath)) {
        return reject(
          new Error(
            "O Artillery terminou sem gerar o relatório JSON esperado.",
          ),
        );
      }

      try {
        const summary = parseArtillerySummary(
          JSON.parse(fs.readFileSync(outputPath, "utf8")),
          config,
        );
        summary.duration = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        summary.vus = config.vus;
        summary.executable = resolved.label;
        summary.version = getArtilleryVersion(resolved);
        summary.artifactsDir = artifactsDir;
        summary.scriptPath = scriptPath;
        summary.stdoutSnippet = truncateOutput(stdout);
        summary.stderrSnippet = truncateOutput(stderr);
        resolve(summary);
      } catch (error) {
        reject(
          new Error(
            `Falha ao parsear summary do Artillery: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}
