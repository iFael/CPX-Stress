import { contextBridge, ipcRenderer } from 'electron'

const api = {
  test: {
    start: (config: unknown) => ipcRenderer.invoke('test:start', config),
    cancel: () => ipcRenderer.invoke('test:cancel'),
    onProgress: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('test:progress', handler)
      return () => {
        ipcRenderer.removeListener('test:progress', handler)
      }
    },
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    get: (id: string) => ipcRenderer.invoke('history:get', id),
    delete: (id: string) => ipcRenderer.invoke('history:delete', id),
    clear: () => ipcRenderer.invoke('history:clear'),
  },
  pdf: {
    save: (base64: string, filename: string) =>
      ipcRenderer.invoke('pdf:save', base64, filename),
    open: (filePath: string) => ipcRenderer.invoke('pdf:open', filePath),
  },
  json: {
    export: (data: string, defaultName: string) =>
      ipcRenderer.invoke('json:export', data, defaultName),
  },
  app: {
    getPath: () => ipcRenderer.invoke('app:getPath'),
  },
}

contextBridge.exposeInMainWorld('stressflow', api)
