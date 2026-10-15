import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import type { McpServerConfig } from '@shared/project'
import { catalogEntry, needsClaudeLogin } from '@shared/mcpCatalog'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, systemPreferences } from 'electron'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import packageJson from '../../../package.json'
import { detectAll, resolveCli } from '../agents/detect'
import { getAgent, installProcess } from '../agents/registry'
import { getShellEnv, which } from '../agents/shellEnv'
import { compileMcpServers } from '../compiler/ConfigCompiler'
import { npxPrefixDir } from '../mcp/npxPrefix'
import { testMcpServer } from '../mcp/testMcp'
import { listProjectFiles } from '../projects/files'
import {
  FileWatchers,
  readForViewer,
  resolveExisting,
  writeFromViewer,
} from '../projects/fileViewer'
import { commands } from '../remote/bus'
import {
  newPairing,
  remoteStatus,
  revokeDevice,
  setRemoteEnabled,
  setupTailscale,
  stopTailscale,
} from '../remote/remote'
import { listDirs } from '../projects/fileViewer'
import { installSkill } from '../skills/installSkill'
import { getServices, sendToAll } from '../services'
import { taskPrompt } from '../tasks/TaskRepo'
import { killTerminal, openTerminal, resizeTerminal, writeTerminal } from '../terminals/terminals'

type Handler<C extends InvokeChannel> = (
  ...args: InvokeArgs<C>
) => InvokeResult<C> | Promise<InvokeResult<C>>

function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as InvokeArgs<C>)))
  commands.set(channel, (...args) => handler(...(args as InvokeArgs<C>)))
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

/** Tempo máximo do teste de conexão de um MCP (a interface usa os mesmos valores). */
const MCP_TEST_TIMEOUT = { default: 90_000, oauth: 180_000 }

/**
 * Registro dos testes de MCP (para diagnóstico): nome, comando/endereço, tempo e resultado.
 * Nunca grava tokens — só o que está no project.yaml, onde eles aparecem como ${secret:…}.
 */
