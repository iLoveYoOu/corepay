$Core = $PSScriptRoot
$Dash = Join-Path $Core 'dashboard'

function Testar-Porta($porta) {
  $conexao = Get-NetTCPConnection `
    -LocalPort $porta `
    -State Listen `
    -ErrorAction SilentlyContinue

  return $null -ne $conexao
}

Write-Host 'Verificando CorePay...' -ForegroundColor Cyan

if (Testar-Porta 4000) {
  Write-Host 'Backend já está rodando na porta 4000.' -ForegroundColor Green
} else {
  Write-Host 'Iniciando backend...' -ForegroundColor Yellow
  Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', "Set-Location -LiteralPath '$Core'; npm run dev"
}

if (Testar-Porta 5173) {
  Write-Host 'Frontend já está rodando na porta 5173.' -ForegroundColor Green
} else {
  Write-Host 'Iniciando frontend...' -ForegroundColor Yellow
  Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList '-NoExit', '-Command', "Set-Location -LiteralPath '$Dash'; npm run dev"
}

Start-Process 'http://localhost:5173'
Write-Host 'CorePay iniciado.' -ForegroundColor Green
