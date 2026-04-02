/**
 * ============================================================================
 * CPX — MisterT Stress - Gerador de Relatório PDF
 * ============================================================================
 *
 * Este arquivo é responsável por gerar o relatório em PDF dos testes de
 * estresse realizados pelo CPX — MisterT Stress. O relatório inclui:
 *
 *   1. Capa com informações gerais do teste
 *   2. Resumo simplificado (para leitores não-técnicos)
 *   3. Resumo executivo com métricas principais
 *   4. Gráficos de evolução do teste ao longo do tempo
 *   5. Tabela detalhada de métricas e códigos de resposta
 *   6. Análise de proteção (WAF, CDN, Rate Limiting, etc.)
 *   7. Conclusões e recomendações priorizadas
 *   8. Glossário de termos técnicos
 *
 * O objetivo é produzir um documento profissional que possa ser entregue
 * tanto para equipes técnicas quanto para gestores e stakeholders.
 * ============================================================================
 */

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

// ============================================================================
// Constantes de Layout e Cores
// ============================================================================
// Aqui definimos todas as cores e estilos usados no relatório.
// Centralizar essas definições facilita a manutenção e garante consistência
// visual em todo o documento.

/** Cor principal da marca CPX — MisterT Stress (roxo/indigo) */
const BRAND_COLOR: [number, number, number] = [79, 70, 229];

/** Cor de destaque secundária (ciano) */
const ACCENT_COLOR: [number, number, number] = [34, 211, 238];

/** Cores de texto em diferentes níveis de ênfase */
const TEXT_PRIMARY: [number, number, number] = [30, 41, 59];
const TEXT_SECONDARY: [number, number, number] = [51, 65, 85];
const TEXT_MUTED: [number, number, number] = [100, 116, 139];
const TEXT_FAINT: [number, number, number] = [148, 163, 184];

/** Cores de fundo e borda para cards e tabelas */
const BG_CARD: [number, number, number] = [241, 245, 249];
const BG_ALTERNATE_ROW: [number, number, number] = [248, 250, 252];
const BORDER_LIGHT: [number, number, number] = [226, 232, 240];

/** Cores para os diferentes níveis de saúde/risco */
const COLOR_SUCCESS: [number, number, number] = [34, 197, 94];
const COLOR_INFO: [number, number, number] = [59, 130, 246];
const COLOR_WARNING: [number, number, number] = [245, 158, 11];
const COLOR_ORANGE: [number, number, number] = [249, 115, 22];
const COLOR_DANGER: [number, number, number] = [239, 68, 68];

/** Margem padrão das páginas (em milímetros) */
const PAGE_MARGIN = 20;

/** Altura da faixa decorativa no topo de cada página */
const TOP_STRIPE_HEIGHT = 4;

// ============================================================================
// Estilos padrão para tabelas (jspdf-autotable)
// ============================================================================
// Estas configurações são reutilizadas em todas as tabelas do relatório
// para manter um visual consistente e profissional.

const TABLE_STYLES = {
  theme: "plain" as const,
  styles: {
    fillColor: [255, 255, 255] as [number, number, number],
    textColor: TEXT_PRIMARY,
    fontSize: 9,
    cellPadding: 4,
    lineColor: BORDER_LIGHT,
    lineWidth: 0.3,
  },
  headStyles: {
    fillColor: BRAND_COLOR,
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: "bold" as const,
    fontSize: 10,
  },
  alternateRowStyles: {
    fillColor: BG_ALTERNATE_ROW,
  },
};

// ============================================================================
// Mapeamentos de labels para o PDF (português)
// ============================================================================
// Traduzimos todos os termos técnicos para português, facilitando a
// compreensão por leitores que não dominam inglês técnico.

/** Labels para os níveis de risco de proteção */
const RISK_LABELS: Record<string, string> = {
  none: "Nenhum",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

/** Cores associadas a cada nível de risco */
const RISK_COLORS: Record<string, [number, number, number]> = {
  none: COLOR_SUCCESS,
  low: COLOR_INFO,
  medium: COLOR_WARNING,
  high: COLOR_ORANGE,
  critical: COLOR_DANGER,
};

/** Labels para os tipos de proteção detectados */
const PROTECTION_TYPE_LABELS: Record<string, string> = {
  waf: "WAF",
  cdn: "CDN",
  "rate-limiter": "Rate Limiting",
  "anti-bot": "Anti-Bot",
  "ddos-protection": "DDoS Protection",
  captcha: "CAPTCHA/Challenge",
  unknown: "Desconhecido",
};

/** Labels para os tipos de padrão comportamental */
const BEHAVIORAL_PATTERN_LABELS: Record<string, string> = {
  throttling: "Throttling",
  blocking: "Bloqueio",
  challenge: "Challenge",
  degradation: "Degradação",
  normal: "Normal",
};

/** Cores para os níveis de prioridade das recomendações */
const PRIORITY_COLORS: Record<string, [number, number, number]> = {
  urgent: COLOR_DANGER,
  important: COLOR_WARNING,
  info: COLOR_INFO,
};

// ============================================================================
// Funções Utilitárias de Formatação
// ============================================================================

/**
 * Formata um valor em bytes para uma unidade legível (B, KB, MB, GB).
 *
 * Exemplo: 1536 -> "1.50 KB"
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const base = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(base)),
    units.length - 1,
  );
  const value = bytes / Math.pow(base, exponent);
  return `${value.toFixed(2)} ${units[exponent]}`;
}

/**
 * Extrai o valor final de Y após uma tabela do autoTable.
 *
 * O jspdf-autotable armazena a posição final em `doc.lastAutoTable.finalY`,
 * mas essa propriedade não está no tipo oficial. Usamos esta função para
 * encapsular o acesso e fornecer um valor padrão seguro.
 */
function getLastTableY(doc: jsPDF, fallback: number): number {
  const lastTable = (doc as any).lastAutoTable;
  return (lastTable?.finalY as number) ?? fallback;
}

// ============================================================================
// Cálculo do Score de Saúde
// ============================================================================
// O score de saúde (0-100) é a métrica central do relatório. Ele avalia
// o desempenho geral do site durante o teste, considerando:
//   - Taxa de erros de conexão
//   - Erros HTTP (403, 429, 5xx)
//   - Tempo de resposta (latência P95)
//   - Disparidade de latência (P99 vs P50)
//   - Ausência de dados transferidos (possível bloqueio)

/** Resultado da avaliação de saúde do site */
interface HealthAssessment {
  /** Score numérico de 0 a 100 */
  score: number;
  /** Label legível: "Excelente", "Bom", "Regular" ou "Crítico" */
  label: string;
  /** Cor RGB associada ao nível de saúde */
  color: [number, number, number];
  /** Recomendação técnica baseada no score */
  recommendation: string;
  /** Texto simplificado para leitores não-técnicos */
  laypersonText: string;
}

/**
 * Calcula o score de saúde do site com base nos resultados do teste.
 *
 * O cálculo funciona por penalizacoes: comecamos em 100 e subtraimos
 * pontos conforme problemas são detectados. Quanto mais grave o
 * problema, maior a penalizacao.
 */
function getHealthScore(result: TestResult): HealthAssessment {
  const httpErrorRate = calculateHttpErrorRate(result);

  // --- Caso crítico: falha total de conexão ---
  // Se quase todos os acessos falharam ou o servidor não respondeu nada,
  // o site está efetivamente fora do ar.
  if (
    result.errorRate >= 95 ||
    (result.totalRequests === result.totalErrors && result.latency.avg === 0)
  ) {
    return {
      score: 0,
      label: "Crítico",
      color: COLOR_DANGER,
      recommendation:
        "Servidor inacessível. Verifique URL, DNS e firewall.",
      laypersonText:
        "O site não respondeu. A equipe técnica precisa verificar se está no ar.",
    };
  }

  // --- Caso crítico: bloqueio quase total via HTTP ---
  // O servidor respondeu, mas recusou quase todas as requisições.
  // Isso geralmente indica proteção ativa (WAF, rate-limiter).
  if (httpErrorRate >= 90) {
    return {
      score: 5,
      label: "Crítico",
      color: COLOR_DANGER,
      recommendation:
        "Proteção ativa bloqueando ~100% das requisições. Libere o IP de teste.",
      laypersonText:
        "A segurança do site bloqueou o teste. Solicite liberação do IP.",
    };
  }

  let score = calculateSharedHealthScore(result);

  // --- Classificação final baseada no score ---
  if (score >= 80) {
    return {
      score,
      label: "Excelente",
      color: COLOR_SUCCESS,
      recommendation:
        "Performance estável. Site preparado para a carga testada.",
      laypersonText:
        "O site respondeu bem e com rapidez durante o teste.",
    };
  }

  if (score >= 60) {
    return {
      score,
      label: "Bom",
      color: COLOR_INFO,
      recommendation:
        "Performance aceitável. Otimizações de cache e queries podem melhorar.",
      laypersonText:
        "O site funciona, mas pode ficar mais rápido com ajustes técnicos.",
    };
  }

  if (score >= 40) {
    return {
      score,
      label: "Regular",
      color: COLOR_WARNING,
      recommendation:
        "Degradação sob carga. Investigue gargalos de CPU, memória e I/O.",
      laypersonText:
        "O site ficou lento durante o teste. Precisa de revisão técnica.",
    };
  }

  return {
    score,
    label: "Crítico",
    color: COLOR_DANGER,
    recommendation:
      "Performance crítica. Ação imediata: revise infraestrutura e recursos do servidor.",
    laypersonText:
      "O site não suportou a carga. Precisa de atenção urgente da equipe técnica.",
  };
}

// ============================================================================
// Funções de Desenho do PDF
// ============================================================================
// Estas funções controlam os elementos visuais reutilizáveis do PDF,
// como fundo de página, títulos de seção e cards informativos.

/**
 * Desenha o fundo branco e a faixa decorativa roxa no topo da página.
 * Cada nova página do relatório deve chamar esta função para manter
 * a identidade visual consistente.
 */
function drawPageBackground(doc: jsPDF): void {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Fundo branco limpo
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, "F");

  // Faixa decorativa roxa no topo (identidade visual CPX)
  doc.setFillColor(...BRAND_COLOR);
  doc.rect(0, 0, width, TOP_STRIPE_HEIGHT, "F");
}

