# CPX-Stress — Laudo de Auditoria de Precisão de Métricas

**Data:** 2025-03-10  
**Versão auditada:** CPX-Stress 1.0.0  
**Método:** Teste programático direto do engine + análise estática de código  
**Ambiente:** Windows, Node.js, mock server local (latência controlada)  
**Total de checks:** 235 (188 Fase 1 + 47 Fase 2)

---

## 🏁 VEREDICTO GERAL: ❌ REPROVADO (com ressalvas)

O CPX-Stress apresenta **métricas matematicamente corretas** nos cálculos individuais, porém contém:

- **1 bug funcional** na timeline (perda de dados do último segundo)
- **1 vulnerabilidade de segurança crítica** (proteção SSRF é código morto)
- **1 discrepância de apresentação** (PDF vs UI)
- **Instabilidade sob alta carga** (>1000 VUs)

---

## 📊 RESULTADOS POR FASE

### Fase 1 — Baseline Controlado (6 cenários, 188 checks)

| Cenário            | VUs | Duração | PASS | FAIL | WARN | Veredicto                  |
| ------------------ | --- | ------- | ---- | ---- | ---- | -------------------------- |
| A1-Baseline        | 10  | 15s     | 30   | 2    | 1    | ❌ T-02/T-04: timeline gap |
| A2-RampUp          | 50  | 20s     | 30   | 0    | 1    | ✅                         |
| A3-ErrorsMixed     | 10  | 15s     | 31   | 0    | 1    | ✅                         |
| A4-RateLimited     | 10  | 15s     | 28   | 2    | 1    | ❌ T-02/T-04: timeline gap |
| A5-VariableLatency | 5   | 15s     | 31   | 0    | 0    | ✅                         |
| A6-HighLoad        | 200 | 30s     | 29   | 0    | 1    | ✅                         |

### Fase 2 — Stress Extremo (4 cenários, 47 checks)

| Cenário   | VUs  | Duração | PASS | FAIL | WARN | Veredicto              |
| --------- | ---- | ------- | ---- | ---- | ---- | ---------------------- |
| B1-500VU  | 500  | 30s ×2  | 16   | 0    | 0    | ✅                     |
| B2-1000VU | 1000 | 30s ×2  | 14   | 2    | 1    | ❌ Variação entre runs |
| B3-3000VU | 3000 | 30s     | 7    | 1    | 0    | ❌ RPS instável        |
| B4-5000VU | 5000 | 30s     | 6    | 0    | 0    | ✅                     |

---

## 🐛 BUGS ENCONTRADOS

### BUG-01: Perda de dados no último segundo da timeline (SEVERIDADE: MÉDIA)

**Descrição:** O `setInterval` de 1 segundo que captura métricas da timeline é `clearInterval`-ado antes de capturar o último segundo de dados. As requisições processadas nesse intervalo final são contabilizadas nos totais globais (`totalRequests`, `totalBytes`) mas **não aparecem na timeline**.

**Evidência numérica:**
| Cenário | timeline.length | duration | Requests na timeline | Total requests | Gap |
|---------|-----------------|----------|----------------------|----------------|-----|
| A1-Baseline | 14 | 15s | 230,301 | 247,914 | **7.10%** |
| A4-RateLimited | 14 | 15s | 243,050 | 262,069 | **7.26%** |
| A2-RampUp | 19 | 20s | 343,685 | 359,479 | 4.39% |
| A6-HighLoad | 29 | 30s | 411,360 | 423,733 | 2.92% |

**Causa raiz:** Em `electron/engine/stress-engine.ts`, o fluxo é:

1. `setInterval` dispara a cada 1s, capturando `secRequests/secBytes/etc.` no timeline
2. Após `config.duration + 2s`, o timer de duração aborta signals
3. `clearInterval` é chamado ao final do `Promise.all`
4. Os dados acumulados em `secRequests/secBytes/etc.` desde o último disparo do interval são **perdidos**

**Impacto:**

- **timeline[] não é uma representação fiel dos dados totais** — sum(timeline.requests) < totalRequests
- Gráficos da UI mostram dados incompletos no final do teste
- O gap é proporcional ao throughput — testes mais rápidos perdem mais dados
- Para testes de 15s com alto RPS, o gap pode chegar a ~7%

**Correção recomendada:** Após o `clearInterval`, fazer um "flush" final:

