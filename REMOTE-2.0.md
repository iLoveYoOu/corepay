# ArtAuto Remote 2.0

Painel e servidor com até dois aparelhos: telas lado a lado no computador e empilhadas em telas pequenas. Cada aparelho tem imagem, teclado, fila de comandos e revogação independentes. Com dois aparelhos, comandos sem identificador são recusados.

## Compatibilidade e ativação

- O protocolo de aparelho permanece compatível com o APK Remote 0.14; não foi gerado novo APK.
- Pareamento ADB Wi-Fi não equivale a pareamento Remote. Abra o Remote em cada aparelho e autorize o compartilhamento/acessibilidade no próprio Android. Para adicionar o segundo, use o código do painel.
- A atualização deve ser publicada separadamente no servidor. Alterações locais não atualizam o serviço em produção.
- Na primeira inicialização com este código, o armazenamento cria `artauto_remote_devices` e importa uma única vez o pareamento anterior. Não modifica tabelas financeiras. A tabela antiga é preservada.
- Antes de implantação, faça backup pelo procedimento operacional autorizado. Não execute uma versão antiga após revogar aparelhos na 2.0: ela ainda usa a tabela antiga e pode reconhecer o pareamento anterior.
- Imagens e comandos continuam em memória, não persistidos. Execute uma única instância do servidor, como no desenho anterior; múltiplas réplicas não são suportadas.

## Verificação local

Execute `node test/remote.js`, `node test/remote-persistence.js`, `node test/remote-multi.js`, `node test/remote-keyboard.js` e `node test/remote-ui.js`.

Os testes usam servidor local, banco em memória e dispositivos/imagens simulados. Cobrem migração, reinício, autenticação, limite de dois aparelhos, isolamento de imagens/comandos, revogação individual, teclado e layout responsivo. Não substituem validação com os dois celulares após implantação.
