/**
 * ============================================================================
 *  StressFlow — Processo Principal do Electron (Main Process)
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

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { StressEngine } from './engine/stress-engine'
import type { TestConfig, TestResult } from './engine/stress-engine'

// ---------------------------------------------------------------------------
// Tratamento global de erros não capturados
// ---------------------------------------------------------------------------
// Garante que exceções e promessas rejeitadas não derrubem o aplicativo
// silenciosamente. O erro é registrado no console para diagnóstico.
// ---------------------------------------------------------------------------
process.on('uncaughtException', (error) => {
  console.error('[StressFlow] Erro não capturado no processo principal:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[StressFlow] Promessa rejeitada sem tratamento no processo principal:', reason)
})

// ---------------------------------------------------------------------------
// Caminhos do ambiente — necessários para o Vite (bundler) funcionar
// tanto em modo de desenvolvimento quanto na versão empacotada final.
// ---------------------------------------------------------------------------
process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// ---------------------------------------------------------------------------
// Estado global da aplicação
// ---------------------------------------------------------------------------

/** Referência à janela principal — null quando a janela está fechada. */
let mainWindow: BrowserWindow | null = null

/** Motor de testes em execução — null quando nenhum teste está rodando. */
let activeEngine: StressEngine | null = null

/** Promise do teste em andamento — usada para aguardar o término ao cancelar. */
let activeTestPromise: Promise<TestResult> | null = null

/** URL do servidor de desenvolvimento do Vite (só existe em modo dev). */
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

/** Quantidade máxima de testes armazenados no histórico. */
const MAX_HISTORY_ENTRIES = 100

// ===========================================================================
//  Gerenciamento de Arquivos e Diretórios
// ===========================================================================
// O StressFlow salva dados em uma pasta dentro do diretório do usuário.
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
    const dataPath = path.join(app.getPath('userData'), 'stressflow-data')
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true })
    }
    return dataPath
  } catch (error) {
    console.error('[StressFlow] Erro ao acessar pasta de dados:', error)
    throw new Error('Não foi possível acessar a pasta de dados do aplicativo. Verifique as permissões do sistema.')
  }
}

/** Retorna o caminho do arquivo JSON onde o histórico de testes é salvo. */
function getHistoryPath(): string {
  return path.join(getDataPath(), 'history.json')
}

/**
 * Retorna o caminho da pasta onde os relatórios PDF são armazenados.
 * Cria a pasta automaticamente caso ela ainda não exista.
 */
function getReportsPath(): string {
  try {
    const reportsPath = path.join(getDataPath(), 'reports')
    if (!fs.existsSync(reportsPath)) {
      fs.mkdirSync(reportsPath, { recursive: true })
    }
    return reportsPath
  } catch (error) {
    console.error('[StressFlow] Erro ao acessar pasta de relatórios:', error)
    throw new Error('Não foi possível acessar a pasta de relatórios. Verifique as permissões do sistema.')
  }
}

// ===========================================================================
//  Histórico de Testes — Leitura e Escrita
// ===========================================================================
// O histórico é salvo como um array JSON no disco. Cada entrada contém
// todos os dados de um teste executado (configuração, métricas, timeline).
// ===========================================================================

/**
 * Carrega a lista de testes do histórico a partir do disco.
 * Retorna um array vazio se o arquivo não existir ou estiver corrompido.
 */
function loadHistory(): TestResult[] {
  const historyPath = getHistoryPath()

  if (!fs.existsSync(historyPath)) {
    return []
  }

  try {
    const data = fs.readFileSync(historyPath, 'utf-8')
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('[StressFlow] Erro ao ler histórico do disco — o arquivo pode estar corrompido:', error)
    return []
  }
}

/**
 * Salva a lista de testes no disco, substituindo o conteúdo anterior.
 */