/**
 * Desenha um título de seção com sublinhado na cor da marca.
 * Retorna a posição Y atualizada para o conteúdo seguinte.
 */
function drawSectionTitle(doc: jsPDF, title: string, yPos: number): number {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLOR);
  doc.text(title, PAGE_MARGIN, yPos);

  // Linha de sublinhado na cor da marca
  doc.setDrawColor(...BRAND_COLOR);
  doc.setLineWidth(0.8);
  const titleWidth = doc.getTextWidth(title);
  doc.line(PAGE_MARGIN, yPos + 2, PAGE_MARGIN + titleWidth, yPos + 2);

  return yPos + 12;
}

/**
 * Desenha um subtitulo menor dentro de uma seção.
 * Retorna a posição Y atualizada.
 */
function drawSubsectionTitle(doc: jsPDF, title: string, yPos: number): number {
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(title, PAGE_MARGIN, yPos);
  return yPos + 8;
}

/**
 * Verifica se há espaço suficiente na página atual. Se não houver,
 * cria uma nova página e retorna a posição Y inicial.
 * Isso evita que conteúdo seja cortado entre páginas.
 */
function ensureSpace(
  doc: jsPDF,
  currentY: number,
  requiredSpace: number,
  pageHeight: number,
): number {
  if (currentY + requiredSpace > pageHeight - 20) {
    doc.addPage();
    drawPageBackground(doc);
    return 20;
  }
  return currentY;
}

// ============================================================================
// Seção: Capa do Relatório
// ============================================================================
// A capa é a primeira impressão do relatório. Ela apresenta o nome da
// ferramenta, a URL testada, data, configurações e o score geral de saúde.

function drawCoverPage(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  drawPageBackground(doc);

  // --- Título principal (duas linhas) ---
  doc.setTextColor(...BRAND_COLOR);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("CPX — MisterT Stress", pageWidth / 2, 60, { align: "center" });

  // --- Subtitulo ---
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Relatório de Teste de Estresse", pageWidth / 2, 72, {
    align: "center",
  });

  // --- Separador horizontal na cor da marca ---
  doc.setDrawColor(...BRAND_COLOR);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 35, 80, pageWidth / 2 + 35, 80);

  // --- Metadata do teste em layout estruturado ---
  const formattedDate = format(
    new Date(result.startTime),
    "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
    { locale: ptBR },
  );

  const metaItems = [
    { label: "URL", value: result.url },
    { label: "Data", value: formattedDate },
    { label: "Usuários Virtuais", value: String(result.config.virtualUsers) },
    { label: "Duração", value: `${result.config.duration}s` },
    { label: "Método", value: result.config.method },
  ];

  let y = 96;
  const labelX = pageWidth / 2 - 12;
  const valueX = pageWidth / 2;

  for (const item of metaItems) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_MUTED);
    doc.text(item.label, labelX, y, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_PRIMARY);

    // Truncar valor se exceder a largura disponível
    let displayValue = item.value;
    const maxValWidth = pageWidth - valueX - PAGE_MARGIN - 5;
    if (doc.getTextWidth(displayValue) > maxValWidth) {
      while (
        doc.getTextWidth(displayValue + "…") > maxValWidth &&
        displayValue.length > 10
      ) {
        displayValue = displayValue.substring(0, displayValue.length - 1);
      }
      displayValue += "…";
    }

    doc.text(displayValue, valueX + 4, y);
    y += 9;
  }

  // --- Badge do score de saúde ---
  y += 16;
  const badgeWidth = 65;
  const badgeHeight = 18;
  doc.setFillColor(...health.color);
  doc.roundedRect(
    pageWidth / 2 - badgeWidth / 2,
    y - 7,
    badgeWidth,
    badgeHeight,
    4,
    4,
    "F",
  );
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`${health.label} (${health.score}/100)`, pageWidth / 2, y + 5, {
    align: "center",
  });

  // --- Rodapé da capa ---
  doc.setTextColor(...TEXT_FAINT);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Gerado por CPX — MisterT Stress", pageWidth / 2, pageHeight - 15, {
    align: "center",
  });
}

// ============================================================================
// Seção: Resumo Simplificado (para leitores não-técnicos)
// ============================================================================
// Esta seção foi pensada para gestores, diretores e qualquer pessoa que
// precise entender os resultados sem conhecimento técnico. Usa linguagem
// simples, evita jargões e foca no impacto prático para o negócio.

function addLaypersonSummary(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  contentWidth: number,
): void {
  doc.addPage();
  drawPageBackground(doc);
  let y = 20;

  y = drawSectionTitle(doc, "Resumo Simplificado", y);

  // Verificar se houve bloqueio por proteção
  const preBlockDataLP = getPreBlockingData(result);

  // --- Card com o score de saúde ---
  // Quando houve bloqueio, exibe o score pré-bloqueio como avaliação principal,
  // pois a nota geral (pós-bloqueio) não reflete o desempenho real do site.
  const displayHealth = preBlockDataLP ? preBlockDataLP.preHealth : health;

  doc.setFillColor(...BG_CARD);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 32, 3, 3, "F");
  doc.setDrawColor(...(preBlockDataLP ? displayHealth.color : BORDER_LIGHT));
  doc.setLineWidth(preBlockDataLP ? 0.6 : 0.3);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 32, 3, 3, "S");

  // Badge com a nota
  doc.setFillColor(...displayHealth.color);
  doc.roundedRect(PAGE_MARGIN + 6, y + 6, 50, 20, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`${displayHealth.score}/100`, PAGE_MARGIN + 31, y + 19, {
    align: "center",
  });

  // Label e descrição ao lado da nota
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...displayHealth.color);
  doc.text(
    preBlockDataLP
      ? `${displayHealth.label} (antes do bloqueio)`
      : displayHealth.label,
    PAGE_MARGIN + 64,
    y + 14,
  );

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  const laypersonDescWidth = contentWidth - 64 - 4;
  const laypersonLines = doc.splitTextToSize(
    displayHealth.laypersonText,
    laypersonDescWidth,
  ) as string[];
  doc.text(laypersonLines, PAGE_MARGIN + 64, y + 24);

  y += 40;

  // --- Alerta de proteção/bloqueio ---
  // Quando proteção bloqueou o tráfego, explica a situação ao leitor
  // e mostra a nota geral como informação secundaria com contexto.
  if (preBlockDataLP) {
    // Card de alerta explicando o bloqueio
    const alertText =
      `A partir do segundo ${preBlockDataLP.blockSecond}, o sistema de proteção do site ` +
      `detectou o volume elevado de acessos do teste e bloqueou o tráfego. ` +
      `Isso é um comportamento normal e esperado — significa que o site possui ` +
      `defesas de segurança ativas contra acessos excessivos. A avaliação acima ` +
      `considera apenas o período antes do bloqueio, refletindo a capacidade real do servidor.`;

    doc.setFontSize(8);
    const alertLines = doc.splitTextToSize(
      alertText,
      contentWidth - 12,
    ) as string[];
    const alertHeight = 12 + alertLines.length * 4;

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, alertHeight, 3, 3, "F");
    doc.setDrawColor(...COLOR_WARNING);
    doc.setLineWidth(0.5);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, alertHeight, 3, 3, "S");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLOR_WARNING);
    doc.text(
      "Proteção de segurança detectada durante o teste",
      PAGE_MARGIN + 4,
      y + 7,
    );

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(alertLines, PAGE_MARGIN + 4, y + 13);

    y += alertHeight + 4;

    // Card menor com a nota geral (inclui período de bloqueio)
    doc.setFillColor(...BG_CARD);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, 20, 2, 2, "F");
    doc.setDrawColor(...BORDER_LIGHT);
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, 20, 2, 2, "S");

    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Nota geral (incluindo período de bloqueio):",
      PAGE_MARGIN + 4,
      y + 8,
    );

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...health.color);
    doc.text(`${health.score}/100 - ${health.label}`, PAGE_MARGIN + 4, y + 16);

    doc.setFontSize(7);
    doc.setTextColor(...TEXT_FAINT);
    doc.setFont("helvetica", "normal");
    doc.text(
      "Esta nota inclui o período após o bloqueio e não representa o desempenho real do site.",
      PAGE_MARGIN + 55,
      y + 16,
    );

    y += 24;
  }

  // --- O que testamos? ---
  // Explicamos em linguagem simples o que foi feito durante o teste.
  y = drawSubsectionTitle(doc, "O que testamos?", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);

  const testDescription =
    `Simulamos ${result.config.virtualUsers} pessoas acessando o site ` +
    `${result.url} ao mesmo tempo, durante ${result.config.duration} segundos. ` +
    `O objetivo é verificar se o site consegue atender todos esses acessos ` +
    `sem ficar lento ou apresentar erros.`;

  const descLines = doc.splitTextToSize(
    testDescription,
    contentWidth,
  ) as string[];
  doc.text(descLines, PAGE_MARGIN, y);
  y += descLines.length * 5 + 10;

  // --- O que encontramos? ---
  // Apresentamos os resultados usando analogias do dia a dia.
  y = drawSubsectionTitle(doc, "O que encontramos?", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);

  const findings = buildLaypersonFindings(result);

  for (const finding of findings) {
    const bulletText = "  •  " + finding;
    const lines = doc.splitTextToSize(bulletText, contentWidth - 4) as string[];
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 5 + 3;
  }

  y += 7;

  // --- O que recomendamos? ---
  // Sugestões práticas que não exigem conhecimento técnico para entender.
  y = drawSubsectionTitle(doc, "O que recomendamos?", y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);

  const recommendations = buildLaypersonRecommendations(health.score);

  for (const rec of recommendations) {
    const bulletText = "  •  " + rec;
    const lines = doc.splitTextToSize(bulletText, contentWidth - 4) as string[];
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 5 + 3;
  }
}

