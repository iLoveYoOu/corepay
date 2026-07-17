Continue a revisão da remoção da Tesouraria. Trabalhe somente com comandos compatíveis com Windows PowerShell (`Get-ChildItem`, `Get-Content`, `Select-String`) ou executáveis diretos (`git`, `node`, `npm.cmd`, `rg`). Não use comandos Linux.

Problema confirmado pelo revisor: `test/smoke.js` ainda contém chamadas e expectativas da API removida `/treasury/today`. Preserve os testes de migração e integridade das tabelas/dados históricos da Tesouraria, mas remova ou adapte somente os testes que exigem a existência da API/rota removida. Não altere `src/db/database.js` nem apague tabelas ou dados.

Confirme no código produtivo que menu, tela, estado Vue, chamadas `/treasury`, montagem Express, arquivo de rota e permissão `viewTreasury` foram removidos. Corrija apenas resíduos incompatíveis com essa remoção.

Execute e relate o código de saída de: `git status --short`; `git diff --check`; `node --check server.js`; `node --check src/routes/directory.js`; `npm.cmd run build:dashboard`; e o teste automatizado relevante. Faça uma busca final por `Tesouraria|treasury|viewTreasury`, distinguindo referências intencionais de banco/migração das referências indevidas de UI/API.

Não modifique `.opencode`, `.opencode-bridge`, `AGENTS.md`, `opencode.json`, `.gitignore` ou scripts da ponte. Não faça commit, push ou deploy. Não encerre após o primeiro comando: complete toda a tarefa e apresente evidências reais.