function saveHistory(history: TestResult[]): void {
  try {
    const safeHistory = Array.isArray(history) ? history : []
    fs.writeFileSync(getHistoryPath(), JSON.stringify(safeHistory, null, 2), 'utf-8')
  } catch (error) {
    console.error('[StressFlow] Erro ao salvar histórico no disco:', error)
    throw new Error('Não foi possível salvar o histórico de testes. Verifique se há espaço em disco disponível.')
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
function assertPathWithinDirectory(filePath: string, allowedDirectory: string): void {
  const resolved = path.resolve(filePath)
  // Adicionamos o separador ao final para garantir que "/reports-evil" não
  // passe na verificação quando o diretório permitido é "/reports".
  if (!resolved.startsWith(allowedDirectory + path.sep) && resolved !== allowedDirectory) {
    throw new Error('Caminho de arquivo fora do diretório permitido')
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'StressFlow',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Segurança: isolamento de contexto impede que a interface acesse APIs do Node.js
      contextIsolation: true,
      // Segurança: desabilita integração com Node.js no processo de renderização
      nodeIntegration: false,
      // Segurança: impede abertura de novas janelas sem controle
      sandbox: true,
    },
  })

  // Remove a barra de menus padrão do Electron (Arquivo, Editar, etc.)
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    mainWindow = null
    if (activeEngine) {
      activeEngine.cancel()
      activeEngine = null
      activeTestPromise = null
    }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || '', 'index.html'))
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
  const mensagem = error instanceof Error ? error.message : String(error)

  // Erros de conexão e rede
  if (mensagem.includes('ECONNREFUSED'))
    return 'Não foi possível conectar ao servidor. Verifique se o endereço está correto e se o servidor está funcionando.'
  if (mensagem.includes('ENOTFOUND') || mensagem.includes('getaddrinfo'))
    return 'O endereço informado não foi encontrado. Verifique se a URL está escrita corretamente.'
  if (mensagem.includes('ETIMEDOUT') || mensagem.includes('timeout'))
    return 'O servidor demorou demais para responder. Ele pode estar sobrecarregado ou inacessível.'
  if (mensagem.includes('ECONNRESET'))
    return 'A conexão com o servidor foi interrompida inesperadamente. Tente novamente.'
  if (mensagem.includes('CERT_') || mensagem.includes('certificate') || mensagem.includes('SSL'))
    return 'Houve um problema com o certificado de segurança do site. O endereço pode ter um certificado inválido ou expirado.'
  if (mensagem.includes('EHOSTUNREACH'))
    return 'O servidor não está acessível. Verifique sua conexão com a internet e se o endereço está correto.'
  if (mensagem.includes('EAI_AGAIN'))
    return 'Não foi possível resolver o endereço do servidor. Verifique sua conexão com a internet.'

  // Erros de teste
  if (mensagem.includes('Teste já em execução'))
    return 'Já existe um teste em andamento. Aguarde a conclusão ou cancele o teste atual antes de iniciar outro.'
  if (mensagem.includes('Cancelado') || mensagem.includes('Cancelled'))
    return 'O teste foi cancelado pelo usuário.'
  if (mensagem.includes('Invalid URL') || mensagem.includes('URL inválida'))
    return 'O endereço informado não é válido. Verifique se começa com http:// ou https:// — exemplo: https://www.meusite.com.br'

  // Erro genérico — preserva a mensagem original como detalhe
  return `Ocorreu um erro inesperado: ${mensagem}`
}

/**
 * Canal: test:start
 * Inicia um novo teste de estresse com a configuração recebida da interface.
 * Envia atualizações de progresso em tempo real pelo canal "test:progress".
 * Retorna o resultado completo do teste ao finalizar.
 */
ipcMain.handle('test:start', async (_event, config: TestConfig) => {
  try {
    if (activeEngine || activeTestPromise) {
      throw new Error('Teste já em execução')
    }

    // Validação básica da configuração recebida
    if (!config || typeof config !== 'object') {
      throw new Error('Configuração de teste inválida. Os parâmetros do teste não foram recebidos corretamente.')
    }
    if (!config.url || typeof config.url !== 'string' || config.url.trim() === '') {
      throw new Error('URL inválida. Informe o endereço do site que deseja testar.')
    }
    if (!config.virtualUsers || config.virtualUsers < 1 || config.virtualUsers > 10000) {
      throw new Error('O número de visitantes simultâneos deve ser entre 1 e 10.000.')
    }
    if (!config.duration || config.duration < 5 || config.duration > 600) {
      throw new Error('A duração do teste deve ser entre 5 e 600 segundos.')
    }

    activeEngine = new StressEngine()

    activeTestPromise = activeEngine.run(config, (progress) => {
      mainWindow?.webContents.send('test:progress', progress)
    })

    const result = await activeTestPromise

    // Salva o resultado no início do histórico (mais recente primeiro)
    const history = loadHistory()
    history.unshift(result)

    // Limita o tamanho do histórico para evitar crescimento infinito
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(MAX_HISTORY_ENTRIES)
    }

    saveHistory(history)
    return result
  } catch (error) {
    console.error('[StressFlow] Erro durante execução do teste:', error)
    throw new Error(traduzirErro(error))
  } finally {
    // Sempre limpa o estado, independente de sucesso ou erro
    activeEngine = null
    activeTestPromise = null
  }
})

