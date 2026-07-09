$ports = @(4000, 5173)

foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $conns) {
    $pid = $conn.OwningProcess
    if ($pid) {
      Stop-Process -Id $pid -Force
      Write-Host "Processo da porta $port encerrado." -ForegroundColor Green
    }
  }
}

Write-Host "CorePay parado."