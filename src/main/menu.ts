import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '@shared/ipc'

const REPO_URL = 'https://github.com/vdloureiro/clawos-ADE'

function send(command: AppCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('app:command', { command })
}

/**
 * Menu nativo com os atalhos do app. Atalhos definidos aqui têm prioridade sobre os do
 * sistema (ex.: ⌘W fecha o painel ativo, não a janela).
 */
export function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const item = (
    label: string,
    accelerator: string,
    command: AppCommand,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send(command),
  })

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: 'Sobre o Clawos' },
              { type: 'separator' as const },
              item('Configurações…', 'CmdOrCtrl+,', 'settings'),
              { type: 'separator' as const },
              { role: 'hide' as const, label: 'Ocultar Clawos' },
              { role: 'hideOthers' as const, label: 'Ocultar outros' },
              { role: 'unhide' as const, label: 'Mostrar todos' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: 'Sair do Clawos' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        item('Novo agente', 'CmdOrCtrl+T', 'new-agent'),
        item('Adicionar projeto…', 'CmdOrCtrl+O', 'add-project'),
        item('Configurações do projeto', 'CmdOrCtrl+Shift+,', 'project-settings'),
        { type: 'separator' },
        item('Fechar painel', 'CmdOrCtrl+W', 'close-panel'),
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              item('Configurações…', 'Ctrl+,', 'settings'),
              { role: 'quit' as const, label: 'Sair' },
            ]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        item('Busca rápida', 'CmdOrCtrl+K', 'palette'),
        item('Parar agente do painel ativo', 'CmdOrCtrl+.', 'stop-agent'),
        item('Alternar tema claro/escuro', 'CmdOrCtrl+Shift+L', 'toggle-theme'),
        item('Terminal', 'Ctrl+`', 'toggle-terminal'),
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) =>
          item(`Projeto ${i + 1}`, `CmdOrCtrl+${i + 1}`, `project-${i + 1}`),
        ),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamanho real' },
        { role: 'zoomIn', label: 'Aumentar' },
        { role: 'zoomOut', label: 'Diminuir' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged
          ? []
          : [
              { type: 'separator' as const },
              { role: 'reload' as const },
              { role: 'toggleDevTools' as const },
            ]),
      ],
    },
    { role: 'windowMenu', label: 'Janela' },
    {
      role: 'help',
      label: 'Ajuda',
      submenu: [
        { label: 'Documentação', click: () => void shell.openExternal(`${REPO_URL}#readme`) },
        {
          label: 'Relatar um problema',
          click: () => void shell.openExternal(`${REPO_URL}/issues`),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
