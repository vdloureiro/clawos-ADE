# Clawos

App desktop open source (MIT) para trabalhar com vários agentes de código de IA — Claude Code, Codex, Gemini e outros — em vários projetos, com uma interface de **chat limpo** e **vários agentes em paralelo** em painéis organizáveis.

> Status: em desenvolvimento (M3 — vários agentes em paralelo, em painéis). Ainda não é um release.

## Princípios

- **100% local.** Sem backend, sem conta, sem telemetria.
- **Clawos nunca lida com suas credenciais de LLM.** Você faz login nos CLIs oficiais (`claude`, `codex`, `gemini`) com a sua própria assinatura; o Clawos só detecta se estão instalados e logados.
- **Chat estruturado, não terminal.** As conversas usam o [Agent Client Protocol (ACP)](https://agentclientprotocol.com).
- **Isolamento por projeto.** Cada projeto tem suas próprias skills, MCPs e instruções em `.clawos/project.yaml`.

## Requisitos para usar

- **Claude:** o [CLI oficial](https://code.claude.com/docs/en/setup) instalado e logado (`claude auth login`). O Clawos detecta automaticamente e oferece um botão **Entrar** que roda esse comando. Ele usa a mesma conta que você usa no terminal ou no VS Code.
- Codex e Gemini chegam no M4.

> **Sobre contas claude.ai:** o Clawos conversa com o Claude através do adaptador ACP oficial e do seu CLI, com o login que você mesmo fez. A Anthropic não permite que produtos de terceiros _ofereçam_ login claude.ai sem aprovação prévia ([Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)); por isso o Clawos nunca implementa login próprio. Use conforme os termos da sua conta.

## Configuração por projeto

Cada projeto pode ter um `.clawos/project.yaml` (editável pela tela de configurações do projeto):

```yaml
name: DraLab
defaultAgent: claude
instructions: ./CLAUDE.md # outro arquivo é anexado às instruções do agente
skills:
  - ./.clawos/skills/revisao-pr # pastas com SKILL.md
mcpServers:
  supabase:
    command: npx
    args: ['-y', '@supabase/mcp-server-supabase', '--project-ref=xxxx']
    env:
      SUPABASE_ACCESS_TOKEN: '${secret:supabase_token}' # resolvido do cofre do sistema
agents:
  claude: { enabled: true, inheritUserConfig: false }
```

- As sessões de um projeto enxergam **somente** os MCPs e skills dele. MCPs globais do usuário nunca são carregados.
- `${secret:nome}` vem dos segredos do projeto, guardados com a criptografia do sistema (`safeStorage`). Nunca vão para o YAML.
- `inheritUserConfig: true` também carrega a sua configuração global do Claude (`~/.claude`: CLAUDE.md, skills, permissões).

## Desenvolvimento

Requisitos: Node.js 22.12+ (veja `.nvmrc`) e pnpm 10.

```bash
pnpm install
pnpm dev          # app em modo desenvolvimento
pnpm test         # testes (Vitest)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript (main + renderer)
pnpm build        # build de produção em out/
pnpm dist:mac     # instalador (também dist:win, dist:linux)
```

> Se `pnpm dev` abrir só um processo Node sem janela, verifique se a variável `ELECTRON_RUN_AS_NODE` está definida no seu ambiente (alguns editores a definem para processos filhos) e remova-a: `env -u ELECTRON_RUN_AS_NODE pnpm dev`.

## Estrutura

```
src/
  main/       processo principal do Electron (agentes, projetos, banco, IPC)
  preload/    ponte segura (contextBridge) entre main e renderer
  renderer/   interface React + Tailwind + shadcn/ui
  shared/     tipos compartilhados, incluindo o contrato de IPC
docs/
  research.md pesquisa técnica que embasa as decisões
```

O renderer roda com `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`. Todo canal de IPC é declarado em `src/shared/ipc.ts`.

## Licença

[MIT](LICENSE)
