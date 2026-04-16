/**
 * ============================================================================
 *  CPX-Stress — Processo Principal do Electron (Main Process)
 * ============================================================================
 *
 *  Este arquivo é o "cérebro" do aplicativo desktop. Ele é responsável por:
 *
 *    1. Criar a janela principal do programa
 *    2. Gerenciar a comunicação entre a interface (React) e o motor de testes
 *    3. Salvar e recuperar o histórico de testes em disco
 *    4. Exportar relatórios em PDF e JSON
 *
 *  O Electron funciona com dois processos separados por segurança:
 *    - Main Process (este arquivo): tem acesso total ao sistema operacional
 *    - Renderer Process (a interface React): roda isolado, como um navegador
 *
 *  A comunicação entre eles acontece por "canais IPC" (Inter-Process Communication),
 *  que funcionam como mensagens entre os dois lados.
 * ============================================================================
 */

import { app, BrowserWindow, ipcMain, dialog, shell, session, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { StressEngine, validateTestConfig } from "./engine/stress-engine";
import { isK6Available, runK6 } from "./engine/k6-runner";
import type { K6Config } from "./engine/k6-types";
import { isLocustAvailable, runLocust } from "./engine/locust-runner";
import type { LocustConfig } from "./engine/locust-types";
import { isJMeterAvailable, runJMeter } from "./engine/jmeter-runner";
import type { JMeterConfig } from "./engine/jmeter-types";
import {
  resolveConfigEnvPlaceholders,
  runMistertValidation,
} from "./engine/mistert-validation";

const APP_DISPLAY_NAME = "CPX-Stress";
const APP_WINDOW_BACKGROUND = "#000000";
const LEGACY_USER_DATA_DIRNAME = "stressflow";
const LEGACY_DATA_DIRNAME = "stressflow-data";
const DEFAULT_JSON_EXPORT_NAME = "cpx-stress-export.json";
const canUseElectronMainApis =
  !!app &&
  !!ipcMain &&
  typeof app.whenReady === "function" &&
  typeof app.on === "function" &&
  typeof ipcMain.handle === "function";

/**
 * Mantém o diretório legado do Electron para preservar .env, histórico,
 * presets e banco SQLite já existentes após o rebrand.
 */
function configureLegacyUserDataPath(): void {
  // Em dev, o Vite pode avaliar este módulo em um contexto Node sem a app API pronta.
  if (!app || typeof app.getPath !== "function" || typeof app.setPath !== "function") {
    return;
  }
  const legacyUserDataPath = path.join(
    app.getPath("appData"),
    LEGACY_USER_DATA_DIRNAME,
  );
  app.setPath("userData", legacyUserDataPath);
}

configureLegacyUserDataPath();

/**
 * Carrega variáveis de ambiente de um arquivo .env na raiz do app.
 * Formato: CHAVE=VALOR (uma por linha). Linhas vazias e # são ignoradas.
 * Em modo de desenvolvimento usa o diretório do projeto; em produção, userData.
 */
function loadEnvFile(): Record<string, string> {
  const envPaths = [
    path.join(app.getAppPath(), ".env"),
    path.join(app.getPath("userData"), ".env"),
  ];

  const env: Record<string, string> = {};

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remover aspas envolventes ("valor" ou 'valor')
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key) env[key] = value;
      }
    }
  }
  return env;
}

/**
 * Salva entradas de credenciais no arquivo .env do diretório userData.
 * Faz merge com entradas existentes: atualiza chaves existentes in-place
 * e adiciona novas chaves ao final. Preserva comentários e linhas vazias.
 *
 * SEGURANCA:
 *   - Apenas chaves com prefixo STRESSFLOW_ são aceitas (whitelist).
 *   - Escrita exclusivamente em app.getPath("userData")/.env — nunca em app.getAppPath() (ASAR read-only em produção).
 *   - Após escrita, recarrega envVars em memória para que o próximo teste use os valores atualizados.
 */
function saveEnvFile(entries: Array<{ key: string; value: string }>): { saved: number; path: string } {
  const envPath = path.join(app.getPath("userData"), ".env");

  // Validar chaves: apenas STRESSFLOW_* permitidas
  for (const entry of entries) {
    if (!/^STRESSFLOW_\w+$/.test(entry.key)) {
      throw new Error(`Chave invalida: ${entry.key}. Apenas chaves com prefixo STRESSFLOW_ são permitidas.`);
    }
  }

  // Ler .env existente (se houver)
  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  }

  // Criar mapa das novas entradas
  const newEntries = new Map(entries.map((e) => [e.key, e.value]));
  const written = new Set<string>();

  // Substituir valores existentes in-place (preserva ordem e comentários)
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return line;
    const key = trimmed.substring(0, eqIndex).trim();
    if (newEntries.has(key)) {
      written.add(key);
      return `${key}=${newEntries.get(key)}`;
    }
    return line;
  });

  // Append chaves novas que não existiam no arquivo
  for (const [key, value] of newEntries) {
    if (!written.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }

  // Garantir que o diretório pai existe
  const envDir = path.dirname(envPath);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  fs.writeFileSync(envPath, updatedLines.join("\n"), "utf-8");

  // CRITICO: Recarregar variáveis em memória para que o próximo teste use os valores atualizados
  envVars = loadEnvFile();

  return { saved: entries.length, path: envPath };
}

