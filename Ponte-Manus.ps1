# Ponte-Manus.ps1 - Versão Automática (Fim de Tarefa -> Clipboard)
$bridgeDir = ".opencode-bridge"
$taskReady = "$bridgeDir\task.ready.md"
$taskRunning = "$bridgeDir\task.running.md"
$resultFile = "$bridgeDir\result.md"
$statusFile = "$bridgeDir\status.txt"

Write-Host "=== PONTE MANUS (MODO AUTOMÁTICO) ===" -ForegroundColor Cyan
Write-Host "Aguardando tarefas..."

while ($true) {
    if (Test-Path $taskReady) {
        if (Test-Path $resultFile) { Remove-Item $resultFile -Force -ErrorAction SilentlyContinue }
        "EXECUTANDO" | Out-File $statusFile -Encoding utf8
        Move-Item $taskReady $taskRunning -Force
        
        Write-Host "[!] DeepSeek trabalhando..." -ForegroundColor Yellow
        opencode run (Get-Content $taskRunning -Raw) --model "opencode/deepseek-v4-flash-free" --auto > $resultFile
        
        # Prepara o relatório automático para o Manus
        $diff = git diff --stat
        $resultText = Get-Content $resultFile -Raw
        $statusGit = git status -sb
        
        $finalReport = @"
--- RELATÓRIO AUTOMÁTICO PARA O MANUS ---
ESTADO: CONCLUÍDO

RESULTADO DO OPENCODE:
$resultText

RESUMO DE ALTERAÇÕES (GIT DIFF):
$diff

STATUS DO REPOSITÓRIO:
$statusGit
"@
        $finalReport | Set-Clipboard
        
        if (Test-Path $taskRunning) { Remove-Item $taskRunning -Force }
        "CONCLUIDO" | Out-File $statusFile -Encoding utf8
        
        Write-Host "`n[OK] Missão Cumprida!" -ForegroundColor Green
        Write-Host "RELATÓRIO COPIADO! Basta dar Ctrl+V no chat do Manus." -ForegroundColor Cyan
        Write-Host "Aguardando próxima tarefa..."
    }
    Start-Sleep -Seconds 2
}
