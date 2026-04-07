import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TestResult, ProtectionReport, ErrorRecord } from "@/types";
import {
  calculateHealthScore as calculateSharedHealthScore,
  calculateHttpErrorRate,
  formatMs,
} from "@/shared/test-analysis";

// ─── Paleta de cores (RGB) ──────────────────────────────────────────────────
// Mapeada a partir dos tokens sf-* do Tailwind para manter identidade visual.

type RGB = [number, number, number];

const C = {
  primary: [99, 102, 241] as RGB, // sf-primary  #6366f1
  primaryDark: [79, 70, 229] as RGB, // sf-primaryMuted #4f46e5
  primaryDeep: [55, 48, 163] as RGB, // sf-primaryFaint #3730a3
  accent: [34, 211, 238] as RGB, // sf-accent   #22d3ee
  success: [34, 197, 94] as RGB, // sf-success  #22c55e
  warning: [245, 158, 11] as RGB, // sf-warning  #f59e0b
  danger: [239, 68, 68] as RGB, // sf-danger   #ef4444
  info: [59, 130, 246] as RGB, // sf-info     #3b82f6
  orange: [249, 115, 22] as RGB,

  white: [255, 255, 255] as RGB,
  bg: [249, 250, 251] as RGB, // fundo suave das páginas
  card: [243, 244, 246] as RGB, // fundo de cards (gray-100)
  cardAlt: [249, 250, 251] as RGB, // linhas alternadas

  text: [15, 23, 42] as RGB, // slate-900
  textSecondary: [51, 65, 85] as RGB, // slate-700
  textMuted: [100, 116, 139] as RGB, // slate-500
  textFaint: [148, 163, 184] as RGB, // slate-400

  border: [226, 232, 240] as RGB, // slate-200
  borderStrong: [203, 213, 225] as RGB, // slate-300
} as const;

// ─── Layout ─────────────────────────────────────────────────────────────────

const M = 18; // margem lateral (mm)
const HEADER_H = 3; // faixa decorativa no topo

// ─── Tipos internos ─────────────────────────────────────────────────────────

interface HealthAssessment {
  score: number;
  label: string;
  color: RGB;
  recommendation: string;
  laypersonText: string;
}

interface PreBlockingData {
  blockSecond: number;
  preHealth: HealthAssessment;
  syntheticResult: TestResult;
}

interface Recommendation {
  text: string;
  priority: "urgent" | "important" | "info";
}

// ─── Dicionários de labels ──────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = {
  none: "Nenhum",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

const RISK_COLORS: Record<string, RGB> = {
  none: C.success,
  low: C.info,
  medium: C.warning,
  high: C.orange,
  critical: C.danger,
};

const PROTECTION_LABELS: Record<string, string> = {
  waf: "WAF",
  cdn: "CDN",
  "rate-limiter": "Rate Limiting",
  "anti-bot": "Anti-Bot",
  "ddos-protection": "DDoS Protection",
  captcha: "CAPTCHA/Challenge",
  unknown: "Desconhecido",
};

const BEHAVIOR_LABELS: Record<string, string> = {
  throttling: "Throttling",
  blocking: "Bloqueio",
  challenge: "Challenge",
  degradation: "Degradação",
  normal: "Normal",
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  http: "Erro HTTP",
  timeout: "Timeout",
  connection: "Conexão",
  dns: "DNS",
  unknown: "Desconhecido",
};

// ─── Estilos de tabela padrão (jspdf-autotable) ────────────────────────────

