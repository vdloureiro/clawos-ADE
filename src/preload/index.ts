import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, type ClawosApi } from '@shared/ipc'

const api: ClawosApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => {
    if (!EVENT_CHANNELS.includes(channel)) throw new Error(`Canal desconhecido: ${channel}`)
    const wrapped = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) =>
      listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
}

contextBridge.exposeInMainWorld('clawos', api)
