import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import packageJson from '../../../package.json'
import { detectAll, resolveCli } from '../agents/detect'
import { getAgent } from '../agents/registry'
import { getShellEnv, which } from '../agents/shellEnv'
import { compileMcpServers } from '../compiler/ConfigCompiler'
import { testMcpServer } from '../mcp/testMcp'
import { listProjectFiles } from '../projects/files'
import { getServices } from '../services'
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

export function registerIpcHandlers(): void {
  const { projects, secrets, sessions, layouts } = getServices()

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
  handle('shell:openPath', async (path) => {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

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
  handle('session:permission', (id, requestId, optionId) =>
    sessions.respondPermission(id, requestId, optionId),
  )
  handle('session:rename', (id, title) => sessions.rename(id, title))
  handle('session:stop', (id) => sessions.stop(id))
  handle('session:restart', (id) => sessions.restart(id))
  handle('session:delete', (id) => sessions.delete(id))

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