/**
 * Gera a lista de achados do teste em linguagem simples.
 * Cada item explica um aspecto do resultado usando termos do cotidiano.
 */
function buildLaypersonFindings(result: TestResult): string[] {
  const findings: string[] = [];

  if (result.latency.avg < 500) {
    findings.push(
      `Velocidade: Resposta rápida (${formatMs(result.latency.avg)} em média). Usuários não percebem espera.`,
    );
  } else if (result.latency.avg < 2000) {
    findings.push(
      `Velocidade: Lentidão moderada (${formatMs(result.latency.avg)} em média). Usuários podem notar demora.`,
    );
  } else {
    findings.push(
      `Velocidade: Lento (${formatMs(result.latency.avg)} em média). Experiência ruim — usuários podem desistir.`,
    );
  }

  if (result.errorRate < 1) {
    findings.push("Estabilidade: Site estável — praticamente sem erros.");
  } else if (result.errorRate < 5) {
    findings.push(
      `Estabilidade: ${result.errorRate}% de falhas. Parcela pequena de usuários afetada.`,
    );
  } else {
    findings.push(
      `Estabilidade: ${result.errorRate}% de falhas. Parte significativa dos usuários não conseguiu acessar.`,
    );
  }

  findings.push(
    `Capacidade: ${result.rps.toLocaleString("pt-BR")} acessos/s, ${result.totalRequests.toLocaleString("pt-BR")} acessos no total.`,
  );

  if (
    result.protectionReport &&
    result.protectionReport.overallRisk !== "none"
  ) {
    findings.push(
      "Proteção: Segurança ativa detectada — pode ter interferido nos resultados.",
    );
  }

  return findings;
}

/**
 * Gera recomendações em linguagem simples com base no score de saúde.
 * As sugestões são práticas e voltadas para decisores de negócio.
 */
function buildLaypersonRecommendations(score: number): string[] {
  const recs: string[] = [];

  if (score >= 80) {
    recs.push("Site saudável. Continue monitorando periodicamente.");
    recs.push(
      "Teste com mais acessos para descobrir o limite antes de campanhas.",
    );
  } else if (score >= 60) {
    recs.push(
      "Funciona, mas pode melhorar. Solicite revisão técnica para otimizar velocidade.",
    );
    recs.push("Monitore em horários de pico para identificar degradações.");
  } else if (score >= 40) {
    recs.push(
      "Problemas que afetam usuários. Solicite análise técnica detalhada.",
    );
    recs.push(
      "Verifique se o servidor tem recursos suficientes para o volume esperado.",
    );
  } else {
    recs.push(
      "Atenção urgente. Solicite revisão completa do servidor e infraestrutura.",
    );
    recs.push(
      "Considere investir em melhorias para suportar o volume desejado.",
    );
  }

  return recs;
}

// ============================================================================
// Seção: Resumo Executivo
// ============================================================================
// O resumo executivo apresenta as métricas principais em cards visuais,
// seguido da avaliação de saúde com barra de progresso. É voltado para
// leitores que querem uma visão rápida dos números.

function addExecutiveSummary(
  doc: jsPDF,
  result: TestResult,
  health: HealthAssessment,
  contentWidth: number,
  pageHeight: number,
): number {
  doc.addPage();
  drawPageBackground(doc);

  let y = 20;
  y = drawSectionTitle(doc, "Resumo Executivo", y);

  // --- Cards com métricas principais ---
  // Apresentamos os 6 indicadores-chave em um grid 3x2.
  const cardData = [
    {
      label: "Total de Requests",
      sublabel: "Quantidade total de acessos realizados",
      value: result.totalRequests.toLocaleString("pt-BR"),
    },
    {
      label: "Requests/segundo (RPS)",
      sublabel: "Acessos processados por segundo",
      value: result.rps.toLocaleString("pt-BR"),
    },
    {
      label: "Taxa de Erro",
      sublabel: "Porcentagem de acessos que falharam",
      value: `${result.errorRate}%`,
    },
    {
      label: "Latência Média",
      sublabel: "Tempo médio de resposta do site",
      value: formatMs(result.latency.avg),
    },
    {
      label: "Latência P95",
      sublabel: "95% dos acessos responderam neste tempo",
      value: formatMs(result.latency.p95),
    },
    {
      label: "Throughput",
      sublabel: "Volume de dados transferidos por segundo",
      value: `${formatBytes(result.throughputBytesPerSec)}/s`,
    },
  ];

  const cardWidth = (contentWidth - 10) / 3;
  const cardHeight = 28;

  for (let i = 0; i < cardData.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = PAGE_MARGIN + col * (cardWidth + 5);
    const cy = y + row * (cardHeight + 5);

    // Fundo do card
    doc.setFillColor(...BG_CARD);
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, "F");
    doc.setDrawColor(...BORDER_LIGHT);
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, "S");

    // Label do card
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(cardData[i].label, cx + 4, cy + 7);

    // Sublabel explicativo
    doc.setFontSize(6);
    doc.setTextColor(...TEXT_FAINT);
    doc.text(cardData[i].sublabel, cx + 4, cy + 12);

    // Valor em destaque
    doc.setFontSize(14);
    doc.setTextColor(...TEXT_PRIMARY);
    doc.setFont("helvetica", "bold");
    doc.text(cardData[i].value, cx + 4, cy + 23);
  }

  y += Math.ceil(cardData.length / 3) * (cardHeight + 5) + 10;

  // --- Avaliação de saúde com barra de progresso ---
  y = drawSectionTitle(doc, "Avaliação de Saúde", y);

  doc.setFillColor(...BG_CARD);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, "F");
  doc.setDrawColor(...BORDER_LIGHT);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, "S");

  // Barra de progresso
  const barWidth = contentWidth - 80;
  const barX = PAGE_MARGIN + 70;
  doc.setFillColor(...BORDER_LIGHT);
  doc.roundedRect(barX, y + 6, barWidth, 8, 2, 2, "F");
  doc.setFillColor(...health.color);
  doc.roundedRect(barX, y + 6, barWidth * (health.score / 100), 8, 2, 2, "F");

  // Score numerico
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...health.color);
  doc.text(`${health.score}`, PAGE_MARGIN + 8, y + 15);
  doc.setFontSize(8);
  doc.text("/100", PAGE_MARGIN + 30, y + 15);

  // Texto da recomendação
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont("helvetica", "normal");
  doc.text(health.recommendation, PAGE_MARGIN + 4, y + 26);

  y += 40;

  // --- Distribuição de erros por tipo ---
  // Mostra a composição dos erros quando há errorBreakdown disponível
  if (result.errorBreakdown && result.totalErrors > 0) {
    y = ensureSpace(doc, y, 50, pageHeight);
    y = drawSectionTitle(doc, "Distribuição de Erros por Tipo", y);

    const labels: { key: keyof NonNullable<typeof result.errorBreakdown>; label: string }[] = [
      { key: "timeout", label: "Timeout" },
      { key: "connection", label: "Conexão" },
      { key: "http", label: "HTTP (4xx/5xx)" },
      { key: "dns", label: "DNS" },
      { key: "unknown", label: "Desconhecido" },
    ];

    const present = labels.filter((l) => result.errorBreakdown![l.key] > 0);
    if (present.length > 0) {
      const colW = (contentWidth - (present.length - 1) * 4) / present.length;
      for (let i = 0; i < present.length; i++) {
        const cx = PAGE_MARGIN + i * (colW + 4);
        const count = result.errorBreakdown![present[i].key];
        const pct = ((count / result.totalErrors) * 100).toFixed(1);

        doc.setFillColor(...BG_CARD);
        doc.roundedRect(cx, y, colW, 22, 2, 2, "F");
        doc.setDrawColor(...BORDER_LIGHT);
        doc.roundedRect(cx, y, colW, 22, 2, 2, "S");

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...TEXT_PRIMARY);
        doc.text(count.toLocaleString("pt-BR"), cx + colW / 2, y + 10, {
          align: "center",
        });

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`${present[i].label} (${pct}%)`, cx + colW / 2, y + 18, {
          align: "center",
        });
      }
      y += 30;
    }
  }

  // --- Nota de contexto quando bloqueio detectado ---
  // Avisa o leitor que a nota geral inclui o período de bloqueio
  // e direciona para a avaliação pré-bloqueio logo abaixo.
  const execPreBlock = getPreBlockingData(result);
  if (execPreBlock) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLOR_WARNING);
    const ctxNote =
      `Importante: A nota acima (${health.score}/100) inclui o período em que a proteção do site ` +
      `bloqueou o tráfego (a partir do segundo ${execPreBlock.blockSecond}). ` +
      `Veja abaixo a avaliação real do site antes do bloqueio.`;
    const ctxLines = doc.splitTextToSize(ctxNote, contentWidth) as string[];
    doc.text(ctxLines, PAGE_MARGIN, y);
    y += ctxLines.length * 4 + 4;
  }

  // --- Score pré-bloqueio (quando proteção interferiu) ---
  // Se o teste detectou que uma proteção bloqueou o tráfego a partir de
  // determinado segundo, calculamos o score considerando apenas os dados
  // anteriores ao bloqueio. Isso da uma visao mais justa da performance
  // real do servidor, sem a interferência da proteção.
  y = addPreBlockingScore(doc, result, y, contentWidth, pageHeight);

  return y;
}

