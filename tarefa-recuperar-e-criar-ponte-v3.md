Você está retomando uma tarefa interrompida no CorePay.

PARTE 1 — RETOMAR A ÚLTIMA TAREFA

1. Leia .opencode-bridge-v2/last-task.md para recuperar a tarefa anterior de cadastro público e domínio.
2. Inspecione git status e git diff para identificar tudo que já foi feito.
3. Preserve as alterações corretas e conclua somente o que falta.
4. Rode os testes e o build usando diretamente o node.exe indicado na tarefa anterior.

PARTE 2 — CRIAR UMA PONTE OPENCODE V3 RESILIENTE

Corrija definitivamente a fragilidade da Ponte V2 criando uma V3 independente.

Requisitos obrigatórios:

1. Criar:
   - ChatGPT-OpenCode-Bridge-V3.ps1
   - Enviar-Tarefa-OpenCode-V3.ps1
   - Ponte OpenCode V3.cmd
   - PONTE-OPENCODE-V3.md
   - diretório de runtime .opencode-bridge-v3 ignorado pelo Git.
2. Ao enviar uma tarefa pela V3, abrir automaticamente uma janela preta visível se não houver trabalhador ativo.
3. Usar fila transacional com task.ready.md e task.running.md.
4. Ao iniciar, se existir task.running.md órfã e nenhum processo trabalhador válido, recuperar automaticamente para task.ready.md.
5. Se o OpenCode falhar, fechar ou reportar erro:
   - nunca apagar a tarefa;
   - guardar a saída e o relatório;
   - recolocar a tarefa na fila;
   - tentar novamente automaticamente até 3 vezes.
6. Em cada retomada, incluir no prompt:
   - a tarefa original;
   - orientação para inspecionar git diff e preservar o que já foi concluído;
   - a saída relevante da tentativa anterior, limitada para não criar prompt enorme.
7. Um erro de uma tentativa não pode matar definitivamente o loop sem preservar a tarefa.
8. Após sucesso:
   - mostrar mensagem verde TAREFA CONCLUÍDA;
   - gravar relatório final;
   - limpar somente os arquivos ready/running/contador;
   - fechar a janela automaticamente após alguns segundos.
9. Após 3 falhas:
   - manter a tarefa preservada;
   - mostrar erro claro;
   - permitir que abrir Ponte OpenCode V3.cmd novamente continue a mesma tarefa.
10. Impedir dois trabalhadores V3 simultâneos usando PID válido.
11. Não depender de caminhos temporários desta conversa. Localize opencode.exe de modo confiável, mantendo fallback para o caminho atualmente usado.
12. Fazer um SelfTest que use OpenCode simulado e valide:
   - sucesso;
   - falha seguida de retomada;
   - recuperação de task.running órfã;
   - tarefa nunca perdida.
13. Atualizar .gitignore para ignorar .opencode-bridge-v3 e arquivos locais apropriados.
14. A V3 não deve fazer commit, push ou deploy automaticamente.
15. Não faça commit, push ou deploy nesta execução.

Ao final, execute o SelfTest da V3 e relate claramente o resultado.
