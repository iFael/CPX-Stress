import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TestResult } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`
  if (ms < 1000) return `${ms.toFixed(2)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function getHealthScore(result: TestResult): {
  score: number
  label: string
  color: [number, number, number]
  recommendation: string
} {
  let score = 100

  if (result.errorRate > 50) score -= 40
  else if (result.errorRate > 20) score -= 30
  else if (result.errorRate > 5) score -= 20
  else if (result.errorRate > 1) score -= 10

  if (result.latency.p95 > 10000) score -= 30
  else if (result.latency.p95 > 5000) score -= 20
  else if (result.latency.p95 > 2000) score -= 15
  else if (result.latency.p95 > 1000) score -= 10
  else if (result.latency.p95 > 500) score -= 5

  const latencyDisparity =
    result.latency.p50 > 0 ? result.latency.p99 / result.latency.p50 : 1
  if (latencyDisparity > 20) score -= 15
  else if (latencyDisparity > 10) score -= 10
  else if (latencyDisparity > 5) score -= 5

  score = Math.max(0, Math.min(100, score))

  if (score >= 80) {
    return {
      score,
      label: 'Excelente',
      color: [34, 197, 94],
      recommendation:
        'O site apresenta performance estável e está preparado para a carga testada.',
    }
  }
  if (score >= 60) {
    return {
      score,
      label: 'Bom',
      color: [59, 130, 246],
      recommendation:
        'O site apresenta performance aceitável, mas pode se beneficiar de otimizações.',
    }
  }
  if (score >= 40) {
    return {
      score,
      label: 'Regular',
      color: [245, 158, 11],
      recommendation:
        'O site apresenta sinais de degradação sob carga. Recomenda-se investigar gargalos.',
    }
  }
  return {
    score,
    label: 'Crítico',
    color: [239, 68, 68],
    recommendation:
      'O site apresenta problemas sérios de performance. Ação imediata é recomendada.',
  }
}

function drawPageBg(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  doc.setFillColor(15, 17, 23)
  doc.rect(0, 0, w, h, 'F')
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, w, 4, 'F')
}

function sectionTitle(doc: jsPDF, title: string, yPos: number, margin: number): number {
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(226, 232, 240)
  doc.text(title, margin, yPos)
  doc.setDrawColor(99, 102, 241)
  doc.setLineWidth(0.8)
  doc.line(margin, yPos + 2, margin + doc.getTextWidth(title), yPos + 2)
  return yPos + 12
}

