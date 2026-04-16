import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { generateJMeterPlan } from "./jmeter-script-generator";
import type { JMeterConfig, JMeterSummary } from "./jmeter-types";

const OUTPUT_PREVIEW_LIMIT = 4_000;
const CONTROL_SAMPLE_LABELS = new Set([
  "Prepare Auth State",
  "Finalize Auth State",
  "Select Flow Deterministically",
]);

interface JMeterCommand {
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
  const dir = path.join(baseTempDir, "cpx-stress-jmeter", runId);
  ensureDir(dir);
  return dir;
}

function truncateOutput(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= OUTPUT_PREVIEW_LIMIT) return trimmed;
  return `${trimmed.slice(-OUTPUT_PREVIEW_LIMIT)}...`;
}

function toCommand(candidate: string): JMeterCommand {
  if (/\.(bat|cmd)$/i.test(candidate)) {
    return {
      command: "cmd.exe",
      args: ["/c", candidate],
      label: candidate,
    };
  }

  return {
    command: candidate,
    args: [],
    label: candidate,
  };
}

function resolveJMeterBinary(): JMeterCommand | null {
  const candidates = [
    process.env.JMETER_PATH,
    path.join(process.env.LOCALAPPDATA || "", "Programs", "JMeter", "bin", "jmeter.bat"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "JMeter", "bin", "jmeter.cmd"),
    "jmeter",
    "jmeter.bat",
    "jmeter.cmd",
  ].filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim() !== "",
  );

  for (const candidate of candidates) {
    const command = toCommand(candidate);
    try {
      execFileSync(command.command, [...command.args, "-v"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return command;
    } catch {
      // try next
    }
  }

  return null;
}

function getJMeterVersion(binary: JMeterCommand): string {
  try {
    return execFileSync(binary.command, [...binary.args, "-v"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "jmeter (versão indisponível)";
  }
}

export function isJMeterAvailable(): boolean {
  return resolveJMeterBinary() !== null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function isLogicalFailure(responseCode: string, responseMessage: string): boolean {
  const normalizedMessage = responseMessage.toLowerCase();

  return (
    normalizedMessage.includes("extractor(es) ausente(s)") ||
    normalizedMessage.includes("texto de sessão inválida detectado") ||
    normalizedMessage.includes("a resposta parece a tela de login do mistert") ||
    normalizedMessage.includes("nenhum texto esperado foi encontrado na resposta") ||
    normalizedMessage.includes("sessão expirada ou redirecionada para login") ||
    /^2\d\d$/.test(responseCode)
  );
}

function parseJtl(jtlPath: string, durationSeconds: number, vus: number): JMeterSummary {
  const content = fs.readFileSync(jtlPath, "utf8").trim();
  if (!content) {
    return {
      avgLatency: 0,
      minLatency: 0,
      p50Latency: 0,
      p90Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      maxLatency: 0,
      rps: 0,
      totalReqs: 0,
      errorRate: 0,
      statusCodes: {},
      duration: durationSeconds,
      vus,
    };
  }

  const lines = content.split(/\r?\n/);
  const header = lines.shift();
  if (!header) {
    throw new Error("JTL CSV sem cabeçalho.");
  }
  const columns = parseCsvLine(header);
  const indexOf = (name: string) => columns.indexOf(name);

  const elapsedIndex = indexOf("elapsed");
  const labelIndex = indexOf("label");
  const responseCodeIndex = indexOf("responseCode");
  const responseMessageIndex = indexOf("responseMessage");
  const successIndex = indexOf("success");
  const bytesIndex = indexOf("bytes");

  const latencies: number[] = [];
  const statusCodes: Record<string, number> = {};
  const operationStats: NonNullable<JMeterSummary["operationStats"]> = {};
  let errors = 0;
  let totalBytes = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);
    const label = values[labelIndex] || "request";
    if (CONTROL_SAMPLE_LABELS.has(label)) {
      continue;
    }
    const elapsed = Number(values[elapsedIndex] || 0);
    const responseCode = values[responseCodeIndex] || "0";
    const responseMessage = values[responseMessageIndex] || "";
    const success = (values[successIndex] || "").toLowerCase() === "true";
    const bytes = Number(values[bytesIndex] || 0);

    latencies.push(elapsed);
    statusCodes[responseCode] = (statusCodes[responseCode] || 0) + 1;
    const current = operationStats[label] ?? {
      name: label,
      requests: 0,
      errors: 0,
      logicalFailures: 0,
      statusCodes: {},
    };
    current.requests += 1;
    current.statusCodes[responseCode] =
      (current.statusCodes[responseCode] || 0) + 1;
    if (!success) {
      errors++;
      current.errors += 1;
      if (isLogicalFailure(responseCode, responseMessage)) {
        current.logicalFailures += 1;
      }
    }
    operationStats[label] = current;
    totalBytes += Number.isFinite(bytes) ? bytes : 0;
  }

  latencies.sort((a, b) => a - b);
  const totalReqs = latencies.length;

  const summary: JMeterSummary = {
    avgLatency:
      totalReqs > 0 ? latencies.reduce((sum, value) => sum + value, 0) / totalReqs : 0,
    minLatency: latencies[0] ?? 0,
    p50Latency: percentile(latencies, 50),
    p90Latency: percentile(latencies, 90),
    p95Latency: percentile(latencies, 95),
    p99Latency: percentile(latencies, 99),
    maxLatency: latencies[latencies.length - 1] ?? 0,
    rps: durationSeconds > 0 ? totalReqs / durationSeconds : 0,
    totalReqs,
    errorRate: totalReqs > 0 ? errors / totalReqs : 0,
    statusCodes,
    duration: durationSeconds,
    vus,
    totalBytes,
    throughputBytesPerSec: durationSeconds > 0 ? totalBytes / durationSeconds : 0,
  };

  if (Object.keys(operationStats).length > 0) {
    summary.operationStats = operationStats;
  }

  return summary;
}

export async function runJMeter(
  config: JMeterConfig,
  onProgress?: (line: string) => void,
): Promise<JMeterSummary> {
  const binary = resolveJMeterBinary();
  if (!binary) {
    throw new Error(
      "O binário do JMeter não foi encontrado. Instale o JMeter ou configure JMETER_PATH para habilitar a comparação.",
    );
  }

  const artifactsDir = createArtifactsDir();
  const planPath = path.join(artifactsDir, "test-plan.jmx");
  const resultsPath = path.join(artifactsDir, "results.csv");
  const stdoutPath = path.join(artifactsDir, "stdout.log");
  const stderrPath = path.join(artifactsDir, "stderr.log");

  fs.writeFileSync(planPath, generateJMeterPlan(config), "utf8");

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(
      binary.command,
      [
        ...binary.args,
        "-n",
        "-t",
        planPath,
        "-l",
        resultsPath,
        "-Jjmeter.save.saveservice.output_format=csv",
        "-Jjmeter.save.saveservice.print_field_names=true",
        "-Jjmeter.save.saveservice.timestamp_format=ms",
        "-Jjmeter.save.saveservice.time=true",
        "-Jjmeter.save.saveservice.label=true",
        "-Jjmeter.save.saveservice.response_code=true",
        "-Jjmeter.save.saveservice.successful=true",
        "-Jjmeter.save.saveservice.bytes=true",
        "-Jjmeter.save.saveservice.response_message=true",
        "-Jjmeter.save.saveservice.thread_name=false",
        "-Jjmeter.save.saveservice.data_type=false",
        "-Jjmeter.save.saveservice.latency=false",
        "-Jjmeter.save.saveservice.connect_time=false",
      ],
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
      reject(new Error(`Não foi possível iniciar o JMeter: ${error.message}`));
    });

    proc.on("close", (code) => {
      fs.writeFileSync(stdoutPath, stdout, "utf8");
      fs.writeFileSync(stderrPath, stderr, "utf8");

      if (code !== 0) {
        return reject(
          new Error(
            truncateOutput(stderr) ||
              truncateOutput(stdout) ||
              `JMeter encerrou com código ${code ?? "desconhecido"}.`,
          ),
        );
      }

      if (!fs.existsSync(resultsPath)) {
        return reject(
          new Error(
            "O JMeter terminou sem gerar o arquivo de resultados esperado.",
          ),
        );
      }

      try {
        const summary = parseJtl(resultsPath, config.duration, config.vus);
        const actualDuration = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        summary.duration = actualDuration;
        summary.rps = actualDuration > 0 ? summary.totalReqs / actualDuration : 0;
        summary.throughputBytesPerSec =
          actualDuration > 0 ? summary.totalBytes / actualDuration : 0;
        summary.vus = config.vus;
        summary.executable = binary.label;
        summary.version = getJMeterVersion(binary);
        summary.artifactsDir = artifactsDir;
        summary.scriptPath = planPath;
        summary.stdoutSnippet = truncateOutput(stdout);
        summary.stderrSnippet = truncateOutput(stderr);
        resolve(summary);
      } catch (error) {
        reject(
          new Error(
            `Falha ao parsear resultados do JMeter: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  });
}
