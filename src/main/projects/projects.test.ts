import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { SecretStore } from '../secrets/SecretStore'
import { ProjectManager } from './ProjectManager'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'clawos-test-'))
}

describe('ProjectManager', () => {
  let projects: ProjectManager

  beforeEach(() => {
    projects = new ProjectManager(openDatabase(':memory:'))
  })

  it('adiciona, lista, renomeia, reordena e remove sem duplicar caminhos', () => {
    const a = projects.add(tempDir())
    const b = projects.add(tempDir())
    expect(projects.add(a.path).id).toBe(a.id)
    expect(projects.list().map((p) => p.id)).toEqual([a.id, b.id])
    expect(a.color).not.toBe(b.color)

    projects.update(a.id, { name: 'Novo nome' })
    projects.reorder([b.id, a.id])
    expect(projects.list().map((p) => p.name)[1]).toBe('Novo nome')
    expect(projects.list()[0]!.id).toBe(b.id)

    projects.remove(a.id)
    expect(projects.list()).toHaveLength(1)
  })

  it('usa o nome do project.yaml quando existe', () => {
    const dir = tempDir()
    mkdirSync(join(dir, '.clawos'))
    writeFileSync(join(dir, '.clawos/project.yaml'), 'name: DraLab\n')
    expect(projects.add(dir).name).toBe('DraLab')
  })

  it('reporta project.yaml inválido sem quebrar', () => {
    const dir = tempDir()
    mkdirSync(join(dir, '.clawos'))
    writeFileSync(join(dir, '.clawos/project.yaml'), 'mcpServers:\n  x:\n    args: []\n')
    const result = projects.readConfig(dir)
    expect(result.exists).toBe(true)
    expect(result.error).toMatch(/inválido/)
  })

  it('grava project.yaml e ignora .clawos/local no git', () => {
    const project = projects.add(tempDir())
    projects.writeConfig(project.id, {
      name: 'X',
      mcpServers: { a: { command: 'node', args: ['s.js'] } },
    })
    expect(projects.readConfig(project.path).config).toEqual({
      name: 'X',
      mcpServers: { a: { command: 'node', args: ['s.js'] } },
    })
    expect(readFileSync(join(project.path, '.clawos/.gitignore'), 'utf8')).toBe('local/\n')
  })
})

describe('SecretStore', () => {
  const cipher = {
    isAvailable: () => true,
    encrypt: (v: string) => Buffer.from(v.split('').reverse().join('')),
    decrypt: (b: Buffer) => b.toString().split('').reverse().join(''),
  }

  it('guarda criptografado, separa por projeto e apaga', () => {
    const db = openDatabase(':memory:')
    const manager = new ProjectManager(db)
    const a = manager.add(tempDir())
    const b = manager.add(tempDir())
    const secrets = new SecretStore(db, cipher)

    secrets.set(a.id, 'token', 'abc')
    const raw = db.prepare('SELECT value FROM secrets').get() as { value: Buffer }
    expect(raw.value.toString()).toBe('cba')
    expect(secrets.get(a.id, 'token')).toBe('abc')
    expect(secrets.get(b.id, 'token')).toBeNull()
    expect(secrets.names(a.id)).toEqual(['token'])

    secrets.delete(a.id, 'token')
    expect(secrets.get(a.id, 'token')).toBeNull()
  })

  it('recusa salvar sem criptografia do sistema', () => {
    const db = openDatabase(':memory:')
    const a = new ProjectManager(db).add(tempDir())
    const secrets = new SecretStore(db, { ...cipher, isAvailable: () => false })
    expect(() => secrets.set(a.id, 'x', 'y')).toThrow(/indisponível/)
  })
})
