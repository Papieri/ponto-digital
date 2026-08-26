# Instalador do Ponto Digital para Windows.
# Rode pelo Instalar.bat, que já cuida da política de execução do PowerShell.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

function Titulo($texto) {
  Write-Host ""
  Write-Host "=== $texto ===" -ForegroundColor Cyan
}
function Ok($texto)     { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Aviso($texto)  { Write-Host "  [!]  $texto" -ForegroundColor Yellow }
function Erro($texto)   { Write-Host "  [X]  $texto" -ForegroundColor Red }

function Existe($comando) {
  $null -ne (Get-Command $comando -ErrorAction SilentlyContinue)
}

function WingetFunciona {
  if (-not (Existe "winget")) { return $false }
  try {
    $saida = winget --version 2>$null
    return -not [string]::IsNullOrWhiteSpace($saida)
  } catch { return $false }
}

Write-Host ""
Write-Host "  Ponto Digital - Papieri" -ForegroundColor White
Write-Host "  Instalacao nesta maquina" -ForegroundColor DarkGray
Write-Host "  Pasta: $raiz" -ForegroundColor DarkGray

# --- 1. Node.js --------------------------------------------------
Titulo "1 de 6  Node.js"

if (Existe "node") {
  $versao = (node -v).TrimStart("v")
  $maior = [int]($versao.Split(".")[0])
  if ($maior -ge 22) {
    Ok "Node $versao"
  } else {
    Erro "Node $versao e antigo demais. O projeto precisa da versao 22 ou maior."
    Write-Host "       Baixe em https://nodejs.org/ e rode este instalador de novo."
    exit 1
  }
} else {
  Aviso "Node nao encontrado."
  if (WingetFunciona) {
    Write-Host "       Instalando pelo winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Erro "Feche esta janela, abra o Instalar.bat de novo e continue."
    exit 1
  }
  Erro "Instale o Node 22 ou maior em https://nodejs.org/ e rode este instalador de novo."
  exit 1
}

# --- 2. PostgreSQL -----------------------------------------------
Titulo "2 de 6  PostgreSQL"

$pgRaiz = "C:\Program Files\PostgreSQL"
$pgBin = $null
if (Test-Path $pgRaiz) {
  $versaoPg = Get-ChildItem $pgRaiz -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+$' } |
    Sort-Object { [int]$_.Name } -Descending |
    Select-Object -First 1
  if ($versaoPg) {
    $candidato = Join-Path $versaoPg.FullName "bin"
    if (Test-Path (Join-Path $candidato "psql.exe")) {
      $pgBin = $candidato
      Ok "PostgreSQL $($versaoPg.Name) em $pgBin"
    }
  }
}

if (-not $pgBin) {
  Aviso "PostgreSQL nao encontrado."
  if (WingetFunciona) {
    Write-Host "       Instalando pelo winget. Quando pedir a senha do usuario postgres,"
    Write-Host "       anote a que voce escolher: sera pedida daqui a pouco."
    winget install PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements
    Erro "Feche esta janela, abra o Instalar.bat de novo e continue."
    exit 1
  }
  Erro "Instale o PostgreSQL e rode este instalador de novo."
  Write-Host "       Baixe em https://www.postgresql.org/download/windows/"
  Write-Host "       (clique em 'Download the installer', escolha Windows x86-64)."
  Write-Host "       Na instalacao ele pede uma senha para o usuario 'postgres' - anote."
  exit 1
}

# --- 3. Senha e banco --------------------------------------------
Titulo "3 de 6  Banco de dados"

Write-Host "  Digite a senha do usuario 'postgres' definida na instalacao do PostgreSQL."
$senha = Read-Host "  Senha (Enter para usar 'devlocal')"
if ([string]::IsNullOrWhiteSpace($senha)) { $senha = "devlocal" }

$env:PGPASSWORD = $senha
$psql = Join-Path $pgBin "psql.exe"

# Confere a senha antes de seguir, para nao falhar la na frente.
& $psql -U postgres -d postgres -c "select 1" *> $null
if ($LASTEXITCODE -ne 0) {
  Erro "Nao consegui conectar no PostgreSQL com essa senha."
  Write-Host "       Rode o instalador de novo com a senha correta."
  exit 1
}
Ok "Conexao com o PostgreSQL"

$existe = & $psql -U postgres -d postgres -tAc "select 1 from pg_database where datname='ponto'"
if ($existe -eq "1") {
  Ok "Banco 'ponto' ja existe"
} else {
  & (Join-Path $pgBin "createdb.exe") -U postgres ponto
  if ($LASTEXITCODE -ne 0) { Erro "Falha ao criar o banco 'ponto'."; exit 1 }
  Ok "Banco 'ponto' criado"
}

# --- 4. Arquivo .env ---------------------------------------------
Titulo "4 de 6  Configuracao"

# A senha vai dentro de uma URL: caracteres como @ e : precisam ser escapados.
$senhaUrl = [uri]::EscapeDataString($senha)
$caminhoEnv = Join-Path $raiz ".env"
if (Test-Path $caminhoEnv) {
  Copy-Item $caminhoEnv "$caminhoEnv.anterior" -Force
  Aviso "Ja existia um .env - copia guardada em .env.anterior"
}

$conteudoEnv = @"
DATABASE_URL=postgres://postgres:$senhaUrl@localhost:5432/ponto
UPLOAD_DIR=./uploads
SESSION_SECRET=$([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
"@
Set-Content -Path $caminhoEnv -Value $conteudoEnv -Encoding UTF8
Ok "Arquivo .env gravado"

# --- 5. Dependencias, tabelas e build ----------------------------
Titulo "5 de 6  Instalando o programa"

Push-Location $raiz
try {
  Write-Host "  Baixando bibliotecas (pode demorar alguns minutos)..."
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou" }
  Ok "Bibliotecas instaladas"

  Write-Host "  Criando as tabelas..."
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw "a criacao das tabelas falhou" }
  Ok "Tabelas criadas"

  Write-Host "  Montando as telas..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "o build falhou" }
  Ok "Telas prontas"
} catch {
  Erro $_
  Pop-Location
  exit 1
}
Pop-Location

# --- 6. Atalho ---------------------------------------------------
Titulo "6 de 6  Atalho na area de trabalho"

try {
  $shell = New-Object -ComObject WScript.Shell
  $atalho = $shell.CreateShortcut(
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Ponto Digital.lnk"))
  $atalho.TargetPath = Join-Path $PSScriptRoot "Ponto Digital.bat"
  $atalho.WorkingDirectory = $raiz
  $atalho.Description = "Ponto Digital - Papieri"
  $atalho.Save()
  Ok "Atalho 'Ponto Digital' criado na area de trabalho"
} catch {
  Aviso "Nao consegui criar o atalho. Use o 'Ponto Digital.bat' na pasta instalador."
}

Write-Host ""
Write-Host "  Instalacao concluida." -ForegroundColor Green
Write-Host "  Abra o Ponto Digital pelo atalho na area de trabalho." -ForegroundColor Green
Write-Host ""
Write-Host "  Este computador tem o proprio banco de dados: os lotes importados" -ForegroundColor DarkGray
Write-Host "  aqui nao aparecem em outro notebook." -ForegroundColor DarkGray
Write-Host ""
Read-Host "  Enter para fechar"
