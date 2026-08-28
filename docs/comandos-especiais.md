# Comandos especiais

Comandos para usar quando algo não funciona como esperado. Todos no
**PowerShell** (não no Prompt de Comando).

Cada bloco diz o **sintoma**, o **comando** e o **resultado esperado**. Quando o
resultado for diferente do descrito, é o próximo passo que vale.

> **Como ler o caminho do PostgreSQL.** Vários comandos usam
> `C:\Program Files\PostgreSQL\18\bin`. Se a sua versão for outra, troque o
> `18`. Para descobrir: `Get-ChildItem "C:\Program Files\PostgreSQL"`.

---

## 1. Atualizar o programa

O mais usado. Sempre que eu avisar que publiquei alguma novidade:

```powershell
cd $HOME\Documents\ponto-digital
git pull
npm install
npm run build
```

Depois **feche o programa e abra de novo** pelo atalho.

O `npm install` só é necessário quando entrou biblioteca nova, mas rodar sempre
não faz mal. O `npm run build` é o que mais se esquece — sem ele, o programa
continua mostrando as telas antigas mesmo com o código novo na pasta.

---

## 2. Saber qual versão está rodando

**Na tela:** o rodapé da barra lateral escura mostra, por exemplo,
`versão 9b87455 · 28/08/2026`.

**Na pasta:**

```powershell
cd $HOME\Documents\ponto-digital
git fetch
git log --oneline -1
git status -sb
```

- `Your branch is up to date` → a pasta está em dia
- `behind by N commits` → falta atualizar (volte ao item 1)

Os dois códigos, o da tela e o do `git log`, têm que ser iguais.

---

## 3. Atualizei, mas o programa continua igual

Quase sempre é **um programa antigo ainda rodando**, segurando a porta e
servindo a versão anterior. Limpar o cache do navegador não resolve, nem abrir
em janela anônima — não é o navegador, é outro servidor respondendo.

Ver o que está aberto:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, StartTime
```

Se houver processo com `StartTime` anterior à sua última atualização, é ele.
Derrube tudo e suba limpo:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
cd $HOME\Documents\ponto-digital
npm start
```

> Desde a versão com o indicador de versão, uma tarja âmbar aparece no topo da
> tela quando isso acontece. Se ela não aparecer, o problema é outro.

Para ver o que o servidor está entregando de fato:

```powershell
$html = (Invoke-WebRequest "http://127.0.0.1:5173/" -UseBasicParsing).Content
[regex]::Matches($html, '(/src/client/[\w.]+|assets/index-[\w-]+\.(css|js))') | ForEach-Object { $_.Value }
```

- `assets/index-XXXX.css` → está servindo o build; compare o nome com o da sua
  pasta em `dist\client\assets`
- `/src/client/index.css` → está em modo de desenvolvimento, não no build

---

## 4. O programa não abre, ou dá erro de banco

Primeiro veja se o PostgreSQL está no ar:

```powershell
Get-Service postgresql* | Select-Object Name, Status
```

`Status` tem que ser `Running`. Se estiver parado:

```powershell
Start-Service postgresql*
```

Erros e o que significam:

| Mensagem | O que é |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | O PostgreSQL não está rodando |
| `password authentication failed` | A senha no `.env` não é a do banco (item 5) |
| `database "ponto" does not exist` | Falta criar o banco (item 5) |
| `DATABASE_URL não definida` | Falta o arquivo `.env` (item 5) |

---

## 5. Banco de dados

**Conferir se o banco existe:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -l
```

Procure `ponto` na lista.

> A senha **não aparece** enquanto você digita — nem asteriscos, nem cursor
> andando. É proposital. Digite às cegas e aperte Enter, ou defina antes:
> `$env:PGPASSWORD = "devlocal"`

**Criar o banco:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres ponto
```

**Recriar o arquivo `.env`** (troque `SUA_SENHA` pela senha do PostgreSQL):

```powershell
cd $HOME\Documents\ponto-digital
"DATABASE_URL=postgres://postgres:SUA_SENHA@localhost:5432/ponto`nUPLOAD_DIR=./uploads" | Set-Content .env
npm run db:migrate
```

---

## 6. Lotes importados

**Listar:**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d ponto -c "SELECT id, filename, period_start::date, period_end::date, total_records FROM import_batches ORDER BY id;"
```

**Apagar um lote** (troque o `3` pelo número da coluna `id`):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d ponto -c "DELETE FROM import_batches WHERE id=3;"
```

> ⚠️ Apaga junto as batidas, os resumos diários e o fechamento daquele lote.
> Não dá para desfazer. Pela tela é mais seguro: **Lotes** → ícone da lixeira.

---

## 7. Conferir o arquivo TXT antes de importar

**Quantos registros de um dia específico** (útil quando o período apurado não
bate com o nome do arquivo):

```powershell
(Select-String -Path "$HOME\Downloads\arquivo.txt" -Pattern "14\.08\.2026").Count
```

**Ver as primeiras linhas:**

```powershell
Get-Content "$HOME\Downloads\arquivo.txt" -Head 5
```

---

## 8. Conferir a apuração pela linha de comando

Sem passar pelas telas, útil para comparar números:

```powershell
cd $HOME\Documents\ponto-digital
npm run validar "$HOME\Downloads\arquivo.txt"
```

Por padrão ele **descarta** o lote no fim. Para manter no banco:

```powershell
$env:MANTER_LOTE=1
npm run validar "$HOME\Downloads\arquivo.txt"
```

A variável vale até você fechar a janela.

---

## 9. O `git pull` foi recusado

Mensagem tipo *"Your local changes would be overwritten by merge"*, quase sempre
no `package-lock.json`, que o npm reescreve sozinho:

```powershell
cd $HOME\Documents\ponto-digital
git checkout -- package-lock.json
git pull
```

Se a reclamação for de outro arquivo que você não alterou de propósito, o mesmo
comando serve — troque o nome do arquivo.

---

## 10. Acentos embaralhados no terminal

`CodificaþÒo` no lugar de `Codificação`: é a página de código antiga do console.
Rode uma vez por janela:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

Afeta só o que você lê na tela. Os dados no banco estão corretos.

---

## Resumo por sintoma

| Sintoma | Vá para |
|---|---|
| Publiquei novidade, quero atualizar | 1 |
| Não sei se estou na versão nova | 2 |
| Atualizei e nada mudou | 3 |
| Não abre / erro de conexão | 4 |
| Erro de senha ou banco inexistente | 5 |
| Quero apagar um lote importado | 6 |
| O período apurado não bate com o arquivo | 7 |
| Quero conferir números sem abrir a tela | 8 |
| `git pull` recusado | 9 |
| Acentos estranhos no terminal | 10 |
