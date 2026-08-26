# Instalação e Deploy

## Pré-requisitos

Para rodar o projeto localmente, você precisará de:

- **Node.js** 22.x ou superior
- **pnpm** 10.x (`npm install -g pnpm`)
- **MySQL** 8.x ou acesso a um banco TiDB/PlanetScale compatível
- Conta na plataforma **Manus** (para OAuth e variáveis de ambiente)

---

## Rodando Localmente

### 1. Clonar o Repositório

```bash
git clone <url-do-repositorio>
cd timesheet_calculator
```

### 2. Instalar Dependências

```bash
pnpm install
```

### 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis. **Nunca commite este arquivo.**

```env
# Banco de dados
DATABASE_URL=mysql://usuario:senha@host:3306/nome_do_banco

# Sessão
JWT_SECRET=uma-string-aleatoria-longa-e-segura

# OAuth Manus
VITE_APP_ID=seu-app-id-manus
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im/oauth

# Informações do dono
OWNER_OPEN_ID=seu-open-id
OWNER_NAME=Seu Nome

# APIs internas Manus (necessário para S3 e notificações)
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=seu-api-key
VITE_FRONTEND_FORGE_API_KEY=seu-frontend-api-key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# Analytics (opcional)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
```

> **Nota:** Se você estiver usando a plataforma Manus para hospedar o projeto, todas essas variáveis são injetadas automaticamente. O arquivo `.env` só é necessário para desenvolvimento local fora da plataforma.

### 4. Aplicar as Migrations do Banco

```bash
pnpm db:push
```

Este comando executa `drizzle-kit generate && drizzle-kit migrate`, criando todas as tabelas no banco de dados.

### 5. Iniciar o Servidor de Desenvolvimento

```bash
pnpm dev
```

O servidor estará disponível em `http://localhost:3000`. O Vite HMR está ativo — alterações no frontend são refletidas instantaneamente.

---

## Estrutura de Scripts

| Script | Comando | Descrição |
|---|---|---|
| `dev` | `pnpm dev` | Inicia servidor Express + Vite HMR |
| `build` | `pnpm build` | Compila frontend (Vite) e backend (esbuild) para `dist/` |
| `start` | `pnpm start` | Inicia o servidor em modo produção a partir de `dist/` |
| `check` | `pnpm check` | Verifica erros TypeScript sem compilar |
| `test` | `pnpm test` | Executa todos os testes com Vitest |
| `db:push` | `pnpm db:push` | Gera e aplica migrations do banco |
| `format` | `pnpm format` | Formata o código com Prettier |

---

## Testes

O projeto usa **Vitest** para testes unitários. Para executar:

```bash
pnpm test
```

Os arquivos de teste são:
- `server/timesheetParser.test.ts` — Testes do parser TXT e cálculo de horas
- `server/auth.logout.test.ts` — Teste de logout (referência do template)

Para adicionar novos testes, crie arquivos `*.test.ts` em qualquer lugar do projeto.

---

## Deploy em Produção (Plataforma Manus)

O projeto está configurado para deploy na plataforma Manus Webdev. O processo é:

1. Certifique-se de ter um checkpoint salvo (`webdev_save_checkpoint`).
2. Clique no botão **Publish** no painel de gerenciamento do projeto.
3. A plataforma faz o build com `pnpm build` e implanta no Cloud Run (Google) em modo Autoscale.

**Domínio atual de produção:** `timesheetapp-jhczrpx5.manus.space`

### Considerações de Produção

O ambiente de produção usa **Autoscale (serverless)**, o que significa que instâncias podem ser desligadas quando inativas e reiniciadas com um cold start de alguns segundos. Isso é adequado para uso interno com acessos esporádicos.

Se o sistema precisar de resposta imediata sem cold start (uso intensivo durante fechamento de folha), considere migrar para **Reserved hosting** (Always On) no painel de configurações da plataforma Manus.

### Build de Produção Manual

Para gerar o build localmente e testar antes do deploy:

```bash
pnpm build
pnpm start
```

O comando `build` gera:
- `dist/` — Bundle do servidor (esbuild, ESM)
- `client/dist/` — Bundle do frontend (Vite)

O servidor Express em produção serve os arquivos estáticos do frontend diretamente.

---

## Adicionando um Novo Funcionário

Após o deploy, para cadastrar funcionários no sistema:

1. Acesse a seção **Funcionários** no menu lateral.
2. Clique em **Novo Funcionário**.
3. Preencha o código (deve corresponder ao campo "Tra. No." do arquivo TXT), nome, departamento, taxa horária, taxa diária e vale-transporte diário.
4. Clique em **Salvar**.

Funcionários não cadastrados no sistema ainda terão seus registros de ponto importados, mas os valores financeiros serão R$ 0,00 até que o cadastro seja feito.

---

## Reimportação de Lotes

Se for necessário reimportar um lote (por exemplo, após corrigir as taxas de um funcionário), use o script utilitário:

```bash
node scripts/reimport.mjs
```

> **Atenção:** Antes de reimportar, exclua o lote original pelo Dashboard para evitar duplicatas.
