/**
 * ResultsSummary.tsx
 *
 * Componente que exibe um resumo em linguagem simples dos resultados do teste de estresse.
 * O objetivo e traduzir números técnicos em frases que qualquer pessoa consiga entender,
 * como se um especialista estivesse explicando os resultados de forma amigavel.
 *
 * Funcionalidades:
 *  - Calcula uma "nota de saude" (0 a 100) para o site testado
 *  - Gera um texto explicativo baseado nessa nota
 *  - Detecta se algum sistema de proteção (firewall, anti-DDoS) interferiu no teste
 *  - Apresenta tudo com cores e icones intuitivos
 */

import {
  MessageCircle,
  ThumbsUp,
  AlertTriangle,
  XCircle,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { TestResult } from "@/types";
import {
  calculateHealthScore,
  formatMs,
} from "@/shared/test-analysis";

/* ============================================================
   CÁLCULO DA NOTA DE SAUDE
   A nota vai de 0 (pessimo) a 100 (perfeito).
   Comecamos com 100 e vamos descontando pontos conforme
   os problemas encontrados — como uma prova escolar.
   ============================================================ */

/* ============================================================
   DETECÇÃO DE PROTEÇÃO (WAF / Rate Limiter / Anti-DDoS)
   Verifica se algum sistema de seguranca interferiu no teste.
   ============================================================ */

interface InfoProtecao {
  detectada: boolean;
  provedor?: string;
}

/**
 * Verifica se o teste foi afetado por algum sistema de proteção.
 * Exemplo: Cloudflare bloqueando requisições por excesso de trafego.
 */
function verificarProtecaoAtiva(result: TestResult): InfoProtecao {
  const relatorio = result.protectionReport;
  if (!relatorio) return { detectada: false };

  // Procura por padrões de bloqueio ou limitacao de trafego
  const padraoDeProtecao = relatorio.behavioralPatterns.find(
    (p) => p.type === "blocking" || p.type === "throttling",
  );
  const limitacaoDetectada = relatorio.rateLimitInfo.detected;

  if (!padraoDeProtecao && !limitacaoDetectada) return { detectada: false };

  // Tenta identificar qual provedor de proteção está atuando (ex: Cloudflare, Akamai)
  const provedor =
    relatorio.detections.length > 0 &&
    relatorio.detections[0].provider !== "unknown"
      ? relatorio.detections[0].provider.charAt(0).toUpperCase() +
        relatorio.detections[0].provider.slice(1)
      : undefined;

  return { detectada: true, provedor };
}

/* ============================================================
   GERAÇÃO DE TEXTOS EXPLICATIVOS
   Textos escritos em linguagem simples, como se um especialista
   estivesse explicando para alguem sem conhecimento técnico.
   ============================================================ */

/**
 * Gera uma frase de destaque curta baseada na nota do site.
 * E o "título" do resumo — a primeira coisa que o usuário le.
 */
function gerarTituloDaNota(nota: number): string {
  if (nota >= 80) return "Desempenho estável sob carga";
  if (nota >= 60) return "Desempenho aceitável com ressalvas";
  if (nota >= 40) return "Degradação de desempenho detectada";
  return "Falha sob carga aplicada";
}

/**
 * Gera o texto principal do resumo, explicando os resultados
 * com linguagem acessível e analogias do dia a dia.
 *
 * Cada faixa de nota tem uma explicacao adaptada aos dados reais do teste.
 */
function gerarTextoDoResumo(result: TestResult): string {
  const nota = calculateHealthScore(result);
  const usuários = result.config.virtualUsers;
  const duração = result.config.duration;
  const p95 = result.latency.p95;

  // Nota alta (80-100): site saudavel
  if (nota >= 80) {
    return (
      `O servidor respondeu de forma estável a ${usuários} conexões simultâneas durante ${duração} segundos. ` +
      `Latência média de ${formatMs(result.latency.avg)} com taxa de falha de ${result.errorRate}%. ` +
      `Desempenho dentro dos parâmetros esperados para a carga aplicada.`
    );
  }

  // Nota boa (60-79): funcional, mas com ressalvas
  if (nota >= 60) {
    if (p95 > 1000) {
      return (
        `Com ${usuários} conexões simultâneas, o servidor manteve a disponibilidade, ` +
        `porém apresentou degradação de latência — P95 atingiu ${formatMs(p95)}. ` +
        `A maioria das requisições foi concluída com sucesso.`
      );
    }
    return (
      `O servidor apresentou desempenho aceitável com ${usuários} conexões simultâneas. ` +
      `Houve oscilações pontuais de latência e algumas falhas isoladas, ` +
      `mas a disponibilidade geral foi mantida.`
    );
  }

  // Nota regular (40-59): problemas perceptiveis
  if (nota >= 40) {
    return (
      `O servidor apresentou dificuldades sob carga de ${usuários} conexões simultâneas. ` +
      `P95 de latência atingiu ${formatMs(p95)} e ` +
      `${result.errorRate}% das requisições resultaram em falha. ` +
      `Indica necessidade de otimização para essa faixa de carga.`
    );
  }

  // Nota critica (0-39): falha grave
  return (
    `O servidor não suportou a carga de ${usuários} conexões simultâneas. ` +
    `${result.errorRate}% das requisições falharam, com P95 de latência em ${formatMs(p95)}. ` +
    `O servidor ficou sobrecarregado e não conseguiu processar as requisições recebidas.`
  );
}

/**
 * Gera um texto complementar explicando a detecção de proteção, se houver.
 * Exemplo: "Uma proteção de seguranca (Cloudflare) foi detectada..."
 */
function gerarTextoDeProtecao(result: TestResult): string | null {
  const { detectada, provedor } = verificarProtecaoAtiva(result);
  if (!detectada) return null;

  const nomeProvedor = provedor ? ` (${provedor})` : "";

  return (
    `Proteção de segurança${nomeProvedor} detectada. Parte das requisições foi bloqueada ` +
    `por mecanismos de defesa do servidor (WAF, rate limiter ou anti-DDoS). ` +
    `Os resultados podem não refletir a capacidade real da aplicação.`
  );
}

/* ============================================================
   ESTILOS VISUAIS
   Cores, icones e estilos baseados na nota de saude.
   ============================================================ */

/** Retorna as classes CSS de fundo e borda de acordo com a faixa de nota. */
function obterEstiloDeFundo(nota: number): string {
  if (nota >= 80) return "bg-sf-success/5 border-sf-success/20";
  if (nota >= 60) return "bg-sf-primary/5 border-sf-primary/20";
  if (nota >= 40) return "bg-sf-warning/5 border-sf-warning/20";
  return "bg-sf-danger/5 border-sf-danger/20";
}

/** Retorna as classes CSS para a cor do texto de destaque. */
function obterCorDoTexto(nota: number): string {
  if (nota >= 80) return "text-sf-success";
  if (nota >= 60) return "text-sf-primary";
  if (nota >= 40) return "text-sf-warning";
  return "text-sf-danger";
}

/** Retorna o icone principal que acompanha o resumo. */
function obterIcone(nota: number) {
  if (nota >= 80)
    return <ThumbsUp className="w-5 h-5 text-sf-success shrink-0" />;
  if (nota >= 60)
    return <MessageCircle className="w-5 h-5 text-sf-primary shrink-0" />;
  if (nota >= 40)
    return <AlertTriangle className="w-5 h-5 text-sf-warning shrink-0" />;
  return <XCircle className="w-5 h-5 text-sf-danger shrink-0" />;
}

/* ============================================================
   COMPONENTES VISUAIS AUXILIARES
   Pequenos componentes reutilizaveis para o layout do resumo.
   ============================================================ */

/** Exibe uma "pilula" com um dado rapido (ex: "120 req/s", "45ms"). */
function PilulaDeMetrica({
  icone,
  rótulo,
  valor,
}: {
  icone: React.ReactNode;
  rótulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sf-surface/60 border border-sf-border/50">
      {icone}
      <span className="text-[11px] text-sf-textMuted">{rótulo}</span>
      <span className="text-xs font-semibold text-sf-text font-mono">
        {valor}
      </span>
    </div>
  );
}

/* ============================================================
   COMPONENTE PRINCIPAL
   O ResultsSummary e o cartao que aparece no topo dos resultados,
   dando ao usuário uma visao geral antes dos detalhes técnicos.
   ============================================================ */

export function ResultsSummary({ result }: { result: TestResult }) {
  const nota = calculateHealthScore(result);
  const título = gerarTituloDaNota(nota);
  const textoResumo = gerarTextoDoResumo(result);
  const textoProtecao = gerarTextoDeProtecao(result);

  return (
    <div
      className={`rounded-xl border ${obterEstiloDeFundo(nota)} overflow-hidden`}
    >
      {/* Cabeçalho com icone e título de destaque */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{obterIcone(nota)}</div>

          <div className="flex-1 space-y-2">
            {/* Título principal — frase curta e direta */}
            <p className={`text-sm font-semibold ${obterCorDoTexto(nota)}`}>
              {título}
            </p>

            {/* Texto explicativo — a explicacao completa em linguagem simples */}
            <p className="text-sm text-sf-text leading-relaxed">
              {textoResumo}
            </p>

            {/* Métricas rapidas — dados-chave acessiveis de relance */}
            <div className="flex flex-wrap gap-2 pt-1">
              <PilulaDeMetrica
                icone={<TrendingUp className="w-3 h-3 text-sf-primary" />}
                rótulo="Velocidade"
                valor={`${result.rps.toLocaleString("pt-BR")} req/s`}
              />
              <PilulaDeMetrica
                icone={<Zap className="w-3 h-3 text-sf-accent" />}
                rótulo="Resposta"
                valor={formatMs(result.latency.avg)}
              />
              <PilulaDeMetrica
                icone={<AlertTriangle className="w-3 h-3 text-sf-warning" />}
                rótulo="Falhas"
                valor={`${result.errorRate}%`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de proteção — aparece somente se um sistema de seguranca foi detectado */}
      {textoProtecao && (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-lg bg-sf-surface/40 border border-sf-border/30 px-3 py-2.5">
          <Shield className="w-4 h-4 text-sf-warning shrink-0 mt-0.5" />
          <p className="text-xs text-sf-textSecondary leading-relaxed">
            {textoProtecao}
          </p>
        </div>
      )}
    </div>
  );
}
