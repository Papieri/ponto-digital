# Sobe o Ponto Digital e abre o navegador.
# Fechar esta janela encerra o programa.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$URL = "http://127.0.0.1:5173"

if (-not (Test-Path (Join-Path $raiz ".env"))) {
  Write-Host "  Este computador ainda nao foi preparado." -ForegroundColor Red
  Write-Host "  Rode o Instalar.bat primeiro." -ForegroundColor Red
  Read-Host "  Enter para fechar"
  exit 1
}

Write-Host ""
Write-Host "  Ponto Digital - Papieri" -ForegroundColor White

# Versao do codigo que esta na pasta agora.
function VersaoDaPasta {
  try { return (git rev-parse --short HEAD 2>$null).Trim() } catch { return "" }
}

# Versao que o programa em execucao esta servindo, se houver algum.
function VersaoEmExecucao {
  try {
    $r = Invoke-WebRequest -Uri "$URL/api/saude" -UseBasicParsing -TimeoutSec 2
    return ($r.Content | ConvertFrom-Json).versao.commit
  } catch { return $null }
}

# Ja tem um Ponto Digital aberto? Se for a versao atual, aproveitamos: derrubar
# fecharia o programa que a pessoa talvez esteja usando. Se for versao antiga,
# derrubamos - senao ela continuaria vendo a versao anterior sem perceber, que
# e o engano mais facil de cometer aqui.
$emExecucao = VersaoEmExecucao
if ($emExecucao) {
  $daPasta = VersaoDaPasta
  if ($daPasta -and $emExecucao -ne "desconhecida" -and $emExecucao -ne $daPasta) {
    Write-Host "  Havia uma versao antiga aberta ($emExecucao). Encerrando..." -ForegroundColor Yellow
    $conexoes = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conexoes) {
      try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch { }
    }
    Start-Sleep -Seconds 2
  } else {
    Write-Host "  O programa ja esta aberto. Abrindo no navegador..." -ForegroundColor Green
    Start-Process $URL
    Write-Host ""
    Write-Host "  Esta janela pode ser fechada - o programa segue rodando na outra." -ForegroundColor DarkGray
    Start-Sleep -Seconds 4
    exit 0
  }
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
    Invoke-WebRequest -Uri "$URL/api/saude" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $pronto = $true
    break
  } catch { }
}

if ($pronto) {
  Start-Process $URL
  Write-Host "  Aberto em $URL" -ForegroundColor Green
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