/** Variáveis de ambiente carregadas do .env */
let envVars: Record<string, string> = {};
import type {
  TestConfig,
  TestResult,
  ErrorDetail,
} from "./engine/stress-engine";
import {
  initDatabase,
  migrateFromJsonHistory,
  closeDatabase,
  ensureBuiltinPresetVersion,
} from "./database/database";
import {
  saveTestResult,
  listTestResults,
  getTestResult,
  deleteTestResult,
  clearTestResults,
  saveErrorBatch,
  searchErrors,
  getErrorsByStatusCode,
  getErrorsByType,
  getErrorsByOperationName,
  listPresets,
  savePreset,
  renamePreset,
  deletePreset,
} from "./database/repository";

// ---------------------------------------------------------------------------
// Tratamento global de erros não capturados
// ---------------------------------------------------------------------------
// Garante que exceções e promessas rejeitadas não derrubem o aplicativo
// silenciosamente. O erro é registrado no console para diagnóstico.
// ---------------------------------------------------------------------------
process.on("uncaughtException", (error) => {
  console.error(
    "[CPX-Stress] Erro não capturado no processo principal:",
    error,
  );
});

process.on("unhandledRejection", (reason) => {
  console.error(
    "[CPX-Stress] Promessa rejeitada sem tratamento no processo principal:",
    reason,
  );
});

// ---------------------------------------------------------------------------
// Caminhos do ambiente — necessários para o Vite (bundler) funcionar
// tanto em modo de desenvolvimento quanto na versão empacotada final.
// ---------------------------------------------------------------------------
process.env.DIST_ELECTRON = path.join(__dirname);
process.env.DIST = path.join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, "../public")
  : process.env.DIST;

// ---------------------------------------------------------------------------
// Estado global da aplicação
// ---------------------------------------------------------------------------

/** Referência à janela principal — null quando a janela está fechada. */
let mainWindow: BrowserWindow | null = null;

/** Motor de testes em execução — null quando nenhum teste está rodando. */
let activeEngine: StressEngine | null = null;

/** Promise do teste em andamento — usada para aguardar o término ao cancelar. */
let activeTestPromise: Promise<TestResult> | null = null;

/** Mutex para prevenir race condition ao iniciar testes (TOCTOU). */
let isTestStarting = false;

/** URL do servidor de desenvolvimento do Vite (só existe em modo dev). */
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// ===========================================================================
//  Gerenciamento de Arquivos e Diretórios
// ===========================================================================
// O CPX-Stress mantém dados no diretório legado do aplicativo para compatibilidade.
// No Windows: %APPDATA%/stressflow/stressflow-data
// No macOS:   ~/Library/Application Support/stressflow/stressflow-data
// No Linux:   ~/.config/stressflow/stressflow-data
// ===========================================================================

/**
 * Retorna o caminho da pasta principal de dados do aplicativo.
 * Cria a pasta automaticamente caso ela ainda não exista.
  */
function getDataPath(): string {
  try {
    const dataPath = path.join(app.getPath("userData"), LEGACY_DATA_DIRNAME);
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    return dataPath;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao acessar pasta de dados:", error);
    throw new Error(
      "Não foi possível acessar a pasta de dados do aplicativo. Verifique as permissões do sistema.",
    );
  }
}

/**
 * Retorna o caminho da pasta onde os relatórios PDF são armazenados.
 * Cria a pasta automaticamente caso ela ainda não exista.
 */
function getReportsPath(): string {
  try {
    const reportsPath = path.join(getDataPath(), "reports");
    if (!fs.existsSync(reportsPath)) {
      fs.mkdirSync(reportsPath, { recursive: true });
    }
    return reportsPath;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao acessar pasta de relatórios:", error);
    throw new Error(
      "Não foi possível acessar a pasta de relatórios. Verifique as permissões do sistema.",
    );
  }
}

// ===========================================================================
//  Banco de Dados SQLite
// ===========================================================================
// O CPX-Stress utiliza SQLite para armazenar resultados de testes e erros
// detalhados. O banco é inicializado automaticamente na primeira execução.
// ===========================================================================

/** Indica se o banco de dados já foi inicializado. */
let dbInitialized = false;

/**
 * Inicializa o banco de dados e migra dados legados do history.json.
 * Chamado uma única vez durante o ciclo de vida da aplicação.
 */
function initializeDatabase(): void {
  if (dbInitialized) return;
  try {
    const dataPath = getDataPath();
    initDatabase(dataPath);
    migrateFromJsonHistory(dataPath);
    ensureBuiltinPresetVersion(); // Atualiza preset built-in se versão mudou
    dbInitialized = true;
    console.log("[CPX-Stress] Banco de dados SQLite inicializado com sucesso.");
  } catch (error) {
    console.error("[CPX-Stress] Erro ao inicializar banco de dados:", error);
    throw new Error(
      "Não foi possível inicializar o banco de dados. Verifique as permissões do sistema.",
    );
  }
}

