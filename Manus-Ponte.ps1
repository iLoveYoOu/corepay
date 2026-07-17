# Manus-Ponte.ps1 - Automacao de Coordenacao CorePay
$bridgeDir = ".opencode-bridge"
if (!(Test-Path $bridgeDir)) { New-Item -ItemType Directory -Path $bridgeDir -Force }

function Menu {
    Clear-Host
    Write-Host "=== MANUS: COORDENADOR COREPAY ===" -ForegroundColor Cyan
    Write-Host "1. Preparar Tarefa (REMOVER EXTRATO)"
    Write-Host "2. Coletar Resultado para o Manus (Copy to Clipboard)"
    Write-Host "3. Limpar arquivos temporarios da ponte"
    Write-Host "4. Sair"
    Write-Host "=================================="
    $choice = Read-Host "Escolha uma opcao"
    
    switch ($choice) {
        "1" { PrepararTarefa }
        "2" { ColetarResultado }
        "3" { LimparPonte }
        "4" { exit }
        Default { Menu }
    }
}

function PrepararTarefa {
    $task = @'
# TAREFA PESADA: Remover funcionalidade de 'Extrato' do CorePay
Objetivo: Desativar a interface e as rotas de API do Extrato, mantendo a integridade do sistema.

INSTRUCOES PARA O EXECUTOR (OpenCode):
1. LOCALIZACAO: Procure por 'Extrato' ou 'statement' no frontend (pasta dashboard/src) e backend (src/routes).
2. FRONTEND (Vue):
   - Remova o item 'Extrato' do menu lateral (provavelmente em Sidebar.vue ou App.vue).
   - Remova a rota associada no Vue Router (dashboard/src/router/index.js).
   - NAO delete o arquivo .vue da tela por enquanto, apenas desative o acesso.
3. BACKEND (Node.js):
   - Identifique e comente/remova a rota de API de extrato em server.js ou src/routes/.
4. BANCO DE DADOS: NAO apague tabelas ou dados.
5. VALIDACAO:
   - Execute 'npm.cmd run build:dashboard' na pasta raiz para garantir que o frontend compila.
   - Execute 'node --check server.js' para validar o backend.
   - Execute 'npm.cmd test' para garantir que nada quebrou.

IMPORTANTE: Use apenas comandos PowerShell. Reporte qualquer conflito no result.md.
'@
    $task | Out-File -FilePath "$bridgeDir\task.ready.md" -Encoding utf8
    Write-Host "
[OK] Tarefa enviada para $bridgeDir\task.ready.md" -ForegroundColor Green
    Write-Host "Se a ponte estiver aberta, o OpenCode comecara em instantes."
    Pause
    Menu
}

function ColetarResultado {
    $report = "info_manus.txt"
    "--- STATUS DA PONTE ---" | Out-File $report -Encoding utf8
    if (Test-Path "$bridgeDir\status.txt") { Get-Content "$bridgeDir\status.txt" | Out-File $report -Append }
    
    "
--- RESULTADO DO OPENCODE ---" | Out-File $report -Append
    if (Test-Path "$bridgeDir\result.md") { Get-Content "$bridgeDir\result.md" | Out-File $report -Append } else { "Sem resultado ainda" | Out-File $report -Append }
    
    "
--- ESTADO DO GIT ---" | Out-File $report -Append
    git status -sb | Out-File $report -Append
    
    Get-Content $report | Set-Clipboard
    Write-Host "
[OK] Tudo copiado! Cole no chat com o Manus." -ForegroundColor Green
    Pause
    Menu
}

function LimparPonte {
    Remove-Item "$bridgeDir\task.*" -ErrorAction SilentlyContinue
    Remove-Item "$bridgeDir\result.md" -ErrorAction SilentlyContinue
    Write-Host "
[OK] Arquivos temporarios removidos." -ForegroundColor Yellow
    Pause
    Menu
}

Menu
