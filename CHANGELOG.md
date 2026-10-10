# Changelog

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
