# Changelog

## 0.5.1

- **Meta Ads** no catálogo de MCPs (servidor oficial da Meta): campanhas, conjuntos, anúncios, públicos, catálogos e métricas do Facebook e Instagram Ads. A Meta só libera o login para clientes aprovados, como o Claude: o botão "fazer login" abre o login oficial do Claude Code e as conversas com o Claude passam a usar esse acesso (o Clawos não vê o token). Com um token de usuário da Meta, funciona também no Codex.
- **ClickUp** no catálogo de MCPs (servidor oficial): tarefas, listas, documentos, comentários e controle de tempo, com login na sua conta pelo navegador.

## 0.5.0

- **Skills prontas**: na aba Skills (configurações do projeto e assistente de novo projeto), 30 skills de fontes abertas e conhecidas para adicionar com um clique: programação (TDD, depuração sistemática, planos, React/Next.js), design (front-end, revisão de interface, temas), marketing (copywriting, SEO, CRO, anúncios, e-mail, redes sociais, precificação) e escrita. Fontes: Anthropic, Superpowers, Vercel e Marketing Skills, cada uma presa a uma versão; cada arquivo baixado é conferido antes de instalar em `.clawos/skills/`.
- **MCPs que ficavam "Conectando…" para sempre**: o teste de conexão agora sempre termina (conectado ou com o erro), mostra há quanto tempo está tentando e inclui a mensagem do servidor no erro. A espera para MCPs com token subiu para 90 s (a primeira conexão baixa o servidor), e cada teste fica registrado em `logs/mcp-tests.log`, sem tokens.

## 0.4.1

- **Higgsfield** no catálogo de MCPs (projetos e "MCPs em todos os projetos"): gere imagens e vídeos com IA direto da conversa. Conecta com login na sua conta Higgsfield, pelo servidor oficial (mcp.higgsfield.ai).

## 0.4.0

- **Catálogo de MCPs com logos**: GitHub, Supabase, Vercel, Linear, Notion, Stripe, Sentry, Cloudflare, Context7, Playwright, Filesystem e Memory, com os logos das marcas em preto e branco. Cada um mostra como conecta (token, login no navegador ou local).
- **✓ Conectado**: ao adicionar um MCP, o Clawos testa a conexão de verdade e mostra o check (ou o erro, com "tentar de novo"). Vercel e Cloudflare conectam com login no navegador.
- **MCPs em todos os projetos**: em Configurações, conecte uma vez (ex.: GitHub) e o MCP fica disponível em todas as conversas. Cada projeto pode desligar um MCP global nas configurações dele. Os tokens ficam no cofre do sistema.

## 0.3.3

- Ícone do Clawos ao adicionar à tela de início do celular ou tablet: versão própria para iPhone/iPad e Android, que preenche o formato do ícone (sem a borda escura).
- Pareamento pelo app da tela de início: além do QR code, dá para colar o link de pareamento (o Clawos do computador mostra o link com botão Copiar).

## 0.3.2

- Acesso remoto: a interface agora se ajusta de verdade à tela do celular (antes o navegador desenhava a página como um desktop e ela ficava minúscula). Campos de texto não dão mais zoom ao tocar no iPhone, a altura acompanha a barra do navegador e há margens para o notch.
- Dá para adicionar o Clawos à tela de início do celular ("Adicionar à Tela de Início") e abrir como app, em tela cheia.

## 0.3.1

- Acesso remoto: quando o Tailscale pede para autorizar o recurso Serve na sua rede (primeira vez), o Clawos explica o passo e mostra os botões "Autorizar no Tailscale" e "Já autorizei — tentar de novo".

## 0.3.0

- **Acesso remoto**: use o Clawos do seu computador pelo celular, tablet ou outro computador, pelo navegador. Ligue em Configurações → Acesso remoto. As conversas, os agentes e os arquivos continuam no seu computador.
  - Conexão pela sua rede **Tailscale** (botão "Publicar na minha rede Tailscale"): HTTPS e acesso só para os seus aparelhos, sem abrir nenhuma porta para a internet. O Clawos escuta apenas no próprio computador.
  - **Pareamento por QR code** (código de uso único, válido por 10 minutos). Cada aparelho recebe uma chave própria e pode ser desconectado a qualquer momento.
  - Funções que agiriam na tela do computador (janelas do sistema, Finder) ficam bloqueadas para aparelhos remotos; anexos são enviados do aparelho e pastas são escolhidas por um navegador de pastas.
  - O computador não entra em repouso enquanto o acesso remoto estiver ligado.