/**
 * Canal: test:cancel
 * Cancela o teste de estresse em execução.
 * Aguarda o teste finalizar completamente antes de retornar.
 */
ipcMain.handle('test:cancel', async () => {
  try {
    if (!activeEngine) {
      return false
    }

    activeEngine.cancel()

    // Aguarda o teste finalizar antes de liberar os recursos
    if (activeTestPromise) {
      try {
        await activeTestPromise
      } catch {
        // Erro esperado ao cancelar — o motor lança exceção proposital
      }
    }

    activeEngine = null
    activeTestPromise = null
    return true
  } catch (error) {
    console.error('[StressFlow] Erro ao cancelar teste:', error)
    activeEngine = null
    activeTestPromise = null
    throw new Error('Não foi possível cancelar o teste. Tente fechar e reabrir o aplicativo.')
  }
})

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
ipcMain.handle('history:list', async () => {
  try {
    return loadHistory()
  } catch (error) {
    console.error('[StressFlow] Erro ao carregar histórico:', error)
    throw new Error('Não foi possível carregar o histórico de testes. O arquivo pode estar corrompido ou inacessível.')
  }
})

/**
 * Canal: history:get
 * Busca um teste específico no histórico pelo seu ID único.
 * Retorna null se o teste não for encontrado.
 */
ipcMain.handle('history:get', async (_event, id: string) => {
  try {
    if (!id || typeof id !== 'string') {
      return null
    }
    const history = loadHistory()
    return history.find((test) => test.id === id) || null
  } catch (error) {
    console.error('[StressFlow] Erro ao buscar teste no histórico:', error)
    throw new Error('Não foi possível buscar o teste no histórico. Tente recarregar a lista.')
  }
})

/**
 * Canal: history:delete
 * Remove um teste específico do histórico pelo seu ID.
 */
ipcMain.handle('history:delete', async (_event, id: string) => {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Identificador do teste não informado.')
    }
    const history = loadHistory()
    const filtered = history.filter((test) => test.id !== id)
    saveHistory(filtered)
    return true
  } catch (error) {
    console.error('[StressFlow] Erro ao excluir teste do histórico:', error)
    throw new Error('Não foi possível excluir o teste do histórico. Tente novamente.')
  }
})

/**
 * Canal: history:clear
 * Remove todos os testes do histórico.
 */
ipcMain.handle('history:clear', async () => {
  try {
    saveHistory([])
    return true
  } catch (error) {
    console.error('[StressFlow] Erro ao limpar histórico:', error)
    throw new Error('Não foi possível limpar o histórico de testes. Verifique as permissões do sistema.')
  }
})

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
ipcMain.handle('pdf:save', async (_event, pdfBase64: string, filename: string) => {
  try {
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      throw new Error('Os dados do PDF não foram gerados corretamente. Tente gerar o relatório novamente.')
    }
    if (!filename || typeof filename !== 'string') {
      throw new Error('O nome do arquivo não foi informado. Tente gerar o relatório novamente.')
    }

    const reportsPath = getReportsPath()

    // Extrai apenas o nome do arquivo, removendo qualquer caminho de diretório
    const sanitizedFilename = path.basename(filename)
    if (!sanitizedFilename || sanitizedFilename === '.' || sanitizedFilename === '..') {
      throw new Error('O nome do arquivo é inválido. Tente gerar o relatório novamente.')
    }

    const fullPath = path.resolve(path.join(reportsPath, sanitizedFilename))

    // Validação de segurança: garante que o arquivo será salvo dentro da pasta de relatórios
    assertPathWithinDirectory(fullPath, reportsPath)

    const buffer = Buffer.from(pdfBase64, 'base64')
    if (buffer.length === 0) {
      throw new Error('O conteúdo do PDF está vazio. Tente gerar o relatório novamente.')
    }

    fs.writeFileSync(fullPath, buffer)
    return fullPath
  } catch (error) {
    console.error('[StressFlow] Erro ao salvar PDF:', error)
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ENOSPC')) {
      throw new Error('Não há espaço suficiente em disco para salvar o relatório.')
    }
    if (msg.includes('EACCES') || msg.includes('EPERM')) {
      throw new Error('Sem permissão para salvar o arquivo. Verifique as permissões da pasta de relatórios.')
    }
    throw new Error(msg.startsWith('O ') || msg.startsWith('Os ') || msg.startsWith('Não ') || msg.startsWith('Sem ')
      ? msg
      : `Não foi possível salvar o relatório PDF: ${msg}`)
  }
})

