# Sobe o Ponto Digital e abre o navegador. Fechar esta janela encerra o programa.
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

if (-not (Test-Path (Join-Path $raiz ".env"))) {
  Write-Host "  Este computador ainda nao foi preparado." -ForegroundColor Red
  Write-Host "  Rode o Instalar.bat primeiro." -ForegroundColor Red
  Read-Host "  Enter para fechar"
  exit 1
}

Write-Host ""
Write-Host "  Ponto Digital - Papieri" -ForegroundColor White
Write-Host "  Iniciando..." -ForegroundColor DarkGray

$app = Start-Process npm -ArgumentList "start" -PassThru -NoNewWindow

# Espera a porta responder antes de abrir o navegador.
$pronto = $false
foreach ($i in 1..40) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:5173/api/saude" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $pronto = $true
    break
  } catch { }
}

if ($pronto) {
  Start-Process "http://127.0.0.1:5173"
  Write-Host "  Aberto em http://127.0.0.1:5173" -ForegroundColor Green
} else {
  Write-Host "  O programa demorou a responder." -ForegroundColor Yellow
  Write-Host "  Se o PostgreSQL estiver parado, abra os Servicos do Windows e inicie" -ForegroundColor Yellow
  Write-Host "  o servico postgresql." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  FECHE ESTA JANELA PARA ENCERRAR O PROGRAMA." -ForegroundColor DarkGray
Wait-Process -Id $app.Id
