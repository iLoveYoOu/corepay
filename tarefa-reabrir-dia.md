# Tarefa: permitir reabrir um dia fechado por engano

No CorePay, implemente uma forma segura de reabrir uma operação/dia que foi fechado por engano.

## Comportamento esperado

- Em **Fechamentos anteriores**, adicionar uma ação visível chamada **Reabrir dia** em cada fechamento que possa ser restaurado.
- Ao reabrir, restaurar a operação como o dia/operação ativa, incluindo bancos, finalidades, saldos e lançamentos relacionados.
- O fechamento anterior correspondente deve deixar de contar como encerrado, evitando duplicidade nos totais, no histórico e nos cálculos do Lucão.
- Não duplicar bancos, depósitos, saques, retornos ou qualquer movimentação.
- Se já existir outra operação ativa, bloquear a reabertura e mostrar uma mensagem clara ao usuário, sem alterar dados.
- Pedir confirmação antes de reabrir, explicando qual dia/operação será restaurado.
- Respeitar autenticação e isolamento por empresa/usuário já existentes.
- A ação precisa funcionar após atualizar a página, portanto não pode ser apenas uma mudança visual no frontend.

## Implementação e validação

- Antes de editar, examine o fluxo atual de início, fechamento, histórico e reset do dia no frontend e no backend.
- Faça alterações mínimas e compatíveis com os dados existentes.
- Não altere nem apague arquivos `.db`, credenciais ou segredos.
- Não faça commit, push ou deploy.
- Adicione ou atualize testes para cobrir: reabertura bem-sucedida, bloqueio quando já há operação ativa e ausência de duplicidade.
- Execute os testes relevantes, build do dashboard, verificação de sintaxe e `git diff --check`.
- Ao concluir, deixe na mensagem final o resumo dos arquivos alterados, testes executados e riscos restantes.
