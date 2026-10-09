# Contribuindo com o Clawos

Obrigado pelo interesse! O Clawos é pequeno de propósito: código legível, tipado e sem abstrações especulativas.

## Ambiente

- Node.js 22.12+ (`.nvmrc`), pnpm 10 e git.
- `pnpm install` e depois `pnpm dev`.
- Para conversar com agentes no modo dev, tenha o CLI de pelo menos um agente instalado e logado (veja o README).

Antes de abrir um pull request:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

O CI roda os mesmos comandos em cada push e PR.

## Arquitetura

```
src/
  main/                 processo principal (Node)
    agents/             registry, detecção de CLI, AgentSession (cliente ACP), normalização de eventos
    compiler/           ConfigCompiler: project.yaml → configuração de cada agente
    sessions/           SessionManager (estado das sessões), SessionRepo (SQLite), aviso de edições
    projects/           ProjectManager e project.yaml
    worktrees/          worktrees git por sessão
    db/                 SQLite + migrations
    secrets/            segredos por projeto (safeStorage)
    ipc/                handlers dos canais de IPC
  preload/              ponte segura (contextBridge)
  renderer/             interface React (Tailwind, shadcn/ui, Zustand, dockview)
  shared/               tipos e contrato de IPC usados pelos dois lados
```

Regras que valem para todo o código:

- **Segurança do Electron:** `contextIsolation`, `sandbox` e sem `nodeIntegration`. Todo canal de IPC é declarado em `src/shared/ipc.ts`; o renderer nunca executa comandos arbitrários.
- **Credenciais:** o Clawos nunca lê, copia ou guarda tokens dos CLIs. Login é sempre pelo comando oficial do agente.
- **A UI só conhece eventos normalizados** (`SessionEvent` em `src/shared/types.ts`). A tradução do formato de cada agente fica em `src/main/agents/normalize.ts`.
- **Isolamento por projeto:** nada de configuração global do usuário vazando para uma sessão. Arquivos gerados ficam fora do repositório do projeto.
- **Migrations** do SQLite são somente adicionadas, nunca editadas (`src/main/db/migrations.ts`).

## Adicionando um agente compatível com ACP

1. Inclua o id, o nome e a cor em `src/shared/agents.ts`.
2. Descreva o agente em `src/main/agents/registry.ts`: CLI, comandos de versão/status/login, como iniciar em modo ACP (`native` com argumentos ou `adapter` com um pacote npm) e a ajuda de autenticação.
3. Opcional: um compilador em `src/main/compiler/ConfigCompiler.ts` para traduzir skills, instruções e isolamento de MCPs. Sem ele, os MCPs do projeto vão pelo `session/new` do ACP.
4. Testes: o registry é testado em `registry.test.ts`; adicione casos do compilador em `ConfigCompiler.test.ts`.

O [registro oficial do ACP](https://agentclientprotocol.com/registry) lista agentes e como iniciá-los.

## Testes

- Vitest, ambiente Node. Arquivos `*.test.ts` ao lado do código.
- Priorize funções puras (compilador, normalização, reducer do chat, layouts) e integrações reais quando baratas (SQLite em memória, repositórios git temporários).

## Publicando uma versão

1. Atualize `version` no `package.json` e o `CHANGELOG.md`.
2. Commit, depois `git tag vX.Y.Z && git push origin main vX.Y.Z`.
3. O workflow **Release** gera os instaladores de macOS, Windows e Linux e os anexa a um release em **rascunho**. Revise e publique.

Os builds não são assinados com certificados da Apple/Microsoft; o macOS recebe assinatura ad-hoc.

## Estilo

- TypeScript estrito, Prettier (`pnpm format`), ESLint.
- Comentários em português, explicando o porquê — não o quê.
- Commits pequenos e descritivos.
