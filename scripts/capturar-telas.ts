/**
 * Captura as telas do sistema para a IT-FIN-02.
 *
 *   npm run dev                        # o sistema precisa estar rodando
 *   npx tsx scripts/capturar-telas.ts  # grava os PNG em ./capturas
 *
 * Percorre o fluxo inteiro do fechamento contra o banco local: cadastra os
 * colaboradores, importa a amostra, corrige a batida esquecida da Raquel e
 * fotografa cada passo. Refazer as imagens depois de mexer na interface é
 * rodar isto e o `gerar-it.ts` de novo — IT com print velho é pior que IT
 * nenhuma.
 *
 * ATENÇÃO: apaga e recria o conteúdo do banco apontado por DATABASE_URL, para
 * as telas saírem sempre iguais. Use só contra o banco de desenvolvimento.
 *
 * O Playwright não é dependência do projeto (só serve para isto):
 *   npm install --no-save playwright
 */
import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";

const PASTA = process.argv[2] ?? "capturas";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";

const TAXAS: Array<[number, string, string, string, string]> = [
  [3, "Elaine", "16.66", "150.00", "0.00"],
  [4, "Raquel", "16.66", "150.00", "0.00"],
  [5, "Skarlat", "11.11", "100.00", "12.00"],
  [6, "Jucelaine Paes", "13.33", "120.00", "12.00"],
  [8, "Maria Izadora", "16.66", "150.00", "12.00"],
  [22, "Ketlen Dias", "13.33", "120.00", "12.00"],
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "Playwright não está instalado. Ele não é dependência do projeto porque\n" +
        "só serve para gerar as capturas da IT. Rode:\n\n" +
        "  npm install --no-save playwright\n"
    );
    process.exit(1);
  }

  mkdirSync(PASTA, { recursive: true });
  const nav = await chromium.launch();
  const pag = await nav.newPage({
    viewport: { width: 1360, height: 1000 },
    deviceScaleFactor: 2,
  });
  const erros: string[] = [];
  pag.on("pageerror", (e) => erros.push(String(e)));

  /** Recorta na altura real do conteúdo: área vazia fica feia no documento. */
  async function foto(nome: string, seletor?: string) {
    const destino = path.join(PASTA, `${nome}.png`);
    if (seletor) {
      await pag.locator(seletor).first().screenshot({ path: destino });
    } else {
      const altura = await pag.evaluate(() => {
        let fundo = 0;
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.width > 0 && r.bottom > fundo) fundo = r.bottom;
        }
        return Math.min(Math.ceil(fundo + 26), window.innerHeight);
      });
      await pag.screenshot({
        path: destino,
        clip: { x: 0, y: 0, width: 1360, height: Math.max(altura, 240) },
      });
    }
    console.log("  ", nome);
  }

  const ir = async (rota: string) => {
    await pag.goto(BASE + rota, { waitUntil: "networkidle" });
    await pag.waitForTimeout(1100);
  };

  await ir("/");
  await foto("01-inicio");

  await ir("/colaboradores");
  await foto("02-colaboradores-vazio");

  await pag.getByRole("button", { name: /Cadastrar o primeiro|Novo colaborador/ }).first().click();
  await pag.waitForTimeout(600);
  for (const [sel, v] of [["#code", "3"], ["#nome", "Elaine"], ["#hora", "16.66"],
                          ["#dia", "150.00"], ["#passagem", "0.00"]] as const) {
    await pag.locator(sel).fill(v);
  }
  await pag.waitForTimeout(400);
  await foto("03-colaborador-form", "[role=dialog]");
  await pag.getByRole("button", { name: "Salvar" }).click();
  await pag.waitForTimeout(1300);

  await pag.evaluate(async (gente) => {
    for (const [code, name, hourlyRate, dailyRate, transportAllowance] of gente) {
      await fetch("/trpc/employee.upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name, department: "PRODUCAO", hourlyRate,
                               dailyRate, transportAllowance, active: true }),
      });
    }
  }, TAXAS.slice(1));
  await pag.reload({ waitUntil: "networkidle" });
  await pag.waitForTimeout(1300);
  await foto("04-colaboradores-lista");

  await ir("/importar");
  await foto("05-importar-vazio");
  await pag.setInputFiles("input[type=file]", "amostras/Registo_de_comparec_.txt");
  await pag.waitForSelector("text=Período do lote", { timeout: 15000 });
  await pag.waitForTimeout(900);
  await foto("06-importar-periodo");

  await pag.getByRole("button", { name: /Processar arquivo/ }).click();
  await pag.waitForSelector("text=Arquivo processado", { timeout: 30000 });
  await pag.waitForTimeout(2400);   // deixa o aviso verde sumir
  await foto("07-importado");

  await pag.getByRole("button", { name: /Ver relatório/ }).click();
  await pag.waitForSelector("tfoot", { timeout: 20000 });
  await pag.waitForTimeout(1500);
  await foto("08-relatorio");

  await pag.getByRole("tab", { name: /Detalhe diário/ }).click();
  await pag.waitForTimeout(1200);
  await foto("09-detalhe-diario", "div.rounded-xl:has-text('Raquel ·')");

  await pag.locator("tr", { hasText: "21/08/2026" }).filter({ hasText: "05:52" })
    .first().getByRole("button").click();
  await pag.waitForSelector("text=Batidas de Raquel", { timeout: 15000 });
  await pag.waitForTimeout(900);
  await foto("10-editar-batidas", "[role=dialog]");

  await pag.locator("#horario").fill("13:40");
  await pag.getByRole("button", { name: "Incluir" }).click();
  await pag.waitForTimeout(2600);
  await foto("11-batida-incluida", "[role=dialog]");
  await pag.getByRole("button", { name: "Concluir" }).click();
  await pag.waitForTimeout(1600);

  await pag.getByRole("tab", { name: /Resumo/ }).click();
  await pag.waitForTimeout(1600);
  await foto("12-relatorio-corrigido");

  console.log("\nerros de console:", erros.length ? erros : "nenhum");
  await nav.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