// ============================================================================
// Helper: Calcular dados do período pré-bloqueio
// ============================================================================
// Quando o teste detecta que uma proteção bloqueou o tráfego a partir de um
// determinado segundo, esta função calcula métricas usando apenas os dados
// anteriores ao bloqueio, permitindo avaliar o desempenho real do servidor.

interface PreBlockingData {
  blockSecond: number;
  preHealth: HealthAssessment;
  syntheticResult: TestResult;
}

function getPreBlockingData(result: TestResult): PreBlockingData | null {
  if (!result.protectionReport) return null;

  const blockingPattern = result.protectionReport.behavioralPatterns.find(
    (p) => p.type === "blocking" && p.startSecond !== undefined,
  );

  if (!blockingPattern || blockingPattern.startSecond === undefined)
    return null;

  const blockSecond = blockingPattern.startSecond;
  const preBlockTimeline = result.timeline.filter(
    (s) => s.second < blockSecond,
  );

  if (preBlockTimeline.length < 2) return null;

  const totalReqs = preBlockTimeline.reduce((sum, s) => sum + s.requests, 0);
  const totalErrs = preBlockTimeline.reduce((sum, s) => sum + s.errors, 0);
  const safeTotalReqs = Math.max(totalReqs, 1);

  const preErrorRate =
    totalReqs > 0 ? Math.round((totalErrs / totalReqs) * 10000) / 100 : 0;
  const preTotalBytes = preBlockTimeline.reduce(
    (sum, s) => sum + s.bytesReceived,
    0,
  );

  const preAvg =
    preBlockTimeline.reduce((sum, s) => sum + s.latencyAvg * s.requests, 0) /
    safeTotalReqs;
  const preP50 =
    preBlockTimeline.reduce((sum, s) => sum + s.latencyP50 * s.requests, 0) /
    safeTotalReqs;
  const preP90 =
    preBlockTimeline.reduce((sum, s) => sum + s.latencyP90 * s.requests, 0) /
    safeTotalReqs;
  const preP95 =
    preBlockTimeline.reduce((sum, s) => sum + s.latencyP95 * s.requests, 0) /
    safeTotalReqs;
  const preP99 =
    preBlockTimeline.reduce((sum, s) => sum + s.latencyP99 * s.requests, 0) /
    safeTotalReqs;

  const nonEmptySeconds = preBlockTimeline.filter((s) => s.requests > 0);
  const preMin =
    nonEmptySeconds.length > 0
      ? Math.min(...nonEmptySeconds.map((s) => s.latencyMin))
      : 0;
  const preMax =
    nonEmptySeconds.length > 0
      ? Math.max(...nonEmptySeconds.map((s) => s.latencyMax))
      : 0;

  const preStatusCodes: Record<string, number> = {};
  for (const second of preBlockTimeline) {
    for (const [code, count] of Object.entries(second.statusCodes)) {
      preStatusCodes[code] = (preStatusCodes[code] || 0) + count;
    }
  }

  const syntheticResult: TestResult = {
    ...result,
    errorRate: preErrorRate,
    totalBytes: preTotalBytes,
    totalRequests: totalReqs,
    totalErrors: totalErrs,
    statusCodes: preStatusCodes,
    latency: {
      avg: preAvg,
      min: preMin,
      p50: preP50,
      p90: preP90,
      p95: preP95,
      p99: preP99,
      max: preMax,
    },
  };

  return {
    blockSecond,
    preHealth: getHealthScore(syntheticResult),
    syntheticResult,
  };
}

/**
 * Adiciona a seção de avaliação pré/pós bloqueio ao relatório.
 * Quando proteção é detectada, exibe o score pré-bloqueio de forma
 * proeminente com contexto explicativo sobre o que aconteceu.
 */