```typescript
// Após clearInterval(interval)
if (secRequests > 0 || secErrors > 0) {
  currentSecond++;
  const sorted = [...secLatencies].sort((a, b) => a - b);
  const metrics: SecondMetrics = {
    timestamp: Date.now(),
    second: currentSecond,
    requests: secRequests,
    errors: secErrors,
    // ... mesmo cálculo do interval callback
  };
  timeline.push(metrics);
}
```

---

### BUG-02 (Segurança): Proteção SSRF é código morto (SEVERIDADE: CRÍTICA)

**Descrição:** As funções `validateTargetHost()`, `isBlockedIP()`, `isPrivate172()` e o array `BLOCKED_IP_RANGES` existem em `electron/engine/stress-engine.ts` (linhas 117-193) mas **nunca são chamadas** em lugar nenhum do código.

**Evidência:**

- `validateTargetHost` é definida na linha 155 mas nenhuma chamada existe no projeto inteiro
- O engine aceita qualquer URL incluindo `localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`
- O `main.ts` não importa nem chama `validateTargetHost` antes de `engine.run()`
- **Este harness de teste provou a vulnerabilidade** — todos os testes rodaram contra `localhost:8787` sem nenhum bloqueio

**Impacto:** Um usuário pode executar stress tests contra IPs internos da rede, endpoints de cloud metadata (169.254.169.254), ou serviços locais, potencialmente causando DoS em infraestrutura interna.

**Correção recomendada:** Chamar `validateTargetHost(url.hostname)` no início do método `run()` do `StressEngine`, antes do `preflight()`.

---

## ⚠️ DISCREPÂNCIAS DE APRESENTAÇÃO

### DISC-01: formatMs diverge entre PDF e UI

| Camada             | Formato                        | Exemplo     |
| ------------------ | ------------------------------ | ----------- |
| TestProgress.tsx   | `ms.toFixed(1)` sem espaço     | `123.5ms`   |
| TestResults.tsx    | `ms.toFixed(1)` sem espaço     | `123.5ms`   |
| ResultsSummary.tsx | `ms.toFixed(1)` sem espaço     | `123.5ms`   |
| pdf-generator.ts   | `ms.toFixed(2)` **com** espaço | `123.46 ms` |

**Impacto:** Cosmético — o valor numérico subjacente é idêntico, apenas a precisão de exibição difere. Um mesmo resultado de 123.456ms aparece como "123.5ms" na UI e "123.46 ms" no PDF.

---

## ✅ O QUE FUNCIONA CORRETAMENTE

### Invariantes Matemáticos — 100% corretos

- ✅ `sum(statusCodes) === totalRequests - totalErrors` — perfeito em todos os cenários
- ✅ `errorRate === round2(totalErrors/totalRequests*100)` — desvio máximo 0.00pp
- ✅ Percentis sempre monotônicos: `min ≤ p50 ≤ p90 ≤ p95 ≤ p99 ≤ max` — zero violações em 235 checks
- ✅ `RPS === round2(totalRequests/durationSeconds)` — desvio máximo 0.02%
- ✅ `throughputBytesPerSec` coerente com `totalBytes/durationSeconds`
- ✅ Todos os campos numéricos respeitam `round2()` (≤2 casas decimais)

### Health Score — 3 implementações IDÊNTICAS

- ✅ `TestResults.tsx` (calculateHealthScore)
- ✅ `ResultsSummary.tsx` (calcularNotaDeSaude)
- ✅ `pdf-generator.ts` (getHealthScore)
- Mesmas entradas produzem exatamente o mesmo score em todas as camadas

### httpErrorRate — 3 implementações IDÊNTICAS

- ✅ Mesmo filtro: `code === '403' || code === '429' || Number(code) >= 500`
- ✅ Mesmo cálculo: `(httpErrorCount / totalRequests) * 100`

### Ramp-up — Funcionando corretamente

- ✅ `activeUsers` cresce linearmente durante o ramp-up
- ✅ No segundo `rampUp + 1`, `activeUsers === config.virtualUsers`
- ✅ RPS cresce proporcionalmente ao número de VUs ativos

### Cenários de erro — Distribuições corretas

- ✅ `/errors-mixed` → 33.0% 200, 33.0% 500, 34.1% 503 (ideal: 33.3% cada)
- ✅ `/rate-limited` → 50.1% 429, 49.9% 200 (ideal: 50/50)
- ✅ `errorRate` (erros de conexão) = 0% em cenários com respostas HTTP normais

