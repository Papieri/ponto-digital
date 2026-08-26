# Arquitetura e Stack Técnica

## Visão Geral da Arquitetura

O projeto segue uma arquitetura **monorepo fullstack** com um único processo Node.js que serve tanto a API backend (Express + tRPC) quanto o frontend React (via Vite em desenvolvimento, ou arquivos estáticos em produção). Não há separação de serviços — tudo roda em um único container.

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Cliente)                  │
│   React 19 + Vite + TanStack Query + tRPC Client    │
└────────────────────────┬────────────────────────────┘
                         │ HTTPS / tRPC over HTTP
┌────────────────────────▼────────────────────────────┐
│              Node.js 22 (Express 4)                  │
│  ┌─────────────────────────────────────────────┐    │
│  │   tRPC Router (/api/trpc/*)                 │    │
│  │   ├── auth.*   (login/logout/me)            │    │
│  │   ├── employee.* (CRUD funcionários)        │    │
│  │   ├── import.* (importação + relatórios)    │    │
│  │   └── system.* (notificações)               │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │   OAuth Callback (/api/oauth/callback)       │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │   Static Files (client/dist em produção)    │    │
│  └─────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│            MySQL / TiDB (Drizzle ORM)                │
│   users, employees, import_batches, time_records,   │
│   daily_summaries, payroll_periods                  │
└─────────────────────────────────────────────────────┘
```

---

## Stack Detalhada

### Frontend

| Tecnologia | Versão | Justificativa |
|---|---|---|
| React | 19.2 | Framework UI principal; suporte a Server Components e hooks modernos |
| Vite | 7.1 | Build tool ultra-rápido com HMR; substitui CRA |
| Tailwind CSS | 4.1 | Utility-first CSS; configuração via CSS variables (OKLCH) |
| shadcn/ui | latest | Componentes acessíveis baseados em Radix UI; sem dependência de runtime |
| Radix UI | latest | Primitivos de UI acessíveis (Dialog, Tabs, Select, AlertDialog, etc.) |
| TanStack Query | 5.90 | Cache e sincronização de estado servidor; integrado ao tRPC |
| tRPC Client | 11.6 | Chamadas tipadas ao backend sem geração de código |
| Wouter | 3.7 | Roteador leve para SPA; substitui React Router |
| Lucide React | 0.453 | Ícones SVG consistentes |
| Sonner | 2.0 | Toast notifications |
| Recharts | 2.15 | Gráficos (disponível mas não utilizado na versão atual) |
| Framer Motion | 12.23 | Animações (disponível mas não utilizado na versão atual) |

### Backend

| Tecnologia | Versão | Justificativa |
|---|---|---|
| Node.js | 22.13 | Runtime JavaScript server-side |
| TypeScript | 5.9 | Tipagem estática end-to-end |
| Express | 4.21 | Servidor HTTP; gerencia rotas, cookies e middleware |
| tRPC | 11.6 | RPC tipado sobre HTTP; elimina a necessidade de REST manual |
| Drizzle ORM | 0.44 | ORM type-safe para MySQL; schema-first com migrations |
| mysql2 | 3.15 | Driver MySQL nativo para Node.js |
| Zod | 4.1 | Validação de schemas de entrada nas procedures tRPC |
| superjson | 1.13 | Serialização avançada (preserva Date, Map, Set sobre JSON) |
| jose | 6.1 | Assinatura e verificação de JWT para sessões |
| tsx | 4.19 | Execução de TypeScript sem compilação prévia (dev) |
| esbuild | 0.25 | Bundler para produção do servidor |

### Banco de Dados

| Tecnologia | Justificativa |
|---|---|
| MySQL / TiDB | Banco relacional gerenciado pela plataforma Manus; compatível com mysql2 |
| Drizzle Kit | Geração e aplicação de migrations a partir do schema TypeScript |

### Infraestrutura

| Serviço | Uso |
|---|---|
| Manus Webdev | Hospedagem, CI/CD, domínio, SSL, banco de dados e S3 |
| Manus OAuth | Autenticação de usuários via SSO |
| AWS S3 (via Manus) | Armazenamento dos arquivos TXT importados |
| Cloud Run (Google) | Runtime de produção (Autoscale — serverless) |

---

## Fluxo de Dados: Importação de Ponto

O fluxo de importação é o núcleo do sistema e segue estas etapas:

1. O usuário seleciona o arquivo TXT na página `ImportPage.tsx` e clica em "Importar".
2. O frontend lê o arquivo, converte para base64 e chama `trpc.import.process.useMutation()`.
3. O backend recebe o conteúdo, chama `parseTxtContent()` em `timesheetParser.ts`.
4. O parser lê linha a linha, extrai código do funcionário, nome, departamento, data e hora.
5. Os registros são agrupados por `(employeeCode, date)` e os turnos noturnos são redistribuídos (registros entre 00:00 e 05:29 UTC pertencem ao dia anterior se aquele dia tiver número ímpar de registros).
6. Para cada dia de cada funcionário, é calculado o total de minutos (pares entrada/saída).
7. Os dados são inseridos nas tabelas `time_records`, `daily_summaries` e `payroll_periods`.
8. O arquivo original é salvo no S3 e o lote (`import_batches`) é marcado como `completed`.

---

## Fluxo de Dados: Edição Manual

1. O usuário clica no ícone de lápis em um dia específico na aba "Detalhe Diário".
2. O modal `EditDayRecordsModal.tsx` abre e carrega os registros via `trpc.import.getDayRecords`.
3. O usuário digita um horário (input `type="time"`) e clica em "Adicionar".
4. O frontend constrói uma ISO string UTC: `${workDate}T${timePart}Z` e chama `trpc.import.addRecord`.
5. O backend converte para string MySQL UTC via `toMysqlUtcString()` e insere na tabela `time_records`.
6. O backend chama `recalcDay()` que recalcula o `daily_summaries` e o `payroll_periods` do funcionário.
7. O modal invalida apenas `getDayRecords` imediatamente; após 50ms (setTimeout), chama `onSaved()` que invalida `getDailySummaries`, `getPayrollPeriods` e `getPayrollSummary` no ReportPage — essa serialização evita o erro `NotFoundError: insertBefore` causado por re-renders simultâneos do React.

---

## Tratamento de Timezone

Todos os timestamps são armazenados como strings UTC no formato MySQL (`YYYY-MM-DD HH:MM:SS`) sem indicação de timezone. O servidor nunca aplica conversão de fuso — usa sempre `getUTCHours()`, `getUTCMinutes()` etc. O frontend usa a função `toUtcDate()` para interpretar essas strings como UTC antes de criar objetos `Date`, e exibe sempre com `{ timeZone: "UTC" }` no `toLocaleTimeString`. Isso garante que um registro de 12:03 UTC seja exibido como 12:03 independentemente do fuso do navegador do usuário.
