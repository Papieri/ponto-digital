# Como rodar no Windows — passo a passo

Guia para quem nunca rodou o projeto. Do zero até ver a tabela de apuração na
tela. Leva uns 20 minutos, quase tudo esperando download.

---

## Passo 0 · Abrir o PowerShell

Menu Iniciar → digite `powershell` → **Abrir**.

**Não** use "Executar como Administrador". Rodar o projeto não precisa disso, e
como Administrador os arquivos ficam com dono errado. Só a instalação dos
programas pede elevação, e o Windows pergunta sozinho na hora.

**Não** use o Prompt de Comando (CMD): ele não entende vários comandos daqui.

---

## Passo 1 · Ver o que já está instalado

Cole no PowerShell e aperte Enter:

```powershell
node -v; npm -v; git --version; docker --version
```

O esperado é algo assim:

```
v22.11.0
10.9.0
git version 2.47.0.windows.1
Docker version 27.3.1, build ce12230
```

Se aparecer **"não é reconhecido como nome de cmdlet"** em alguma linha, é essa
peça que falta. Vá para o passo 2. Se as quatro responderam, pule para o 3.

> A versão do Node precisa ser **22 ou maior**. Se a sua for menor, instale de
> novo pelo passo 2.

---

## Passo 2 · Instalar o que faltar

Um comando por peça que faltou. Cada um abre um aviso do Windows pedindo
permissão — pode aceitar.

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

> **Se o winget responder só `\` e voltar ao prompt sem instalar nada**, ele
> está quebrado nessa máquina — acontece quando o "Instalador de Aplicativo"
> está desatualizado ou ausente. Para confirmar, rode `winget search git`: se
> não imprimir uma tabela de pacotes, é isso. Não gaste tempo consertando;
> baixe pelos sites oficiais, que é o caminho de sempre:
> [Node.js](https://nodejs.org/) · [Git](https://git-scm.com/download/win) ·
> [PostgreSQL](https://www.postgresql.org/download/windows/).

Para o banco, escolha **um** dos dois caminhos abaixo. Qualquer um serve: a
migration é Postgres puro, sem recurso de fornecedor.

**Caminho A — Postgres direto (mais simples no Windows):**

```powershell
winget install PostgreSQL.PostgreSQL.16
```

Sem winget, baixe pelo site: em
[postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
clique em *Download the installer*, e na coluna **Windows x86-64** da versão
que preferir, clique em *Download*. Rode o `.exe`.

**Qualquer versão da 14 para cima serve** — 16, 17 ou 18. A migration usa só
DDL comum (tabelas, enums, chaves estrangeiras e índices), sem nada específico
de versão, e o `timestamp` sem fuso, que é o ponto sensível deste projeto, se
comporta igual em todas.

No instalador:

- **Componentes:** mantenha *PostgreSQL Server* e *Command Line Tools*. O
  *Stack Builder* pode desmarcar.
- **Senha do usuário `postgres`:** use **`devlocal`** — é a que já está no
  `.env.example`, e assim nada mais precisa ser ajustado.
- **Porta:** deixe 5432.
- No fim, se abrir o *Stack Builder*, pode cancelar.

O Postgres vira um serviço do Windows e sobe sozinho com o computador. Não tem
o "ligar o banco" do passo 4.

**Caminho B — Docker Desktop:**

```powershell
winget install Docker.DockerDesktop
```

Exige WSL2 e virtualização habilitada na BIOS, e costuma pedir reinicialização
do computador na primeira instalação. É o caminho mais pesado dos dois — se a
máquina não tiver Docker ainda, prefira o caminho A.

> **Atenção ao nome do pacote:** é `Docker.DockerDesktop`. Com o nome errado, o
> winget não acha nada e sai sem mensagem clara, parecendo que instalou.

Depois de instalar, **feche o PowerShell e abra de novo**. Sem isso ele não
enxerga os programas novos. Aí repita o passo 1 para conferir.

> Se o `winget` não existir na sua máquina, baixe pelos sites oficiais:
> [Node.js](https://nodejs.org/) · [Git](https://git-scm.com/download/win) ·
> [PostgreSQL](https://www.postgresql.org/download/windows/) ·
> [Docker Desktop](https://www.docker.com/products/docker-desktop/).

---

## Passo 3 · Baixar o projeto

```powershell
cd $HOME\Documents
git clone https://github.com/Papieri/ponto-digital.git
cd ponto-digital
git checkout claude/timesheet-mysql-postgres-migration-f480zs
```

O repositório é privado: na primeira vez o Git abre uma janela do navegador
pedindo login do GitHub. Faça o login e ele guarda para as próximas.

A última linha é importante — é ela que troca para o ramo onde o trabalho está.
Sem ela você fica no `main`, que está vazio.

Confira que deu certo:

```powershell
git branch --show-current
```

Tem que responder `claude/timesheet-mysql-postgres-migration-f480zs`.

---

## Passo 4 · Criar o banco

### Caminho A — Postgres direto

O serviço já está no ar desde a instalação. Só falta criar o banco. Troque o
`18` pela versão que você instalou:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres ponto
```