const TABLE_BASE = {
  theme: "plain" as const,
  styles: {
    fillColor: C.white,
    textColor: C.text,
    fontSize: 8.5,
    cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
    lineColor: C.border,
    lineWidth: 0.2,
  },
  headStyles: {
    fillColor: C.primaryDark,
    textColor: C.white,
    fontStyle: "bold" as const,
    fontSize: 8.5,
  },
  alternateRowStyles: {
    fillColor: C.cardAlt,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), u.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${u[i]}`;
}

function lastTableY(doc: jsPDF, fallback: number): number {
  return ((doc as any).lastAutoTable?.finalY as number) ?? fallback;
}

function needsPage(
  doc: jsPDF,
  y: number,
  need: number,
  pageH: number,
): number {
  if (y + need > pageH - 15) {
    doc.addPage();
    pageDecor(doc);
    return 16;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE
// ═══════════════════════════════════════════════════════════════════════════════

function healthScore(result: TestResult): HealthAssessment {
  const httpErr = calculateHttpErrorRate(result);

  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return {
      score: 0,
      label: "Crítico",
      color: C.danger,
      recommendation: "Servidor inacessível. Verifique URL, DNS e firewall.",
      laypersonText:
        "O site não respondeu durante o teste. A equipe técnica precisa verificar se está no ar.",
    };
  }

  if (httpErr >= 90) {
    return {
      score: 5,
      label: "Crítico",
      color: C.danger,
      recommendation:
        "Proteção ativa bloqueando ~100% das requisições. Libere o IP de teste.",
      laypersonText:
        "A segurança do site bloqueou o teste. Solicite liberação do IP.",
    };
  }

  const score = calculateSharedHealthScore(result);

  if (score >= 80)
    return {
      score,
      label: "Excelente",
      color: C.success,
      recommendation:
        "Performance estável. Site preparado para a carga testada.",
      laypersonText: "O site respondeu bem e com rapidez durante todo o teste.",
    };
  if (score >= 60)
    return {
      score,
      label: "Bom",
      color: C.info,
      recommendation:
        "Performance aceitável. Otimizações de cache e queries podem melhorar.",
      laypersonText:
        "O site funciona, mas pode ficar mais rápido com ajustes técnicos.",
    };
  if (score >= 40)
    return {
      score,
      label: "Regular",
      color: C.warning,
      recommendation:
        "Degradação sob carga. Investigue gargalos de CPU, memória e I/O.",
      laypersonText:
        "O site ficou lento durante o teste. Precisa de revisão técnica.",
    };
  return {
    score,
    label: "Crítico",
    color: C.danger,
    recommendation:
      "Performance crítica. Revise infraestrutura e recursos do servidor.",
    laypersonText:
      "O site não suportou a carga. Precisa de atenção urgente da equipe técnica.",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-BLOCKING ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

function preBlockingData(result: TestResult): PreBlockingData | null {
  if (!result.protectionReport) return null;

  const pat = result.protectionReport.behavioralPatterns.find(
    (p) => p.type === "blocking" && p.startSecond !== undefined,
  );
  if (!pat || pat.startSecond === undefined) return null;

  const sec = pat.startSecond;
  const pre = result.timeline.filter((s) => s.second < sec);
  if (pre.length < 2) return null;

  const reqs = pre.reduce((s, t) => s + t.requests, 0);
  const errs = pre.reduce((s, t) => s + t.errors, 0);
  const safe = Math.max(reqs, 1);
  const bytes = pre.reduce((s, t) => s + t.bytesReceived, 0);

  const nonEmpty = pre.filter((t) => t.requests > 0);

  const statusCodes: Record<string, number> = {};
  for (const t of pre)
    for (const [c, n] of Object.entries(t.statusCodes))
      statusCodes[c] = (statusCodes[c] || 0) + n;

  const synth: TestResult = {
    ...result,
    totalRequests: reqs,
    totalErrors: errs,
    errorRate: reqs > 0 ? Math.round((errs / reqs) * 10000) / 100 : 0,
    totalBytes: bytes,
    statusCodes,
    latency: {
      avg: pre.reduce((s, t) => s + t.latencyAvg * t.requests, 0) / safe,
      min: nonEmpty.length
        ? Math.min(...nonEmpty.map((t) => t.latencyMin))
        : 0,
      p50: pre.reduce((s, t) => s + t.latencyP50 * t.requests, 0) / safe,
      p90: pre.reduce((s, t) => s + t.latencyP90 * t.requests, 0) / safe,
      p95: pre.reduce((s, t) => s + t.latencyP95 * t.requests, 0) / safe,
      p99: pre.reduce((s, t) => s + t.latencyP99 * t.requests, 0) / safe,
      max: nonEmpty.length
        ? Math.max(...nonEmpty.map((t) => t.latencyMax))
        : 0,
    },
  };

  return {
    blockSecond: sec,
    preHealth: healthScore(synth),
    syntheticResult: synth,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

function pageDecor(doc: jsPDF): void {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.white);
  doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), "F");
  doc.setFillColor(...C.primaryDark);
  doc.rect(0, 0, w, HEADER_H, "F");
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...C.primaryDark);
  doc.rect(M, y - 5, 3, 7, "F");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.text);
  doc.text(title, M + 7, y);

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  const w = doc.internal.pageSize.getWidth();
  doc.line(M, y + 3, w - M, y + 3);

  return y + 11;
}

function subTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textSecondary);
  doc.text(title, M, y);
  return y + 7;
}

function label(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size = 7,
): void {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textMuted);
  doc.text(text, x, y);
}

function value(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size = 13,
): void {
  doc.setFontSize(size);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.text);
  doc.text(text, x, y);
}

function pill(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  color: RGB,
  w?: number,
): void {
  const pw = w ?? doc.getTextWidth(text) + 8;
  doc.setFillColor(...color);
  doc.roundedRect(x, y, pw, 7, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text(text, x + pw / 2, y + 5, { align: "center" });
}

function card(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { border?: RGB },
): void {
  doc.setFillColor(...C.card);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setDrawColor(...(opts?.border ?? C.border));
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 2, 2, "S");
}

function progressBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: RGB,
): void {
  doc.setFillColor(...C.border);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  if (pct > 0) {
    doc.setFillColor(...color);
    doc.roundedRect(
      x,
      y,
      w * Math.min(pct / 100, 1),
      h,
      h / 2,
      h / 2,
      "F",
    );
  }
}

function paragraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  opts?: { size?: number; color?: RGB; lineH?: number },
): number {
  const sz = opts?.size ?? 9;
  const lh = opts?.lineH ?? 4;
  doc.setFontSize(sz);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...(opts?.color ?? C.textSecondary));
  const lines = doc.splitTextToSize(text, maxW) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lh;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CAPA
// ═══════════════════════════════════════════════════════════════════════════════

function drawCover(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Fundo branco total
  doc.setFillColor(...C.white);
  doc.rect(0, 0, w, h, "F");

  // ── Banda superior (indigo, 58mm de altura) ──
  const bandH = 58;
  doc.setFillColor(...C.primaryDark);
  doc.rect(0, 0, w, bandH, "F");

  // Linha de destaque ciano na base da banda
  doc.setFillColor(...C.accent);
  doc.rect(0, bandH, w, 1.5, "F");

  // Título principal na banda
  doc.setTextColor(...C.white);
  doc.setFontSize(26);
  doc.setFont("helvetica", "bold");
  doc.text("CPX \u2014 MisterT Stress", w / 2, 28, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 255);
  doc.text("Relat\u00f3rio de Teste de Estresse", w / 2, 39, {
    align: "center",
  });

  // ── Bloco central: Score de Saúde ──
  let y = bandH + 20;

  const scoreCardW = 120;
  const scoreCardH = 40;
  const scoreCardX = (w - scoreCardW) / 2;

  card(doc, scoreCardX, y, scoreCardW, scoreCardH, { border: health.color });

  // Badge de score
  const badgeW = 36;
  const badgeH = 24;
  const badgeX = scoreCardX + 8;
  const badgeY = y + 8;
  doc.setFillColor(...health.color);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, "F");

  doc.setTextColor(...C.white);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`${health.score}`, badgeX + badgeW / 2, badgeY + 14, {
    align: "center",
  });
  doc.setFontSize(7);
  doc.text("/ 100", badgeX + badgeW / 2, badgeY + 20, { align: "center" });

  // Label e descrição (direita do badge)
  const infoX = badgeX + badgeW + 10;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...health.color);
  doc.text(health.label, infoX, y + 17);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textMuted);
  const recLines = doc.splitTextToSize(
    health.recommendation,
    scoreCardW - badgeW - 26,
  ) as string[];
  doc.text(recLines, infoX, y + 24);

  y += scoreCardH + 18;

  // ── Metadados do teste ──
  const dateStr = format(
    new Date(result.startTime),
    "dd 'de' MMMM 'de' yyyy '\u00e0s' HH:mm",
    { locale: ptBR },
  );

  const meta: [string, string][] = [
    ["URL testada", result.url],
    ["Data do teste", dateStr],
    ["Usu\u00e1rios virtuais", String(result.config.virtualUsers)],
    ["Dura\u00e7\u00e3o", `${result.config.duration} segundos`],
    ["M\u00e9todo HTTP", result.config.method],
    [
      "Status",
      result.status === "completed"
        ? "Conclu\u00eddo"
        : result.status === "cancelled"
          ? "Cancelado"
          : "Erro",
    ],
  ];

  const metaCardW = 140;
  const metaCardX = (w - metaCardW) / 2;
  const metaCardH = meta.length * 10 + 12;

  card(doc, metaCardX, y, metaCardW, metaCardH);

  let my = y + 9;
  for (const [lbl, val] of meta) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textMuted);
    doc.text(lbl, metaCardX + 6, my);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.text);
    let display = val;
    const maxValW = metaCardW - 60;
    if (doc.getTextWidth(display) > maxValW) {
      while (doc.getTextWidth(display + "\u2026") > maxValW && display.length > 10)
        display = display.slice(0, -1);
      display += "\u2026";
    }
    doc.text(display, metaCardX + 50, my);
    my += 10;
  }

  // ── Rodapé da capa ──
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textFaint);
  doc.text(
    "Gerado automaticamente por CPX \u2014 MisterT Stress",
    w / 2,
    h - 12,
    { align: "center" },
  );

  // Faixa inferior decorativa
  doc.setFillColor(...C.primaryDark);
  doc.rect(0, h - 4, w, 4, "F");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. RESUMO EXECUTIVO
// ═══════════════════════════════════════════════════════════════════════════════

function drawExecutiveSummary(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  cW: number,
  pH: number,
): number {
  doc.addPage();
  pageDecor(doc);

  let y = 16;
  y = sectionTitle(doc, "Resumo Executivo", y);

  // ── KPI Cards (grid 3×2) ──
  const kpis = [
    {
      label: "Total de Requisi\u00e7\u00f5es",
      value: result.totalRequests.toLocaleString("pt-BR"),
    },
    {
      label: "Requisi\u00e7\u00f5es/segundo",
      value: result.rps.toLocaleString("pt-BR"),
    },
    { label: "Taxa de Erro", value: `${result.errorRate}%` },
    {
      label: "Lat\u00eancia M\u00e9dia",
      value: formatMs(result.latency.avg),
    },
    { label: "Lat\u00eancia P95", value: formatMs(result.latency.p95) },
    {
      label: "Throughput",
      value: `${formatBytes(result.throughputBytesPerSec)}/s`,
    },
  ];

  const gap = 5;
  const cols = 3;
  const cardW = (cW - gap * (cols - 1)) / cols;
  const cardH = 22;

  for (let i = 0; i < kpis.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = M + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    card(doc, cx, cy, cardW, cardH);
    label(doc, kpis[i].label, cx + 4, cy + 7);
    value(doc, kpis[i].value, cx + 4, cy + 17);
  }

  y += Math.ceil(kpis.length / cols) * (cardH + gap) + 8;

  // ── Barra de saúde ──
  y = subTitle(doc, "Diagn\u00f3stico de Sa\u00fade", y);

  const barCardH = 22;
  card(doc, M, y, cW, barCardH, { border: health.color });

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...health.color);
  doc.text(`${health.score}`, M + 6, y + 13);
  doc.setFontSize(7);
  doc.text("/100", M + 24, y + 13);

  const barX = M + 38;
  const barW = cW - 46;
  progressBar(doc, barX, y + 8, barW, 6, health.score, health.color);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textMuted);
  doc.text(health.recommendation, barX, y + 20);

  y += barCardH + 10;

  // ── Distribuição de erros (se houver) ──
  if (result.errorBreakdown && result.totalErrors > 0) {
    y = needsPage(doc, y, 40, pH);
    y = subTitle(doc, "Distribui\u00e7\u00e3o de Erros", y);

    const errLabels: {
      key: keyof NonNullable<typeof result.errorBreakdown>;
      label: string;
    }[] = [
      { key: "timeout", label: "Timeout" },
      { key: "connection", label: "Conex\u00e3o" },
      { key: "http", label: "HTTP (4xx/5xx)" },
      { key: "dns", label: "DNS" },
      { key: "unknown", label: "Outros" },
    ];

    const present = errLabels.filter(
      (l) => result.errorBreakdown![l.key] > 0,
    );
    if (present.length > 0) {
      const eGap = 4;
      const eW = (cW - (present.length - 1) * eGap) / present.length;

      for (let i = 0; i < present.length; i++) {
        const cx = M + i * (eW + eGap);
        const count = result.errorBreakdown![present[i].key];
        const pct = ((count / result.totalErrors) * 100).toFixed(1);

        card(doc, cx, y, eW, 20);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.text);
        doc.text(count.toLocaleString("pt-BR"), cx + eW / 2, y + 10, {
          align: "center",
        });
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...C.textMuted);
        doc.text(`${present[i].label} (${pct}%)`, cx + eW / 2, y + 17, {
          align: "center",
        });
      }
      y += 28;
    }
  }

  // ── Alerta pré-bloqueio ──
  const pb = preBlockingData(result);
  if (pb) {
    y = needsPage(doc, y, 50, pH);
    y = addPreBlockSection(doc, pb, health, y, cW, pH);
  }

  return y;
}

function addPreBlockSection(
  doc: jsPDF,
  pb: PreBlockingData,
  overallHealth: HealthAssessment,
  startY: number,
  cW: number,
  pH: number,
): number {
  let y = startY;
  y = subTitle(doc, "Prote\u00e7\u00e3o detectada durante o teste", y);

  const alertText =
    `A prote\u00e7\u00e3o do site bloqueou o tr\u00e1fego a partir do segundo ${pb.blockSecond}. ` +
    `A nota geral (${overallHealth.score}/100) inclui o per\u00edodo de bloqueio. ` +
    `A avalia\u00e7\u00e3o abaixo considera apenas os primeiros ${pb.blockSecond - 1} segundos (desempenho real).`;

  doc.setFontSize(8);
  const lines = doc.splitTextToSize(alertText, cW - 10) as string[];
  const alertH = 10 + lines.length * 3.5;

  doc.setFillColor(255, 251, 235);
  doc.roundedRect(M, y, cW, alertH, 2, 2, "F");
  doc.setDrawColor(...C.warning);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, cW, alertH, 2, 2, "S");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.warning);
  doc.text("Prote\u00e7\u00e3o ativa interceptou o teste", M + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  doc.text(lines, M + 4, y + 12);

  y += alertH + 6;

  y = needsPage(doc, y, 30, pH);

  const pbH = 22;
  card(doc, M, y, cW, pbH, { border: pb.preHealth.color });

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textMuted);
  doc.text(
    `Score pr\u00e9-bloqueio (at\u00e9 segundo ${pb.blockSecond - 1})`,
    M + 6,
    y + 7,
  );

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...pb.preHealth.color);
  doc.text(`${pb.preHealth.score}/100`, M + 6, y + 17);

  progressBar(
    doc,
    M + 38,
    y + 11,
    cW - 46,
    5,
    pb.preHealth.score,
    pb.preHealth.color,
  );

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textFaint);
  doc.text(pb.preHealth.label, M + 38, y + 20);

  y += pbH + 8;
  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. VISÃO NÃO-TÉCNICA
// ═══════════════════════════════════════════════════════════════════════════════

function drawLaypersonPage(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  cW: number,
): void {
  doc.addPage();
  pageDecor(doc);
  let y = 16;
  y = sectionTitle(doc, "Resumo para Gestores", y);

  const pb = preBlockingData(result);
  const displayH = pb ? pb.preHealth : health;

  // Card com score
  const scoreH = 28;
  card(doc, M, y, cW, scoreH, { border: displayH.color });

  doc.setFillColor(...displayH.color);
  doc.roundedRect(M + 6, y + 5, 40, 18, 3, 3, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`${displayH.score}/100`, M + 26, y + 17, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(...displayH.color);
  doc.text(
    pb ? `${displayH.label} (antes do bloqueio)` : displayH.label,
    M + 54,
    y + 14,
  );

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textMuted);
  const lpLines = doc.splitTextToSize(
    displayH.laypersonText,
    cW - 60,
  ) as string[];
  doc.text(lpLines, M + 54, y + 21);

  y += scoreH + 12;

  // Veredicto de capacidade
  const displayResult = pb ? pb.syntheticResult : result;
  const verdict = buildVerdict(displayResult, displayH);
  const pageH = doc.internal.pageSize.height;

  // Calcular altura do card de veredicto
  doc.setFontSize(11);
  const verdictLines = doc.splitTextToSize(
    verdict.sentence,
    cW - 16,
  ) as string[];
  let verdictH = 12 + verdictLines.length * 4.5;
  let noteLines: string[] = [];
  if (verdict.contextNote) {
    doc.setFontSize(8);
    noteLines = doc.splitTextToSize(verdict.contextNote, cW - 16) as string[];
    verdictH += 4 + noteLines.length * 3.5;
  }

  y = needsPage(doc, y, verdictH + 8, pageH);
  card(doc, M, y, cW, verdictH, { border: displayH.color });

  // Frase do veredicto — negrito
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.text);
  doc.text(verdictLines, M + 8, y + 8);

  let vy = y + 8 + verdictLines.length * 4.5;

  // Nota de contexto — quando taxa de erro > 5%
  if (verdict.contextNote) {
    vy += 1;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textMuted);
    doc.text(noteLines, M + 8, vy);
  }

  y += verdictH + 8;

  // O que testamos
  y = subTitle(doc, "O que testamos?", y);
  y = paragraph(
    doc,
    `Simulamos ${result.config.virtualUsers} pessoas acessando o site ` +
      `${result.url} ao mesmo tempo, durante ${result.config.duration} segundos. ` +
      `O objetivo \u00e9 verificar se o site atende todos esses acessos sem ficar lento ou apresentar erros.`,
    M,
    y,
    cW,
  );
  y += 6;

  // O que encontramos
  y = subTitle(doc, "O que encontramos?", y);
  const findings = buildFindings(result);
  for (const f of findings) {
    y = paragraph(doc, `\u2022  ${f}`, M + 2, y, cW - 4, { lineH: 4.5 });
    y += 2;
  }
  y += 4;

  // O que recomendamos
  y = subTitle(doc, "O que recomendamos?", y);
  const recs = buildLayRecs(displayH.score);
  for (const r of recs) {
    y = paragraph(doc, `\u2022  ${r}`, M + 2, y, cW - 4, { lineH: 4.5 });
    y += 2;
  }
}

// ─── Veredicto de capacidade ─────────────────────────────────────────────────

function buildVerdict(
  result: TestResult,
  health: HealthAssessment,
): { sentence: string; contextNote: string | null } {
  const vus = result.config.virtualUsers;
  const avgMs = formatMs(result.latency.avg);
  const errPct = result.errorRate.toFixed(1);

  let sentence: string;

  if (result.errorRate < 5) {
    sentence =
      `O sistema suportou ${vus} usu\u00e1rios simult\u00e2neos ` +
      `com tempo de resposta m\u00e9dio de ${avgMs} e taxa de erro de ${errPct}%.`;
  } else if (result.errorRate < 20) {
    sentence =
      `O sistema apresentou dificuldades com ${vus} usu\u00e1rios simult\u00e2neos: ` +
      `tempo de resposta m\u00e9dio de ${avgMs} e taxa de erro de ${errPct}%.`;
  } else {
    sentence =
      `O sistema n\u00e3o suportou ${vus} usu\u00e1rios simult\u00e2neos adequadamente: ` +
      `tempo de resposta m\u00e9dio de ${avgMs} e ${errPct}% das requisi\u00e7\u00f5es falharam.`;
  }

  const contextNote =
    result.errorRate > 5
      ? "\u00c9 comum que servidores web apresentem aumento de erros quando o n\u00famero " +
        "de acessos simult\u00e2neos ultrapassa a capacidade de processamento configurada. " +
        "Isso pode ser ajustado pela equipe de infraestrutura."
      : null;

  return { sentence, contextNote };
}

function buildFindings(result: TestResult): string[] {
  const f: string[] = [];

  if (result.latency.avg < 500)
    f.push(
      `Velocidade: Resposta r\u00e1pida (${formatMs(result.latency.avg)} em m\u00e9dia). Sem espera percept\u00edvel.`,
    );
  else if (result.latency.avg < 2000)
    f.push(
      `Velocidade: Demora moderada (${formatMs(result.latency.avg)} em m\u00e9dia). Usu\u00e1rios podem notar lentid\u00e3o.`,
    );
  else
    f.push(
      `Velocidade: Lento (${formatMs(result.latency.avg)} em m\u00e9dia). Experi\u00eancia ruim \u2014 usu\u00e1rios podem desistir.`,
    );

  if (result.errorRate < 1)
    f.push("Estabilidade: Site est\u00e1vel \u2014 praticamente sem erros.");
  else if (result.errorRate < 5)
    f.push(
      `Estabilidade: ${result.errorRate}% de falhas. Parcela pequena de usu\u00e1rios afetada.`,
    );
  else
    f.push(
      `Estabilidade: ${result.errorRate}% de falhas. Parte significativa dos acessos falhou.`,
    );

  f.push(
    `Capacidade: ${result.rps.toLocaleString("pt-BR")} acessos/s, ${result.totalRequests.toLocaleString("pt-BR")} no total.`,
  );

  if (result.protectionReport?.overallRisk !== "none")
    f.push(
      "Prote\u00e7\u00e3o: Seguran\u00e7a ativa detectada \u2014 pode ter interferido nos resultados.",
    );

  return f;
}

function buildLayRecs(score: number): string[] {
  if (score >= 80)
    return [
      "Site saud\u00e1vel. Continue monitorando periodicamente.",
      "Teste com mais acessos para descobrir o limite antes de campanhas.",
    ];
  if (score >= 60)
    return [
      "Funciona, mas pode melhorar. Solicite revis\u00e3o t\u00e9cnica para otimizar velocidade.",
      "Monitore em hor\u00e1rios de pico para identificar degrada\u00e7\u00f5es.",
    ];
  if (score >= 40)
    return [
      "Problemas que afetam usu\u00e1rios. Solicite an\u00e1lise t\u00e9cnica detalhada.",
      "Verifique se o servidor tem recursos suficientes para o volume esperado.",
    ];
  return [
    "Aten\u00e7\u00e3o urgente. Solicite revis\u00e3o completa do servidor e infraestrutura.",
    "Considere investir em melhorias para suportar o volume desejado.",
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GRÁFICOS DE EVOLUÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

function drawCharts(
  doc: jsPDF,
  charts: { rps?: string; latency?: string; errors?: string },
  startY: number,
  cW: number,
  pH: number,
): number {
  if (!charts.rps && !charts.latency && !charts.errors) return startY;

  let y = needsPage(doc, startY, 60, pH);
  y = sectionTitle(doc, "Evolu\u00e7\u00e3o Temporal", y);

  const chartH = 42;
  const entries: [string | undefined, string][] = [
    [charts.rps, "Requisi\u00e7\u00f5es por Segundo (RPS)"],
    [charts.latency, "Lat\u00eancia (ms)"],
    [charts.errors, "Erros por Segundo"],
  ];

  for (const [img, title] of entries) {
    if (!img) continue;
    y = needsPage(doc, y, chartH + 15, pH);

    label(doc, title, M, y);
    y += 3;

    try {
      doc.addImage(img, "PNG", M, y, cW, chartH);
    } catch {
      /* imagem indisponível */
    }
    y += chartH + 6;
  }

  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MÉTRICAS DETALHADAS
// ═══════════════════════════════════════════════════════════════════════════════

function drawDetailedMetrics(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  cW: number,
  pH: number,
): number {
  let y = needsPage(doc, startY, 80, pH);
  y = sectionTitle(doc, "M\u00e9tricas Detalhadas", y);

  autoTable(doc, {
    startY: y,
    head: [["M\u00e9trica", "Valor"]],
    body: [
      ["Lat\u00eancia M\u00e9dia", formatMs(result.latency.avg)],
      ["Lat\u00eancia M\u00ednima", formatMs(result.latency.min)],
      ["Lat\u00eancia P50 (mediana)", formatMs(result.latency.p50)],
      ["Lat\u00eancia P90", formatMs(result.latency.p90)],
      ["Lat\u00eancia P95", formatMs(result.latency.p95)],
      ["Lat\u00eancia P99", formatMs(result.latency.p99)],
      ["Lat\u00eancia M\u00e1xima", formatMs(result.latency.max)],
      ["RPS", result.rps.toLocaleString("pt-BR")],
      [
        "Total de Requisi\u00e7\u00f5es",
        result.totalRequests.toLocaleString("pt-BR"),
      ],
      ["Total de Erros", result.totalErrors.toLocaleString("pt-BR")],
      ["Taxa de Erro", `${result.errorRate}%`],
      ["Throughput", `${formatBytes(result.throughputBytesPerSec)}/s`],
      ["Volume Total", formatBytes(result.totalBytes)],
      ["Dura\u00e7\u00e3o Real", `${result.durationSeconds}s`],
    ],
    ...TABLE_BASE,
    margin: { left: M, right: M },
  });

  y = lastTableY(doc, y + 80) + 8;

  // Status codes
  const codes = Object.entries(result.statusCodes);
  if (codes.length > 0) {
    y = needsPage(doc, y, 40, pH);
    y = subTitle(doc, "C\u00f3digos de Status HTTP", y);

    autoTable(doc, {
      startY: y,
      head: [["Status", "Quantidade", "%"]],
      body: codes.map(([code, count]) => [
        code,
        (count as number).toLocaleString("pt-BR"),
        result.totalRequests > 0
          ? `${(((count as number) / result.totalRequests) * 100).toFixed(1)}%`
          : "0%",
      ]),
      ...TABLE_BASE,
      margin: { left: M, right: M },
    });

    y = lastTableY(doc, y + 30) + 8;
  }

  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. MÉTRICAS POR OPERAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

function drawOperationMetrics(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  cW: number,
  pH: number,
): number {
  if (
    !result.operationMetrics ||
    Object.keys(result.operationMetrics).length === 0
  )
    return startY;

  let y = needsPage(doc, startY, 50, pH);
  y = sectionTitle(doc, "Fluxo por Opera\u00e7\u00e3o", y);

  const ops = Object.values(result.operationMetrics);
  const hasSess = ops.some((o) => !!o.sessionMetrics);

  const head = hasSess
    ? [
        [
          "Opera\u00e7\u00e3o",
          "Reqs",
          "RPS",
          "Lat.M\u00e9d",
          "P95",
          "Erros",
          "%",
          "Autent.",
          "Falhas",
          "Consist.",
        ],
      ]
    : [
        [
          "Opera\u00e7\u00e3o",
          "Reqs",
          "RPS",
          "Lat.M\u00e9dia",
          "P95",
          "Erros",
          "%",
        ],
      ];

  const body = ops.map((op) => {
    const base = [
      op.name,
      op.totalRequests.toLocaleString("pt-BR"),
      op.rps.toLocaleString("pt-BR"),
      formatMs(op.latency.avg),
      formatMs(op.latency.p95),
      op.totalErrors.toLocaleString("pt-BR"),
      `${op.errorRate}%`,
    ];
    if (!hasSess) return base;
    const s = op.sessionMetrics;
    return [
      ...base,
      s ? s.authenticatedRequests.toLocaleString("pt-BR") : "\u2014",
      s
        ? `${s.sessionFailures.toLocaleString("pt-BR")}${s.sessionExpiredErrors > 0 ? ` (${s.sessionExpiredErrors} exp.)` : ""}`
        : "\u2014",
      s ? `${s.consistencyScore}%` : "\u2014",
    ];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    ...TABLE_BASE,
    styles: {
      ...TABLE_BASE.styles,
      fontSize: hasSess ? 7 : 8,
      cellPadding: hasSess ? 2 : 3,
    },
    margin: { left: M, right: M },
  });

  y = lastTableY(doc, y + 30) + 6;

  // Alerta de sessão
  if (hasSess) {
    const critical = ops.filter(
      (o) => o.sessionMetrics && o.sessionMetrics.consistencyScore < 85,
    );
    const warn = ops.filter(
      (o) =>
        o.sessionMetrics &&
        o.sessionMetrics.consistencyScore >= 85 &&
        o.sessionMetrics.consistencyScore < 95,
    );

    let boxBg: RGB;
    let boxBorder: RGB;
    let title: string;
    let bodyText: string;

    if (critical.length > 0) {
      boxBg = [255, 236, 236];
      boxBorder = C.danger;
      title = `Alerta: ${critical.length} opera\u00e7\u00e3o(\u00f5es) com consist\u00eancia cr\u00edtica (<85%)`;
      bodyText = `Opera\u00e7\u00f5es [${critical.map((o) => o.name).join(", ")}] com perda frequente de autentica\u00e7\u00e3o. Risco de transa\u00e7\u00f5es incompletas em produ\u00e7\u00e3o.`;
    } else if (warn.length > 0) {
      boxBg = [255, 251, 230];
      boxBorder = C.warning;
      title = `Aten\u00e7\u00e3o: ${warn.length} opera\u00e7\u00e3o(\u00f5es) com consist\u00eancia degradada (85-94%)`;
      bodyText = `Opera\u00e7\u00f5es [${warn.map((o) => o.name).join(", ")}] com instabilidade intermitente. Monitorar em produ\u00e7\u00e3o.`;
    } else {
      boxBg = [231, 255, 240];
      boxBorder = C.success;
      title = "Sess\u00f5es est\u00e1veis em todas as opera\u00e7\u00f5es (\u226595%)";
      bodyText =
        "Autentica\u00e7\u00e3o preservada ao longo de todo o fluxo multi-opera\u00e7\u00e3o simulado.";
    }

    y = needsPage(doc, y, 24, pH);

    doc.setFontSize(8);
    const tLines = doc.splitTextToSize(title, cW - 10) as string[];
    const bLines = doc.splitTextToSize(bodyText, cW - 10) as string[];
    const bH = 8 + tLines.length * 4 + bLines.length * 3.5 + 4;

    doc.setFillColor(...boxBg);
    doc.roundedRect(M, y, cW, bH, 2, 2, "F");
    doc.setDrawColor(...boxBorder);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, cW, bH, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.text);
    doc.text(tLines, M + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textSecondary);
    doc.text(bLines, M + 4, y + 6 + tLines.length * 4 + 2);

    y += bH + 6;
  }

  return y;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ANÁLISE DE PROTEÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

function drawProtection(
  doc: jsPDF,
  report: ProtectionReport,
  cW: number,
  pH: number,
): void {
  doc.addPage();
  pageDecor(doc);
  let y = 16;
  y = sectionTitle(doc, "An\u00e1lise de Prote\u00e7\u00e3o", y);

  // Risco geral
  const rColor = RISK_COLORS[report.overallRisk] ?? C.success;
  const rLabel = RISK_LABELS[report.overallRisk] ?? "\u2014";

  const riskCardH = 18;
  card(doc, M, y, cW, riskCardH, { border: rColor });

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textMuted);
  doc.text("N\u00edvel de risco:", M + 5, y + 10);

  pill(doc, rLabel, M + 42, y + 5, rColor, 28);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  const sumLines = doc.splitTextToSize(report.summary, cW - 80) as string[];
  doc.text(sumLines, M + 76, y + 8);

  y += riskCardH + 8;

  // Proteções detectadas
  if (report.detections.length > 0) {
    y = needsPage(doc, y, 40, pH);
    y = subTitle(doc, "Prote\u00e7\u00f5es Detectadas", y);

    autoTable(doc, {
      startY: y,
      head: [["Provedor", "Tipo", "Confian\u00e7a", "Indicadores"]],
      body: report.detections.map((d) => [
        d.provider !== "unknown"
          ? d.provider.charAt(0).toUpperCase() + d.provider.slice(1)
          : "\u2014",
        PROTECTION_LABELS[d.type] ?? d.type,
        `${d.confidence}% (${d.confidenceLevel === "high" ? "Alta" : d.confidenceLevel === "medium" ? "M\u00e9dia" : "Baixa"})`,
        d.indicators.map((i) => `${i.source}: ${i.name}`).join(", "),
      ]),
      ...TABLE_BASE,
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: cW - 88 },
      },
      margin: { left: M, right: M },
    });

    y = lastTableY(doc, y + 40) + 8;
  }

  // Rate Limiting
  if (report.rateLimitInfo.detected) {
    y = needsPage(doc, y, 30, pH);
    y = subTitle(doc, "Rate Limiting", y);

    const rlData: [string, string][] = [["Status", "Detectado"]];
    if (report.rateLimitInfo.limitPerWindow)
      rlData.push(["Limite/janela", report.rateLimitInfo.limitPerWindow]);
    if (report.rateLimitInfo.windowSeconds !== undefined)
      rlData.push(["Janela (s)", String(report.rateLimitInfo.windowSeconds)]);
    if (report.rateLimitInfo.triggerPoint !== undefined)
      rlData.push([
        "Ativado no segundo",
        String(report.rateLimitInfo.triggerPoint),
      ]);
    if (report.rateLimitInfo.recoveryPattern)
      rlData.push([
        "Recupera\u00e7\u00e3o",
        report.rateLimitInfo.recoveryPattern,
      ]);

    autoTable(doc, {
      startY: y,
      head: [["Par\u00e2metro", "Valor"]],
      body: rlData,
      ...TABLE_BASE,
      headStyles: {
        ...TABLE_BASE.headStyles,
        fillColor: C.warning,
      },
      margin: { left: M, right: M },
    });

    y = lastTableY(doc, y + 30) + 8;
  }

  // Padrões comportamentais
  const anomalies = report.behavioralPatterns.filter(
    (b) => b.type !== "normal",
  );
  if (anomalies.length > 0) {
    y = needsPage(doc, y, 30, pH);
    y = subTitle(doc, "Padr\u00f5es Comportamentais", y);

    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Descri\u00e7\u00e3o", "Evid\u00eancia"]],
      body: anomalies.map((p) => [
        BEHAVIOR_LABELS[p.type] ?? p.type,
        p.description,
        p.evidence,
      ]),
      ...TABLE_BASE,
      headStyles: { ...TABLE_BASE.headStyles, fillColor: C.orange },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: cW - 65 },
        2: { cellWidth: 40 },
      },
      margin: { left: M, right: M },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ERROS DETALHADOS
// ═══════════════════════════════════════════════════════════════════════════════

function drawErrors(
  doc: jsPDF,
  errors: ErrorRecord[],
  result: TestResult,
  cW: number,
  pH: number,
): number {
  doc.addPage();
  pageDecor(doc);

  let y = 16;
  y = sectionTitle(doc, "Erros Detalhados", y);

  const shown = Math.min(errors.length, 100);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.textSecondary);
  doc.text(
    `${result.totalErrors.toLocaleString("pt-BR")} erros no total \u2014 exibindo ${shown} registros mais recentes.`,
    M,
    y,
  );
  y += 8;

  // Por tipo
  const byType: Record<string, number> = {};
  for (const e of errors) byType[e.errorType] = (byType[e.errorType] || 0) + 1;

  const typeSummary = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .map(([t, c]) => [
      ERROR_TYPE_LABELS[t] || t,
      c.toLocaleString("pt-BR"),
      `${((c / errors.length) * 100).toFixed(1)}%`,
    ]);

  if (typeSummary.length > 0) {
    y = subTitle(doc, "Por Tipo", y);
    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Qtd", "%"]],
      body: typeSummary,
      ...TABLE_BASE,
      margin: { left: M, right: M },
    });
    y = lastTableY(doc, y + 30) + 8;
  }

  // Por status HTTP
  const byStatus: Record<string, number> = {};
  for (const e of errors)
    if (e.statusCode > 0)
      byStatus[String(e.statusCode)] =
        (byStatus[String(e.statusCode)] || 0) + 1;

  const statusSummary = Object.entries(byStatus)
    .sort(([, a], [, b]) => b - a)
    .map(([c, n]) => [
      c,
      n.toLocaleString("pt-BR"),
      `${((n / errors.length) * 100).toFixed(1)}%`,
    ]);

  if (statusSummary.length > 0) {
    y = needsPage(doc, y, 40, pH);
    y = subTitle(doc, "Por C\u00f3digo HTTP", y);
    autoTable(doc, {
      startY: y,
      head: [["Status", "Qtd", "%"]],
      body: statusSummary,
      ...TABLE_BASE,
      margin: { left: M, right: M },
    });
    y = lastTableY(doc, y + 30) + 8;
  }

  // Registros individuais
  y = needsPage(doc, y, 60, pH);
  y = subTitle(doc, "Registros Individuais", y);

  autoTable(doc, {
    startY: y,
    head: [["Hora", "Opera\u00e7\u00e3o", "Status", "Tipo", "Mensagem"]],
    body: errors.slice(0, 100).map((e) => [
      format(new Date(e.timestamp), "HH:mm:ss", { locale: ptBR }),
      e.operationName || "\u2014",
      e.statusCode > 0 ? String(e.statusCode) : "\u2014",
      ERROR_TYPE_LABELS[e.errorType] || e.errorType,
      (e.message || "").substring(0, 60) +
        (e.message && e.message.length > 60 ? "\u2026" : ""),
    ]),
    ...TABLE_BASE,
    styles: { ...TABLE_BASE.styles, fontSize: 7.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 28 },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 20 },
      4: { cellWidth: cW - 78 },
    },
    margin: { left: M, right: M },
    didDrawPage: () => pageDecor(doc),
  });

  return lastTableY(doc, y + 30) + 8;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. RECOMENDAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

function drawRecommendations(
  doc: jsPDF,
  result: TestResult,
  cW: number,
  pH: number,
): number {
  doc.addPage();
  pageDecor(doc);
  let y = 16;
  y = sectionTitle(doc, "Recomenda\u00e7\u00f5es", y);

  const recs = buildRecs(result);
  const priorityColors: Record<string, RGB> = {
    urgent: C.danger,
    important: C.warning,
    info: C.info,
  };

  for (const rec of recs) {
    if (rec.text === "") {
      y = needsPage(doc, y, 14, pH);
      y += 4;
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(M, y, M + cW, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textMuted);
      doc.text("Recomenda\u00e7\u00f5es gerais", M, y);
      y += 6;
      continue;
    }

    y = needsPage(doc, y, 10, pH);

    const pc = priorityColors[rec.priority] ?? C.info;
    doc.setFillColor(...pc);
    doc.roundedRect(M, y - 3, 2, 5, 1, 1, "F");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textSecondary);
    const lines = doc.splitTextToSize(rec.text, cW - 8) as string[];
    doc.text(lines, M + 6, y);
    y += lines.length * 4 + 3;
  }

  // Legenda
  y += 4;
  if (y + 8 < pH - 15) {
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textFaint);

    const legs: [RGB, string][] = [
      [C.danger, "Urgente"],
      [C.warning, "Importante"],
      [C.info, "Informativo"],
    ];

    let lx = M;
    for (const [c, t] of legs) {
      doc.setFillColor(...c);
      doc.roundedRect(lx, y - 2, 4, 4, 1, 1, "F");
      doc.text(t, lx + 6, y + 1);
      lx += 26;
    }
    y += 8;
  }

  return y;
}

function buildRecs(result: TestResult): Recommendation[] {
  const r: Recommendation[] = [];

  if (result.errorRate > 5)
    r.push({
      text: `Taxa de erro de ${result.errorRate}%. Aumente recursos do servidor ou investigue gargalos de conex\u00e3o.`,
      priority: "urgent",
    });

  if (result.latency.p95 > 2000)
    r.push({
      text: `Lat\u00eancia P95 de ${formatMs(result.latency.p95)}. Otimize queries, habilite cache e compress\u00e3o.`,
      priority: "urgent",
    });

  if (result.latency.p99 / Math.max(result.latency.p50, 1) > 10)
    r.push({
      text: "Disparidade P99/P50 > 10x. Investigue picos intermitentes, GC e lock contention.",
      priority: "important",
    });

  if (result.rps < result.config.virtualUsers * 0.5)
    r.push({
      text: `RPS (${result.rps}) abaixo do esperado para ${result.config.virtualUsers} VUs. Servidor n\u00e3o absorve a carga.`,
      priority: "urgent",
    });

  if (Object.entries(result.statusCodes).some(([c]) => Number(c) >= 500))
    r.push({
      text: "Erros 5xx detectados. Revise logs do servidor e estabilidade da aplica\u00e7\u00e3o.",
      priority: "urgent",
    });

  if (Object.entries(result.statusCodes).some(([c]) => Number(c) === 429))
    r.push({
      text: "Rate limiting ativo (HTTP 429). Solicite whitelist do IP de teste.",
      priority: "important",
    });

  if (result.protectionReport) {
    const pr = result.protectionReport;
    if (pr.overallRisk === "high" || pr.overallRisk === "critical")
      r.push({
        text: "Prote\u00e7\u00f5es ativas interferindo nos resultados. Libere o IP de teste.",
        priority: "important",
      });

    const provs = [
      ...new Set(
        pr.detections
          .filter((d) => d.provider !== "unknown")
          .map((d) => d.provider),
      ),
    ];
    if (provs.length > 0)
      r.push({
        text: `Prote\u00e7\u00e3o detectada: ${provs.join(", ")}. Solicite whitelist para resultados precisos.`,
        priority: "info",
      });

    if (pr.rateLimitInfo.detected)
      r.push({
        text: "Rate limiter ativo. Reduza VUs ou solicite aumento tempor\u00e1rio do limite.",
        priority: "important",
      });
  }

  if (r.length === 0) {
    r.push({
      text: "Site est\u00e1vel sob a carga testada. Nenhum problema cr\u00edtico detectado.",
      priority: "info",
    });
    r.push({
      text: "Teste com mais VUs para identificar o ponto de ruptura.",
      priority: "info",
    });
  }

  // Separador + gerais
  r.push({ text: "", priority: "info" });
  r.push({
    text: "Monitore performance em produ\u00e7\u00e3o para detectar degrada\u00e7\u00f5es precocemente.",
    priority: "info",
  });
  r.push({
    text: "Repita testes periodicamente, especialmente antes de campanhas e picos de tr\u00e1fego.",
    priority: "info",
  });

  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. CONFIGURAÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════════════

function drawConfig(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  cW: number,
  pH: number,
): number {
  let y = needsPage(doc, startY, 50, pH);
  y = sectionTitle(doc, "Configura\u00e7\u00e3o do Teste", y);

  autoTable(doc, {
    startY: y,
    head: [["Par\u00e2metro", "Valor"]],
    body: [
      ["URL", result.url],
      ["M\u00e9todo HTTP", result.config.method],
      ["Usu\u00e1rios Virtuais", String(result.config.virtualUsers)],
      ["Dura\u00e7\u00e3o Configurada", `${result.config.duration}s`],
      [
        "Ramp-up",
        result.config.rampUp ? `${result.config.rampUp}s` : "Desabilitado",
      ],
      [
        "In\u00edcio",
        format(new Date(result.startTime), "dd/MM/yyyy HH:mm:ss", {
          locale: ptBR,
        }),
      ],
      [
        "Fim",
        format(new Date(result.endTime), "dd/MM/yyyy HH:mm:ss", {
          locale: ptBR,
        }),
      ],
      [
        "Status",
        result.status === "completed"
          ? "Conclu\u00eddo"
          : result.status === "cancelled"
            ? "Cancelado"
            : "Erro",
      ],
    ],
    ...TABLE_BASE,
    margin: { left: M, right: M },
  });

  return lastTableY(doc, y + 50) + 8;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. GLOSSÁRIO
// ═══════════════════════════════════════════════════════════════════════════════

function drawGlossary(doc: jsPDF, cW: number): void {
  doc.addPage();
  pageDecor(doc);
  let y = 16;
  y = sectionTitle(doc, "Gloss\u00e1rio", y);

  label(
    doc,
    "Explica\u00e7\u00e3o dos termos t\u00e9cnicos utilizados neste relat\u00f3rio.",
    M,
    y,
  );
  y += 6;

  const terms: [string, string][] = [
    [
      "Lat\u00eancia",
      "Tempo entre o envio da requisi\u00e7\u00e3o e o recebimento da resposta. Quanto menor, melhor.",
    ],
    [
      "Lat\u00eancia M\u00e9dia",
      "M\u00e9dia de todos os tempos de resposta registrados durante o teste.",
    ],
    [
      "P50 (mediana)",
      "Metade dos acessos foi respondida abaixo deste tempo. Representa a experi\u00eancia t\u00edpica.",
    ],
    [
      "P90 / P95 / P99",
      "Percentis de lat\u00eancia. P95 = 95% dos acessos responderam at\u00e9 esse tempo.",
    ],
    [
      "RPS",
      "Requisi\u00e7\u00f5es por segundo \u2014 taxa de vaz\u00e3o do servidor durante o teste.",
    ],
    [
      "Taxa de Erro",
      "% de requisi\u00e7\u00f5es que falharam. Ideal < 1%. Acima de 5% indica problema.",
    ],
    [
      "Throughput",
      "Volume de dados transferidos por segundo entre servidor e usu\u00e1rios.",
    ],
    [
      "Usu\u00e1rios Virtuais",
      "Conex\u00f5es simult\u00e2neas simuladas. Cada uma envia requisi\u00e7\u00f5es em paralelo.",
    ],
    [
      "Status Code HTTP",
      "C\u00f3digo de resposta do servidor. 200 = sucesso, 4xx = erro cliente, 5xx = erro servidor.",
    ],
    [
      "WAF",
      "Web Application Firewall \u2014 prote\u00e7\u00e3o contra ataques que pode bloquear testes de carga.",
    ],
    [
      "CDN",
      "Rede de servidores distribu\u00eddos que acelera a entrega de conte\u00fado.",
    ],
    [
      "Rate Limiting",
      "Limite de acessos por per\u00edodo. Protege o site mas pode interferir em testes.",
    ],
    [
      "Ramp-up",
      "Aquecimento gradual \u2014 VUs s\u00e3o adicionados progressivamente em vez de todos de uma vez.",
    ],
    [
      "Score de Sa\u00fade",
      "Nota 0-100 que avalia desempenho considerando velocidade, estabilidade e taxa de erros.",
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Termo", "Defini\u00e7\u00e3o"]],
    body: terms,
    ...TABLE_BASE,
    styles: { ...TABLE_BASE.styles, fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: "bold" },
      1: { cellWidth: cW - 32 },
    },
    margin: { left: M, right: M },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RODAPÉ DE TODAS AS PÁGINAS
// ═══════════════════════════════════════════════════════════════════════════════

function addFooters(doc: jsPDF, result: TestResult): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  const dateStr = format(new Date(result.startTime), "dd/MM/yyyy HH:mm");

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(M, h - 12, w - M, h - 12);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.textFaint);
    doc.text("CPX \u2014 MisterT Stress", M, h - 8);
    doc.text(dateStr, w / 2, h - 8, { align: "center" });
    doc.text(`${i} / ${pages}`, w - M, h - 8, { align: "right" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT: GERAR PDF COMPLETO
// ═══════════════════════════════════════════════════════════════════════════════

export async function generatePDF(
  result: TestResult,
  chartImages: { rps?: string; latency?: string; errors?: string },
  errorRecords?: ErrorRecord[],
): Promise<string> {
  const doc = new jsPDF("p", "mm", "a4");
  const w = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  const cW = w - M * 2;

  const health = healthScore(result);

  // 1. Capa
  drawCover(doc, result, health);

  // 2. Resumo executivo
  let y = drawExecutiveSummary(doc, result, health, cW, pH);

  // 3. Visão para gestores
  drawLaypersonPage(doc, result, health, cW);

  // 4. Gráficos
  doc.addPage();
  pageDecor(doc);
  y = 16;
  y = drawCharts(doc, chartImages, y, cW, pH);

  // 5. Métricas detalhadas
  y = drawDetailedMetrics(doc, result, y > 16 ? y : 16, cW, pH);

  // 6. Fluxo por operação
  y = drawOperationMetrics(doc, result, y, cW, pH);

  // 7. Proteção
  if (result.protectionReport) {
    drawProtection(doc, result.protectionReport, cW, pH);
  }

  // 8. Recomendações
  y = drawRecommendations(doc, result, cW, pH);

  // 9. Erros detalhados
  if (errorRecords && errorRecords.length > 0) {
    y = drawErrors(doc, errorRecords, result, cW, pH);
  }

  // 10. Configuração
  drawConfig(doc, result, y, cW, pH);

  // 11. Glossário
  drawGlossary(doc, cW);

  // 12. Rodapé em todas as páginas
  addFooters(doc, result);

  return doc.output("datauristring").split(",")[1];
}