// ===========================================================================
//  Validação e Segurança
// ===========================================================================

/**
 * Verifica se um caminho de arquivo está dentro de um diretório permitido.
 * Essa verificação previne ataques de "path traversal", onde um caminho
 * malicioso como "../../etc/passwd" tenta acessar arquivos fora da pasta segura.
 */
function assertPathWithinDirectory(
  filePath: string,
  allowedDirectory: string,
): void {
  const resolved = path.resolve(filePath);
  // Adicionamos o separador ao final para garantir que "/reports-evil" não
  // passe na verificação quando o diretório permitido é "/reports".
  if (
    !resolved.startsWith(allowedDirectory + path.sep) &&
    resolved !== allowedDirectory
  ) {
    throw new Error("Caminho de arquivo fora do diretório permitido");
  }
}

// ===========================================================================
//  Criação da Janela Principal
// ===========================================================================

/**
 * Cria e configura a janela principal do aplicativo.
 * Em modo de desenvolvimento, carrega do servidor Vite local.
 * Em produção, carrega os arquivos HTML já compilados.
 */
function createWindow(): void {
  // Carregar icone Compex para a janela
  const iconPath = path.join(app.getAppPath(), "resources", "icon.gif");
  const appIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: APP_DISPLAY_NAME,
    ...(appIcon && !appIcon.isEmpty() ? { icon: appIcon } : {}),
    backgroundColor: APP_WINDOW_BACKGROUND,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Segurança: isolamento de contexto impede que a interface acesse APIs do Node.js
      contextIsolation: true,
      // Segurança: desabilita integração com Node.js no processo de renderização
      nodeIntegration: false,
      // Segurança: impede abertura de novas janelas sem controle
      sandbox: true,
    },
  });

  // Remove a barra de menus padrão do Electron (Arquivo, Editar, etc.)
  mainWindow.setMenuBarVisibility(false);

  // Segurança: define Content Security Policy para prevenir XSS e injeção de scripts.
  // Em modo dev, o Vite serve via localhost com WebSocket (HMR), então a CSP é mais permissiva.
  // Em produção, a CSP restringe a 'self' apenas.
  if (!VITE_DEV_SERVER_URL) {
    mainWindow.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
            ],
          },
        });
      },
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (activeEngine) {
      activeEngine.cancel();
      activeEngine = null;
      activeTestPromise = null;
    }
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || "", "index.html"));
  }
}

// ===========================================================================
//  Handlers IPC — Execução de Testes
// ===========================================================================
// Estes handlers cuidam de iniciar, acompanhar e cancelar testes de estresse.
// A interface envia comandos por IPC e recebe os resultados/progresso aqui.
// ===========================================================================

/**
 * Traduz mensagens de erro técnicas para mensagens compreensíveis em português.
 * Utilizada nos handlers IPC para que o usuário veja mensagens amigáveis.
 */
function traduzirErro(error: unknown): string {
  const mensagem = error instanceof Error ? error.message : String(error);

  // Erros de conexão e rede
  if (mensagem.includes("ECONNREFUSED"))
    return "Não foi possível conectar ao servidor. Verifique se o endereço está correto e se o servidor está funcionando.";
  if (mensagem.includes("ENOTFOUND") || mensagem.includes("getaddrinfo"))
    return "O endereço informado não foi encontrado. Verifique se a URL está escrita corretamente.";
  if (mensagem.includes("ETIMEDOUT") || mensagem.includes("timeout"))
    return "O servidor demorou demais para responder. Ele pode estar sobrecarregado ou inacessível.";
  if (mensagem.includes("ECONNRESET"))
    return "A conexão com o servidor foi interrompida inesperadamente. Tente novamente.";
  if (
    mensagem.includes("CERT_") ||
    mensagem.includes("certificate") ||
    mensagem.includes("SSL")
  )
    return "Houve um problema com o certificado de segurança do site. O endereço pode ter um certificado inválido ou expirado.";
  if (mensagem.includes("EHOSTUNREACH"))
    return "O servidor não está acessível. Verifique sua conexão com a internet e se o endereço está correto.";
  if (mensagem.includes("EAI_AGAIN"))
    return "Não foi possível resolver o endereço do servidor. Verifique sua conexão com a internet.";

  // Erros de teste
  if (mensagem.includes("Teste já em execução"))
    return "Já existe um teste em andamento. Aguarde a conclusão ou cancele o teste atual antes de iniciar outro.";
  if (mensagem.includes("Cancelado") || mensagem.includes("Cancelled"))
    return "O teste foi cancelado pelo usuário.";
  if (mensagem.includes("Invalid URL") || mensagem.includes("URL inválida"))
    return "O endereço informado não é válido. Verifique se começa com http:// ou https:// — exemplo: https://www.meusite.com.br";
  if (mensagem.includes("Credenciais obrigatórias ausentes"))
    return mensagem;
  if (mensagem.includes("k6 não encontrado") || mensagem.includes("binário do k6")) {
    return "O binário do k6 não foi encontrado. Instale o k6 ou configure o caminho do executável para habilitar a comparação.";
  }
  if (mensagem.includes("Locust não foi encontrado") || mensagem.includes("binário do Locust")) {
    return "O binário do Locust não foi encontrado. Instale o Locust ou configure LOCUST_PATH para habilitar a comparação.";
  }
  if (mensagem.includes("JMeter não foi encontrado") || mensagem.includes("binário do JMeter")) {
    return "O binário do JMeter não foi encontrado. Instale o JMeter ou configure JMETER_PATH para habilitar a comparação.";
  }

  // Erro genérico — preserva a mensagem original como detalhe
  return `Ocorreu um erro inesperado: ${mensagem}`;
}

