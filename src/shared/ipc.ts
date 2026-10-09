/**
 * Contrato tipado de IPC entre main e renderer.
 * Todo canal novo é declarado aqui; preload e main só aceitam canais desta lista.
 */
export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  versions: { electron: string; chrome: string; node: string }
}

export interface InvokeChannels {
  'app:info': { args: []; result: AppInfo }
}

export type InvokeChannel = keyof InvokeChannels
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]['result']

/** API exposta ao renderer em `window.clawos`. */
export interface ClawosApi {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>>
}
