$Core = "C:\Users\arthu\OneDrive\Área de Trabalho\CorePay"
$Dash = "C:\Users\arthu\OneDrive\Área de Trabalho\CorePay\dashboard"

function PortaAberta($porta) {
  $c = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
  return $null -ne $c
}

Write-Host "Verificando CorePay..." -ForegroundColor Cyan

if (PortaAberta 4000) {
  Write-Host "Backend já está rodando na porta 4000" -ForegroundColor Green
} else {
  Write-Host "Iniciando Backend..." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Core'; npm run dev"
  Start-Sleep -Seconds 3
}

if (PortaAberta 5173) {
  Write-Host "Frontend já está rodando na porta 5173" -ForegroundColor Green
} else {
  Write-Host "Iniciando Frontend..." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Dash'; npm run dev"
  Start-Sleep -Seconds 3
}

Start-Process "http://localhost:5173"

Write-Host "CorePay iniciado." -ForegroundColor Green