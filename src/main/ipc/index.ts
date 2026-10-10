import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, systemPreferences } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import packageJson from '../../../package.json'
import { detectAll, resolveCli } from '../agents/detect'
import { getAgent } from '../agents/registry'
import { getShellEnv, which } from '../agents/shellEnv'
import { compileMcpServers } from '../compiler/ConfigCompiler'
import { testMcpServer } from '../mcp/testMcp'
import { listProjectFiles } from '../projects/files'
import { FileWatchers, readForViewer, resolveExisting } from '../projects/fileViewer'
import { getServices, sendToAll } from '../services'
import { taskPrompt } from '../tasks/TaskRepo'
import { killTerminal, openTerminal, resizeTerminal, writeTerminal } from '../terminals/terminals'

type Handler<C extends InvokeChannel> = (
  ...args: InvokeArgs<C>
) => InvokeResult<C> | Promise<InvokeResult<C>>

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as InvokeArgs<C>)))
}

async function pickFolder(title?: string): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title,
    properties: ['openDirectory', 'createDirectory'],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function pickFiles(): Promise<string[]> {
  const window = BrowserWindow.getFocusedWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Anexar arquivos',
    properties: ['openFile', 'multiSelections'],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

const MAC_FILENAMES = 'electron application/osclipboard;format="NSFilenamesPboardType"'

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Caminhos de arquivos copiados no gerenciador de arquivos do sistema (Finder, Explorer…). */
async function clipboardFilePaths(): Promise<string[]> {
  const paths: string[] = []
  try {
    for (const item of await clipboard.read()) {
      // No macOS a lista completa (vários arquivos) vem no plist do Finder.
      if (item.types.includes(MAC_FILENAMES)) {
        const plist = await (await item.getType(MAC_FILENAMES)).text()
        for (const m of plist.matchAll(/<string>([^<]+)<\/string>/g)) paths.push(decodeXml(m[1]!))
      } else if (item.types.includes('text/uri-list')) {
        const list = await (await item.getType('text/uri-list')).text()
        for (const line of list.split(/\r?\n/)) {
          if (line.startsWith('file://')) paths.push(fileURLToPath(line.trim()))
        }
      }
    }
  } catch {
    return []
  }
  return [...new Set(paths)].filter((path) => existsSync(path))
}

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

/** Grava conteúdo colado (ex.: print de tela) fora dos projetos, para anexar à mensagem. */
function saveAttachment(name: string, data: Uint8Array): string {
  if (data.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Arquivo maior que 50 MB.')
  const safe =
    name
      .replace(/[^\w.\- ]+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'colado'
  const dir = join(app.getPath('userData'), 'attachments', randomUUID())
  mkdirSync(dir, { recursive: true })
  const path = join(dir, safe)
  writeFileSync(path, data)
  return path
}

export function registerIpcHandlers(): void {
  const { projects, secrets, sessions, layouts, tasks } = getServices()

  handle('app:info', () => ({
    name: app.getName(),
    // Fora do app empacotado, app.getVersion() pode devolver a versão do Electron.
    version: packageJson.version,
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
  }))
  handle('dialog:pickFolder', (title) => pickFolder(title))
  handle('dialog:pickFiles', () => pickFiles())
  handle('clipboard:filePaths', () => clipboardFilePaths())
  handle('attachments:save', (name, data) => saveAttachment(name, data))
  handle('media:microphone', async () => {
    if (process.platform !== 'darwin') return true
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  handle('shell:openPath', async (path) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
  handle('shell:showItem', (path) => shell.showItemInFolder(path))

  // Visualizador de arquivos ---------------------------------------------------
  const watchers = new FileWatchers((path) => sendToAll('files:changed', { path }))
  handle('files:read', (path) => readForViewer(path))
  handle('files:resolve', (paths, cwd) => resolveExisting(paths, cwd))
  handle('files:watch', (path) => watchers.watch(path))
  handle('files:unwatch', (path) => watchers.unwatch(path))

  // Agentes -----------------------------------------------------------------
  handle('agents:status', (refresh) => detectAll(refresh))
  handle('agents:login', async (agentId, cols, rows) => {
    const agent = getAgent(agentId)
    const cliPath = await resolveCli(agentId)
    return openTerminal(cliPath, agent.loginArgs, cols, rows)
  })

  // Projetos ----------------------------------------------------------------
  handle('projects:list', () => projects.list())
  handle('projects:add', async (path) => {
    const folder = path ?? (await pickFolder('Adicionar projeto'))
    return folder ? projects.add(folder) : null
  })
  handle('projects:inspect', (path) => projects.inspect(path))
  handle('projects:create', (input) =>
    projects.create(input, (id, name, value) => secrets.set(id, name, value)),
  )
  handle('projects:update', (id, patch) => projects.update(id, patch))
  handle('projects:reorder', (ids) => projects.reorder(ids))
  handle('projects:remove', (id) => {
    for (const session of sessions.list(id)) if (session.live) sessions.stop(session.id)
    projects.remove(id)
  })
  handle('projects:getConfig', (id) => projects.readConfig(projects.get(id).path))
  handle('projects:saveConfig', (id, config) => projects.writeConfig(id, config))
  handle('projects:testMcp', async (id, serverName) => {
    const project = projects.get(id)
    const { config, error } = projects.readConfig(project.path)
    if (error) return { ok: false, tools: [], error }
    const server = config.mcpServers?.[serverName]
    if (!server)
      return { ok: false, tools: [], error: `MCP "${serverName}" não está no project.yaml.` }
    try {
      const [compiled] = compileMcpServers({
        agentId: project.defaultAgent,
        projectPath: project.path,
        config: { mcpServers: { [serverName]: server } },
        secret: (name) => secrets.get(id, name),
        readText: () => null,
        generatedDir: '',
        globalMcp: [],
      })
      return await testMcpServer(compiled!, project.path, await getShellEnv())
    } catch (e) {
      return { ok: false, tools: [], error: (e as Error).message }
    }
  })

  handle('projects:files', (id) => listProjectFiles(projects.get(id).path))

  // Layouts -----------------------------------------------------------------
  handle('layouts:get', (projectId) => layouts.get(projectId))
  handle('layouts:save', (projectId, json) => layouts.save(projectId, json))
  handle('presets:list', () => layouts.listPresets())
  handle('presets:save', (name, json) => layouts.savePreset(name, json))
  handle('presets:delete', (id) => layouts.deletePreset(id))

  // Segredos ----------------------------------------------------------------
  handle('secrets:list', (projectId) => secrets.names(projectId))
  handle('secrets:set', (projectId, name, value) => secrets.set(projectId, name, value))
  handle('secrets:delete', (projectId, name) => secrets.delete(projectId, name))

  // Sessões -----------------------------------------------------------------
  handle('sessions:list', (projectId) => sessions.list(projectId))
  handle('sessions:listAll', () => sessions.listAll())
  handle('session:create', (projectId, agentId, mode) => sessions.create(projectId, agentId, mode))
  handle('session:open', (id) => sessions.open(id))
  // Não aguardamos o turno inteiro: o progresso chega por `session:event`.
  handle('session:prompt', (id, text, attachments) => sessions.prompt(id, text, attachments))
  handle('session:cancel', (id) => sessions.cancel(id))
  handle('session:setConfig', (id, configId, value) => sessions.setConfig(id, configId, value))
  handle('session:permission', (id, requestId, optionId) =>
    sessions.respondPermission(id, requestId, optionId),
  )
  handle('session:rename', (id, title) => sessions.rename(id, title))
  handle('session:stop', (id) => sessions.stop(id))
  handle('session:restart', (id) => sessions.restart(id))
  handle('session:delete', (id) => sessions.delete(id))

  // Tarefas -----------------------------------------------------------------
  const tasksChanged = (...projectIds: string[]) => {
    for (const projectId of new Set(projectIds)) sendToAll('tasks:changed', { projectId })
  }
  handle('tasks:list', (projectId) => tasks.list(projectId))
  handle('tasks:counts', () => tasks.openCounts())
  handle('tasks:create', (input) => {
    const task = tasks.create(input)
    tasksChanged(task.projectId)
    return task
  })
  handle('tasks:update', (id, patch) => {
    const before = tasks.get(id)
    const task = tasks.update(id, patch)
    tasksChanged(before.projectId, task.projectId)
    return task
  })
  handle('tasks:delete', (id) => {
    const task = tasks.get(id)
    tasks.delete(id)
    tasksChanged(task.projectId)
  })
  handle('tasks:reorder', (ids) => {
    tasks.reorder(ids)
    if (ids[0]) tasksChanged(tasks.get(ids[0]).projectId)
  })
  handle('tasks:delegate', async (id, agentId, mode) => {
    const task = tasks.get(id)
    const project = projects.get(task.projectId)
    const session = await sessions.create(task.projectId, agentId, mode, {
      title: task.title,
      initialPrompt: taskPrompt(task, project.name),
    })
    const linked = tasks.linkSession(id, session.id)
    tasksChanged(task.projectId)
    return { task: linked, session }
  })

  // Worktrees ---------------------------------------------------------------
  handle('worktree:diff', (id) => sessions.worktreeDiff(id))
  handle('worktree:merge', (id) => sessions.worktreeMerge(id))
  handle('worktree:openEditor', async (id) => {
    const path = sessions.worktreePath(id)
    for (const editor of ['code', 'cursor']) {
      const bin = await which(editor)
      if (bin) {
        spawn(bin, [path], { detached: true, stdio: 'ignore', env: await getShellEnv() }).unref()
        return
      }
    }
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  // Terminais ---------------------------------------------------------------
  handle('terminal:input', (id, data) => writeTerminal(id, data))
  handle('terminal:resize', (id, cols, rows) => resizeTerminal(id, cols, rows))
  handle('terminal:kill', (id) => killTerminal(id))
}