if (canUseElectronMainApis) {
  /**
   * Canal: validation:run
   * Executa uma passada sequencial pelo fluxo atual para validar credenciais,
   * extração dinâmica, sessão ASP e evidência funcional das abas MisterT.
   */
  ipcMain.handle("validation:run", async (_event, config: TestConfig) => {
  try {
    const { config: resolvedConfig } = resolveConfigEnvPlaceholders(
      config,
      envVars,
    );
    validateTestConfig(resolvedConfig);
    return await runMistertValidation(config, envVars);
  } catch (error) {
    console.error("[CPX-Stress] Erro durante validação do fluxo MisterT:", error);
    throw new Error(traduzirErro(error));
  }
  });

  /**
   * Canal: test:start
   * Inicia um novo teste de estresse com a configuração recebida da interface.
   * Envia atualizações de progresso em tempo real pelo canal "test:progress".
   * Retorna o resultado completo do teste ao finalizar.
   */
  ipcMain.handle("test:start", async (_event, config: TestConfig) => {
  try {
    if (isTestStarting || activeEngine || activeTestPromise) {
      throw new Error("Teste já em execução");
    }
    isTestStarting = true;

    const { config: resolvedConfig, missingKeys } = resolveConfigEnvPlaceholders(
      config,
      envVars,
    );
    if (missingKeys.length > 0) {
      throw new Error(
        `Credenciais obrigatórias ausentes no .env: ${missingKeys.join(", ")}`,
      );
    }

    validateTestConfig(resolvedConfig);

    activeEngine = new StressEngine();
    const pendingErrorRows: Array<{
      id: string;
      test_id: string;
      timestamp: number;
      operation_name: string;
      status_code: number;
      error_type: string;
      message: string;
      response_snippet: string | null;
    }> = [];

    activeTestPromise = activeEngine.run(
      resolvedConfig,
      (progress) => {
        mainWindow?.webContents.send("test:progress", progress);
      },
      (errors: ErrorDetail[]) => {
        // Acumula erros durante a execução e persiste só depois que o
        // test_result existir, evitando violação da FK test_errors.test_id.
        pendingErrorRows.push(
          ...errors.map((e) => ({
            id: e.id,
            test_id: e.testId,
            timestamp: e.timestamp,
            operation_name: e.operationName,
            status_code: e.statusCode,
            error_type: e.errorType,
            message: e.message,
            response_snippet: e.responseSnippet || null,
          })),
        );
      },
    );

    const result = await activeTestPromise;

    // Salva o resultado no banco SQLite
    saveTestResult(result);
    if (pendingErrorRows.length > 0) {
      saveErrorBatch(pendingErrorRows);
    }

    return result;
  } catch (error) {
    console.error("[CPX-Stress] Erro durante execução do teste:", error);
    throw new Error(traduzirErro(error));
  } finally {
    // Sempre limpa o estado, independente de sucesso ou erro
    activeEngine = null;
    activeTestPromise = null;
    isTestStarting = false;
  }
  });

  /**
   * Canal: test:cancel
   * Cancela o teste de estresse em execução.
   * Aguarda o teste finalizar completamente antes de retornar.
   */
  ipcMain.handle("test:cancel", async () => {
  try {
    if (!activeEngine) {
      return false;
    }

    activeEngine.cancel();

    // Aguarda o teste finalizar antes de liberar os recursos
    if (activeTestPromise) {
      try {
        await activeTestPromise;
      } catch {
        // Erro esperado ao cancelar — o motor lança exceção proposital
      }
    }

    activeEngine = null;
    activeTestPromise = null;
    return true;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao cancelar teste:", error);
    activeEngine = null;
    activeTestPromise = null;
    throw new Error(
      "Não foi possível cancelar o teste. Tente fechar e reabrir o aplicativo.",
    );
  }
  });

// ===========================================================================
//  Handlers IPC — Histórico de Testes
// ===========================================================================
// Estes handlers permitem que a interface consulte, filtre e gerencie
// o histórico de testes executados anteriormente.
// ===========================================================================

  /**
   * Canal: history:list
   * Retorna a lista completa do histórico de testes.
   */
  ipcMain.handle("history:list", async () => {
  try {
    initializeDatabase();
    const history = listTestResults();
    return JSON.parse(JSON.stringify(history));
  } catch (error) {
    console.error("[CPX-Stress] Erro ao carregar histórico:", error);
    return [];
  }
  });

/**
 * Canal: history:get
 * Busca um teste específico no histórico pelo seu ID único.
 * Retorna null se o teste não for encontrado.
 */
  ipcMain.handle("history:get", async (_event, id: string) => {
  try {
    if (!id || typeof id !== "string") {
      return null;
    }
    initializeDatabase();
    const result = getTestResult(id);
    return result ? JSON.parse(JSON.stringify(result)) : null;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao buscar teste no histórico:", error);
    throw new Error(
      "Não foi possível buscar o teste no histórico. Tente recarregar a lista.",
    );
  }
  });

/**
 * Canal: history:delete
 * Remove um teste específico do histórico pelo seu ID.
 */
  ipcMain.handle("history:delete", async (_event, id: string) => {
  try {
    if (!id || typeof id !== "string") {
      throw new Error("Identificador do teste não informado.");
    }
    return deleteTestResult(id);
  } catch (error) {
    console.error("[CPX-Stress] Erro ao excluir teste do histórico:", error);
    throw new Error(
      "Não foi possível excluir o teste do histórico. Tente novamente.",
    );
  }
  });

/**
 * Canal: history:clear
 * Remove todos os testes do histórico.
 */
  ipcMain.handle("history:clear", async () => {
  try {
    clearTestResults();
    return true;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao limpar histórico:", error);
    throw new Error("Não foi possível limpar o histórico de testes.");
  }
  });

// ===========================================================================
//  Handlers IPC — Exportação de Relatórios (PDF e JSON)
// ===========================================================================
// Estes handlers permitem que a interface salve relatórios no disco
// e abra arquivos gerados para o usuário visualizar.
// ===========================================================================

/**
 * Canal: pdf:save
 * Salva um relatório PDF (recebido como texto base64) na pasta de relatórios.
 * Retorna o caminho completo do arquivo salvo.
 *
 * Inclui validação de segurança para impedir escrita fora da pasta de relatórios.
 */
  ipcMain.handle(
  "pdf:save",
  async (_event, pdfBase64: string, filename: string) => {
    try {
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        throw new Error(
          "Os dados do PDF não foram gerados corretamente. Tente gerar o relatório novamente.",
        );
      }
      if (!filename || typeof filename !== "string") {
        throw new Error(
          "O nome do arquivo não foi informado. Tente gerar o relatório novamente.",
        );
      }

      const reportsPath = getReportsPath();

      // Extrai apenas o nome do arquivo, removendo qualquer caminho de diretório
      const sanitizedFilename = path.basename(filename);
      if (
        !sanitizedFilename ||
        sanitizedFilename === "." ||
        sanitizedFilename === ".."
      ) {
        throw new Error(
          "O nome do arquivo é inválido. Tente gerar o relatório novamente.",
        );
      }

      const fullPath = path.resolve(path.join(reportsPath, sanitizedFilename));

      // Validação de segurança: garante que o arquivo será salvo dentro da pasta de relatórios
      assertPathWithinDirectory(fullPath, reportsPath);

      // Limite de segurança: impede decode de payloads excessivamente grandes (max 50 MB)
      const MAX_PDF_BASE64_SIZE = 50 * 1024 * 1024 * 1.37; // ~68.5 MB em base64 = ~50 MB decoded
      if (pdfBase64.length > MAX_PDF_BASE64_SIZE) {
        throw new Error(
          "O relatório PDF excede o tamanho máximo permitido (50 MB).",
        );
      }

      const buffer = Buffer.from(pdfBase64, "base64");
      if (buffer.length === 0) {
        throw new Error(
          "O conteúdo do PDF está vazio. Tente gerar o relatório novamente.",
        );
      }

      fs.writeFileSync(fullPath, buffer);
      return fullPath;
    } catch (error) {
      console.error("[CPX-Stress] Erro ao salvar PDF:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("ENOSPC")) {
        throw new Error(
          "Não há espaço suficiente em disco para salvar o relatório.",
        );
      }
      if (msg.includes("EACCES") || msg.includes("EPERM")) {
        throw new Error(
          "Sem permissão para salvar o arquivo. Verifique as permissões da pasta de relatórios.",
        );
      }
      throw new Error(
        msg.startsWith("O ") ||
          msg.startsWith("Os ") ||
          msg.startsWith("Não ") ||
          msg.startsWith("Sem ")
          ? msg
          : `Não foi possível salvar o relatório PDF: ${msg}`,
      );
    }
  },
  );