- **Modo celular**: em telas pequenas, a barra lateral vira um menu e a tela mostra uma conversa por vez; arquivos abrem em tela cheia.

## 0.2.1

- **Pastas na barra lateral** para organizar projetos (ex.: uma pasta por cliente). Crie pelo ícone de pasta ao lado de "Projetos", arraste projetos para dentro, para fora ou para reordenar, e abra/feche cada pasta. Também dá para mover pelo menu do projeto ("Mover para pasta"). Renomeie com duplo clique; excluir uma pasta não apaga nenhum projeto.
- **Permissão padrão por projeto**: o assistente de novo projeto ganhou a etapa "Permissões" — Automático (o agente não pede autorização) ou Pedir autorização. Vale para todas as conversas novas do projeto, com qualquer agente, e pode ser trocada nas configurações do projeto ou em cada conversa.

## 0.2.0

- **Assistente de primeiro acesso**: no primeiro uso, o Clawos guia em três passos — instalar os agentes, entrar com sua conta e criar o primeiro projeto. Reabra quando quiser pela busca (⌘K → "Primeiros passos").
- **Instalação dos agentes dentro do app**: o botão "Instalar" roda o instalador oficial num terminal do próprio Clawos, sem copiar comandos. O Codex agora usa o instalador oficial da OpenAI, que não precisa de Node.js/npm.
- O status dos agentes se atualiza sozinho depois de instalar ou entrar (e ao voltar para a janela); antes era preciso reiniciar o app para ele enxergar um agente recém-instalado.
- Copiar um comando confirma a cópia (✓ Copiado), e "Verificar novamente" mostra que está verificando e quando terminou.

## 0.1.9

- A mensagem enviada, o fim de cada resposta e os pedidos de permissão são gravados no disco na hora (antes, em até 1 segundo). Mesmo se o app for fechado à força ou travar, nada do que você enviou se perde.
- Ao desligar ou reiniciar o Mac com agentes rodando, o Clawos grava tudo e fecha sem a pergunta de sessões ativas (que podia bloquear o desligamento).

## 0.1.8

- **Editar arquivos na aba**: o arquivo aberto a partir do chat agora é editável (editor com destaque, número de linha, desfazer, busca com ⌘F). ⌘S ou o botão Salvar grava no disco; a aba mostra ● enquanto houver alteração não salva e pergunta antes de fechar.
- Markdown abre formatado, com o botão **Editar** para mudar o texto.
- Se o agente alterar o arquivo enquanto você edita, aparece um aviso para escolher entre a versão do disco e a sua; nada é sobrescrito sem perguntar.

## 0.1.7

- **Arquivos viram links no chat**, como no VS Code: arquivos que o agente cria, edita ou lê, nomes de arquivo citados na resposta (ex.: `consultas/clientes.sql`, `NOTAS.md`, `app.ts:42`) e anexos abrem numa aba ao lado da conversa.
- A aba mostra o código com destaque de sintaxe e número de linha (vai direto para a linha citada), Markdown formatado (com opção de ver o código) e imagens. Atualiza sozinha quando o arquivo muda e tem atalhos para copiar, abrir no app padrão e mostrar no Finder.
- As abas de arquivo ficam salvas no layout do projeto.

## 0.1.6

- Barra de mensagem responsiva: com muitos painéis abertos, os seletores de modelo e permissão encolhem (ficam só com o ícone) em vez de sobrepor os botões, e os menus abrem por cima do painel, sempre inteiros na tela.

## 0.1.5

