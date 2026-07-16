# CorePay

Painel operacional para controle de bancos, operadores, lançamentos e fechamento diário. O fluxo **Operação Bancária** registra o que aconteceu nas contas; ele não movimenta dinheiro e não substitui a confirmação no aplicativo do banco.

## Produção

1. Configure as variáveis de [`.env.example`](./.env.example).
2. No Render, use um Persistent Disk e aponte `DATABASE_PATH` para ele, por exemplo `/var/data/corepay.db`.
3. Mantenha apenas uma instância gravando no SQLite.
4. Deixe `ENABLE_MERCADOPAGO_DEPOSITS=false` enquanto o objetivo for evitar a tarifa da API.
5. O backup usa `GET /backup/db` com `Authorization: Bearer <BACKUP_TOKEN>` e cria uma cópia consistente mesmo com WAL ativo.

## Desenvolvimento

```bash
npm install
npm start
```

O `postinstall` compila automaticamente o dashboard Vue. A aplicação exige `JWT_SECRET` antes de iniciar.

## Regras importantes

- Operadores são cadastrados em **Administração**; o fluxo legado duplicado foi removido.
- Pagamento e saque reais não estão integrados. As rotas antigas retornam `410` para impedir falso sucesso.
- Troca de senha, bloqueio ou alteração de perfil revoga sessões anteriores.
- O Pix estático da Operação Bancária não leva valor; o pagador informa o valor no banco.
