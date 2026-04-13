/**
 * install-native.js
 *
 * Executado como `postinstall` pelo npm.
 * Garante que o binário nativo do better-sqlite3 seja compilado/baixado
 * corretamente para o runtime do Electron, independente da versão do Node.js
 * instalada na máquina do desenvolvedor.
 *
 * Fluxo:
 *  1. Descobre a versão do Electron instalada no projeto
 *  2. Mapeia versão → ABI do módulo nativo (NODE_MODULE_VERSION)
 *  3. Baixa o prebuilt do GitHub releases do better-sqlite3
 *  4. Extrai better_sqlite3.node → node_modules/better-sqlite3/build/Release/
 *
 * Se o prebuilt não existir para a combinação detectada, encerra com aviso
 * mas NÃO interrompe o install (exit 0) para não travar o pipeline de CI.
 */

const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");

/** Versão do better-sqlite3 instalada no projeto */
const SQLITE_VERSION = (() => {
  try {
    return require(path.join(ROOT, "node_modules/better-sqlite3/package.json"))
      .version;
  } catch {
    return null;
  }
})();

/** Versão do Electron instalada no projeto */
const ELECTRON_VERSION = (() => {
  try {
    return require(path.join(ROOT, "node_modules/electron/package.json"))
      .version;
  } catch {
    return null;
  }
})();

/**
 * Mapa de versão major do Electron → NODE_MODULE_VERSION (ABI).
 * Atualizar conforme novas versões do Electron forem adotadas.
 */
const ELECTRON_ABI_MAP = {
  28: 119,
  29: 121,
  30: 123,
  31: 125,
  32: 128,
  33: 130,
  34: 132,
  35: 133,
};

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

/**
 * Faz GET HTTP(S) seguindo até 5 redirecionamentos.
 */
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Redirecionamentos demais"));
    const mod = url.startsWith("https")
      ? require("node:https")
      : require("node:http");
    mod
      .get(
        url,
        { headers: { "User-Agent": "cpx-stress-postinstall" } },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return httpGet(res.headers.location, redirects + 1)
              .then(resolve)
              .catch(reject);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} em ${url}`));
          }
          resolve(res);
        },
      )
      .on("error", reject);
  });
}

/**
 * Extrai um único arquivo de um stream .tar.gz.
 * Usa apenas módulos built-in do Node.js (sem dependências externas).
 * Implementação mínima: lê o stream tar após a descompressão zlib.
 */
function extractNodeFromTarGz(stream, destPath) {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const chunks = [];

    gunzip.on("data", (c) => chunks.push(c));
    gunzip.on("error", reject);
    gunzip.on("end", () => {
      const buf = Buffer.concat(chunks);
      // Procura pelo arquivo .node no conteúdo tar (formato POSIX ustar)
      let offset = 0;
      while (offset < buf.length - 512) {
        const name = buf
          .slice(offset, offset + 100)
          .toString("utf8")
          .replace(/\0/g, "");
        const sizeStr = buf
          .slice(offset + 124, offset + 136)
          .toString("utf8")
          .replace(/\0/g, "")
          .trim();
        const size = parseInt(sizeStr, 8) || 0;
        offset += 512;
        if (name.endsWith(".node") && size > 0) {
          const fileData = buf.slice(offset, offset + size);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, fileData);
          console.log(
            `  [install-native] Extraído: ${path.basename(name)} (${(size / 1024 / 1024).toFixed(1)} MB)`,
          );
          return resolve();
        }
        offset += Math.ceil(size / 512) * 512;
      }
      reject(new Error("Arquivo .node não encontrado no tar.gz"));
    });

    stream.pipe(gunzip);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!SQLITE_VERSION) {
    console.log("[install-native] better-sqlite3 não encontrado, pulando.");
    return;
  }
  if (!ELECTRON_VERSION) {
    console.log("[install-native] Electron não encontrado, pulando.");
    return;
  }

  const electronMajor = parseInt(ELECTRON_VERSION.split(".")[0], 10);
  const abi = ELECTRON_ABI_MAP[electronMajor];

  if (!abi) {
    console.warn(
      `[install-native] Electron ${electronMajor} não mapeado. Adicione o ABI em scripts/install-native.js.`,
    );
    return;
  }

  const destPath = path.join(
    ROOT,
    "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  );

  // Verifica se o binário já está correto para este Electron
  if (fs.existsSync(destPath)) {
    // Verifica se o binário atual é o correto verificando o tamanho
    // (heurística: qualquer binário > 500KB é provavelmente válido — evita re-download)
    const stat = fs.statSync(destPath);
    if (stat.size > 500_000) {
      console.log(
        `[install-native] Binário nativo já presente (${(stat.size / 1024 / 1024).toFixed(1)} MB), pulando download.`,
      );
      return;
    }
  }

  const platform = process.platform; // win32 | darwin | linux
  const arch = process.arch; // x64 | arm64 | ia32
  const filename = `better-sqlite3-v${SQLITE_VERSION}-electron-v${abi}-${platform}-${arch}.tar.gz`;
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${SQLITE_VERSION}/${filename}`;

  console.log(
    `[install-native] Baixando prebuilt para Electron ${electronMajor} (ABI ${abi})...`,
  );
  console.log(`[install-native] URL: ${url}`);

  try {
    const stream = await httpGet(url);
    await extractNodeFromTarGz(stream, destPath);
    console.log(
      `[install-native] Binário instalado com sucesso em: ${destPath}`,
    );
  } catch (err) {
    // Não falha o install — apenas avisa
    console.warn(
      `[install-native] AVISO: Não foi possível baixar prebuilt para Electron ${electronMajor}: ${err.message}`,
    );
    console.warn(
      "[install-native] Você pode precisar compilar manualmente com Visual Studio Build Tools.",
    );
    console.warn(
      "[install-native] Veja: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/compilation.md",
    );
  }
}

main();