- **Seleção de modelo** na barra do chat (ex.: Opus, Sonnet, Haiku no Claude; os modelos do Codex), com o nível de raciocínio. A lista vem do próprio CLI, então modelos novos aparecem sozinhos.
- **Permissões**: escolha entre Automático (faz tudo sem pedir), Automático com revisão, Editar sem pedir, Pedir permissão ou Só planejar. A escolha fica salva na conversa e vira o padrão das próximas com o mesmo agente.
- **Anexar arquivos** pelo clipe, ou colando (⌘V) arquivos copiados no Finder e prints de tela. Imagens vão direto para o modelo.
- **Ditado por voz**: grave pelo microfone e o texto aparece no campo para revisar e enviar. A transcrição (Whisper) roda no seu computador; o modelo de voz é baixado uma única vez.
- Correção: conversas do Codex que não podiam ser retomadas agora abrem uma sessão nova em vez de falhar.

## 0.1.4

- Logos reais dos agentes (Claude e Codex), em preto e branco, no lugar das letras: abas, cabeçalho da conversa, menu de novo agente, tarefas e configurações.

## 0.1.3

- **Tarefas por projeto**, estilo Todoist: adição rápida, prioridade P1–P4, datas (Hoje, Amanhã, atrasadas), descrição, reordenar arrastando e concluídas recolhidas. O item **Tarefas** fica logo abaixo do nome do projeto na barra lateral, com a contagem de abertas.
- **Todas as tarefas**: todas as tarefas de todos os projetos numa tela, agrupadas por projeto, com filtros (Hoje, Atrasadas, Delegadas).
- **Delegar para um agente**: escolha o agente e o modo (mesma pasta ou worktree) e o Clawos abre uma conversa nova com a tarefa já enviada. A tarefa fica em andamento e mostra o status da conversa ao vivo.

## 0.1.2

- **Novo projeto em 5 passos:** pasta, nome e cor; agentes (padrão e habilitados) e instruções; MCPs; skills; e revisão. A configuração existente da pasta é detectada e pré-preenchida, assim como os arquivos de instruções e as skills do projeto.
- **Catálogo de MCPs** para adicionar com um clique: Filesystem, GitHub (servidor remoto oficial), Supabase, Playwright, Context7, Notion, Stripe e Memory. Tokens vão direto para o cofre do sistema; o `project.yaml` só guarda a referência.
- Opção de abrir uma conversa com o agente padrão assim que o projeto é criado.

## 0.1.1

- **Corrigido:** conversas que ficavam presas em "Resource not found" ao reabrir o app ou clicar em _Reiniciar sessão_. Acontecia quando a conversa era criada e encerrada antes da primeira mensagem (o Claude só grava a sessão depois dela). Agora, se o agente não conhecer a sessão anterior, o Clawos abre uma nova automaticamente — e avisa no chat apenas se havia contexto a perder.
- Mensagem clara quando a mesclagem de uma worktree é bloqueada por alterações não commitadas nos mesmos arquivos.
- macOS: pronto para assinatura Developer ID e notarização (ativadas pelos secrets do repositório).

## 0.1.0 — primeira versão

- Chat estruturado com agentes via ACP: streaming, ações como cards, diffs inline, pedidos de permissão, plano e pensamento.
- Agentes: Claude (adaptador ACP oficial + seu CLI `claude`), Codex (adaptador + seu CLI `codex`) e Gemini (`gemini --acp`, com API key).
- Detecção de instalação/login e botão **Entrar** com o login oficial de cada CLI.
- Projetos com `.clawos/project.yaml`: MCPs, skills, instruções e agentes por projeto, com isolamento dos MCPs globais em todos os agentes; segredos com a criptografia do sistema.
- Vários agentes em paralelo em painéis (dockview), layouts salvos por projeto e presets; sessões continuam rodando ao trocar de projeto; notificações do sistema.
- Worktrees isoladas por sessão: diff, abrir no editor, mesclar e descartar; aviso de edições concorrentes na mesma pasta.
- Histórico persistido (SQLite) e retomada de conversas.
- `@` para mencionar arquivos, arrastar para anexar, busca rápida (⌘K), atalhos, tema claro/escuro/sistema.
- Instaladores para macOS (arm64/x64), Windows e Linux.