function logMcpTest(
  name: string,
  server: McpServerConfig,
  result: { ok: boolean; tools: string[]; error: string | null },
  ms: number,
): void {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    const target =
      'command' in server ? [server.command, ...(server.args ?? [])].join(' ') : server.url
    const line = `${new Date().toISOString()} ${name} ${result.ok ? 'OK' : 'FALHOU'} ${(ms / 1000).toFixed(1)}s ${target} ${result.ok ? `${result.tools.length} ferramentas` : JSON.stringify(result.error)}\n`
    appendFileSync(join(dir, 'mcp-tests.log'), line)
  } catch {
    // diagnóstico não pode quebrar o teste
  }
}

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
  const { projects, secrets, sessions, layouts, tasks, sharedMcps } = getServices()

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
  handle('files:write', (path, text, expectedMtime) => writeFromViewer(path, text, expectedMtime))
  handle('files:watch', (path) => watchers.watch(path))
  handle('fs:listDirs', (path) => listDirs(path))
  handle('skills:install', (projectPath, id) => installSkill(projectPath, id))

  // Acesso remoto ----------------------------------------------------------------
  handle('remote:status', () => remoteStatus())
  handle('remote:setEnabled', (enabled) => setRemoteEnabled(enabled))
  handle('remote:newPairing', () => newPairing())
  handle('remote:revoke', (id) => revokeDevice(id))
  handle('remote:setupTailscale', () => setupTailscale())
  handle('remote:stopTailscale', () => stopTailscale())
  handle('files:unwatch', (path) => watchers.unwatch(path))

  // Agentes -----------------------------------------------------------------
  handle('agents:status', (refresh) => detectAll(refresh))
  handle('agents:install', (agentId, cols, rows) => {
    const { file, args, env } = installProcess(getAgent(agentId))
    return openTerminal(file, args, cols, rows, undefined, env)
  })
  handle('agents:login', async (agentId, cols, rows) => {
    const agent = getAgent(agentId)
    const cliPath = await resolveCli(agentId)
    return openTerminal(cliPath, agent.loginArgs, cols, rows)
  })

  handle('agents:mcpLogin', async (mcpId, cols, rows) => {
    const entry = catalogEntry(mcpId)
    const server = entry?.auth === 'claude' ? entry.build({}) : null
    if (!entry || !server || !('url' in server))
      throw new Error(`MCP sem login pelo Claude: ${mcpId}`)
    const cli = await resolveCli('claude')
    // O Claude Code guarda o acesso pelo nome + endereço: o mesmo que as conversas usam.
    if (process.platform === 'win32')
      return openTerminal(
        'cmd.exe',
        [
          '/c',
          `"${cli}" mcp add --transport http --scope user ${entry.id} ${server.url} & "${cli}" mcp login ${entry.id}`,
        ],
        cols,
        rows,
      )
    const script = [
      'echo "Registrando $2 no Claude Code (se ainda não estiver)…"',
      '"$1" mcp get "$2" >/dev/null 2>&1 || "$1" mcp add --transport http --scope user "$2" "$3" || exit 1',
      'echo "Abrindo o login…"',
      'exec "$1" mcp login "$2"',
    ].join('\n')
    return openTerminal('/bin/sh', ['-c', script, 'sh', cli, entry.id, server.url], cols, rows)
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
  handle('projects:arrange', (items) => projects.arrange(items))
  handle('folders:list', () => projects.listFolders())
  handle('folders:create', (name) => projects.createFolder(name))
  handle('folders:update', (id, patch) => projects.updateFolder(id, patch))
  handle('folders:delete', (id) => projects.deleteFolder(id))
  handle('projects:remove', (id) => {
    for (const session of sessions.list(id)) if (session.live) sessions.stop(session.id)
    projects.remove(id)
  })
  handle('projects:getConfig', (id) => projects.readConfig(projects.get(id).path))
  handle('projects:saveConfig', (id, config) => projects.writeConfig(id, config))
  /** Conecta a um MCP (formato do project.yaml) e lista as ferramentas. */
  const testConfig = async (
    name: string,
    server: McpServerConfig,
    secret: (name: string) => string | null,
    cwd: string,
  ) => {
    if (needsClaudeLogin(server))
      return { ok: false, tools: [], error: null, claudeLogin: 'meta-ads' }
    try {
      const [compiled] = compileMcpServers({
        agentId: 'claude',
        projectPath: cwd,
        config: { mcpServers: { [name]: server } },
        secret,
        readText: () => null,
        generatedDir: '',
        globalMcp: [],
        npxPrefix: npxPrefixDir(),
      })
      // Login no navegador (mcp-remote): dá tempo para a pessoa entrar na conta. Servidores
      // via npx baixam o pacote na primeira vez, o que pode levar mais de meio minuto.
      const oauth =
        'command' in server && (server.args ?? []).some((a) => a.startsWith('mcp-remote'))
      const started = Date.now()
      const result = await testMcpServer(
        compiled!,
        cwd,
        await getShellEnv(),
        oauth ? MCP_TEST_TIMEOUT.oauth : MCP_TEST_TIMEOUT.default,
      )
      logMcpTest(name, server, result, Date.now() - started)
      return result
    } catch (e) {
      const result = { ok: false, tools: [], error: (e as Error).message }
      logMcpTest(name, server, result, 0)
      return result
    }
  }

  handle('projects:testMcp', async (id, serverName) => {
    const project = projects.get(id)
    const { config, error } = projects.readConfig(project.path)
    if (error) return { ok: false, tools: [], error }
    const server = config.mcpServers?.[serverName] ?? sharedMcps.list()[serverName]
    if (!server) return { ok: false, tools: [], error: `MCP "${serverName}" não está configurado.` }
    return testConfig(
      serverName,
      server,
      (name) => secrets.get(id, name) ?? sharedMcps.secret(name),
      project.path,
    )
  })
  handle('projects:sharedMcps', (projectId) => {
    const off = new Set(sharedMcps.disabledFor(projectId))
    return Object.keys(sharedMcps.list()).map((name) => ({ name, enabled: !off.has(name) }))
  })
  handle('projects:setSharedMcp', (projectId, name, enabled) =>
    sharedMcps.setEnabledFor(projectId, name, enabled),
  )

  // MCPs ativos em todos os projetos ---------------------------------------------
  handle('mcp:sharedList', () => ({
    servers: sharedMcps.list(),
    secrets: sharedMcps.secretNames(),
  }))
  handle('mcp:sharedSave', (name, server, values) => sharedMcps.save(name, server, values))
  handle('mcp:sharedRemove', (name) => sharedMcps.remove(name))
  handle('mcp:sharedTest', (name) => {
    const server = sharedMcps.list()[name]
    if (!server) return { ok: false, tools: [], error: `MCP "${name}" não encontrado.` }
    return testConfig(name, server, (n) => sharedMcps.secret(n), homedir())
  })
  handle('mcp:testConfig', (server, values, cwd) =>
    testConfig('teste', server, (n) => values[n] ?? sharedMcps.secret(n), cwd ?? homedir()),
  )

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