### Reservoir Sampling — Esperado

- ⚠️ Ativo quando `totalRequests > 100,000` — percentis globais são aproximados
- Não afeta os invariantes individuais (sum, errorRate, RPS)

---

## 📈 COMPORTAMENTO SOB CARGA

### Ponto de saturação

| VUs  | RPS médio   | P95 (ms) | CV do RPS | Observação                 |
| ---- | ----------- | -------- | --------- | -------------------------- |
| 10   | ~17,000     | 1.16     | —         | Baseline OK                |
| 50   | ~17,900     | 4.22     | —         | Com ramp-up OK             |
| 200  | ~14,100     | 23.08    | 5.9%      | Estável                    |
| 500  | ~2,900      | 274-326  | 9.8%      | ✅ Estável                 |
| 1000 | 1,800-8,300 | 186-774  | **64.2%** | ❌ Instável entre runs     |
| 3000 | ~2,600      | 3,088    | **83.5%** | ❌ RPS muito errático      |
| 5000 | ~2,300      | 2,997    | 19.5%     | Surpreendentemente estável |

**Análise:**

- A saturação começa em ~200-500 VUs contra o mock server local
- Acima de 1000 VUs, a variabilidade entre execuções é muito alta (CV de 64%)
- A 3000 VUs, o RPS é extremamente errático (CV de 83%) — o motor sofre com contention de event loop
- A 5000 VUs estabiliza novamente (provavelmente porque os VUs ficam bloqueados esperando)
- **Isso não é um bug do CPX-Stress** — é o limite real do Node.js single-threaded sob carga extrema contra localhost

---

## 📋 RECOMENDAÇÕES PRIORITÁRIAS

### P0 — Crítico (corrigir imediatamente)

1. **Ativar proteção SSRF:** Chamar `validateTargetHost()` no engine antes do preflight
2. **Flush da timeline:** Capturar dados residuais após clearInterval

### P1 — Importante

3. **Extrair lógica duplicada:** Health score, httpErrorRate, formatMs devem ser funções utilitárias compartilhadas
4. **Normalizar formatMs:** Decidir entre 1 ou 2 casas decimais e usar consistentemente

### P2 — Melhoria

5. **Documentar limites de carga:** Adicionar nota que acima de ~500 VUs a variabilidade aumenta significativamente
6. **Adicionar checks de sanidade na UI:** Mostrar warning se `sum(timeline) ≠ totalRequests`

---

## 📁 ARTEFATOS GERADOS

- `audit/results/A1-Baseline.json` — Resultado completo baseline (247,914 requests)
- `audit/results/A2-RampUp.json` — Resultado ramp-up (359,479 requests)
- `audit/results/A3-ErrorsMixed.json` — Resultado erros mistos (261,176 requests)
- `audit/results/A4-RateLimited.json` — Resultado rate limiting (262,069 requests)
- `audit/results/A5-VariableLatency.json` — Resultado latência variável (32 requests)
- `audit/results/A6-HighLoad.json` — Resultado alta carga (423,733 requests)
- `audit/results/B1-500VU-R1.json`, `B1-500VU-R2.json` — Stress 500 VUs
- `audit/results/B2-1000VU-R1.json`, `B2-1000VU-R2.json` — Stress 1000 VUs
- `audit/results/B3-3000VU-R1.json` — Stress 3000 VUs
- `audit/results/B4-5000VU-R1.json` — Stress 5000 VUs
- `audit/results/SUMMARY.json` — Sumário Fase 1
- `audit/results/STRESS-SUMMARY.json` — Sumário Fase 2
- `audit/engine-test-harness.ts` — Harness de teste programático
- `audit/stress-extreme-test.ts` — Teste de carga extrema
- `audit/validate-result.js` — Validador de JSON exportado
- `audit/mock-server.js` — Mock HTTP server

---

## 📊 ESTATÍSTICAS DA AUDITORIA

| Métrica                       | Valor       |
| ----------------------------- | ----------- |
| Total de checks executados    | 235         |
| PASS                          | 222 (94.5%) |
| FAIL                          | 7 (3.0%)    |
| WARN                          | 6 (2.6%)    |
| Total de requests processados | ~1,887,297  |
| Cenários executados           | 10          |
| Tempo total de teste          | ~5 minutos  |