function addPreBlockingScore(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  let y = startY;

  const preBlockData = getPreBlockingData(result);
  if (!preBlockData) return y;

  y = ensureSpace(doc, y, 70, pageHeight);

  // --- Subtitulo da subseção ---
  y = drawSubsectionTitle(doc, "Avaliação antes do bloqueio", y);

  // --- Texto explicativo de contexto ---
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  const explainText =
    `A proteção do site bloqueou o tráfego a partir do segundo ${preBlockData.blockSecond}. ` +
    `O score abaixo considera apenas os ${preBlockData.blockSecond - 1} segundos anteriores ao bloqueio, ` +
    `representando o desempenho real do servidor sob carga legítima. ` +
    `A queda na nota geral (acima) é causada pelo bloqueio e não indica problema no site.`;
  const explainLines = doc.splitTextToSize(
    explainText,
    contentWidth,
  ) as string[];
  doc.text(explainLines, PAGE_MARGIN, y);
  y += explainLines.length * 4.5 + 5;

  // --- Card do score pré-bloqueio (proeminente) ---
  doc.setFillColor(...BG_CARD);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, "F");
  doc.setDrawColor(...preBlockData.preHealth.color);
  doc.setLineWidth(0.6);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, 30, 2, 2, "S");

  // Label
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Score pré-bloqueio (até segundo ${preBlockData.blockSecond - 1}):`,
    PAGE_MARGIN + 4,
    y + 8,
  );

  // Barra de progresso
  const preBarWidth = contentWidth - 80;
  const preBarX = PAGE_MARGIN + 70;
  doc.setFillColor(...BORDER_LIGHT);
  doc.roundedRect(preBarX, y + 4, preBarWidth, 8, 2, 2, "F");
  doc.setFillColor(...preBlockData.preHealth.color);
  doc.roundedRect(
    preBarX,
    y + 4,
    preBarWidth * (preBlockData.preHealth.score / 100),
    8,
    2,
    2,
    "F",
  );

  // Score e label
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...preBlockData.preHealth.color);
  doc.text(
    `${preBlockData.preHealth.score}/100 - ${preBlockData.preHealth.label}`,
    PAGE_MARGIN + 4,
    y + 24,
  );

  // Recomendação do score pré-bloqueio
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_FAINT);
  doc.setFont("helvetica", "normal");
  doc.text(preBlockData.preHealth.recommendation, PAGE_MARGIN + 60, y + 24);

  y += 36;

  return y;
}

// ============================================================================
// Seção: Gráficos de Evolução do Teste
// ============================================================================
// Os gráficos mostram como o site se comportou ao longo do tempo durante
// o teste. São imagens capturadas da interface e inseridas no PDF.

function addCharts(
  doc: jsPDF,
  chartImages: { rps?: string; latency?: string; errors?: string },
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  let y = startY;

  // Verificar se há pelo menos um gráfico para exibir
  if (!chartImages.rps && !chartImages.latency && !chartImages.errors) {
    return y;
  }

  y = drawSectionTitle(doc, "Evolução do Teste", y);

  const chartHeight = 45;

  // Gráfico de Requests por Segundo (RPS)
  if (chartImages.rps) {
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "Requests por Segundo (RPS) — Quantidade de acessos processados a cada segundo",
      PAGE_MARGIN,
      y,
    );
    y += 3;
    try {
      doc.addImage(
        chartImages.rps,
        "PNG",
        PAGE_MARGIN,
        y,
        contentWidth,
        chartHeight,
      );
    } catch {
      /* Falha ao inserir imagem do gráfico - continua sem ele */
    }
    y += chartHeight + 8;
  }

  // Verificar espaço antes do próximo gráfico
  y = ensureSpace(doc, y, chartHeight + 20, pageHeight);

  // Gráfico de Latência
  if (chartImages.latency) {
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "Latência (ms) — Tempo de resposta do site ao longo do teste",
      PAGE_MARGIN,
      y,
    );
    y += 3;
    try {
      doc.addImage(
        chartImages.latency,
        "PNG",
        PAGE_MARGIN,
        y,
        contentWidth,
        chartHeight,
      );
    } catch {
      /* Falha ao inserir imagem do gráfico - continua sem ele */
    }
    y += chartHeight + 8;
  }

  // Verificar espaço antes do próximo gráfico
  y = ensureSpace(doc, y, chartHeight + 20, pageHeight);

  // Gráfico de Erros por Segundo
  if (chartImages.errors) {
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "Erros por Segundo — Quantidade de falhas a cada segundo",
      PAGE_MARGIN,
      y,
    );
    y += 3;
    try {
      doc.addImage(
        chartImages.errors,
        "PNG",
        PAGE_MARGIN,
        y,
        contentWidth,
        chartHeight,
      );
    } catch {
      /* Falha ao inserir imagem do gráfico - continua sem ele */
    }
    y += chartHeight + 8;
  }

  return y;
}

// ============================================================================
// Seção: Métricas Detalhadas e Códigos de Status
// ============================================================================
// Estas tabelas apresentam todos os números do teste de forma completa.
// São voltadas para leitores técnicos que precisam dos dados brutos.

function addDetailedMetrics(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  _contentWidth: number,
  pageHeight: number,
): number {
  let y = ensureSpace(doc, startY, 60, pageHeight);

  y = drawSectionTitle(doc, "Métricas Detalhadas", y);

  // Tabela principal de métricas
  // Cada linha inclui o nome da métrica e uma breve explicação
  autoTable(doc, {
    startY: y,
    head: [["Métrica", "Valor"]],
    body: [
      [
        "Latência Média — Tempo médio de resposta",
        formatMs(result.latency.avg),
      ],
      [
        "Latência Mínima — Resposta mais rápida registrada",
        formatMs(result.latency.min),
      ],
      [
        "Latência P50 — Metade dos acessos respondeu neste tempo",
        formatMs(result.latency.p50),
      ],
      [
        "Latência P90 — 90% dos acessos responderam neste tempo",
        formatMs(result.latency.p90),
      ],
      [
        "Latência P95 — 95% dos acessos responderam neste tempo",
        formatMs(result.latency.p95),
      ],
      [
        "Latência P99 — 99% dos acessos responderam neste tempo",
        formatMs(result.latency.p99),
      ],
      [
        "Latência Máxima — Resposta mais lenta registrada",
        formatMs(result.latency.max),
      ],
      [
        "RPS — Acessos processados por segundo",
        result.rps.toLocaleString("pt-BR"),
      ],
      [
        "Total de Requests — Total de acessos realizados",
        result.totalRequests.toLocaleString("pt-BR"),
      ],
      [
        "Total de Erros — Acessos que falharam",
        result.totalErrors.toLocaleString("pt-BR"),
      ],
      ["Taxa de Erro — Porcentagem de falhas", `${result.errorRate}%`],
      [
        "Throughput — Dados transferidos por segundo",
        `${formatBytes(result.throughputBytesPerSec)}/s`,
      ],
      [
        "Total de Dados — Volume total transferido",
        formatBytes(result.totalBytes),
      ],
      [
        "Duração Real — Tempo total do teste",
        `${result.durationSeconds}s`,
      ],
    ],
    ...TABLE_STYLES,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y = getLastTableY(doc, y + 80) + 10;

  // --- Tabela de Status Codes HTTP ---
  // Os códigos de status indicam como o servidor respondeu a cada acesso.
  const statusCodesEntries = Object.entries(result.statusCodes);

  if (statusCodesEntries.length > 0) {
    let statusY = y;

    statusY = ensureSpace(doc, statusY, 40, pageHeight);

    statusY = drawSectionTitle(
      doc,
      "Status Codes HTTP — Códigos de resposta do site",
      statusY,
    );

    autoTable(doc, {
      startY: statusY,
      head: [["Status Code", "Quantidade", "Porcentagem"]],
      body: statusCodesEntries.map(([code, count]) => [
        code,
        (count as number).toLocaleString("pt-BR"),
        result.totalRequests > 0
          ? `${(((count as number) / result.totalRequests) * 100).toFixed(2)}%`
          : "0%",
      ]),
      ...TABLE_STYLES,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y = getLastTableY(doc, statusY + 30) + 10;
  }

  return y;
}

// ============================================================================
// Seção: Métricas por Operação (Multi-Operação)
// ============================================================================
// Quando o teste é executado com fluxo multi-operação, esta seção detalha
// desempenho por etapa e, quando disponível, consistência de sessão.

function addOperationMetrics(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  contentWidth: number,
  pageHeight: number,
): number {
  if (
    !result.operationMetrics ||
    Object.keys(result.operationMetrics).length === 0
  ) {
    return startY;
  }

  let y = ensureSpace(doc, startY, 50, pageHeight);
  y = drawSectionTitle(doc, "Fluxo por Operação", y);

  const operations = Object.values(result.operationMetrics);
  const hasSessionMetrics = operations.some((op) => !!op.sessionMetrics);

  const head = hasSessionMetrics
    ? [
        [
          "Operação",
          "Reqs",
          "RPS",
          "Lat. Média",
          "P95",
          "Erros",
          "Taxa",
          "Autent.",
          "Falhas Sessão",
          "Consistência",
        ],
      ]
    : [["Operação", "Reqs", "RPS", "Lat. Média", "P95", "Erros", "Taxa"]];

  const body = operations.map((op) => {
    const baseRow = [
      op.name,
      op.totalRequests.toLocaleString("pt-BR"),
      op.rps.toLocaleString("pt-BR"),
      formatMs(op.latency.avg),
      formatMs(op.latency.p95),
      op.totalErrors.toLocaleString("pt-BR"),
      `${op.errorRate}%`,
    ];

    if (!hasSessionMetrics) {
      return baseRow;
    }

    const session = op.sessionMetrics;
    return [
      ...baseRow,
      session ? session.authenticatedRequests.toLocaleString("pt-BR") : "-",
      session
        ? `${session.sessionFailures.toLocaleString("pt-BR")}${
            session.sessionExpiredErrors > 0
              ? ` (${session.sessionExpiredErrors} exp.)`
              : ""
          }`
        : "-",
      session ? `${session.consistencyScore}%` : "-",
    ];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    ...TABLE_STYLES,
    styles: {
      ...TABLE_STYLES.styles,
      fontSize: hasSessionMetrics ? 7 : 8,
      cellPadding: hasSessionMetrics ? 2.5 : 3,
    },
    headStyles: {
      ...TABLE_STYLES.headStyles,
      fontSize: hasSessionMetrics ? 8 : 9,
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    columnStyles: hasSessionMetrics
      ? {
          0: { cellWidth: 34 },
          1: { cellWidth: 12, halign: "right" },
          2: { cellWidth: 12, halign: "right" },
          3: { cellWidth: 15, halign: "right" },
          4: { cellWidth: 12, halign: "right" },
          5: { cellWidth: 12, halign: "right" },
          6: { cellWidth: 11, halign: "right" },
          7: { cellWidth: 14, halign: "right" },
          8: { cellWidth: 18, halign: "right" },
          9: { cellWidth: 15, halign: "right" },
        }
      : {
          0: { cellWidth: 48 },
          1: { cellWidth: 20, halign: "right" },
          2: { cellWidth: 20, halign: "right" },
          3: { cellWidth: 25, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 20, halign: "right" },
        },
  });

  y = getLastTableY(doc, y + 30) + 6;

  if (hasSessionMetrics) {
    // ---- Interpretação executiva de consistência de sessão ----
    // Classifica as operações por severidade e gera um bloco contextual
    // com cor, título e texto de impacto de negócio, além do footnote técnico.

    const criticalOps = operations.filter(
      (op) => op.sessionMetrics && op.sessionMetrics.consistencyScore < 85,
    );
    const warningOps = operations.filter(
      (op) =>
        op.sessionMetrics &&
        op.sessionMetrics.consistencyScore >= 85 &&
        op.sessionMetrics.consistencyScore < 95,
    );

    let boxBg: [number, number, number];
    let boxBorder: [number, number, number];
    let boxTitle: string;
    let boxBody: string;

    if (criticalOps.length > 0) {
      boxBg = [255, 236, 236];
      boxBorder = COLOR_DANGER;
      boxTitle = `Alerta Crítico de Sessão: ${criticalOps.length} operação(ões) com consistência crítica (<85%)`;
      const names = criticalOps.map((op) => op.name).join(", ");
      boxBody =
        `As operações [${names}] apresentaram perda frequente de autenticação durante o fluxo. ` +
        `Usuários reais poderiam ser desconectados em meio a operações críticas, ` +
        `causando transações incompletas, perda de dados e retrabalho operacional no sistema.`;
    } else if (warningOps.length > 0) {
      boxBg = [255, 251, 230];
      boxBorder = COLOR_WARNING;
      boxTitle = `Atenção: ${warningOps.length} operação(ões) com consistência degradada (85-94%)`;
      const names = warningOps.map((op) => op.name).join(", ");
      boxBody =
        `As operações [${names}] apresentaram instabilidade intermitente de sessão. ` +
        `Embora não crítico, recomenda-se monitorar este comportamento em produção ` +
        `com cargas elevadas, pois pode impactar fluxos dependentes de autenticação contínua.`;
    } else {
      boxBg = [231, 255, 240];
      boxBorder = COLOR_SUCCESS;
      boxTitle =
        "Sessões Estáveis: consistência aceitável (>=95%) em todas as operações";
      boxBody =
        `Todas as operações com métricas de sessão atingiram consistência igual ou superior a 95%, ` +
        `indicando que a autenticação foi preservada confiavelmente ao longo do fluxo multi-operação simulado. ` +
        `O sistema demonstra estabilidade de sessão adequada para os níveis de carga testados.`;
    }

    // Calcula altura necessária para o bloco (título + corpo + padding)
    const boxPadX = 4;
    const boxPadY = 4;
    const boxWidth = contentWidth;
    const titleLines = doc.splitTextToSize(boxTitle, boxWidth - boxPadX * 2);
    const bodyLines = doc.splitTextToSize(boxBody, boxWidth - boxPadX * 2);
    const titleLineHeight = 4.5;
    const bodyLineHeight = 4;
    const boxHeight =
      boxPadY * 2 +
      titleLines.length * titleLineHeight +
      2 +
      bodyLines.length * bodyLineHeight;

    y = ensureSpace(doc, y, boxHeight + 8, pageHeight);

    // Fundo e borda do box
    doc.setFillColor(...boxBg);
    doc.setDrawColor(...boxBorder);
    doc.setLineWidth(0.4);
    doc.roundedRect(PAGE_MARGIN, y, boxWidth, boxHeight, 2, 2, "FD");

    // Título em negrito
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(
      titleLines,
      PAGE_MARGIN + boxPadX,
      y + boxPadY + titleLineHeight - 1,
    );
    const afterTitle = y + boxPadY + titleLines.length * titleLineHeight + 2;

    // Corpo em regular
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(bodyLines, PAGE_MARGIN + boxPadX, afterTitle + bodyLineHeight - 1);

    y += boxHeight + 5;

    // Footnote técnico
    y = ensureSpace(doc, y, 10, pageHeight);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "Consistência de sessão = % de requisições com autenticação válida / total de requisições autenticadas esperadas.",
      PAGE_MARGIN,
      y,
    );
    y += 5;
  }

  return y;
}

// ============================================================================
// Seção: Análise de Proteção
// ============================================================================
// Quando o teste detecta que o site possui camadas de proteção ativas
// (WAF, CDN, Rate Limiting, Anti-Bot, etc.), esta seção detalha cada
// proteção encontrada e como ela afetou os resultados do teste.

function addProtectionSection(
  doc: jsPDF,
  report: ProtectionReport,
  contentWidth: number,
  pageHeight: number,
): void {
  doc.addPage();
  drawPageBackground(doc);
  let y = 20;

  y = drawSectionTitle(doc, "Análise de Proteção", y);

  // --- Card do nivel de risco geral ---
  const riskColor = RISK_COLORS[report.overallRisk] ?? RISK_COLORS.none;
  const riskLabel = RISK_LABELS[report.overallRisk] ?? "Desconhecido";

  // Calcular linhas do resumo antes de desenhar o card para ajustar a altura
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const summaryLines = doc.splitTextToSize(
    report.summary,
    contentWidth - 8,
  ) as string[];
  const riskCardHeight = Math.max(24, 20 + summaryLines.length * 3 + 1);

  doc.setFillColor(...BG_CARD);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, riskCardHeight, 2, 2, "F");
  doc.setDrawColor(...BORDER_LIGHT);
  doc.roundedRect(PAGE_MARGIN, y, contentWidth, riskCardHeight, 2, 2, "S");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Nível de Risco:", PAGE_MARGIN + 4, y + 10);

  // Badge do risco
  doc.setFillColor(...riskColor);
  doc.roundedRect(PAGE_MARGIN + 42, y + 3, 30, 11, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(riskLabel, PAGE_MARGIN + 57, y + 10, { align: "center" });

  // Resumo textual
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont("helvetica", "normal");
  doc.text(summaryLines, PAGE_MARGIN + 4, y + 20);
  y += riskCardHeight + 4;

  // --- Tabela de protecoes detectadas ---
  if (report.detections.length > 0) {
    y = ensureSpace(doc, y, 40, pageHeight);
    y = drawSectionTitle(doc, "Proteções Detectadas", y);

    autoTable(doc, {
      startY: y,
      head: [["Provedor", "Tipo", "Confianca", "Indicadores"]],
      body: report.detections.map((detection) => [
        detection.provider !== "unknown"
          ? detection.provider.charAt(0).toUpperCase() +
            detection.provider.slice(1)
          : "—",
        PROTECTION_TYPE_LABELS[detection.type] ?? detection.type,
        `${detection.confidence}% (${
          detection.confidenceLevel === "high"
            ? "Alta"
            : detection.confidenceLevel === "medium"
              ? "Média"
              : "Baixa"
        })`,
        detection.indicators
          .map((ind) => `${ind.source}: ${ind.name}`)
          .join(", "),
      ]),
      ...TABLE_STYLES,
      headStyles: {
        ...TABLE_STYLES.headStyles,
        fontSize: 9,
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: contentWidth - 88 },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y = getLastTableY(doc, y + 40) + 8;
  }

  // --- Rate Limiting ---
  // Mostra informações sobre limite de requisições, se detectado.
  if (report.rateLimitInfo.detected) {
    y = ensureSpace(doc, y, 30, pageHeight);
    y = drawSectionTitle(doc, "Rate Limiting", y);

    const rateLimitData: [string, string][] = [["Status", "Detectado"]];

    if (report.rateLimitInfo.limitPerWindow) {
      rateLimitData.push([
        "Limite por Janela",
        report.rateLimitInfo.limitPerWindow,
      ]);
    }
    if (report.rateLimitInfo.windowSeconds !== undefined) {
      rateLimitData.push([
        "Janela (segundos)",
        String(report.rateLimitInfo.windowSeconds),
      ]);
    }
    if (report.rateLimitInfo.triggerPoint !== undefined) {
      rateLimitData.push([
        "Ativado no Segundo",
        String(report.rateLimitInfo.triggerPoint),
      ]);
    }
    if (report.rateLimitInfo.recoveryPattern) {
      rateLimitData.push([
        "Padrão de Recuperação",
        report.rateLimitInfo.recoveryPattern,
      ]);
    }

    autoTable(doc, {
      startY: y,
      head: [["Parâmetro", "Valor"]],
      body: rateLimitData,
      ...TABLE_STYLES,
      headStyles: {
        fillColor: COLOR_WARNING,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: "bold" as const,
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y = getLastTableY(doc, y + 30) + 8;
  }

  // --- Padrões comportamentais anomalos ---
  // Detecta comportamentos como throttling, bloqueio e degradação
  // que indicam interferência de proteção nos resultados.
  const anomalies = report.behavioralPatterns.filter(
    (b) => b.type !== "normal",
  );

  if (anomalies.length > 0) {
    y = ensureSpace(doc, y, 30, pageHeight);
    y = drawSectionTitle(doc, "Padrões Comportamentais", y);

    autoTable(doc, {
      startY: y,
      head: [["Tipo", "Descrição", "Evidência"]],
      body: anomalies.map((pattern) => [
        BEHAVIORAL_PATTERN_LABELS[pattern.type] ?? pattern.type,
        pattern.description,
        pattern.evidence,
      ]),
      ...TABLE_STYLES,
      headStyles: {
        fillColor: COLOR_ORANGE,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: "bold" as const,
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: contentWidth - 65 },
        2: { cellWidth: 40 },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
  }
}

// ============================================================================
// Seção: Conclusão e Recomendações
// ============================================================================
// As recomendações são priorizadas por urgência (vermelho), importância
// (amarelo) e informativo (azul). Cada recomendação inclui uma explicação
// acessível para que qualquer leitor entenda o que precisa ser feito.

/** Estrutura de uma recomendação no relatório */
interface Recommendation {
  text: string;
  priority: "urgent" | "important" | "info";
}

function addRecommendations(
  doc: jsPDF,
  result: TestResult,
  contentWidth: number,
  pageHeight: number,
): number {
  doc.addPage();
  drawPageBackground(doc);
  let y = 20;

  y = drawSectionTitle(doc, "Conclusão e Recomendações", y);

  // --- Gerar recomendações baseadas nos resultados ---
  const recommendations = buildRecommendations(result);

  // --- Desenhar cada recomendação ---
  for (const rec of recommendations) {
    y = ensureSpace(doc, y, 8, pageHeight);

    // Separador para recomendações gerais
    if (rec.text === "") {
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TEXT_PRIMARY);
      doc.text("Recomendações gerais:", PAGE_MARGIN, y);
      y += 6;
      continue;
    }

    // Indicador de prioridade (circulo colorido)
    const color = PRIORITY_COLORS[rec.priority];
    doc.setFillColor(...color);
    doc.circle(PAGE_MARGIN + 2, y - 1.5, 1.5, "F");

    // Texto da recomendação
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(rec.text, contentWidth - 8) as string[];
    doc.text(lines, PAGE_MARGIN + 7, y);
    y += lines.length * 4.5 + 3;
  }

  // --- Legenda de prioridades ---
  y += 4;
  if (y + 10 < pageHeight - 20) {
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_FAINT);

    doc.setFillColor(...COLOR_DANGER);
    doc.circle(PAGE_MARGIN + 2, y - 1, 1.2, "F");
    doc.text("Urgente", PAGE_MARGIN + 6, y);

    doc.setFillColor(...COLOR_WARNING);
    doc.circle(PAGE_MARGIN + 30, y - 1, 1.2, "F");
    doc.text("Importante", PAGE_MARGIN + 34, y);

    doc.setFillColor(...COLOR_INFO);
    doc.circle(PAGE_MARGIN + 62, y - 1, 1.2, "F");
    doc.text("Informativo", PAGE_MARGIN + 66, y);

    y += 8;
  }

  return y;
}

/**
 * Constrói a lista completa de recomendações baseada nos resultados do teste.
 *
 * As recomendações são divididas em:
 *   1. Recomendações específicas (baseadas nos problemas detectados)
 *   2. Recomendações gerais (boas práticas aplicáveis a qualquer site)
 */
function buildRecommendations(result: TestResult): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // --- Recomendações específicas baseadas nos problemas detectados ---

  if (result.errorRate > 5) {
    recommendations.push({
      text: `Taxa de erro de ${result.errorRate}%. Aumente recursos do servidor ou investigue gargalos de conexão.`,
      priority: "urgent",
    });
  }

  if (result.latency.p95 > 2000) {
    recommendations.push({
      text: `Latência P95 de ${formatMs(result.latency.p95)}. Otimize queries, habilite cache e compressão.`,
      priority: "urgent",
    });
  }

  if (result.latency.p99 / Math.max(result.latency.p50, 1) > 10) {
    recommendations.push({
      text: "Disparidade de latência (P99/P50 > 10x). Investigue picos intermitentes, GC e lock contention.",
      priority: "important",
    });
  }

  if (result.rps < result.config.virtualUsers * 0.5) {
    recommendations.push({
      text: `RPS (${result.rps}) abaixo do esperado para ${result.config.virtualUsers} VUs. Servidor não absorve a carga.`,
      priority: "urgent",
    });
  }

  const hasServerErrors = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) >= 500,
  );
  if (hasServerErrors) {
    recommendations.push({
      text: "Erros 5xx detectados. Revise logs do servidor e estabilidade da aplicação.",
      priority: "urgent",
    });
  }

  const hasRateLimiting = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) === 429,
  );
  if (hasRateLimiting) {
    recommendations.push({
      text: "Rate limiting ativo (HTTP 429). Solicite whitelist do IP de teste ou aumente o limite.",
      priority: "important",
    });
  }

  if (result.protectionReport) {
    const pr = result.protectionReport;

    if (pr.overallRisk === "high" || pr.overallRisk === "critical") {
      recommendations.push({
        text: "Proteções ativas interferindo nos resultados. Libere o IP de teste para avaliação real.",
        priority: "important",
      });
    }

    const providers = [
      ...new Set(
        pr.detections
          .filter((d) => d.provider !== "unknown")
          .map((d) => d.provider),
      ),
    ];
    if (providers.length > 0) {
      recommendations.push({
        text: `Proteção detectada: ${providers.join(", ")}. Solicite whitelist para resultados precisos.`,
        priority: "info",
      });
    }

    if (pr.rateLimitInfo.detected) {
      recommendations.push({
        text: "Rate limiter do provedor ativo. Reduza VUs ou solicite aumento temporário do limite.",
        priority: "important",
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      text: "Site estável sob a carga testada. Nenhum problema detectado.",
      priority: "info",
    });
    recommendations.push({
      text: "Teste com mais VUs para identificar o ponto de ruptura.",
      priority: "info",
    });
  }

  // --- Recomendações gerais ---
  recommendations.push({ text: "", priority: "info" });

  recommendations.push({
    text: "Monitore performance em produção para detectar degradações precocemente.",
    priority: "info",
  });
  recommendations.push({
    text: "Repita testes periodicamente, especialmente antes de campanhas e picos de tráfego.",
    priority: "info",
  });

  return recommendations;
}

// ============================================================================
// Seção: Erros Detalhados
// ============================================================================
// Lista os erros individuais registrados durante o teste, agrupados por
// tipo e com detalhes de cada ocorrência. Limitado a 100 registros para
// manter o PDF em tamanho razoável.

/** Labels em português para os tipos de erro */
const ERROR_TYPE_LABELS: Record<string, string> = {
  http: "Erro HTTP",
  timeout: "Timeout",
  connection: "Conexão",
  dns: "DNS",
  unknown: "Desconhecido",
};

function addDetailedErrors(
  doc: jsPDF,
  errors: ErrorRecord[],
  result: TestResult,
  contentWidth: number,
  pageHeight: number,
): number {
  doc.addPage();
  drawPageBackground(doc);
  let y = drawSectionTitle(doc, "Erros Detalhados", 20);

  // Resumo geral de erros
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  const totalErrors = result.totalErrors;
  const shownCount = Math.min(errors.length, 100);
  doc.text(
    `${totalErrors.toLocaleString("pt-BR")} erro${totalErrors !== 1 ? "s" : ""} registrado${totalErrors !== 1 ? "s" : ""} no total — exibindo ${shownCount} registro${shownCount !== 1 ? "s" : ""} mais recentes.`,
    PAGE_MARGIN,
    y,
  );
  y += 10;

  // Resumo por tipo de erro
  const byType: Record<string, number> = {};
  for (const err of errors) {
    byType[err.errorType] = (byType[err.errorType] || 0) + 1;
  }

  const typeSummary = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => [
      ERROR_TYPE_LABELS[type] || type,
      count.toLocaleString("pt-BR"),
      `${((count / errors.length) * 100).toFixed(1)}%`,
    ]);

  if (typeSummary.length > 0) {
    y = drawSubsectionTitle(doc, "Distribuição por Tipo", y);

    autoTable(doc, {
      startY: y,
      head: [["Tipo de Erro", "Quantidade", "Proporção"]],
      body: typeSummary,
      ...TABLE_STYLES,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.4 },
        1: { cellWidth: contentWidth * 0.3, halign: "center" },
        2: { cellWidth: contentWidth * 0.3, halign: "center" },
      },
    });
    y = getLastTableY(doc, y + 30) + 10;
  }

  // Resumo por código de status HTTP
  const byStatus: Record<string, number> = {};
  for (const err of errors) {
    if (err.statusCode > 0) {
      byStatus[String(err.statusCode)] =
        (byStatus[String(err.statusCode)] || 0) + 1;
    }
  }

  const statusSummary = Object.entries(byStatus)
    .sort(([, a], [, b]) => b - a)
    .map(([code, count]) => [
      code,
      count.toLocaleString("pt-BR"),
      `${((count / errors.length) * 100).toFixed(1)}%`,
    ]);

  if (statusSummary.length > 0) {
    y = ensureSpace(doc, y, 40, pageHeight);
    if (y < 25) {
      drawPageBackground(doc);
      y = 20;
    }
    y = drawSubsectionTitle(
      doc,
      "Distribuição por Código HTTP",
      y,
    );

    autoTable(doc, {
      startY: y,
      head: [["Status HTTP", "Quantidade", "Proporção"]],
      body: statusSummary,
      ...TABLE_STYLES,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.4 },
        1: { cellWidth: contentWidth * 0.3, halign: "center" },
        2: { cellWidth: contentWidth * 0.3, halign: "center" },
      },
    });
    y = getLastTableY(doc, y + 30) + 10;
  }

  // Tabela de erros individuais (top 100)
  const limitedErrors = errors.slice(0, 100);
  y = ensureSpace(doc, y, 60, pageHeight);
  if (y < 25) {
    drawPageBackground(doc);
    y = 20;
  }
  y = drawSubsectionTitle(doc, "Registros Individuais", y);

  const errorRows = limitedErrors.map((err) => [
    format(new Date(err.timestamp), "HH:mm:ss", { locale: ptBR }),
    err.operationName || "—",
    err.statusCode > 0 ? String(err.statusCode) : "—",
    ERROR_TYPE_LABELS[err.errorType] || err.errorType,
    (err.message || "").substring(0, 60) +
      (err.message && err.message.length > 60 ? "…" : ""),
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ["Horário", "Operação", "Status", "Tipo", "Mensagem"],
    ],
    body: errorRows,
    ...TABLE_STYLES,
    styles: {
      ...TABLE_STYLES.styles,
      fontSize: 8,
      cellPadding: 3,
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 30 },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 22 },
      4: { cellWidth: contentWidth - 85 },
    },
    didDrawPage: () => {
      drawPageBackground(doc);
    },
  });
  y = getLastTableY(doc, y + 30) + 10;

  return y;
}

// ============================================================================
// Seção: Configuração do Teste
// ============================================================================
// Registra todos os parâmetros usados no teste para fins de auditoria
// e reprodutibilidade.

function addTestConfiguration(
  doc: jsPDF,
  result: TestResult,
  startY: number,
  pageHeight: number,
): void {
  let y = startY + 10;

  y = ensureSpace(doc, y, 40, pageHeight);

  y = drawSectionTitle(doc, "Configuração do Teste", y);

  autoTable(doc, {
    startY: y,
    head: [["Parâmetro", "Valor"]],
    body: [
      ["URL", result.url],
      ["Método HTTP", result.config.method],
      ["Usuários Virtuais", String(result.config.virtualUsers)],
      ["Duração Configurada", `${result.config.duration}s`],
      [
        "Ramp-up",
        result.config.rampUp ? `${result.config.rampUp}s` : "Desabilitado",
      ],
      [
        "Início",
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
          ? "Concluído"
          : result.status === "cancelled"
            ? "Cancelado"
            : "Erro",
      ],
    ],
    ...TABLE_STYLES,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
}

// ============================================================================
// Seção: Glossário de Termos Técnicos
// ============================================================================
// O glossário explica de forma acessível todos os termos técnicos usados
// no relatório. Cada definição usa linguagem simples e analogias do
// dia a dia para facilitar a compreensao por leitores não-técnicos.

function addGlossary(doc: jsPDF, contentWidth: number): void {
  doc.addPage();
  drawPageBackground(doc);
  let y = 20;

  y = drawSectionTitle(doc, "Glossário", y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    "Explicação dos termos técnicos utilizados neste relatório.",
    PAGE_MARGIN,
    y,
  );
  y += 8;

  // Cada entrada do glossário: [Termo, Explicação em linguagem simples]
  const glossaryData: [string, string][] = [
    [
      "Latência",
      "Tempo que o site leva para responder após receber uma solicitação. " +
        "É como o tempo de espera na fila de um atendimento — quanto menor, melhor.",
    ],
    [
      "Latência Média",
      "A média de todos os tempos de resposta durante o teste. " +
        'Representa o tempo "típico" que um usuário espera ao acessar o site.',
    ],
    [
      "P50 (mediana)",
      "Metade dos acessos foi respondida em menos que este tempo. " +
        "Representa a experiência típica de um usuário comum.",
    ],
    [
      "P90",
      "90% dos acessos foram respondidos em menos que este tempo. " +
        "Mostra a experiência da grande maioria dos usuários.",
    ],
    [
      "P95",
      "95% dos acessos foram respondidos em menos que este tempo. " +
        "Os 5% restantes foram mais lentos, possivelmente por picos de carga.",
    ],
    [
      "P99",
      "99% dos acessos foram respondidos em menos que este tempo. " +
        "Apenas 1% dos acessos foi mais lento — mostra os piores cenários.",
    ],
    [
      "RPS (Requests/s)",
      "Quantidade de solicitações que o site processou por segundo. " +
        "Quanto maior, mais acessos simultâneos o site consegue atender.",
    ],
    [
      "Taxa de Erro",
      "Porcentagem de acessos que falharam durante o teste. " +
        "Idealmente deve ser próxima de 0%. Acima de 5% indica problemas.",
    ],
    [
      "Throughput",
      "Volume de dados transferidos por segundo entre o servidor e os usuários. " +
        "Indica quanta informação o site conseguiu entregar no tempo testado.",
    ],
    [
      "Usuários Virtuais",
      "Quantidade de conexões simultâneas simuladas durante o teste. " +
        "Cada usuário virtual envia requisições HTTP em paralelo.",
    ],
    [
      "Status Code HTTP",
      "Código numerico que o servidor retorna indicando o resultado de cada acesso. " +
        "Exemplos: 200 = sucesso, 404 = página não encontrada, 500 = erro do servidor.",
    ],
    [
      "WAF",
      "Web Application Firewall — sistema de segurança que protege o site contra " +
        "ataques. Pode bloquear acessos que parecem suspeitos, incluindo testes de carga.",
    ],
    [
      "CDN",
      "Content Delivery Network — rede de servidores distribuídos pelo mundo que " +
        "acelera a entrega de conteúdo. O usuário recebe dados do servidor mais próximo.",
    ],
    [
      "Rate Limiting",
      "Mecanismo que limita quantos acessos cada usuário pode fazer em um período. " +
        "Protege o site contra sobrecarga, mas pode interferir em testes de estresse.",
    ],
    [
      "Ramp-up",
      "Período de aquecimento no início do teste onde os acessos aumentam gradualmente, " +
        "em vez de começar todos de uma vez. Simula um cenário mais realista.",
    ],
    [
      "DDoS Protection",
      "Sistema de defesa contra ataques de negação de serviço distribuídos. " +
        "Detecta e bloqueia volumes anormais de tráfego para manter o site funcionando.",
    ],
    [
      "Score de Saúde",
      "Nota de 0 a 100 que avalia o desempenho geral do site durante o teste. " +
        "Considera velocidade, estabilidade, taxa de erros e consistência das respostas.",
    ],
    [
      "Teste de Estresse",
      "Simulação de muitos acessos simultâneos ao site para verificar se ele " +
        "consegue funcionar bem sob alta demanda, como em Black Friday ou eventos.",
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Termo", "O que significa"]],
    body: glossaryData,
    ...TABLE_STYLES,
    styles: {
      ...TABLE_STYLES.styles,
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: "bold" },
      1: { cellWidth: contentWidth - 35 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
}

// ============================================================================
// Rodapé de Páginas
// ============================================================================
// Adiciona rodapé com número da página, data e identificação da ferramenta
// em todas as páginas do relatório.

function addPageFooters(doc: jsPDF, result: TestResult): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const formattedDate = format(new Date(result.startTime), "dd/MM/yyyy HH:mm");

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_FAINT);
    doc.text(
      `CPX — MisterT Stress — ${formattedDate} — Página ${i}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" },
    );
  }
}

