@echo off
echo # Tarefa: Verificacao de Sanidade do Projeto CorePay > .opencode-bridge\task.ready.md
echo Verifique o estado atual do projeto apos a remocao da tesouraria. >> .opencode-bridge\task.ready.md
echo 1. Execute 'node --check server.js' para validar a sintaxe. >> .opencode-bridge\task.ready.md
echo 2. Liste os arquivos em 'src/routes/' para garantir que 'treasury.js' nao existe mais. >> .opencode-bridge\task.ready.md
echo 3. Execute 'npm.cmd test' (test/smoke.js) para validar a integridade. >> .opencode-bridge\task.ready.md
echo 4. Verifique se o arquivo '.env' esta protegido. >> .opencode-bridge\task.ready.md
echo.
echo Tarefa preparada em .opencode-bridge\task.ready.md! 
echo Se a ponte estiver aberta, o OpenCode vai comecar agora.
pause
