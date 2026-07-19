# Ponte ChatGPT -> OpenCode V2

A V2 envia o conteudo da tarefa como prompt. Ela nao usa `--file`, evitando que
o OpenCode confunda instrucoes com caminho ou nome de arquivo.

## Uso direto

Abra um PowerShell na pasta do CorePay.

1. Inicie o trabalhador (deixe a janela aberta):

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Iniciar-Ponte-OpenCode-V2.ps1`

2. Em outra janela, envie o texto copiado:

   `Get-Clipboard -Raw | powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Enviar-Tarefa-OpenCode-V2.ps1`

   Tambem e possivel executar o remetente sem pipeline; nesse caso ele le a
   area de transferencia diretamente:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Enviar-Tarefa-OpenCode-V2.ps1`

   Ou envie um arquivo de tarefa:

   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Enviar-Tarefa-OpenCode-V2.ps1 -TaskFile .\tarefa.md`

3. Ao terminar, consulte:

   `.opencode-bridge-v2\report-chatgpt.md`

## Execucao unica

Depois de enviar uma tarefa, tambem e possivel processa-la sem deixar um
trabalhador aberto:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ChatGPT-OpenCode-Bridge-V2.ps1 -Mode RunOnce`

## Autoteste local

O autoteste usa um OpenCode simulado, nao chama modelo e nao altera o codigo do
CorePay:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ChatGPT-OpenCode-Bridge-V2.ps1 -Mode SelfTest`
