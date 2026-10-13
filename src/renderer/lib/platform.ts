import { create } from 'zustand'

/**
 * Diferenças entre o app desktop e o acesso remoto (navegador): no navegador não há
 * janelas do sistema nem caminhos de arquivo locais.
 */
declare global {
  interface Window {
    __clawosRemote?: boolean
  }
}

export const isRemote = (): boolean => window.__clawosRemote === true

/** Envia arquivos do aparelho para o computador e devolve os caminhos lá. */
export async function uploadFiles(files: File[]): Promise<string[]> {
  const paths: string[] = []
  for (const file of files) {
    paths.push(
      await window.clawos.invoke(
        'attachments:save',
        file.name || 'arquivo',
        new Uint8Array(await file.arrayBuffer()),
      ),
    )
  }
  return paths
}

/** Escolher arquivos para anexar: diálogo do sistema no desktop, seletor do navegador no remoto. */
export async function pickFiles(): Promise<string[]> {
  if (!isRemote()) return window.clawos.invoke('dialog:pickFiles')
  const files = await new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => resolve([...(input.files ?? [])])
    input.click()
  })
  return uploadFiles(files)
}

/** Seletor de pasta pelo navegador (as pastas são do computador). */
export const useFolderPicker = create<{
  request: { title: string; resolve: (path: string | null) => void } | null
  open: (title: string) => Promise<string | null>
  close: (path: string | null) => void
}>((set, get) => ({
  request: null,
  open: (title) =>
    new Promise((resolve) => {
      get().request?.resolve(null)
      set({ request: { title, resolve } })
    }),
  close: (path) => {
    get().request?.resolve(path)
    set({ request: null })
  },
}))

export function pickFolder(title: string): Promise<string | null> {
  if (!isRemote()) return window.clawos.invoke('dialog:pickFolder', title)
  return useFolderPicker.getState().open(title)
}
