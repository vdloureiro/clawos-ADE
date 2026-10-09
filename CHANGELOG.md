# Changelog

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
