# Pesquisa técnica — M0

Verificado em **2026-10-09** com o registro npm, o código-fonte dos repositórios oficiais e a documentação atual. O que não pude confirmar está marcado como **NÃO VERIFICADO**.

---

## ⚠️ Decisões que precisam do mantenedor

### D1. Política da Anthropic sobre login claude.ai em produtos de terceiros

Trecho da [documentação do Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), conferido diretamente na página:

> "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart instead."

O adaptador ACP do Claude (`claude-agent-acp`) é construído sobre o Claude Agent SDK. O plano previa que o usuário usasse a própria assinatura claude.ai pelo Clawos, e isso esbarra diretamente nessa regra.

O Clawos não implementa login próprio, só reaproveita o login do CLI oficial. Ainda assim, um produto distribuído que oferece "converse com o Claude usando sua assinatura" se enquadra no texto.

Opções:

- **(a) Pedir aprovação à Anthropic** antes de distribuir com suporte a assinatura claude.ai, e durante o desenvolvimento usar o Clawos só localmente.
- **(b) Claude só via API key** (`ANTHROPIC_API_KEY`, ou `claude auth login --console`). Cumpre a regra, mas muda a proposta para quem tem assinatura.
- **(c) Lançar com Codex e Gemini primeiro** e manter o Claude atrás da decisão (a) ou (b).

O adaptador oferece a flag `--hide-claude-auth`, que recusa sessões pagas pela assinatura claude.ai. Com ela, a opção (b) fica fácil de implementar.

**Não vou escolher por você.** Para o spike do M1 (uso local, seu próprio login), a decisão não bloqueia tecnicamente, mas precisa estar resolvida antes de qualquer release público (M6).

Há também regras de marca. Na UI, o agente deve aparecer como **"Claude"** ou **"Claude Agent"**, não como "Claude Code", e sem visual que imite o Claude Code. Isso diverge do texto do plano, que fala em "Claude Code" na interface.

### D2. Isolamento de MCPs no Codex

Nenhum agente isola os MCPs da sessão por padrão: todos somam os MCPs globais do usuário. A situação de cada um:

| Agente | MCPs do `session/new`                                                                                      | Modo estrito                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Claude | respeitados (stdio, http, sse)                                                                             | ✅ `_meta.claudeCode.options.strictMcpConfig: true` + `settingSources` controlado |
| Gemini | **mesclados** com `~/.gemini/settings.json`                                                                | ⚠️ `--allowed-mcp-server-names` (**NÃO VERIFICADO** em modo ACP)                  |
| Codex  | **mesclados** com `~/.codex/config.toml`; se houver colisão de nome, **o da sessão é descartado**; sem SSE | ❌ não existe                                                                     |

No Codex, a única forma de isolar de verdade é usar um `CODEX_HOME` próprio. Isso separa junto o `auth.json` e deslogaria o usuário. Conforme pedido no plano, **não vou copiar credenciais**.

Opções:

- **(a)** Aceitar a mescla no Codex. A UI mostra "MCPs globais do Codex também ativos" e lista quais são, via `codex mcp list`.
- **(b)** Usar um `CODEX_HOME` por projeto e pedir ao usuário que faça login de novo uma vez por projeto. Mais isolado, mas com mais atrito.
- **(c)** Pedir ao usuário que remova os MCPs globais do Codex.

Recomendo **(a)**. A decisão só é necessária no M4.

### D3. Como distribuir os adaptadores

Os três agentes se iniciam por pacotes npm. A tabela mostra o que cada um traz e como o Clawos pode apontar para o CLI do usuário:

| Agente | Como iniciar       | O que o pacote traz                                                            | Apontar para o CLI do usuário |
| ------ | ------------------ | ------------------------------------------------------------------------------ | ----------------------------- |
| Claude | `claude-agent-acp` | Claude Agent SDK, com o **binário nativo do Claude** como dependência opcional | `CLAUDE_CODE_EXECUTABLE`      |
| Codex  | `codex-acp`        | `@openai/codex`                                                                | `CODEX_PATH`                  |
| Gemini | `gemini --acp`     | nativo, sem adaptador                                                          | —                             |

**Recomendação:** embutir no app só os adaptadores JS, `@agentclientprotocol/claude-agent-acp` e `@agentclientprotocol/codex-acp` (licença Apache-2.0), **sem** os binários opcionais. Eles seriam apontados para os CLIs oficiais que o usuário já instalou e logou.

