import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { StressEngine } from './engine/stress-engine'
import type { TestConfig, TestResult } from './engine/stress-engine'

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
let engine: StressEngine | null = null

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function getDataPath(): string {
  const dataPath = path.join(app.getPath('userData'), 'stressflow-data')
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  return dataPath
}

function getHistoryPath(): string {
  return path.join(getDataPath(), 'history.json')
}

function getReportsPath(): string {
  const reportsPath = path.join(getDataPath(), 'reports')
  if (!fs.existsSync(reportsPath)) {
    fs.mkdirSync(reportsPath, { recursive: true })
  }
  return reportsPath
}

function loadHistory(): TestResult[] {
  const historyPath = getHistoryPath()
  if (!fs.existsSync(historyPath)) {
    return []
  }
  const data = fs.readFileSync(historyPath, 'utf-8')
  return JSON.parse(data)
}

function saveHistory(history: TestResult[]): void {
  fs.writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2), 'utf-8')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'StressFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f1117',
  })

  mainWindow.setMenuBarVisibility(false)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }
}

// IPC Handlers
ipcMain.handle('test:start', async (_event, config: TestConfig) => {
  if (engine) {
    throw new Error('Teste já em execução')
  }

  engine = new StressEngine()

  try {
    const result = await engine.run(config, (progress) => {
      mainWindow?.webContents.send('test:progress', progress)
    })

    const history = loadHistory()
    history.unshift(result)
    if (history.length > 100) {
      history.splice(100)
    }
    saveHistory(history)

    engine = null
    return result
  } catch (error) {
    engine = null
    throw error
  }
})

ipcMain.handle('test:cancel', async () => {
  if (engine) {
    engine.cancel()
    engine = null
    return true
  }
  return false
})

ipcMain.handle('history:list', async () => {
  return loadHistory()
})

ipcMain.handle('history:get', async (_event, id: string) => {
  const history = loadHistory()
  return history.find((t) => t.id === id) || null
})

ipcMain.handle('history:delete', async (_event, id: string) => {
  let history = loadHistory()
  history = history.filter((t) => t.id !== id)
  saveHistory(history)
  return true
})

ipcMain.handle('history:clear', async () => {
  saveHistory([])
  return true
})

ipcMain.handle('pdf:save', async (_event, pdfBase64: string, filename: string) => {
  const reportsPath = getReportsPath()
  const sanitizedFilename = path.basename(filename)
  const filePath = path.join(reportsPath, sanitizedFilename)
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(reportsPath)) {
    throw new Error('Nome de arquivo inválido')
  }
  const buffer = Buffer.from(pdfBase64, 'base64')
  fs.writeFileSync(resolved, buffer)
  return resolved
})

ipcMain.handle('pdf:open', async (_event, filePath: string) => {
  const reportsPath = getReportsPath()
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(reportsPath)) {
    throw new Error('Caminho inválido')
  }
  shell.openPath(resolved)
})

ipcMain.handle('json:export', async (_event, data: string, defaultName: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.basename(defaultName),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return result.filePath
  }
  return null
})

ipcMain.handle('app:getPath', () => {
  return getDataPath()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