/**
 * Canal: pdf:open
 * Abre um arquivo PDF no aplicativo padrão do sistema operacional.
 *
 * Inclui validação de segurança para impedir abertura de arquivos fora da pasta de relatórios.
 */
  ipcMain.handle("pdf:open", async (_event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("O caminho do arquivo não foi informado.");
    }

    const reportsPath = getReportsPath();
    const resolved = path.resolve(filePath);

    // Validação de segurança: só permite abrir arquivos dentro da pasta de relatórios
    assertPathWithinDirectory(resolved, reportsPath);

    // Verifica se o arquivo existe antes de tentar abrir
    if (!fs.existsSync(resolved)) {
      throw new Error(
        "O arquivo do relatório não foi encontrado. Ele pode ter sido movido ou excluído.",
      );
    }

    const errorMsg = await shell.openPath(resolved);
    if (errorMsg) {
      throw new Error(`Não foi possível abrir o arquivo: ${errorMsg}`);
    }
  } catch (error) {
    console.error("[CPX-Stress] Erro ao abrir PDF:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      msg.startsWith("O ") || msg.startsWith("Não ")
        ? msg
        : `Não foi possível abrir o relatório PDF: ${msg}`,
    );
  }
  });

/**
 * Canal: json:export
 * Abre uma janela "Salvar como" para o usuário escolher onde salvar um arquivo JSON.
 * Retorna o caminho escolhido ou null se o usuário cancelar.
 */
  ipcMain.handle(
  "json:export",
  async (_event, data: string, defaultName: string) => {
    try {
      if (!mainWindow) {
        return null;
      }

      if (!data || typeof data !== "string") {
        throw new Error(
          "Os dados para exportação não foram gerados corretamente. Tente novamente.",
        );
      }

      const safeName =
        typeof defaultName === "string" && defaultName.trim() !== ""
          ? path.basename(defaultName)
          : DEFAULT_JSON_EXPORT_NAME;

      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: safeName,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      fs.writeFileSync(result.filePath, data, "utf-8");
      return result.filePath;
    } catch (error) {
      console.error("[CPX-Stress] Erro ao exportar JSON:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("ENOSPC")) {
        throw new Error(
          "Não há espaço suficiente em disco para salvar o arquivo.",
        );
      }
      if (msg.includes("EACCES") || msg.includes("EPERM")) {
        throw new Error(
          "Sem permissão para salvar o arquivo no local escolhido. Tente outro local.",
        );
      }
      throw new Error(
        msg.startsWith("Os ") ||
          msg.startsWith("Não ") ||
          msg.startsWith("Sem ")
          ? msg
          : `Não foi possível exportar os dados: ${msg}`,
      );
    }
  },
  );

