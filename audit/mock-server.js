/**
 * Mock Server para testes controlados do CPX-Stress.
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
const LOGIN_CTRL = "9001";

const PAYLOAD_1KB = JSON.stringify({
  status: "ok",
  data: "x".repeat(950),
  timestamp: Date.now(),
});

let requestCount = 0;
let nextSessionId = 1;
const paritySessions = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    cookies[rawKey] = rawValue.join("=");
  }

  return cookies;
}

function sendJson(res, statusCode, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.writeHead(statusCode);
  res.end(html);
}

function renderLoginPage() {
  return `<!doctype html>
<html lang="pt-BR">
  <body>
    <h1>Bem vindo</h1>
    <label>Nome</label>
    <label>Senha</label>
    <form method="post" action="/parity/auth?CTRL=${LOGIN_CTRL}">
      <input type="text" name="usuario" value="tester" />
      <input type="password" name="senha" value="123" />
      <button type="submit">Entrar</button>
    </form>
    <div>CTRL=${LOGIN_CTRL}</div>
  </body>
</html>`;
}

function renderAuthGatePage() {
  return `<!doctype html>
<html lang="pt-BR">
  <body>
    <h1>Sessao expirada</h1>
    <div>Autenticacao necessaria para continuar</div>
    <div>CTRL=${LOGIN_CTRL}</div>
  </body>
</html>`;
}

function renderModulePage(moduleName, ctrl, extraLines = []) {
  const extraHtml = extraLines.join("\n    ");
  return `<!doctype html>
<html lang="pt-BR">
  <body>
    <h1>${moduleName} concluido</h1>
    <div>Modulo ${moduleName} executado com sucesso</div>
    <div>CTRL=${ctrl}</div>
    ${extraHtml}
  </body>
</html>`;
}

function createParitySession() {
  const sessionId = `sess-${nextSessionId++}`;
  const ctrl = String(7000 + nextSessionId);
  const session = { id: sessionId, ctrl };
  paritySessions.set(sessionId, session);
  return session;
}

function getParitySession(req, url) {
  const cookies = parseCookies(req);
  const sessionId = cookies.CPXPARITY;
  const ctrl = url.searchParams.get("CTRL") || "";
  if (!sessionId) return null;

  const session = paritySessions.get(sessionId);
  if (!session) return null;
  if (session.ctrl !== ctrl) return null;
  return session;
}

function resetParityState() {
  nextSessionId = 1;
  paritySessions.clear();
}

const server = http.createServer((req, res) => {
  requestCount++;
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (path === "/ok") {
    return sendJson(res, 200, JSON.parse(PAYLOAD_1KB));
  }

  const slowMatch = path.match(/^\/slow\/(\d+)$/);
  if (slowMatch) {
    const delay = Math.min(parseInt(slowMatch[1], 10), 60000);
    setTimeout(() => {
      sendJson(res, 200, JSON.parse(PAYLOAD_1KB));
    }, delay);
    return;
  }

  if (path === "/random-latency") {
    const delay = Math.floor(Math.random() * 4950) + 50;
    setTimeout(() => {
      sendJson(res, 200, { latency: delay, data: "x".repeat(500) });
    }, delay);
    return;
  }

  if (path === "/rate-limited") {
    if (Math.random() < 0.5) {
      return sendJson(res, 200, JSON.parse(PAYLOAD_1KB));
    }
    return sendJson(res, 429, { error: "Too Many Requests" });
  }

  if (path === "/errors-mixed") {
    const r = Math.random();
    if (r < 0.33) {
      return sendJson(res, 200, JSON.parse(PAYLOAD_1KB));
    }
    if (r < 0.66) {
      return sendJson(res, 500, { error: "Internal Server Error" });
    }
    return sendJson(res, 503, { error: "Service Unavailable" });
  }

  if (path === "/timeout") {
    return;
  }

  const statusMatch = path.match(/^\/status\/(\d{3})$/);
  if (statusMatch) {
    return sendJson(res, parseInt(statusMatch[1], 10), {
      status: parseInt(statusMatch[1], 10),
    });
  }

  if (path === "/parity/reset") {
    resetParityState();
    return sendJson(res, 200, { ok: true, sessions: 0 });
  }

  if (path === "/parity/login") {
    return sendHtml(res, 200, renderLoginPage());
  }

  if (path === "/parity/auth") {
    const ctrl = url.searchParams.get("CTRL") || "";
    if (ctrl !== LOGIN_CTRL) {
      return sendHtml(res, 200, renderLoginPage());
    }

    if (req.method !== "POST") {
      return sendHtml(res, 200, renderAuthGatePage());
    }

    const session = createParitySession();
    return sendHtml(
      res,
      200,
      `<!doctype html>
<html lang="pt-BR">
  <body>
    <h1>Tutorial do MisterT</h1>
    <div>Sessão autenticada</div>
    <div>CTRL=${session.ctrl}</div>
  </body>
</html>`,
      {
        "Set-Cookie": `CPXPARITY=${session.id}; Path=/; HttpOnly`,
      },
    );
  }

  if (path === "/parity/module/alpha" || path === "/parity/module/beta") {
    const session = getParitySession(req, url);
    if (!session) {
      return sendHtml(res, 200, renderLoginPage());
    }

    const variant = (url.searchParams.get("variant") || "stable").toLowerCase();
    if (path === "/parity/module/beta" && variant === "timeout") {
      return;
    }

    if (path === "/parity/module/beta" && variant === "expired-beta") {
      paritySessions.delete(session.id);
      return sendHtml(res, 200, renderLoginPage());
    }

    if (path === "/parity/module/beta" && variant === "invalid-beta") {
      return sendHtml(
        res,
        200,
        `<!doctype html>
<html lang="pt-BR">
  <body>
    <h1>Painel inesperado</h1>
    <div>Resposta sem o texto esperado do módulo beta</div>
    <div>CTRL=${session.ctrl}</div>
  </body>
</html>`,
      );
    }

    const moduleName = path.endsWith("alpha") ? "Alpha" : "Beta";
    const extraLines =
      path === "/parity/module/alpha" && variant !== "missing-extractor"
        ? [`<div>ALPHA_TOKEN=${70000 + nextSessionId}</div>`]
        : [];

    return sendHtml(res, 200, renderModulePage(moduleName, session.ctrl, extraLines));
  }

  if (path === "/stats") {
    return sendJson(res, 200, {
      totalRequests: requestCount,
      uptime: process.uptime(),
      paritySessions: paritySessions.size,
    });
  }

  if (path === "/parity/stats") {
    return sendJson(res, 200, {
      sessions: paritySessions.size,
      nextSessionId,
    });
  }

  return sendJson(res, 404, { error: "Not Found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Mock Server] Ouvindo em http://0.0.0.0:${PORT}`);
  console.log(`Endpoints disponíveis:`);
  console.log(`  GET /ok                       → 200, 1KB fixo`);
  console.log(`  GET /slow/:ms                 → 200, atraso controlado`);
  console.log(`  GET /random-latency           → 200, 50-5000ms aleatório`);
  console.log(`  GET /rate-limited             → 50% 200, 50% 429`);
  console.log(`  GET /errors-mixed             → 33% 200/500/503`);
  console.log(`  GET /timeout                  → nunca responde`);
  console.log(`  GET /status/:code             → código HTTP específico`);
  console.log(`  GET /parity/login             → página de login com CTRL estático`);
  console.log(`  POST /parity/auth?CTRL=9001   → autenticação mock com cookie + CTRL`);
  console.log(`  GET /parity/auth?CTRL=9001    → gate de autenticação para simular sessão expirada`);
  console.log(`  GET /parity/module/alpha      → módulo Alpha com variant stable ou missing-extractor`);
  console.log(`  GET /parity/module/beta       → módulo Beta com variant stable, invalid-beta, expired-beta ou timeout`);
  console.log(`  GET /parity/reset             → limpa estado de sessão do fluxo mock`);
  console.log(`  GET /stats                    → estatísticas gerais do mock`);
});