export async function generatePDF(
  result: TestResult,
  chartImages: { rps?: string; latency?: string; errors?: string }
): Promise<string> {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  const health = getHealthScore(result)

  // ===== COVER PAGE =====
  drawPageBg(doc)

  doc.setFillColor(99, 102, 241)
  doc.circle(pageWidth / 2 - 15, 70, 12, 'F')
  doc.setFillColor(34, 211, 238)
  doc.circle(pageWidth / 2 + 5, 65, 8, 'F')

  doc.setTextColor(226, 232, 240)
  doc.setFontSize(36)
  doc.setFont('helvetica', 'bold')
  doc.text('StressFlow', pageWidth / 2, 105, { align: 'center' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('Relatório de Teste de Estresse', pageWidth / 2, 118, {
    align: 'center',
  })

  doc.setDrawColor(42, 45, 58)
  doc.setLineWidth(0.5)
  doc.line(margin + 30, 135, pageWidth - margin - 30, 135)

  doc.setFontSize(11)
  doc.setTextColor(148, 163, 184)

  const coverInfo = [
    `URL: ${result.url}`,
    `Data: ${format(new Date(result.startTime), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`,
    `Usuários Virtuais: ${result.config.virtualUsers}`,
    `Duração: ${result.config.duration}s`,
  ]

  let coverY = 150
  for (const line of coverInfo) {
    doc.text(line, pageWidth / 2, coverY, { align: 'center' })
    coverY += 8
  }

  coverY += 10
  doc.setFillColor(health.color[0], health.color[1], health.color[2])
  const badgeWidth = 60
  doc.roundedRect(
    pageWidth / 2 - badgeWidth / 2,
    coverY - 6,
    badgeWidth,
    16,
    3,
    3,
    'F'
  )
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`${health.label} (${health.score}/100)`, pageWidth / 2, coverY + 4, {
    align: 'center',
  })

  doc.setTextColor(100, 116, 139)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Gerado por StressFlow v1.0', pageWidth / 2, pageHeight - 15, {
    align: 'center',
  })

  // ===== PAGE 2: EXECUTIVE SUMMARY =====
  doc.addPage()
  drawPageBg(doc)

  let y = 20
  y = sectionTitle(doc, 'Resumo Executivo', y, margin)

  const cardData = [
    {
      label: 'Total de Requests',
      value: result.totalRequests.toLocaleString('pt-BR'),
    },
    {
      label: 'Requests/segundo',
      value: result.rps.toLocaleString('pt-BR'),
    },
    { label: 'Taxa de Erro', value: `${result.errorRate}%` },
    { label: 'Latência Média', value: formatMs(result.latency.avg) },
    { label: 'Latência P95', value: formatMs(result.latency.p95) },
    {
      label: 'Throughput',
      value: `${formatBytes(result.throughputBytesPerSec)}/s`,
    },
  ]

  const cardWidth = (contentWidth - 10) / 3
  const cardHeight = 22

  for (let i = 0; i < cardData.length; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    const cx = margin + col * (cardWidth + 5)
    const cy = y + row * (cardHeight + 5)

    doc.setFillColor(26, 29, 39)
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.setFont('helvetica', 'normal')
    doc.text(cardData[i].label, cx + 4, cy + 8)
    doc.setFontSize(14)
    doc.setTextColor(226, 232, 240)
    doc.setFont('helvetica', 'bold')
    doc.text(cardData[i].value, cx + 4, cy + 18)
  }

  y += Math.ceil(cardData.length / 3) * (cardHeight + 5) + 10

  // Health assessment
  y = sectionTitle(doc, 'Avaliação de Saúde', y, margin)

  doc.setFillColor(26, 29, 39)
  doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'F')

  const barWidth = contentWidth - 80
  const barX = margin + 70
  doc.setFillColor(42, 45, 58)
  doc.roundedRect(barX, y + 6, barWidth, 8, 2, 2, 'F')
  doc.setFillColor(health.color[0], health.color[1], health.color[2])
  doc.roundedRect(
    barX,
    y + 6,
    barWidth * (health.score / 100),
    8,
    2,
    2,
    'F'
  )

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(health.color[0], health.color[1], health.color[2])
  doc.text(`${health.score}`, margin + 8, y + 15)
  doc.setFontSize(8)
  doc.text('/100', margin + 30, y + 15)

  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.text(health.recommendation, margin + 4, y + 26)

  y += 40

  // ===== CHARTS =====
  if (chartImages.rps || chartImages.latency || chartImages.errors) {
    y = sectionTitle(doc, 'Evolução do Teste', y, margin)

    const chartHeight = 45

    if (chartImages.rps) {
      doc.setFontSize(9)
      doc.setTextColor(148, 163, 184)
      doc.text('Requests por Segundo (RPS)', margin, y)
      y += 3
      try {
        doc.addImage(chartImages.rps, 'PNG', margin, y, contentWidth, chartHeight)
      } catch {
        /* chart image failed */
      }
      y += chartHeight + 8
    }

    if (y + chartHeight + 20 > pageHeight) {
      doc.addPage()
      drawPageBg(doc)
      y = 20
    }

    if (chartImages.latency) {
      doc.setFontSize(9)
      doc.setTextColor(148, 163, 184)
      doc.text('Latência (ms)', margin, y)
      y += 3
      try {
        doc.addImage(
          chartImages.latency,
          'PNG',
          margin,
          y,
          contentWidth,
          chartHeight
        )
      } catch {
        /* chart image failed */
      }
      y += chartHeight + 8
    }

    if (y + chartHeight + 20 > pageHeight) {
      doc.addPage()
      drawPageBg(doc)
      y = 20
    }

    if (chartImages.errors) {
      doc.setFontSize(9)
      doc.setTextColor(148, 163, 184)
      doc.text('Erros por Segundo', margin, y)
      y += 3
      try {
        doc.addImage(
          chartImages.errors,
          'PNG',
          margin,
          y,
          contentWidth,
          chartHeight
        )
      } catch {
        /* chart image failed */
      }
      y += chartHeight + 8
    }
  }

  // ===== DETAILED METRICS TABLE =====
  if (y + 60 > pageHeight) {
    doc.addPage()
    drawPageBg(doc)
    y = 20
  }

  y = sectionTitle(doc, 'Métricas Detalhadas', y, margin)

  autoTable(doc, {
    startY: y,
    head: [['Métrica', 'Valor']],
    body: [
      ['Latência Média', formatMs(result.latency.avg)],
      ['Latência Mínima', formatMs(result.latency.min)],
      ['Latência P50 (mediana)', formatMs(result.latency.p50)],
      ['Latência P90', formatMs(result.latency.p90)],
      ['Latência P95', formatMs(result.latency.p95)],
      ['Latência P99', formatMs(result.latency.p99)],
      ['Latência Máxima', formatMs(result.latency.max)],
      ['Requests por Segundo (RPS)', result.rps.toLocaleString('pt-BR')],
      ['Total de Requests', result.totalRequests.toLocaleString('pt-BR')],
      ['Total de Erros', result.totalErrors.toLocaleString('pt-BR')],
      ['Taxa de Erro', `${result.errorRate}%`],
      ['Throughput', `${formatBytes(result.throughputBytesPerSec)}/s`],
      ['Total de Dados Transferidos', formatBytes(result.totalBytes)],
      ['Duração Real', `${result.durationSeconds}s`],
    ],
    theme: 'plain',
    styles: {
      fillColor: [26, 29, 39],
      textColor: [226, 232, 240],
      fontSize: 9,
      cellPadding: 4,
      lineColor: [42, 45, 58],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: [20, 23, 32],
    },
    margin: { left: margin, right: margin },
  })

  // Status codes table
  const statusCodesEntries = Object.entries(result.statusCodes)
  if (statusCodesEntries.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let statusY = ((doc as any).lastAutoTable?.finalY as number) || y + 80
    statusY += 10

    if (statusY + 40 > pageHeight) {
      doc.addPage()
      drawPageBg(doc)
      statusY = 20
    }

    statusY = sectionTitle(doc, 'Status Codes HTTP', statusY, margin)

    autoTable(doc, {
      startY: statusY,
      head: [['Status Code', 'Quantidade', 'Porcentagem']],
      body: statusCodesEntries.map(([code, count]) => [
        code,
        (count as number).toLocaleString('pt-BR'),
        `${(((count as number) / result.totalRequests) * 100).toFixed(2)}%`,
      ]),
      theme: 'plain',
      styles: {
        fillColor: [26, 29, 39],
        textColor: [226, 232, 240],
        fontSize: 9,
        cellPadding: 4,
        lineColor: [42, 45, 58],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [99, 102, 241],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      margin: { left: margin, right: margin },
    })
  }

  // ===== RECOMMENDATIONS PAGE =====
  doc.addPage()
  drawPageBg(doc)
  y = 20

  y = sectionTitle(doc, 'Conclusão e Recomendações', y, margin)

  const recommendations: string[] = []

  if (result.errorRate > 5) {
    recommendations.push(
      '• Alta taxa de erro detectada. Verifique a capacidade do servidor e possíveis gargalos de recursos (CPU, memória, conexões de banco de dados).'
    )
  }
  if (result.latency.p95 > 2000) {
    recommendations.push(
      '• Latência P95 elevada (acima de 2s). Considere implementar cache, otimizar queries e revisar a arquitetura de backend.'
    )
  }
  if (result.latency.p99 / Math.max(result.latency.p50, 1) > 10) {
    recommendations.push(
      '• Grande disparidade entre P50 e P99, indicando comportamento inconsistente. Investigue operações que causam picos de latência.'
    )
  }
  if (result.rps < result.config.virtualUsers * 0.5) {
    recommendations.push(
      '• RPS abaixo do esperado para o número de usuários virtuais. O servidor pode estar saturado ou com throttling.'
    )
  }

  const hasServerErrors = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) >= 500
  )
  if (hasServerErrors) {
    recommendations.push(
      '• Erros 5xx detectados indicando falhas no servidor. Verifique logs do servidor para diagnóstico detalhado.'
    )
  }

  const hasRateLimiting = Object.entries(result.statusCodes).some(
    ([code]) => Number(code) === 429
  )
  if (hasRateLimiting) {
    recommendations.push(
      '• Respostas 429 (Rate Limited) detectadas. O servidor está limitando as requisições. Ajuste o rate limiter ou a capacidade.'
    )
  }

  if (recommendations.length === 0) {
    recommendations.push(
      '• O site demonstrou estabilidade durante o teste de estresse.'
    )
    recommendations.push(
      '• Considere realizar testes com cargas maiores para encontrar o ponto de ruptura.'
    )
    recommendations.push(
      '• Monitore o site continuamente em produção para detectar degradações.'
    )
  }

  recommendations.push('')
  recommendations.push('Recomendações gerais:')
  recommendations.push(
    '• Implemente monitoramento de performance em tempo real (APM).'
  )
  recommendations.push(
    '• Configure auto-scaling para lidar com picos de tráfego.'
  )
  recommendations.push(
    '• Realize testes de estresse periodicamente, especialmente antes de eventos de alto tráfego.'
  )
  recommendations.push(
    '• Utilize CDN para conteúdo estático e cache para respostas frequentes.'
  )

  doc.setFontSize(10)
  doc.setTextColor(200, 210, 225)
  doc.setFont('helvetica', 'normal')

  for (const rec of recommendations) {
    if (y + 8 > pageHeight - 20) {
      doc.addPage()
      drawPageBg(doc)
      y = 20
    }
    if (rec === '') {
      y += 6
      continue
    }
    const lines = doc.splitTextToSize(rec, contentWidth) as string[]
    doc.text(lines, margin, y)
    y += lines.length * 5 + 3
  }

  // Test config table
  y += 10
  if (y + 40 > pageHeight) {
    doc.addPage()
    drawPageBg(doc)
    y = 20
  }

  y = sectionTitle(doc, 'Configuração do Teste', y, margin)

  autoTable(doc, {
    startY: y,
    head: [['Parâmetro', 'Valor']],
    body: [
      ['URL', result.url],
      ['Método HTTP', result.config.method],
      ['Usuários Virtuais', String(result.config.virtualUsers)],
      ['Duração Configurada', `${result.config.duration}s`],
      [
        'Ramp-up',
        result.config.rampUp ? `${result.config.rampUp}s` : 'Desabilitado',
      ],
      [
        'Início',
        format(new Date(result.startTime), 'dd/MM/yyyy HH:mm:ss', {
          locale: ptBR,
        }),
      ],
      [
        'Fim',
        format(new Date(result.endTime), 'dd/MM/yyyy HH:mm:ss', {
          locale: ptBR,
        }),
      ],
      [
        'Status',
        result.status === 'completed'
          ? 'Concluído'
          : result.status === 'cancelled'
            ? 'Cancelado'
            : 'Erro',
      ],
    ],
    theme: 'plain',
    styles: {
      fillColor: [26, 29, 39],
      textColor: [226, 232, 240],
      fontSize: 9,
      cellPadding: 4,
      lineColor: [42, 45, 58],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [99, 102, 241],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    margin: { left: margin, right: margin },
  })

  // Page footers
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(
      `StressFlow Report — ${format(new Date(result.startTime), 'dd/MM/yyyy HH:mm')} — Página ${i}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    )
  }

  return doc.output('datauristring').split(',')[1]
}