// ============================================================================
// Função Principal: Gerar o PDF Completo
// ============================================================================
// Esta é a função exportada que orquestra toda a geração do relatório.
// Ela chama cada seção na ordem correta e retorna o PDF como base64.

/**
 * Gera o relatório PDF completo a partir dos resultados do teste de estresse.
 *
 * @param result - Resultado completo do teste (métricas, timeline, etc.)
 * @param chartImages - Imagens dos gráficos capturadas da interface (base64 PNG)
 * @param errorRecords - Registros individuais de erros do banco de dados (opcional)
 * @returns O PDF codificado em base64 (sem o prefixo data URI)
 */
export async function generatePDF(
  result: TestResult,
  chartImages: { rps?: string; latency?: string; errors?: string },
  errorRecords?: ErrorRecord[],
): Promise<string> {
  // Inicializar documento A4 em modo retrato
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // Calcular o score de saúde (métrica central do relatório)
  const health = getHealthScore(result);

  // 1. Capa do relatório
  drawCoverPage(doc, result, health);

  // 2. Resumo simplificado (para leitores não-técnicos)
  addLaypersonSummary(doc, result, health, contentWidth);

  // 3. Resumo executivo com métricas e score
  let y = addExecutiveSummary(doc, result, health, contentWidth, pageHeight);

  // 4. Gráficos de evolução do teste
  y = addCharts(doc, chartImages, y, contentWidth, pageHeight);

  // 5. Métricas detalhadas e códigos de status
  y = addDetailedMetrics(doc, result, y, contentWidth, pageHeight);

  // 6. Fluxo por operação e consistência de sessão (quando aplicável)
  y = addOperationMetrics(doc, result, y, contentWidth, pageHeight);

  // 7. Análise de proteção (se detectada)
  if (result.protectionReport) {
    addProtectionSection(
      doc,
      result.protectionReport,
      contentWidth,
      pageHeight,
    );
  }

  // 8. Conclusões e recomendações priorizadas
  y = addRecommendations(doc, result, contentWidth, pageHeight);

  // 9. Erros detalhados (quando disponíveis)
  if (errorRecords && errorRecords.length > 0) {
    y = addDetailedErrors(doc, errorRecords, result, contentWidth, pageHeight);
  }

  // 10. Configuração do teste (para auditoria)
  addTestConfiguration(doc, result, y, pageHeight);

  // 11. Glossário de termos técnicos
  addGlossary(doc, contentWidth);

  // 12. Rodapé em todas as páginas
  addPageFooters(doc, result);

  // Retornar o PDF como string base64 (sem o prefixo "data:application/pdf;base64,")
  return doc.output("datauristring").split(",")[1];
}
