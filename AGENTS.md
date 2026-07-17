# CorePay

Este é um sistema financeiro. Trabalhe somente dentro deste repositório e faça alterações mínimas, verificáveis e compatíveis com o comportamento existente.

## Regras obrigatórias

- Nunca leia, mostre, copie ou altere `.env`, credenciais, tokens ou chaves.
- Nunca altere ou exclua arquivos `*.db`, `*.db-wal`, `*.db-shm`, backups, tabelas ou migrações sem uma solicitação explícita.
- Nunca faça commit, push, tag, publicação, deploy ou alteração no Render/Supabase.
- Nunca use comandos destrutivos, restaure arquivos com `git checkout/reset` nem descarte mudanças existentes.
- Antes de editar, leia os arquivos relacionados e confirme usos compartilhados.
- Preserve autenticação, isolamento entre empresas, Litestream e persistência.
- No Windows, prefira `npm.cmd` quando a política do PowerShell bloquear `npm.ps1`.
- Depois de editar, execute verificações proporcionais: busca de referências, `git diff --check`, sintaxe, testes existentes e build.
- Se uma verificação não puder ser executada, informe o comando e o erro real. Não declare sucesso sem evidência.
- Ao terminar, informe arquivos modificados, comandos executados, resultados e riscos restantes.

## Publicação

Somente o usuário pode autorizar commit, push e deploy em uma solicitação separada e explícita.