Ele pede a senha que você definiu na instalação (`devlocal`). Sem mensagem de
erro, deu certo. **Isso é só uma vez** — nas próximas o banco já existe e o
serviço sobe junto com o Windows.

> **A senha não aparece enquanto você digita.** Nem asteriscos, nem pontinhos,
> nem cursor andando — parece que o teclado travou, e não travou. É proposital,
> para ninguém ler a senha por cima do ombro. Digite no escuro e aperte Enter.

Para não passar por esse prompt às cegas, informe a senha antes:

```powershell
$env:PGPASSWORD = "devlocal"
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres ponto
```

A variável vale só nessa janela do PowerShell e some quando você a fecha.

Confira que o banco existe:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -l
```

Procure `ponto` na lista. Se aparecer, está pronto.

Não sabe a versão? Liste a pasta:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL"
```

> **Se você usou outra senha** que não `devlocal`, abra o `.env` e ajuste a
> linha `DATABASE_URL` antes de seguir:
> `postgres://postgres:SUA_SENHA@localhost:5432/ponto`

### Caminho B — Docker

Primeiro **abra o Docker Desktop** pelo Menu Iniciar e espere ele terminar de
subir — o ícone da baleia, embaixo à direita, para de se mexer quando está
pronto. O passo seguinte só funciona com ele rodando.

Agora, no PowerShell:

```powershell
docker run -d --name ponto-db -e POSTGRES_PASSWORD=devlocal -e POSTGRES_DB=ponto -p 5432:5432 postgres:16
```

Na primeira vez ele baixa o Postgres, o que demora um pouco. No fim imprime uma
linha comprida de letras e números — é o identificador do container, sinal de
que deu certo.

**Isso é só uma vez.** Nas próximas, para religar o banco:

```powershell
docker start ponto-db
```

---

## Passo 5 · Preparar o projeto

```powershell
cp .env.example .env
npm install
```

O `npm install` baixa as bibliotecas e demora um ou dois minutos. Pode aparecer
aviso de `vulnerabilities` no fim — normal, não atrapalha.

---

## Passo 6 · Criar as tabelas

```powershell
npm run db:migrate
```

Esperado: `migrations applied successfully!`

---

## Passo 7 · Rodar os testes

```powershell
npm test
```

Esperado, no fim:

```
 Test Files  5 passed (5)
      Tests  67 passed (67)
```

Se os 67 passarem, tudo que foi construído está funcionando na sua máquina.

---

## Passo 8 · Ver a apuração

```powershell
npm run seed:colaboradores
npm run validar amostras/Registo_de_comparec_.txt
```

O primeiro cadastra as taxas de amostra, para os valores saírem do zero. O
segundo importa o arquivo do relógio de ponto e imprime:

```
| Cód | Nome           | Dias | Total | Dias c/ problema |  Status | Total por Hora | Total Passagem | Valor Total | VALOR A PAGAR |
|-----|----------------|------|-------|------------------|---------|----------------|----------------|-------------|---------------|
| 3   | Elaine         |    6 | 45:42 |                0 |      ok |         761,36 |           0,00 |      761,36 |        762,00 |
| 4   | Raquel         |    6 | 42:08 |                1 | warning |         701,94 |           0,00 |      701,94 |        702,00 |
| 5   | Skarlat        |    5 | 45:34 |                0 |      ok |         506,25 |          60,00 |      566,25 |        567,00 |
| 6   | Jucelaine Paes |    5 | 43:41 |                0 |      ok |         582,30 |          60,00 |      642,30 |        643,00 |
| 8   | Maria Izadora  |    6 | 55:46 |                0 |      ok |         929,07 |          72,00 |    1.001,07 |      1.002,00 |
| 22  | Ketlen Dias    |    5 | 38:18 |                0 |      ok |         510,54 |          60,00 |      570,54 |        571,00 |

Dias em aberto (6.4): 1 — fechamento exige confirmação explícita.
  ! Raquel em 2026-08-21: 3 batidas — Número ímpar de registros (3) — possível batida faltando
```

Bateu? Então está tudo certo.

> Os valores em reais usam as taxas de julho/2026 lidas da amostra de
> fechamento, só para o número não sair zerado. Não são o pagamento de agosto.

---

## Nas próximas vezes

Já instalado, é só isto:

```powershell
cd $HOME\Documents\ponto-digital
docker start ponto-db     # só no caminho B; no A o serviço já sobe sozinho
npm run validar amostras/Registo_de_comparec_.txt
```

---

## Quando der errado

| O que aparece | O que é | O que fazer |
|---|---|---|
| `node : O termo 'node' não é reconhecido` | Node não instalado, ou o PowerShell é anterior à instalação | Feche e abra o PowerShell. Se persistir, refaça o passo 2 |
| `error during connect` ou `cannot connect to the Docker daemon` | Docker Desktop não está rodando | Abra o Docker Desktop e espere a baleia parar de se mexer |
| `port is already allocated` | Já existe algo na porta 5432 | `docker start ponto-db` — provavelmente o container já existe |
| `Conflict. The container name "/ponto-db" is already in use` | O container já foi criado antes | `docker start ponto-db`, e siga do passo 5 |
| `ECONNREFUSED 127.0.0.1:5432` | O banco não está no ar | Caminho B: `docker start ponto-db`. Caminho A: abra "Serviços" do Windows e veja se `postgresql-x64-16` está em execução |
| `winget` responde `\` e volta ao prompt sem instalar nada | Ou o nome do pacote está errado, ou o winget está quebrado | Teste com `winget search git`: se não imprimir tabela, o winget está quebrado — baixe pelos sites oficiais. Se imprimir, era só o nome (o do Docker é `Docker.DockerDesktop`) |
| `password authentication failed for user "postgres"` | A senha do Postgres não é a do `.env` | Edite a `DATABASE_URL` no `.env` com a senha que você definiu na instalação |
| Pede `Senha:` e digitar não faz nada aparecer | Nada de errado — a digitação é invisível de propósito | Digite às cegas e aperte Enter, ou use `$env:PGPASSWORD` antes do comando |
| `database "ponto" already exists` | O banco já tinha sido criado numa tentativa anterior | Nada a fazer, siga para o passo 5 |
| `O termo '...createdb.exe' não é reconhecido` ou caminho inexistente | A pasta da versão é outra | `Get-ChildItem "C:\Program Files\PostgreSQL"` mostra o número certo |
| `database "ponto" does not exist` | Faltou criar o banco | Refaça o passo 4 |
| `DATABASE_URL não definida` | Faltou criar o `.env` | `cp .env.example .env` |
| `fatal: repository not found` | Login do GitHub sem acesso ao repositório | Confirme que entrou com a conta que tem acesso ao `Papieri/ponto-digital` |
| `\` sozinho numa linha e o cursor esperando | Comando colado com quebra de linha do Linux | Aperte Ctrl+C e cole o comando em uma linha só |

Nenhuma biblioteca do projeto compila código nativo, então **não** é preciso
instalar Visual Studio nem build tools.