/**
 * Canal: pdf:open
 * Abre um arquivo PDF no aplicativo padrão do sistema operacional.
 *
 * Inclui validação de segurança para impedir abertura de arquivos fora da pasta de relatórios.
 */
ipcMain.handle('pdf:open', async (_event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('O caminho do arquivo não foi informado.')
    }

    const reportsPath = getReportsPath()
    const resolved = path.resolve(filePath)

    // Validação de segurança: só permite abrir arquivos dentro da pasta de relatórios
    assertPathWithinDirectory(resolved, reportsPath)

    // Verifica se o arquivo existe antes de tentar abrir
    if (!fs.existsSync(resolved)) {
      throw new Error('O arquivo do relatório não foi encontrado. Ele pode ter sido movido ou excluído.')
    }

    const errorMsg = await shell.openPath(resolved)
    if (errorMsg) {
      throw new Error(`Não foi possível abrir o arquivo: ${errorMsg}`)
    }
  } catch (error) {
    console.error('[StressFlow] Erro ao abrir PDF:', error)
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(msg.startsWith('O ') || msg.startsWith('Não ')
      ? msg
      : `Não foi possível abrir o relatório PDF: ${msg}`)
  }
})

/**
 * Canal: json:export
 * Abre uma janela "Salvar como" para o usuário escolher onde salvar um arquivo JSON.
 * Retorna o caminho escolhido ou null se o usuário cancelar.
 */
ipcMain.handle('json:export', async (_event, data: string, defaultName: string) => {
  try {
    if (!mainWindow) {
      return null
    }

    if (!data || typeof data !== 'string') {
      throw new Error('Os dados para exportação não foram gerados corretamente. Tente novamente.')
    }

    const safeName = typeof defaultName === 'string' && defaultName.trim() !== ''
      ? path.basename(defaultName)
      : 'stressflow-export.json'

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: safeName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    fs.writeFileSync(result.filePath, data, 'utf-8')
    return result.filePath
  } catch (error) {
    console.error('[StressFlow] Erro ao exportar JSON:', error)
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ENOSPC')) {
      throw new Error('Não há espaço suficiente em disco para salvar o arquivo.')
    }
    if (msg.includes('EACCES') || msg.includes('EPERM')) {
      throw new Error('Sem permissão para salvar o arquivo no local escolhido. Tente outro local.')
    }
    throw new Error(msg.startsWith('Os ') || msg.startsWith('Não ') || msg.startsWith('Sem ')
      ? msg
      : `Não foi possível exportar os dados: ${msg}`)
  }
})

// ===========================================================================
//  Handlers IPC — Utilitários
// ===========================================================================

/**
 * Canal: app:getPath
 * Retorna o caminho da pasta de dados do aplicativo.
 * Usado pela interface para exibir onde os dados estão armazenados.
 */
ipcMain.handle('app:getPath', () => {
  try {
    return getDataPath()
  } catch (error) {
    console.error('[StressFlow] Erro ao obter caminho de dados:', error)
    return 'Caminho indisponível'
  }
})

// ===========================================================================
//  Ciclo de Vida do Aplicativo
// ===========================================================================
// O Electron gerencia o ciclo de vida do aplicativo com eventos.
// Aqui configuramos o que acontece quando o app inicia, fecha e é reativado.
// ===========================================================================

/**
 * Quando o Electron termina de inicializar, cria a janela principal.
 */
app.whenReady().then(createWindow)

/**
 * Quando todas as janelas são fechadas:
 * - No macOS (darwin), o app continua rodando na barra de menus (comportamento padrão).
 * - Nos demais sistemas (Windows/Linux), o app é encerrado completamente.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * Quando o app é reativado (clique no ícone do dock no macOS),
 * cria uma nova janela caso nenhuma esteja aberta.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
