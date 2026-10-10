# Changelog

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
