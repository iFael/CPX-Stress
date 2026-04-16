import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { generateFlowScript, generateSimpleScript } from "./locust-script-generator";
import type { LocustConfig, LocustSummary } from "./locust-types";

const OUTPUT_PREVIEW_LIMIT = 4_000;

interface LocustCommand {
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
  const baseTempDir =
    typeof app?.getPath === "function" ? app.getPath("temp") : os.tmpdir();
  const dir = path.join(baseTempDir, "cpx-stress-locust", runId);
  ensureDir(dir);
  return dir;
}

function truncateOutput(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= OUTPUT_PREVIEW_LIMIT) {
    return trimmed;
  }
  return `${trimmed.slice(-OUTPUT_PREVIEW_LIMIT)}...`;
}

function buildSpawnRate(config: LocustConfig): number {
  if (typeof config.spawnRate === "number" && Number.isFinite(config.spawnRate) && config.spawnRate > 0) {
    return config.spawnRate;
  }

  if (
    typeof config.rampUpSeconds === "number" &&
    Number.isFinite(config.rampUpSeconds) &&
    config.rampUpSeconds > 0
  ) {
    return Math.max(1, Math.ceil(config.vus / config.rampUpSeconds));
  }

  return Math.max(1, config.vus);
}

function deriveHost(config: LocustConfig): string | undefined {
  if (config.host && config.host.trim() !== "") {
    return config.host.trim();
  }

  const firstUrl = config.flowOperations?.[0]?.url || config.url;
  try {
    const parsed = new URL(firstUrl);
    return parsed.origin;
  } catch {
    return undefined;
  }
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

function resolveLocustCommand(): LocustCommand | null {
  const candidates: LocustCommand[] = [];

  if (process.env.LOCUST_PATH && process.env.LOCUST_PATH.trim() !== "") {
    candidates.push({
      command: process.env.LOCUST_PATH.trim(),
      args: [],
      label: process.env.LOCUST_PATH.trim(),
    });
  }

  candidates.push(
    { command: "locust", args: [], label: "locust" },
    { command: "python", args: ["-m", "locust"], label: "python -m locust" },
    { command: "py", args: ["-m", "locust"], label: "py -m locust" },
  );

  for (const candidate of candidates) {
    if (tryExec(candidate.command, [...candidate.args, "--version"])) {
      return candidate;
    }
  }

  return null;
}

function getLocustVersion(command: LocustCommand): string {
  try {
    return execFileSync(command.command, [...command.args, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "locust (versão indisponível)";
  }
}

export function isLocustAvailable(): boolean {
  return resolveLocustCommand() !== null;
}

function parseLocustSummary(raw: string): LocustSummary {
  return JSON.parse(raw) as LocustSummary;
}

export async function runLocust(
  config: LocustConfig,
  onProgress?: (line: string) => void,
): Promise<LocustSummary> {
  const resolved = resolveLocustCommand();
  if (!resolved) {
    throw new Error(
      "O binário do Locust não foi encontrado. Instale o Locust ou configure LOCUST_PATH para habilitar a comparação.",
    );
  }

  const artifactsDir = createArtifactsDir();
  const scriptPath = path.join(artifactsDir, "locustfile.py");
  const summaryPath = path.join(artifactsDir, "summary.json");
  const csvPrefix = path.join(artifactsDir, "run");
  const stdoutPath = path.join(artifactsDir, "stdout.log");
  const stderrPath = path.join(artifactsDir, "stderr.log");

  const runtimeConfig: LocustConfig & { summaryPath?: string } = {
    ...config,
    host: deriveHost(config),
    summaryPath,
  };

  const script = runtimeConfig.flowOperations?.length
    ? generateFlowScript(runtimeConfig)
    : generateSimpleScript(runtimeConfig);

  fs.writeFileSync(scriptPath, script, "utf8");

  const startedAt = Date.now();
  const spawnRate = buildSpawnRate(config);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(
      resolved.command,
      [
        ...resolved.args,
        "-f",
        scriptPath,
        "--headless",
        "-u",
        String(config.vus),
        "-r",
        String(spawnRate),
        "-t",
        `${config.duration}s`,
        "--csv",
        csvPrefix,
        "--only-summary",
      ],
      {
        cwd: artifactsDir,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
        },
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
      reject(
        new Error(
          `Não foi possível iniciar o Locust: ${error.message}`,
        ),
      );
    });

    proc.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      if (!fs.existsSync(summaryPath)) {
        return reject(
          new Error(
            "O Locust terminou sem gerar o summary esperado. Verifique os artefatos da execução.",
          ),
        );
      }

      try {
        const summary = parseLocustSummary(
          fs.readFileSync(summaryPath, "utf8"),
        );
        const actualDuration = Number(
          ((Date.now() - startedAt) / 1000).toFixed(2),
        );
        summary.duration = actualDuration;
        summary.rps = actualDuration > 0 ? summary.totalReqs / actualDuration : 0;
        summary.throughputBytesPerSec =
          actualDuration > 0 ? summary.totalBytes / actualDuration : 0;
        summary.vus = config.vus;
        summary.executable = resolved.label;
        summary.version = getLocustVersion(resolved);
        summary.artifactsDir = artifactsDir;
        summary.scriptPath = scriptPath;
        summary.stdoutSnippet = truncateOutput(stdout);
        summary.stderrSnippet = truncateOutput(stderr);
        if (code !== 0) {
          onProgress?.(
            `Locust encerrou com código ${code}; usando o summary gerado para análise.\n`,
          );
        }
        resolve(summary);
      } catch (error) {
        reject(
          new Error(
            `Falha ao parsear summary do Locust: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}
