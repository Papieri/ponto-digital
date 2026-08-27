# Instalar em outro computador

O Ponto Digital roda inteiro na máquina: aplicação e banco. Instalar em outro
notebook é copiar a pasta e rodar um instalador.

---

## Passo a passo

1. **Leve o projeto para a outra máquina.** Baixe o ZIP pelo GitHub (botão
   *Code* → *Download ZIP*), ou copie a pasta por pendrive, ou clone com
   `git clone`. Descompacte em algum lugar estável, como
   `Documentos\ponto-digital` — a pasta vira a instalação.

2. **Abra a pasta `instalador` e dê dois cliques em `Instalar.bat`.**

O instalador confere o que falta, instala o que puder, cria o banco, monta as
telas e põe um atalho **Ponto Digital** na área de trabalho.

3. **Abra pelo atalho.** Ele sobe o programa e abre o navegador sozinho.
   Fechar a janela preta encerra o programa.

---

## Testar o instalador na máquina que já está configurada

Dá para rodar sem medo numa máquina que já foi preparada à mão: o instalador
confere cada etapa antes de agir e não refaz o que já existe.

```powershell
cd $HOME\Documents\ponto-digital
git pull
```

Depois abra a pasta `instalador` e dê dois cliques em **Instalar.bat**.

O que você deve ver, nessa ordem:

| Etapa | Esperado numa máquina já configurada |
|---|---|
| 1 Node.js | `[ok] Node v24...` |
| 2 PostgreSQL | `[ok] PostgreSQL 18 em C:\Program Files\PostgreSQL\18\bin` |
| 3 Banco | Pede a senha; depois `[ok] Conexao com o PostgreSQL` e `[ok] Banco 'ponto' ja existe` |
| 4 Configuracao | `[!] Ja existia um .env - copia guardada em .env.anterior` e `[ok] Arquivo .env gravado` |
| 5 Instalando | Baixa bibliotecas, cria tabelas, monta as telas |
| 6 Atalho | `[ok] Atalho 'Ponto Digital' criado na area de trabalho` |

O `.env` é regravado com a senha que você digitar; o anterior fica guardado
como `.env.anterior`, então nada se perde. Os dados no banco não são tocados —
os lotes já importados continuam lá.

Em seguida teste o atalho **Ponto Digital** na área de trabalho: ele deve subir
o programa e abrir o navegador sozinho. Fechar a janela preta encerra.

> Para ver a experiência de primeira instalação de verdade — com Node e
> PostgreSQL sendo baixados — é preciso uma máquina que ainda não os tenha.
> Nesta aqui o instalador vai apenas reconhecer que já estão prontos.

---

## O que o instalador faz

| Etapa | O que acontece |
|---|---|
| 1 | Confere o Node 22 ou maior; instala pelo winget se faltar |
| 2 | Procura o PostgreSQL; instala pelo winget se faltar |
| 3 | Pede a senha do usuário `postgres` e cria o banco `ponto` |
| 4 | Grava o `.env` com a senha já escapada para a URL |
| 5 | Baixa as bibliotecas, cria as tabelas e monta as telas |
| 6 | Cria o atalho na área de trabalho |

Ele confere a senha antes de seguir, para não falhar lá na frente. Se algo
faltar e o winget não funcionar, ele diz exatamente o que baixar e para —
rodar de novo depois continua de onde estava.

---

## Cada máquina tem o próprio banco

**Os lotes importados num notebook não aparecem no outro.** São instalações
independentes, cada uma com seu PostgreSQL local.

Para duas pessoas verem o mesmo fechamento, o banco precisa ser um só. Aí
basta apontar a `DATABASE_URL` do `.env` das duas máquinas para o mesmo
Postgres — servidor da empresa ou serviço gerenciado como o Supabase:

```
DATABASE_URL=postgres://usuario:senha@host:5432/ponto?sslmode=require
```

Nada no código muda; é a mesma migration. Só rode `npm run db:migrate` uma vez
contra o banco novo.

> **Antes de compartilhar o banco, leia:** o programa **ainda não tem login**.
> Enquanto isso, ele escuta só em `127.0.0.1` e não deve ser publicado na rede.
> Compartilhar o banco é aceitável porque cada pessoa roda a aplicação na
> própria máquina e só o Postgres é comum — mas a senha do banco fica no `.env`
> de cada notebook. Avalie se isso serve para o seu caso.

---

## Quando der errado

| O que aparece | O que fazer |
|---|---|
| `Node nao encontrado` e o winget não funciona | Instale de https://nodejs.org/ e rode o `Instalar.bat` de novo |
| `PostgreSQL nao encontrado` e o winget não funciona | Instale de https://www.postgresql.org/download/windows/, anote a senha, e rode o instalador de novo |
| `Nao consegui conectar no PostgreSQL com essa senha` | Rode de novo e informe a senha definida na instalação do PostgreSQL |
| O programa nao reflete a atualizacao, mesmo apos `git pull` e `npm run build` | Uma instancia antiga ficou rodando e segura a porta 5173, servindo a versao velha. Feche todas as janelas pretas, ou rode `Get-Process node | Stop-Process -Force`, e abra pelo atalho. Cache do navegador nao tem nada a ver — ate janela anonima mostra a versao velha |
| O atalho abre e fecha na hora | Abra o `Ponto Digital.bat` direto pela pasta `instalador` para ler a mensagem de erro |
| `O programa demorou a responder` | Abra os Serviços do Windows e verifique se o serviço `postgresql` está em execução |

---

## Atualizar depois

Se a pasta veio de `git clone`:

```powershell
cd $HOME\Documents\ponto-digital
git pull
npm install
npm run db:migrate
npm run build
```

Se veio de ZIP, baixe o ZIP novo, substitua os arquivos preservando o `.env`, e
rode os mesmos quatro comandos.
