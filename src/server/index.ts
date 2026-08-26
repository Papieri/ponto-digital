/**
 * Entrypoint do servidor. Express monolítico em execução contínua — a decisão
 * de não usar serverless está no CLAUDE.md: a importação insere milhares de
 * linhas de uma vez.
 *
 * Em desenvolvimento o Vite roda embutido (middleware mode), então um comando
 * só sobe API e telas. Em produção serve os arquivos estáticos de `dist/client`.
 *
 * SEM AUTENTICAÇÃO. Enquanto o login próprio não existir, escute só em
 * localhost — ver `trpc.ts`.
 */
import "dotenv/config";
import express from "express";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { closeDb } from "./db";
import { gerarPlanilhaFechamento } from "./planilha";

const PORTA = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? "127.0.0.1";
// `NODE_ENV=x comando` é sintaxe de shell Unix e não funciona no PowerShell.
// O modo vem por parâmetro, que funciona igual em todo sistema.
const producao =
  process.argv.includes("--producao") || process.env.NODE_ENV === "production";
const raiz = path.resolve(import.meta.dirname, "../..");

async function main() {
  const app = express();

  // O TXT de uma quinzena é pequeno, mas chega em base64 dentro do JSON.
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/saude", (_req, res) => res.json({ ok: true }));

  // Download da planilha. Fica fora do tRPC porque devolve binário.
  app.get("/api/lote/:id/planilha.xlsx", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ erro: "Lote inválido." });
      return;
    }
    try {
      const { nomeArquivo, conteudo } = await gerarPlanilhaFechamento(id);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
      res.send(conteudo);
    } catch (erro) {
      console.error("[Planilha]", erro);
      res.status(404).json({
        erro: erro instanceof Error ? erro.message : "Falha ao gerar a planilha.",
      });
    }
  });

  app.use(
    "/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  if (producao) {
    const estaticos = path.join(raiz, "dist/client");
    app.use(express.static(estaticos));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(estaticos, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: raiz,
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const servidor = app.listen(PORTA, HOST, () => {
    console.log(`\n  Ponto Digital rodando em http://${HOST}:${PORTA}\n`);
  });

  for (const sinal of ["SIGINT", "SIGTERM"] as const) {
    process.on(sinal, () => {
      servidor.close(async () => {
        await closeDb();
        process.exit(0);
      });
    });
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
