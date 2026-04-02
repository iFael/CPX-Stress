/**
 * Mock Server para testes controlados do StressFlow.
 *
 * Endpoints:
 *   GET /ok            → 200, payload fixo de 1KB, latência ~0ms
 *   GET /slow/:ms      → 200, responde após :ms milissegundos
 *   GET /random-latency→ 200, latência aleatória entre 50ms e 5000ms
 *   GET /rate-limited  → 50% 200, 50% 429
 *   GET /errors-mixed  → 33% 200, 33% 500, 33% 503
 *   GET /timeout       → nunca responde (força timeout no cliente)
 *   GET /status/:code  → responde com o código HTTP especificado
 *
 * Uso:
 *   node audit/mock-server.js [porta]
 *   porta padrão: 8787
 */

const http = require("node:http");

const PORT = parseInt(process.argv[2], 10) || 8787;

// Payload fixo de ~1 KB
const PAYLOAD_1KB = JSON.stringify({
  status: "ok",
  data: "x".repeat(950),
  timestamp: Date.now(),
});

let requestCount = 0;

const server = http.createServer((req, res) => {
  requestCount++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS headers para evitar problemas
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  // --- /ok: resposta imediata, payload fixo ---
  if (path === "/ok") {
    res.writeHead(200);
    res.end(PAYLOAD_1KB);
    return;
  }

  // --- /slow/:ms: latência controlada ---
  const slowMatch = path.match(/^\/slow\/(\d+)$/);
  if (slowMatch) {
    const delay = Math.min(parseInt(slowMatch[1], 10), 60000);
    setTimeout(() => {
      res.writeHead(200);
      res.end(PAYLOAD_1KB);
    }, delay);
    return;
  }

  // --- /random-latency: latência aleatória 50-5000ms ---
  if (path === "/random-latency") {
    const delay = Math.floor(Math.random() * 4950) + 50;
    setTimeout(() => {
      res.writeHead(200);
      res.end(JSON.stringify({ latency: delay, data: "x".repeat(500) }));
    }, delay);
    return;
  }

  // --- /rate-limited: 50% 200, 50% 429 ---
  if (path === "/rate-limited") {
    if (Math.random() < 0.5) {
      res.writeHead(200);
      res.end(PAYLOAD_1KB);
    } else {
      res.writeHead(429);
      res.end(JSON.stringify({ error: "Too Many Requests" }));
    }
    return;
  }

  // --- /errors-mixed: 33% 200, 33% 500, 33% 503 ---
  if (path === "/errors-mixed") {
    const r = Math.random();
    if (r < 0.33) {
      res.writeHead(200);
      res.end(PAYLOAD_1KB);
    } else if (r < 0.66) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({ error: "Service Unavailable" }));
    }
    return;
  }

  // --- /timeout: nunca responde ---
  if (path === "/timeout") {
    // Não responde — força timeout no cliente
    return;
  }

  // --- /status/:code: responde com código específico ---
  const statusMatch = path.match(/^\/status\/(\d{3})$/);
  if (statusMatch) {
    const code = parseInt(statusMatch[1], 10);
    res.writeHead(code);
    res.end(JSON.stringify({ status: code }));
    return;
  }

  // --- /stats: estatísticas do mock ---
  if (path === "/stats") {
    res.writeHead(200);
    res.end(
      JSON.stringify({ totalRequests: requestCount, uptime: process.uptime() }),
    );
    return;
  }

  // --- Fallback: 404 ---
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Mock Server] Ouvindo em http://0.0.0.0:${PORT}`);
  console.log(`Endpoints disponíveis:`);
  console.log(`  GET /ok              → 200, 1KB fixo`);
  console.log(`  GET /slow/:ms        → 200, atraso controlado`);
  console.log(`  GET /random-latency  → 200, 50-5000ms aleatório`);
  console.log(`  GET /rate-limited    → 50% 200, 50% 429`);
  console.log(`  GET /errors-mixed    → 33% 200/500/503`);
  console.log(`  GET /timeout         → nunca responde`);
  console.log(`  GET /status/:code    → código HTTP específico`);
  console.log(`  GET /stats           → estatísticas do mock`);
});
