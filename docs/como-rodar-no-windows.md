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
winget install Docker.Desktop
```

Depois de instalar, **feche o PowerShell e abra de novo**. Sem isso ele não
enxerga os programas novos. Aí repita o passo 1 para conferir.

> **O Docker Desktop pode pedir para reiniciar o computador** na primeira
> instalação, porque ele liga o WSL2 do Windows. Reinicie se ele pedir.

> Se o `winget` não existir na sua máquina, baixe pelos sites oficiais:
> [Node.js](https://nodejs.org/) · [Git](https://git-scm.com/download/win) ·
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

## Passo 4 · Ligar o banco de dados

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
docker start ponto-db
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
| `ECONNREFUSED 127.0.0.1:5432` | O banco não está no ar | `docker start ponto-db` e tente de novo |
| `DATABASE_URL não definida` | Faltou criar o `.env` | `cp .env.example .env` |
| `fatal: repository not found` | Login do GitHub sem acesso ao repositório | Confirme que entrou com a conta que tem acesso ao `Papieri/ponto-digital` |
| `\` sozinho numa linha e o cursor esperando | Comando colado com quebra de linha do Linux | Aperte Ctrl+C e cole o comando em uma linha só |

Nenhuma biblioteca do projeto compila código nativo, então **não** é preciso
instalar Visual Studio nem build tools.