// ===========================================================================
//  Handlers IPC — Utilitários
// ===========================================================================

/**
 * Canal: app:getPath
 * Retorna o caminho da pasta de dados do aplicativo.
 * Usado pela interface para exibir onde os dados estão armazenados.
 */
  ipcMain.handle("app:getPath", () => {
  try {
    return getDataPath();
  } catch (error) {
    console.error("[CPX-Stress] Erro ao obter caminho de dados:", error);
    return "Caminho indisponível";
  }
  });

/**
 * Canal: k6:check
 * Verifica se o binário do k6 está disponível para execução.
 */
  ipcMain.handle("k6:check", () => {
  try {
    return isK6Available();
  } catch (error) {
    console.error("[CPX-Stress] Erro ao verificar disponibilidade do k6:", error);
    return false;
  }
  });

/**
 * Canal: k6:run
 * Executa um benchmark com k6 usando o mesmo config do teste atual.
 * O progresso textual do subprocesso é encaminhado ao renderer.
 */
  ipcMain.handle("k6:run", async (_event, config: K6Config) => {
  try {
    if (!config || typeof config !== "object") {
      throw new Error("Configuração do k6 inválida.");
    }
    return await runK6(config, (line) => {
      mainWindow?.webContents.send("k6:progress", line);
    });
  } catch (error) {
    console.error("[CPX-Stress] Erro ao executar comparação com k6:", error);
    throw new Error(traduzirErro(error));
  }
  });

/**
 * Canal: locust:check
 * Verifica se o binário do Locust está disponível para execução.
 */
  ipcMain.handle("locust:check", () => {
  try {
    return isLocustAvailable();
  } catch (error) {
    console.error("[CPX-Stress] Erro ao verificar disponibilidade do Locust:", error);
    return false;
  }
  });

/**
 * Canal: locust:run
 * Executa um benchmark com Locust usando o mesmo config do teste atual.
 * O progresso textual do subprocesso é encaminhado ao renderer.
 */
  ipcMain.handle("locust:run", async (_event, config: LocustConfig) => {
  try {
    if (!config || typeof config !== "object") {
      throw new Error("Configuração do Locust inválida.");
    }
    return await runLocust(config, (line) => {
      mainWindow?.webContents.send("locust:progress", line);
    });
  } catch (error) {
    console.error("[CPX-Stress] Erro ao executar comparação com Locust:", error);
    throw new Error(traduzirErro(error));
  }
  });

/**
 * Canal: jmeter:check
 * Verifica se o binário do JMeter está disponível para execução.
 */
  ipcMain.handle("jmeter:check", () => {
  try {
    return isJMeterAvailable();
  } catch (error) {
    console.error("[CPX-Stress] Erro ao verificar disponibilidade do JMeter:", error);
    return false;
  }
  });

/**
 * Canal: jmeter:run
 * Executa um benchmark com JMeter usando o mesmo config do teste atual.
 */
  ipcMain.handle("jmeter:run", async (_event, config: JMeterConfig) => {
  try {
    if (!config || typeof config !== "object") {
      throw new Error("Configuração do JMeter inválida.");
    }
    return await runJMeter(config, (line) => {
      mainWindow?.webContents.send("jmeter:progress", line);
    });
  } catch (error) {
    console.error("[CPX-Stress] Erro ao executar comparação com JMeter:", error);
    throw new Error(traduzirErro(error));
  }
  });

