# MANUS-START.ps1 - Inicializador Único CorePay
$path = "C:\Users\Pichau\Documents\Codex\CorePay"
Set-Location $path

Write-Host "Iniciando Ecossistema Manus..." -ForegroundColor Cyan

# Abre a Janela 1: A Ponte (Motor)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$path'; .\Ponte-Manus.ps1" -WindowStyle Normal

# Abre a Janela 2: O Coordenador (Menu)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$path'; .\Manus-Ponte.ps1" -WindowStyle Normal

Write-Host "[OK] Motor e Menu iniciados em janelas separadas!" -ForegroundColor Green
Write-Host "Pode fechar esta janela se desejar."
Pause
