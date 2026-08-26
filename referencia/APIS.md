# APIs e Integrações

## Protocolo

Todas as chamadas de API usam **tRPC 11** sobre HTTP, com o transformer **superjson** para serialização. O endpoint base é `/api/trpc`. Não há REST puro — toda comunicação frontend/backend passa pelo cliente tRPC (`client/src/lib/trpc.ts`).

O tRPC serializa as chamadas como:
- **Queries:** `GET /api/trpc/{router}.{procedure}?input={json}`
- **Mutations:** `POST /api/trpc/{router}.{procedure}` com body JSON

---

## Autenticação

O sistema usa **Manus OAuth 2.0**. O fluxo é:

1. O frontend redireciona para `VITE_OAUTH_PORTAL_URL` com `state` contendo `origin + returnPath`.
2. Após login, o Manus redireciona para `/api/oauth/callback`.
3. O backend troca o código por um token JWT, cria uma sessão via cookie `httpOnly`.
4. Cada request subsequente lê o cookie e popula `ctx.user` no contexto tRPC.

Procedures marcadas como `protectedProcedure` lançam `UNAUTHORIZED` se `ctx.user` for nulo. Procedures `publicProcedure` são acessíveis sem autenticação.

---

## Variáveis de Ambiente

As seguintes variáveis são injetadas automaticamente pela plataforma Manus. **Nunca as exponha em código ou logs.**

| Variável | Uso | Lado |
|---|---|---|
| `DATABASE_URL` | String de conexão MySQL | Servidor |
| `JWT_SECRET` | Assinatura do cookie de sessão | Servidor |
| `VITE_APP_ID` | ID da aplicação OAuth | Frontend |
| `OAUTH_SERVER_URL` | URL base do servidor OAuth Manus | Servidor |
| `VITE_OAUTH_PORTAL_URL` | URL do portal de login Manus | Frontend |
| `OWNER_OPEN_ID` | OpenID do dono do projeto | Servidor |
| `OWNER_NAME` | Nome do dono do projeto | Servidor |
| `BUILT_IN_FORGE_API_URL` | URL das APIs internas Manus | Servidor |
| `BUILT_IN_FORGE_API_KEY` | Token Bearer para APIs Manus | Servidor |
| `VITE_FRONTEND_FORGE_API_KEY` | Token Bearer para APIs Manus (frontend) | Frontend |
| `VITE_FRONTEND_FORGE_API_URL` | URL das APIs Manus (frontend) | Frontend |
| `VITE_ANALYTICS_ENDPOINT` | Endpoint de analytics | Frontend |
| `VITE_ANALYTICS_WEBSITE_ID` | ID do site no analytics | Frontend |

---

## Endpoints tRPC

### `auth.*`

| Procedure | Tipo | Auth | Descrição |
|---|---|---|---|
| `auth.me` | Query | Pública | Retorna o usuário autenticado ou `null` |
| `auth.logout` | Mutation | Pública | Limpa o cookie de sessão |

---

### `employee.*`

| Procedure | Tipo | Auth | Input | Descrição |
|---|---|---|---|---|
| `employee.list` | Query | Pública | — | Lista todos os funcionários ativos e inativos |
| `employee.upsert` | Mutation | Protegida | `{ code, name, department, hourlyRate, dailyRate, transportAllowance, active }` | Cria ou atualiza um funcionário pelo código |
| `employee.delete` | Mutation | Protegida | `{ id: number }` | Remove um funcionário pelo ID interno |
| `employee.getByCode` | Query | Pública | `{ code: number }` | Busca um funcionário pelo código |

---

### `import.*`

#### Queries

| Procedure | Auth | Input | Descrição |
|---|---|---|---|
| `import.list` | Pública | — | Lista todos os lotes de importação com metadados |
| `import.getById` | Pública | `{ id: number }` | Retorna um lote específico |
| `import.getDailySummaries` | Pública | `{ batchId: number }` | Lista todos os resumos diários de um lote |
| `import.getPayrollPeriods` | Pública | `{ batchId: number }` | Lista os períodos de folha de um lote |
| `import.getPayrollSummary` | Pública | `{ batchId: number }` | Retorna totais consolidados do lote (total horas, total R$, total VT) |
| `import.getDayRecords` | Pública | `{ batchId, employeeCode, workDate }` | Lista os registros de ponto de um funcionário em um dia específico |

#### Mutations

| Procedure | Auth | Input | Descrição |
|---|---|---|---|
| `import.process` | Protegida | `{ filename, content, isBase64 }` | Processa e importa um arquivo TXT; cria lote, registros, resumos e períodos |
| `import.addRecord` | Protegida | `{ batchId, employeeCode, employeeName, department, recordedAt, workDate }` | Adiciona uma batida manual e recalcula o dia |
| `import.removeRecord` | Protegida | `{ recordId, batchId, employeeCode, workDate }` | Remove uma batida e recalcula o dia |
| `import.deleteBatch` | Protegida | `{ batchId: number }` | Exclui um lote e todos os dados associados em cascata |

---

### `system.*`

| Procedure | Tipo | Auth | Descrição |
|---|---|---|---|
| `system.notifyOwner` | Mutation | Protegida | Envia notificação ao dono do projeto via plataforma Manus |

---

## Integrações Externas

### AWS S3 (via Manus)

Os arquivos TXT importados são salvos no S3 usando os helpers de `server/storage.ts`. A URL pública retornada é armazenada em `import_batches.s3Url`. O bucket é público — não é necessário assinar URLs para leitura.

```typescript
// Exemplo de uso (server/routers.ts)
const fileKey = `imports/${nanoid()}-${filename}`;
const { url } = await storagePut(fileKey, Buffer.from(content), "text/plain");
```

### Manus OAuth

Implementado em `server/_core/oauth.ts`. O frontend usa `getLoginUrl(returnPath?)` de `client/src/const.ts` para gerar a URL de login com o `origin` codificado no `state`, garantindo que o callback redirecione corretamente independentemente do domínio.

---

## Formato do Arquivo TXT de Entrada

O parser (`server/timesheetParser.ts`) espera arquivos TXT com o seguinte formato de cabeçalho e linhas de dados:

```
Tra. No.  Name                Dept.     Date       Time   IO   No.
--------  ------------------  --------  ---------  -----  ---  ---
00002     MIRELLI             PRODUCAO  02/02/2026 12:04  I    1
00002     MIRELLI             PRODUCAO  02/02/2026 16:04  O    1
```

As colunas são lidas por posição (não por separador). O parser ignora linhas de cabeçalho, separadores e linhas em branco. O campo `IO` (I = entrada, O = saída) é ignorado — o sistema ordena todos os registros do dia e trata pares (entrada, saída) em sequência.