// ===========================================================================
//  Handlers IPC — Gerenciamento de Credenciais
// ===========================================================================
// Estes handlers permitem que a interface verifique e salve credenciais
// MisterT sem expor os valores reais ao processo de renderização.
// SEGURANCA: Apenas booleanos e nomes de chaves são retornados — nunca valores.
// ===========================================================================

/**
 * Canal: credentials:status
 * Verifica quais credenciais obrigatorias estão configuradas.
 * Retorna um mapa booleano (chave -> configurada ou não). NUNCA retorna valores.
 */
  ipcMain.handle("credentials:status", async () => {
  try {
    const requiredKeys = ["STRESSFLOW_USER", "STRESSFLOW_PASS"];
    const status: Record<string, boolean> = {};
    for (const key of requiredKeys) {
      status[key] = !!(envVars[key] && envVars[key].trim() !== "");
    }
    return status;
  } catch (error) {
    console.error("[CPX-Stress] Erro ao verificar credenciais:", error);
    throw new Error("Não foi possível verificar o status das credenciais.");
  }
  });

/**
 * Canal: credentials:load
 * Retorna a lista de NOMES de chaves STRESSFLOW_* configuradas no .env.
 * SEGURANCA: Retorna apenas nomes de chaves (string[]), NUNCA valores.
 */
  ipcMain.handle("credentials:load", async () => {
  try {
    return Object.keys(envVars).filter((key) => key.startsWith("STRESSFLOW_"));
  } catch (error) {
    console.error("[CPX-Stress] Erro ao listar chaves de credenciais:", error);
    throw new Error("Não foi possível listar as chaves de credenciais.");
  }
  });

/**
 * Canal: credentials:save
 * Salva credenciais no .env do diretório userData.
 * Aceita apenas chaves com prefixo STRESSFLOW_ (whitelist de seguranca).
 * Entradas com valor vazio são filtradas antes de salvar (preservam valor anterior).
 */
  ipcMain.handle(
  "credentials:save",
  async (_event, entries: Array<{ key: string; value: string }>) => {
    try {
      if (!entries || !Array.isArray(entries)) {
        throw new Error("Dados de credenciais inválidos.");
      }

      // Filtrar entradas vazias — campos em branco no formulario não sobrescrevem valores existentes
      const nonEmpty = entries.filter(
        (e) => e && typeof e.key === "string" && typeof e.value === "string" && e.value.trim() !== "",
      );

      if (nonEmpty.length === 0) {
        throw new Error("Nenhuma credencial para salvar. Preencha ao menos um campo.");
      }

      return saveEnvFile(nonEmpty);
    } catch (error) {
      console.error("[CPX-Stress] Erro ao salvar credenciais:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("EACCES") || msg.includes("EPERM")) {
        throw new Error(
          "Sem permissao para salvar as credenciais. Verifique as permissoes do diretório de dados.",
        );
      }
      throw new Error(
        msg.startsWith("Chave") || msg.startsWith("Nenhuma") || msg.startsWith("Dados") || msg.startsWith("Sem") || msg.startsWith("Não")
          ? msg
          : `Não foi possível salvar as credenciais: ${msg}`,
      );
    }
  },
  );

// ===========================================================================
//  Handlers IPC — Gerenciamento de Presets de Teste
// ===========================================================================
// Estes handlers permitem que a interface liste, salve, renomeie e delete
// presets de teste. O preset built-in "MisterT Completo" e protegido contra
// alterações e exclusão tanto na camada IPC quanto no repositório.
// ===========================================================================

/**
 * Canal: presets:list
 * Lista todos os presets (built-in primeiro, depois usuário por nome).
 */
  ipcMain.handle("presets:list", async () => {
  try {
    initializeDatabase();
    const presets = listPresets();
    return JSON.parse(JSON.stringify(presets));
  } catch (error) {
    console.error("[CPX-Stress] Erro ao listar presets:", error);
    return [];
  }
  });

/**
 * Canal: presets:save
 * Salva um novo preset ou atualiza um existente.
 * Retorna o preset salvo com todos os campos.
 */
  ipcMain.handle(
  "presets:save",
  async (
    _event,
    data: { id?: string; name: string; configJson: string },
  ) => {
    try {
      if (!data || typeof data !== "object") {
        throw new Error("Dados do preset inválidos.");
      }
      if (!data.name || typeof data.name !== "string") {
        throw new Error("Informe um nome para o preset.");
      }
      if (!data.configJson || typeof data.configJson !== "string") {
        throw new Error("Configuração do preset ausente.");
      }
      return savePreset(data);
    } catch (error) {
      console.error("[CPX-Stress] Erro ao salvar preset:", error);
      const msg = error instanceof Error ? error.message : String(error);
      // Tratar UNIQUE constraint do SQLite para nome duplicado
      if (msg.includes("UNIQUE constraint failed") || msg.includes("test_presets.name")) {
        throw new Error("Já existe um preset com este nome.");
      }
      throw new Error(
        msg.startsWith("Informe") ||
          msg.startsWith("Presets built-in") ||
          msg.startsWith("O nome") ||
          msg.startsWith("A configuração") ||
          msg.startsWith("Dados") ||
          msg.startsWith("Configuração")
          ? msg
          : `Não foi possível salvar o preset: ${msg}`,
      );
    }
  },
  );

