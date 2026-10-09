import { contextBridge, ipcRenderer } from 'electron'
import type { ClawosApi } from '@shared/ipc'

const api: ClawosApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
}

contextBridge.exposeInMainWorld('clawos', api)
