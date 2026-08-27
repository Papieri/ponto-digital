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

# Uma instancia antiga segurando a porta serve a versao ANTIGA do programa: o
# novo processo nao consegue assumir a porta, morre, e o navegador continua
# conversando com o velho. Some ate em janela anonima, porque nao e cache do
# navegador - e outro servidor respondendo. Por isso derrubamos antes de subir.
$ocupada = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($ocupada) {
  Write-Host "  Ja havia uma instancia aberta. Encerrando para subir a versao atual..." -ForegroundColor Yellow
  foreach ($conexao in $ocupada) {
    try { Stop-Process -Id $conexao.OwningProcess -Force -ErrorAction Stop } catch { }
  }
  Start-Sleep -Seconds 2
}

Write-Host "  Iniciando..." -ForegroundColor DarkGray

# `npm` no Windows e npm.cmd: chamamos pelo cmd.exe para o Start-Process achar.
$app = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start" `
  -PassThru -NoNewWindow

# Espera a porta responder. Conferir so a porta nao basta: se o nosso processo
# morreu e outro respondeu, estariamos abrindo o programa errado.
$pronto = $false
foreach ($i in 1..40) {
  Start-Sleep -Milliseconds 500
  if ($app.HasExited) { break }
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:5173/api/saude" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $pronto = $true
    break
  } catch { }
}

if ($pronto) {
  Start-Process "http://127.0.0.1:5173"
  Write-Host "  Aberto em http://127.0.0.1:5173" -ForegroundColor Green
} elseif ($app.HasExited) {
  Write-Host "  O programa nao conseguiu subir." -ForegroundColor Red
  Write-Host "  Rode 'npm start' na pasta do projeto para ver a mensagem de erro." -ForegroundColor Red
  Read-Host "  Enter para fechar"
  exit 1
} else {
  Write-Host "  O programa demorou a responder." -ForegroundColor Yellow
  Write-Host "  Se o PostgreSQL estiver parado, abra os Servicos do Windows e inicie" -ForegroundColor Yellow
  Write-Host "  o servico postgresql." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  FECHE ESTA JANELA PARA ENCERRAR O PROGRAMA." -ForegroundColor DarkGray
Wait-Process -Id $app.Id