/**
 * Canal: presets:rename
 * Renomeia um preset do usuário. Rejeita presets built-in.
 */
  ipcMain.handle(
  "presets:rename",
  async (_event, id: string, newName: string) => {
    try {
      if (!id || typeof id !== "string") {
        throw new Error("Identificador do preset não informado.");
      }
      if (!newName || typeof newName !== "string") {
        throw new Error("Informe um novo nome para o preset.");
      }
      renamePreset(id, newName);
    } catch (error) {
      console.error("[CPX-Stress] Erro ao renomear preset:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("UNIQUE constraint failed") || msg.includes("test_presets.name")) {
        throw new Error("Já existe um preset com este nome.");
      }
      throw new Error(
        msg.startsWith("Informe") ||
          msg.startsWith("Preset não") ||
          msg.startsWith("Presets built-in") ||
          msg.startsWith("O nome") ||
          msg.startsWith("Identificador")
          ? msg
          : `Não foi possível renomear o preset: ${msg}`,
      );
    }
  },
  );

/**
 * Canal: presets:delete
 * Deleta um preset do usuário. Rejeita presets built-in.
 */
  ipcMain.handle("presets:delete", async (_event, id: string) => {
  try {
    if (!id || typeof id !== "string") {
      throw new Error("Identificador do preset não informado.");
    }
    deletePreset(id);
  } catch (error) {
    console.error("[CPX-Stress] Erro ao excluir preset:", error);
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      msg.startsWith("Preset não") ||
        msg.startsWith("Presets built-in") ||
        msg.startsWith("Identificador")
        ? msg
        : `Não foi possível excluir o preset: ${msg}`,
    );
  }
  });

// ===========================================================================
//  Handlers IPC — Consulta de Erros Detalhados
// ===========================================================================

/**
 * Canal: errors:search
 * Busca erros detalhados com filtros opcionais (testId, statusCode, errorType).
 * Retorna registros paginados e o total correspondente.
 */
  ipcMain.handle(
  "errors:search",
  async (
    _event,
    params: {
      testId?: string;
      statusCode?: number;
      errorType?: string;
      operationName?: string;
      timestampStart?: number;
      timestampEnd?: number;
      limit?: number;
      offset?: number;
    },
  ) => {
    try {
      if (!params || typeof params !== "object") {
        return { records: [], total: 0 };
      }
      return searchErrors(params);
    } catch (error) {
      console.error("[CPX-Stress] Erro ao buscar erros:", error);
      throw new Error("Não foi possível buscar os erros detalhados.");
    }
  },
  );

/**
 * Canal: errors:byStatusCode
 * Retorna contagem de erros agrupados por status code para um teste específico.
 */
  ipcMain.handle("errors:byStatusCode", async (_event, testId: string) => {
  try {
    if (!testId || typeof testId !== "string") return {};
    return getErrorsByStatusCode(testId);
  } catch (error) {
    console.error("[CPX-Stress] Erro ao buscar erros por status code:", error);
    throw new Error("Não foi possível buscar os erros por código de status.");
  }
  });

/**
 * Canal: errors:byErrorType
 * Retorna contagem de erros agrupados por tipo para um teste específico.
 */
  ipcMain.handle("errors:byErrorType", async (_event, testId: string) => {
  try {
    if (!testId || typeof testId !== "string") return {};
    return getErrorsByType(testId);
  } catch (error) {
    console.error("[CPX-Stress] Erro ao buscar erros por tipo:", error);
    throw new Error("Não foi possível buscar os erros por tipo.");
  }
  });

/**
 * Canal: errors:byOperationName
 * Retorna contagem de erros agrupados por nome de operação para um teste específico.
 */
  ipcMain.handle("errors:byOperationName", async (_event, testId: string) => {
  try {
    if (!testId || typeof testId !== "string") return {};
    return getErrorsByOperationName(testId);
  } catch (error) {
    console.error("[CPX-Stress] Erro ao buscar erros por operação:", error);
    throw new Error("Não foi possível buscar os erros por operação.");
  }
  });

// ===========================================================================
//  Ciclo de Vida do Aplicativo
// ===========================================================================
// O Electron gerencia o ciclo de vida do aplicativo com eventos.
// Aqui configuramos o que acontece quando o app inicia, fecha e é reativado.
// ===========================================================================

/**
 * Quando o Electron termina de inicializar, inicializa o banco de dados
 * e cria a janela principal.
 */
  app.whenReady().then(() => {
    envVars = loadEnvFile();
    initializeDatabase();
    createWindow();
  });

/**
 * Quando todas as janelas são fechadas:
 * - No macOS (darwin), o app continua rodando na barra de menus (comportamento padrão).
 * - Nos demais sistemas (Windows/Linux), o app é encerrado completamente.
 */
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      closeDatabase();
      app.quit();
    }
  });

/**
 * Quando o app é reativado (clique no ícone do dock no macOS),
 * cria uma nova janela caso nenhuma esteja aberta.
 */
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