Isso mantém o princípio 2, de que o usuário instala e loga no CLI oficial. Também evita redistribuir o binário do Claude, que segue os Commercial Terms da Anthropic, e não depende de `npx` nem de rede em runtime.

Alternativa: rodar via `npx` com versão fixada, como faz o [registro ACP](#6-registro-de-agentes-acp). É mais simples, mas exige Node e rede na máquina do usuário, e baixa o binário do Claude.

---

## ✅ Decisões tomadas (2026-10-09)

- **D1:** o Claude roda com o login que o usuário já fez no Claude Code (conta claude.ai ou API), exatamente como a extensão do VS Code. O Clawos não tem fluxo de login próprio: o botão **Entrar** roda `claude auth login` num terminal. A restrição da Anthropic sobre produtos de terceiros continua valendo para **distribuição pública**; revisitar antes do release (M6).
- **D2:** Codex com mescla de MCPs globais e aviso na UI (M4).
- **D3:** só os adaptadores JS vão embutidos, apontando para o CLI do usuário (`CLAUDE_CODE_EXECUTABLE`). O binário nativo opcional do Claude Agent SDK fica fora do pacote (`electron-builder.yml`).

## 🔬 Verificado na prática no M4 (2026-10-09)

- **Codex — isolamento sem tocar no `CODEX_HOME`:** o adaptador mescla `CODEX_CONFIG` na config de cada sessão. O Clawos envia por ali os MCPs do projeto **e** uma entrada `enabled = false` para cada MCP global listado por `codex mcp list --json` (inclusive os que vêm de plugins do app do Codex). Detalhes que custaram caro:
  - a entrada de desligamento precisa de um transporte válido (`command` ou `url`), senão o Codex rejeita a config ("invalid transport");
  - os MCPs **não** podem ir pelo `session/new` do ACP: o adaptador substituiria a tabela `mcp_servers` inteira e as entradas de desligamento sumiriam;
  - os conectores da conta ChatGPT entram como um MCP extra (`codex_apps`), controlado pela feature `apps` → `features.apps = false`;
  - `developer_instructions` existe e recebe instruções extras; skills fora de `.agents/skills` entram via `additionalDirectories` (o adaptador lê `<dir>/.agents/skills`).
  - Resultado provado: a sessão Codex de um projeto enxerga só o MCP do projeto, sem os MCPs globais do usuário (de config.toml e de plugins) nem os conectores — e o login do ChatGPT continua intacto.
- **Gemini — login com conta Google descontinuado:** ao autenticar via ACP (`oauth-personal`) o Gemini CLI 0.63.0 responde _"This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products"_. Só funcionam API key (AI Studio), Vertex ou gateway. **Diverge do plano** (assinatura Google via CLI).
- **Gemini — isolamento:** `--allowed-mcp-server-names` filtra todos os servidores (sessão, settings e extensões). Lista vazia = sem filtro, então sem MCPs no projeto o Clawos passa um nome sentinela. Skills só de `.agents/skills`/`.gemini/skills` do projeto ou do usuário (sem pasta extra). **Não verificado na prática** por falta de autenticação.
- **Retomada:** o Gemini anuncia `loadSession` mas não `session/resume`; o Clawos usa `session/load` e descarta o histórico reenviado (a UI já o tem do SQLite).

## 🔬 Verificado na prática no M2 (2026-10-09)

- **Isolamento de MCPs do Claude:** `session/new` com `_meta.claudeCode.options.strictMcpConfig: true` + `settingSources: ['project','local']` → a sessão enxerga **só** os MCPs do projeto (nenhum MCP global, de `.mcp.json` ou conector claude.ai). Provado com dois projetos e MCPs distintos.
- **Skills via plugin local** (gerado em `<userData>/generated/<sessão>/claude-plugin`, com symlinks para as pastas do projeto): funciona; a skill aparece como `clawos-project:<nome>` e só no projeto dono.
- **`skipMcpDiscovery` quebra CLIs antigos** (`claude` 2.1.87 não conhece `--plugin-dir-no-mcp`). Não usamos: o plugin gerado não declara MCPs.
- **`session/resume`** do adaptador do Claude retoma o contexto sem reenviar o histórico; o Clawos mostra o histórico salvo no SQLite.
- **`.gitignore`:** em vez de editar o `.gitignore` da raiz do projeto, o Clawos cria `.clawos/.gitignore` com `local/` — mesmo efeito, sem tocar em arquivos do usuário.
- **better-sqlite3 13** carrega no Electron 44 sem rebuild (N-API).

## 1. SDK TypeScript do ACP

- Pacote: **`@agentclientprotocol/sdk` 1.8.0** ([repo](https://github.com/agentclientprotocol/typescript-sdk)). O pacote `@zed-industries/agent-client-protocol` está abandonado (parou na 0.4.5).
- Versão do protocolo: **v1** (`PROTOCOL_VERSION = 1`). O v2 é um draft em `/experimental/v2`; não vamos usar.
- O SDK lança versões novas quase toda semana. Vamos **fixar a versão exata**.

**A API de cliente mudou.** `ClientSideConnection` está `@deprecated`. A API recomendada é:

```ts
await acp.client({ name: 'clawos' })
  .onRequest(acp.methods.client.session.requestPermission, (ctx) => …)
  .onRequest(acp.methods.client.fs.readTextFile, (ctx) => …)
  .connectWith(acp.ndJsonStream(stdinWeb, stdoutWeb), async (ctx) => {
    await ctx.request(acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: { … } })
    // ctx.buildSession(cwd)…
  })
```

**Métodos estáveis**

- Disponíveis: `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/set_mode` e `session/set_config_option`.
- Também estáveis, mas cada um depende de uma capability: `session/list`, `session/resume`, `session/close` e `session/delete`.
- No lado do cliente: `session/request_permission`, `fs/*` e `terminal/*`.

**`session/set_model` foi removido.** A troca de modelo agora passa por `session/set_config_option` (categoria `model`).

**Variantes de `session/update` no schema estável**

- `agent_message_chunk`, `agent_thought_chunk`, `user_message_chunk`
- `tool_call`, `tool_call_update`, `plan`
- `available_commands_update`, `current_mode_update`, `config_option_update`
- `session_info_update`, `usage_update`, `notice`
- `compaction_*`

**Outros tipos**

- `ToolCallContent`: `content`, `diff` (path, oldText, newText) ou `terminal`.
- Opções de permissão: `allow_once`, `allow_always`, `reject_once` e `reject_always`. Esses tipos cobrem diretamente o "Aprovar / Aprovar sempre / Recusar" do plano.
- `session/new` exige `cwd` e `mcpServers`. Aceita também `additionalDirectories` e `_meta`.

**Impacto no plano.** Os eventos normalizados de `shared/types.ts` mapeiam quase 1:1 para o ACP:

| Evento do plano      | Origem no ACP                |
| -------------------- | ---------------------------- |
| `text_delta`         | `agent_message_chunk`        |
| `tool_call_start`    | `tool_call`                  |
| `tool_call_update`   | `tool_call_update`           |
| `diff`               | conteúdo de tool call        |
| `plan`               | `plan`                       |
| `permission_request` | `session/request_permission` |

Vou acrescentar `thought_delta`, que vem de `agent_thought_chunk` e serve para o indicador "pensando…".

## 2. Claude via ACP

**Pacote**

- Nome: **`@agentclientprotocol/claude-agent-acp` 0.88.0**, binário `claude-agent-acp`.
- Os pacotes `@zed-industries/claude-code-acp` e `@zed-industries/claude-agent-acp` estão deprecated.

**Autenticação**

- O adaptador usa as credenciais do Claude Code. Os `authMethods` são do tipo terminal e rodam `auth login --claudeai` ou `auth login --console`.
- Se `ANTHROPIC_API_KEY` estiver definida, ela tem prioridade sobre a assinatura.
- O adaptador informa o estado de login por `_auth/status_update`.

**MCPs**

- Por padrão, carrega `settingSources: ["user","project","local"]`, ou seja, os MCPs globais, o `.mcp.json`, os hooks e as skills do usuário.
- Para isolar, passamos `_meta.claudeCode.options` no `session/new`:

```json
{ "claudeCode": { "options": { "strictMcpConfig": true, "settingSources": ["project"] } } }
```

- `strictMcpConfig` é o equivalente programático do `--strict-mcp-config`. Não é preciso chamar o CLI com `--mcp-config`.

**Skills e instruções**

- O Claude lê `CLAUDE.md` e `.claude/skills` nativamente. `options.skills` filtra quais skills ficam ativas.
- O SDK carrega **plugins por caminho local**. Isso permite injetar as skills do `project.yaml` a partir de um diretório **fora do repositório**, por exemplo `<userData>/compiled/<projeto>/plugin`. **NÃO VERIFICADO** via ACP; validar no M2.
- `_meta.systemPrompt` aceita `{ append: "…" }` para instruções extras.

**Sessões**

- Suporta `loadSession`, list, resume, fork, close e delete.

## 3. Codex via ACP

**Pacotes**

- Adaptador: **`@agentclientprotocol/codex-acp` 2.1.1**. Foi reescrito em TypeScript e roda sobre o `codex app-server` (experimental). `@zed-industries/codex-acp` está deprecated.
- O Codex **não tem ACP nativo**. O `@openai/codex` está na 0.162.0.

**Autenticação**

- `CODEX_HOME/auth.json` (padrão `~/.codex`) guarda o login. Se o usuário configurar `cli_auth_credentials_store = "keyring"` ou `"auto"`, o token vai para o keychain do sistema.
- Isso confirma o alerta do plano: trocar `CODEX_HOME` desloga o usuário.

**MCPs**

- Aceita apenas stdio e http, e mescla com o `config.toml`. Detalhes em [D2](#d2-isolamento-de-mcps-no-codex).

**Configuração**

- A variável `CODEX_CONFIG` recebe um JSON que é mesclado na configuração da sessão. Faz o papel do `-c` do CLI.

**Skills e instruções**

- Instruções: `AGENTS.md`.
- Skills: **`.agents/skills`**, procuradas do cwd até a raiz do repositório, e `~/.agents/skills`. **Não ficam em `~/.codex/skills`**, ao contrário do que eu supunha.
- O adaptador também lê `<additionalRoot>/.agents/skills`. Assim dá para apontar um diretório gerado fora do repo via `additionalDirectories`. **NÃO VERIFICADO** na prática.

## 4. Gemini CLI via ACP

**Pacote e flag**

- **`@google/gemini-cli` 0.63.0**. A flag agora é **`--acp`**; `--experimental-acp` está deprecated.

**Autenticação**

- Métodos: login Google, `GEMINI_API_KEY`, Vertex e Gateway.

**MCPs**

- Os MCPs da sessão são mesclados com o `settings.json` do usuário e do projeto. Detalhes em [D2](#d2-isolamento-de-mcps-no-codex).

**Skills e instruções**

- Instruções: `GEMINI.md`, configurável por `context.fileName`, que aceita lista (por exemplo `["AGENTS.md","GEMINI.md"]`).
- Skills: `.gemini/skills` ou `.agents/skills`, e os equivalentes em `~`.

**Sessões**

- Suporta `loadSession`. Não anuncia list nem resume.

## 5. Detecção de instalado/logado (sem ler arquivos de token)

| Agente | Instalado / versão | Logado?                                                              | Login oficial         |
| ------ | ------------------ | -------------------------------------------------------------------- | --------------------- |
| Claude | `claude --version` | `claude auth status` → JSON, exit 0 = logado (confirmado localmente) | `claude auth login`   |
| Codex  | `codex --version`  | `codex login status` → exit 0 = logado                               | `codex login`         |
| Gemini | `gemini --version` | **não há comando de status**                                         | `gemini` (interativo) |

No Gemini, a detecção será pelo handshake ACP: se a sessão retornar `authRequired`, a UI mostra **Entrar**.

Os adaptadores de Claude e Codex também enviam `_auth/status_update`.

**Achado local: PATH.** Nesta máquina, o `claude` está em `~/.local/bin`, que **não** está no PATH de shells não interativos. Apps abertos pelo Finder ou Dock também não herdam o PATH do zsh.

Por isso, o `detect.ts` precisa resolver o PATH do login shell do usuário uma vez na inicialização, executando `$SHELL -ilc 'echo $PATH'` (é o que fazem o VS Code e o pacote `shell-env`), e checar locais conhecidos como fallback.

## 6. Registro de agentes ACP

Existe um registro oficial: <https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json>, com 41 agentes, atualizado a cada hora ([repo](https://github.com/agentclientprotocol/registry)). As entradas relevantes:

- `claude-acp`: npx `@agentclientprotocol/claude-agent-acp@0.88.0`
- `codex-acp`: npx `@agentclientprotocol/codex-acp@2.1.1`
- `gemini`: npx `@google/gemini-cli@0.63.0 --acp`

**Recomendação:** o `registry.ts` fica local e versionado, usando o formato do registro oficial como inspiração. Nada de buscar na rede em runtime, para respeitar o princípio 1. Em M4 ou depois, podemos acrescentar um botão opcional "descobrir mais agentes" que consulta o registro só quando o usuário pede.

## 7. dockview

**Pacotes**

- **`dockview-react` 8.4.1**. Na v8, `dockview` virou o pacote sem React.
- CSS: `dockview-react/dist/styles/dockview.css`.

**Uso e serialização**

- Painéis: `<DockviewReact components={{ chat: ChatPanel }} onReady={…} />`, depois `api.addPanel({ id, component: 'chat', params })`.
- Layout: `api.toJSON()` e `api.fromJSON()`, salvando em `onDidLayoutChange`. Isso cabe direto na tabela `layouts`.

**Renderização**

- O padrão é `onlyWhenVisible`: um painel escondido sai do DOM e perde o scroll.
- Para os chats, usar **`defaultRenderer: 'always'`**. Assim o scroll e o streaming seguem intactos ao trocar de aba ou mover o painel.

## 8. Stack e versões (fixadas no scaffold)

| Pacote               | Versão            | Nota                                                            |
| -------------------- | ----------------- | --------------------------------------------------------------- |
| Electron             | 44.7.0            | Node 24.21 embutido                                             |
| electron-vite        | 5.0.0             | peer `vite ≤ 7`                                                 |
| Vite                 | **7.3.7** (não 8) | o electron-vite 5 não aceita Vite 8; o 6.0 ainda é beta         |
| @vitejs/plugin-react | **5.2.0**         | a 6.x exige Vite 8                                              |
| TypeScript           | **5.9.3** (não 7) | o typescript-eslint só aceita `<6.1`                            |
| Vitest               | **4.1.11**        | a 5.x exige Node 22.12+; ficamos na 4 por compatibilidade ampla |
| ESLint               | 10                |                                                                 |
| React                | 19.3              |                                                                 |
| Tailwind             | 4.3               | via `@tailwindcss/vite`                                         |
| shadcn               | config `new-york` | componentes copiados, padrão shadcn                             |
| Zustand              | 5.0               |                                                                 |
| Node (dev)           | **22** (`.nvmrc`) |                                                                 |

Pacotes nativos, adicionados quando forem usados:

- **better-sqlite3 13** é N-API e traz prebuilds para mac, win e linux, em x64 e arm64, provavelmente sem electron-rebuild. **NÃO VERIFICADO** com o Electron 44; validar no M2.
- **node-pty 1.1.0** é N-API. Tem prebuilds para mac e win; no Linux compila. Validar no M1.

## 9. Outros achados

- **`ELECTRON_RUN_AS_NODE`.** Processos filhos de algumas extensões de editor herdam `ELECTRON_RUN_AS_NODE=1`, e aí o Electron roda como Node puro, sem janela. Isso está documentado no README. Também vale para o Clawos: ao iniciar agentes, **limpar essa variável** do ambiente dos filhos, porque os adaptadores ACP são scripts Node e podem ser afetados.
- **Bundle do renderer em 758 kB.** Tamanho aceitável para app desktop. Revisar no M6.

## Divergências em relação ao plano (resumo)

1. O SDK ACP se chama `@agentclientprotocol/sdk` e tem uma API de cliente nova. `session/set_model` não existe mais.
2. Os adaptadores se chamam `@agentclientprotocol/claude-agent-acp` e `@agentclientprotocol/codex-acp`. O Gemini usa `--acp`.
3. **Política da Anthropic sobre login claude.ai em produtos de terceiros** (D1) e regras de marca: na UI, "Claude" e não "Claude Code".
4. MCPs por sessão **não isolam por padrão** em nenhum agente. Claude tem modo estrito via `_meta`; Codex não tem (D2); Gemini só filtra por nome.
5. O fallback `--mcp-config`/`--strict-mcp-config` é desnecessário: o equivalente é passado via `_meta` do ACP.
6. As skills do Codex ficam em `.agents/skills`, não em `~/.codex/skills`. O Gemini também lê `.agents/skills`.
7. O Gemini não tem comando de status de login. A detecção será via ACP.
8. Versões fixadas abaixo das mais recentes (Vite 7, TS 5.9) por compatibilidade com o electron-vite 5 e o typescript-eslint.
