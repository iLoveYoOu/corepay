# Ponte OpenCode V3

## Enviar uma tarefa

```powershell
.\Enviar-Tarefa-OpenCode-V3.ps1 -TaskFile .\tarefa.md
```

A janela de trabalho abre automaticamente.

## Recuperação

- Uma tarefa interrompida nunca é apagada.
- A V3 recupera `task.running.md` órfã ao iniciar.
- Em caso de erro, tenta novamente até 3 vezes.
- Cada tentativa recebe a saída anterior e deve continuar pelo `git diff`.
- Após três falhas, a tarefa fica preservada. Abra `Ponte OpenCode V3.cmd` novamente para continuar.

## Autoteste

```powershell
.\ChatGPT-OpenCode-Bridge-V3.ps1 -Mode SelfTest
```
