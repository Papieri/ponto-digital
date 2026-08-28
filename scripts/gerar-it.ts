/**
 * Gera a IT-FIN-02 — Fechamento Quinzenal de Ponto, em PDF.
 *
 *   npx tsx scripts/gerar-it.ts [pasta-das-capturas] [arquivo-de-saida]
 *
 * As capturas de tela são geradas por `scripts/capturar-telas.ts`, que dirige o
 * navegador contra o sistema rodando. Refazer as imagens depois de mudar a
 * interface é rodar os dois scripts de novo — IT com print velho é pior que IT
 * nenhuma.
 *
 * Estrutura seguindo o padrão da IT-FIN-01 da Papieri.
 */
import PDFDocument from "pdfkit";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PASTA = process.argv[2] ?? "capturas";
const SAIDA = process.argv[3] ?? "IT-FIN-02_Fechamento_Quinzenal_de_Ponto.pdf";

const AZUL = "#2f6fe4";
const TINTA = "#141a24";
const APAGADO = "#5b6675";
const LINHA = "#dfe4ec";
const AMBAR_FUNDO = "#fdf4e3";
const AMBAR_TINTA = "#7a4e06";
const CINZA_FUNDO = "#f3f5f9";
const VERDE = "#047857";

const S = "Helvetica";
const SB = "Helvetica-Bold";
const SI = "Helvetica-Oblique";

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 56, bottom: 62, left: 52, right: 52 },
  bufferPages: true,
  info: {
    Title: "IT-FIN-02 — Fechamento Quinzenal de Ponto",
    Author: "Papieri",
    Subject: "Instrução de Trabalho",
  },
});

const pedacos: Buffer[] = [];
doc.on("data", (p: Buffer) => pedacos.push(p));
const pronto = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(pedacos))));

/**
 * As fontes internas do PDF usam WinAnsi, que não tem seta, sinal de menos
 * matemático nem reticências tipográficas — esses caracteres saem como lixo na
 * página, e o erro é fácil de não notar numa revisão rápida. Tudo que vai para
 * o papel passa por aqui; o que não tiver substituto vira "?" e sai avisado no
 * terminal, em vez de estragar o documento em silêncio.
 */
/** Caracteres do WinAnsi que ficam fora do latin1 — travessão, aspas curvas, etc. */
const EXTRAS_WINANSI = new Set(
  "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152" +
  "\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A" +
  "\u0153\u017E\u0178"
);

/** O que não existe no WinAnsi, com substituto legível. */
const SUBSTITUICOES: Record<string, string> = {
  "\u2192": "»", "\u2190": "«", "\u2212": "-",
  "\u2264": "<=", "\u2265": ">=", "\u2260": "!=",
  "\u2713": "OK", "\u26A0": "!", "\u00A0": " ",
};

function representavel(c: string): boolean {
  const n = c.codePointAt(0)!;
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || EXTRAS_WINANSI.has(c);
}

function seguro(texto: string): string {
  let saida = "";
  for (const c of texto) {
    if (representavel(c)) { saida += c; continue; }
    if (SUBSTITUICOES[c] !== undefined) { saida += SUBSTITUICOES[c]; continue; }
    console.warn(`  aviso: caractere sem representacao no PDF: ${JSON.stringify(c)}`);
    saida += "?";
  }
  return saida;
}

const X = doc.page.margins.left;
const LARG = doc.page.width - doc.page.margins.left - doc.page.margins.right;
const FUNDO = () => doc.page.height - doc.page.margins.bottom;

/** Abre página nova se não couber `altura` no que resta. */
function garantir(altura: number) {
  if (doc.y + altura > FUNDO()) doc.addPage();
}

function h1(numero: string, texto: string) {
  // Reserva espaco para o titulo arrastar o inicio do texto junto: titulo
  // sozinho no pe da pagina fica orfao.
  garantir(120);
  doc.moveDown(0.6);
  const y = doc.y;
  doc.font(SB).fontSize(13).fillColor(AZUL).text(seguro(numero), X, y, { continued: true });
  doc.fillColor(TINTA).text(seguro("  " + texto));
  doc.moveTo(X, doc.y + 3).lineTo(X + LARG, doc.y + 3).lineWidth(0.8).strokeColor(LINHA).stroke();
  doc.moveDown(0.55);
}

function h2(texto: string) {
  garantir(96);
  doc.moveDown(0.35);
  doc.font(SB).fontSize(10.5).fillColor(TINTA).text(seguro(texto), X, doc.y, { width: LARG });
  doc.moveDown(0.25);
}

function p(texto: string, opcoes: { cor?: string; tamanho?: number } = {}) {
  garantir(30);
  doc.font(S).fontSize(opcoes.tamanho ?? 9.5).fillColor(opcoes.cor ?? TINTA)
    .text(seguro(texto), X, doc.y, { width: LARG, align: "left", lineGap: 2.2 });
  doc.moveDown(0.45);
}

function itens(lista: string[], numerado = false) {
  lista.forEach((texto, i) => {
    garantir(26);
    const marca = numerado ? `${i + 1}.` : "•";
    const y = doc.y;
    doc.font(SB).fontSize(9.5).fillColor(AZUL).text(marca, X + 4, y, { width: 16 });
    doc.font(S).fontSize(9.5).fillColor(TINTA)
      .text(seguro(texto), X + 24, y, { width: LARG - 24, lineGap: 2.2 });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.25);
}

/** Caixa de destaque. `tom` muda a cor: atenção (âmbar) ou neutra (cinza). */
function caixa(titulo: string, corpo: string, tom: "atencao" | "neutra" = "atencao") {
  const fundo = tom === "atencao" ? AMBAR_FUNDO : CINZA_FUNDO;
  const tinta = tom === "atencao" ? AMBAR_TINTA : TINTA;
  const barra = tom === "atencao" ? "#e0b062" : AZUL;

  doc.font(SB).fontSize(9.5);
  const hTitulo = doc.heightOfString(seguro(titulo), { width: LARG - 34 });
  doc.font(S).fontSize(9.5);
  const hCorpo = doc.heightOfString(seguro(corpo), { width: LARG - 34, lineGap: 2.2 });
  const altura = hTitulo + hCorpo + 26;

  garantir(altura + 8);
  const y = doc.y;
  doc.rect(X, y, LARG, altura).fillColor(fundo).fill();
  doc.rect(X, y, 3, altura).fillColor(barra).fill();

  doc.font(SB).fontSize(9.5).fillColor(tinta).text(seguro(titulo), X + 16, y + 10, { width: LARG - 34 });
  doc.font(S).fontSize(9.5).fillColor(tinta)
    .text(seguro(corpo), X + 16, y + 12 + hTitulo, { width: LARG - 34, lineGap: 2.2 });
  doc.y = y + altura + 10;
}

/** Captura de tela com legenda. */
function figura(arquivo: string, legenda: string, larguraMax = LARG) {
  const caminho = path.resolve(PASTA, arquivo);
  if (!existsSync(caminho)) {
    p(`[captura ausente: ${arquivo}]`, { cor: "#b42318" });
    return;
  }
  const dados = readFileSync(caminho);
  // dimensões do PNG: largura e altura ficam no cabeçalho IHDR
  const larguraPx = dados.readUInt32BE(16);
  const alturaPx = dados.readUInt32BE(20);
  let larg = Math.min(larguraMax, LARG);
  let alt = (alturaPx / larguraPx) * larg;

  // Se nao couber no que resta da pagina, tenta encolher um pouco antes de
  // quebrar: quebrar sempre deixa um terco de pagina em branco.
  const disponivel = FUNDO() - doc.y - 26;
  if (alt > disponivel) {
    const largQueCabe = (disponivel * larguraPx) / alturaPx;
    if (largQueCabe >= LARG * 0.7) {
      larg = largQueCabe;
      alt = disponivel;
    } else {
      doc.addPage();
    }
  }
  const x = X + (LARG - larg) / 2;
  const y = doc.y;
  doc.image(dados, x, y, { width: larg });
  doc.rect(x, y, larg, alt).lineWidth(0.6).strokeColor(LINHA).stroke();
  doc.font(SI).fontSize(8).fillColor(APAGADO)
    .text(seguro(legenda), X, y + alt + 5, { width: LARG, align: "center" });
  doc.y = y + alt + 22;
}

function tabela(
  cabecalho: string[],
  linhas: string[][],
  larguras: number[],
  opcoes: { tamanho?: number } = {}
) {
  const tam = opcoes.tamanho ?? 8.8;
  const posX = larguras.reduce<number[]>((acc, l, i) => {
    acc.push(i === 0 ? X : acc[i - 1]! + larguras[i - 1]!);
    return acc;
  }, []);

  const desenharCabecalho = () => {
    const alt = 20;
    garantir(alt + 24);
    const y = doc.y;
    doc.rect(X, y, LARG, alt).fillColor(AZUL).fill();
    cabecalho.forEach((t, i) => {
      doc.font(SB).fontSize(tam).fillColor("#ffffff")
        .text(seguro(t), posX[i]! + 6, y + 6, { width: larguras[i]! - 12, lineBreak: false });
    });
    doc.y = y + alt;
  };

  desenharCabecalho();

  for (const linha of linhas) {
    doc.font(S).fontSize(tam);
    const alturas = linha.map((t, i) =>
      doc.heightOfString(seguro(t), { width: larguras[i]! - 12, lineGap: 1.6 })
    );
    const alt = Math.max(...alturas) + 12;

    if (doc.y + alt > FUNDO()) {
      doc.addPage();
      desenharCabecalho();
    }

    const y = doc.y;
    linha.forEach((t, i) => {
      doc.font(S).fontSize(tam).fillColor(TINTA)
        .text(seguro(t), posX[i]! + 6, y + 6, { width: larguras[i]! - 12, lineGap: 1.6 });
    });
    doc.moveTo(X, y + alt).lineTo(X + LARG, y + alt).lineWidth(0.5).strokeColor(LINHA).stroke();
    doc.y = y + alt;
  }
  doc.moveDown(0.8);
}

// ════════════════════════════════════════════════════════════════════════════
// Capa
// ════════════════════════════════════════════════════════════════════════════

doc.font(SB).fontSize(9).fillColor(AZUL)
  .text(seguro("INSTRUÇÃO DE TRABALHO"), X, doc.y, { characterSpacing: 1.6 });
doc.moveDown(0.35);
doc.font(SB).fontSize(21).fillColor(TINTA)
  .text(seguro("Fechamento Quinzenal de Ponto"), X, doc.y, { width: LARG });
doc.moveDown(0.25);
doc.font(S).fontSize(11).fillColor(APAGADO)
  .text(seguro("Relógio de ponto  »  Ponto Digital  »  Relatório de pagamento"), X, doc.y, { width: LARG });
doc.moveDown(1.1);

tabela(
  ["Campo", "Valor"],
  [
    ["Código", "IT-FIN-02"],
    ["Área", "Financeiro"],
    ["Sistemas", "Relógio de ponto (arquivo TXT) · Ponto Digital"],
    ["Periodicidade", "Quinzenal"],
    ["Versão", "1.0 — rascunho para validação"],
    ["Data", new Date().toLocaleDateString("pt-BR")],
    ["Elaborado por", "Henrique"],
  ],
  [120, LARG - 120],
  { tamanho: 9.2 }
);

h1("", "Sumário");
doc.y -= 8;
itens(
  [
    "Objetivo", "Quando executar", "Pré-requisitos", "Visão geral do fluxo",
    "Passo a passo", "Regras de negócio", "Validação e conferência",
    "Dependências externas", "Erros comuns e o que fazer",
    "Pendências a validar (versão 1.1)", "Controle de versões",
  ],
  true
);

// ════════════════════════════════════════════════════════════════════════════
h1("1.", "Objetivo");
p(
  "Esta instrução descreve a rotina quinzenal de apuração das horas dos freelancers da produção, do arquivo exportado pelo relógio de ponto até o relatório de pagamento. O sistema importa o arquivo TXT, apura as horas por pessoa e por dia, permite corrigir batidas esquecidas e gera o fechamento em PDF e Excel."
);
p(
  "A apuração feita à mão não deixa rastro de conferência e erra em silêncio: uma batida esquecida reduz o total de horas da pessoa sem qualquer aviso, e ela recebe a menos. O sistema sinaliza esses casos e permite corrigi-los antes do pagamento."
);

// ════════════════════════════════════════════════════════════════════════════
h1("2.", "Quando executar");
p("Frequência: quinzenal, a cada fechamento — um arquivo do relógio por período.");
caixa(
  "A validar",
  "Dia do mês em que o fechamento é executado e o prazo para envio ao pagamento.",
);

// ════════════════════════════════════════════════════════════════════════════
h1("3.", "Pré-requisitos");
itens([
  "Ponto Digital instalado na máquina, com o atalho na área de trabalho.",
  "Serviço do PostgreSQL em execução (sobe junto com o Windows).",
  "Arquivo TXT exportado do relógio de ponto, cobrindo a quinzena inteira.",
  "Colaboradores cadastrados no sistema, com valor/hora, valor/dia e passagem.",
  "O código do colaborador no sistema tem que ser o mesmo do campo \"Tra. No.\" do arquivo do relógio — é por ele que o sistema liga a batida à pessoa.",
]);

// ════════════════════════════════════════════════════════════════════════════
h1("4.", "Visão geral do fluxo");
itens([
  "Abrir o programa pelo atalho da área de trabalho.",
  "Conferir o cadastro dos colaboradores e seus valores.",
  "Importar o arquivo TXT e confirmar o período.",
  "Ler os avisos da importação.",
  "Conferir o relatório e o detalhe diário.",
  "Corrigir as batidas esquecidas.",
  "Exportar o fechamento em PDF e Excel.",
], true);

// ════════════════════════════════════════════════════════════════════════════
h1("5.", "Passo a passo");

h2("Passo 1 — Abrir o programa");
p(
  "Dois cliques no atalho Ponto Digital, na área de trabalho. Abre uma janela preta e, em seguida, o navegador na tela de Lotes. A janela preta é o programa em execução: fechá-la encerra o sistema, então deixe-a aberta até terminar."
);
figura("01-inicio.png", "Tela inicial — lista dos lotes já importados.");

h2("Passo 2 — Conferir o cadastro dos colaboradores");
p(
  "No menu Colaboradores, confira se todos que aparecem no arquivo estão cadastrados e com os valores corretos. Quem não estiver cadastrado tem as horas apuradas normalmente, mas o valor sai zerado."
);
figura("02-colaboradores-vazio.png", "Menu Colaboradores.");
p("Para incluir, use Novo colaborador e preencha código, nome e os três valores:");
figura("03-colaborador-form.png", "Cadastro de colaborador.", LARG * 0.62);
figura("04-colaboradores-lista.png", "Cadastro completo, com os valores individuais de cada pessoa.");

h2("Passo 3 — Importar o arquivo do relógio");
p("No menu Importar Ponto, arraste o arquivo TXT para a área indicada, ou clique para escolher.");
figura("05-importar-vazio.png", "Área de envio do arquivo.");
p(
  "Depois de carregado, o sistema mostra o período que detectou e uma prévia dos registros. Confira o período antes de processar: um arquivo exportado com intervalo errado rotula o fechamento inteiro com o período errado."
);
figura("06-importar-periodo.png", "Período sugerido e prévia dos registros.");

h2("Passo 4 — Ler o resultado da importação");
p(
  "Ao terminar, o sistema informa quantos registros e quantas pessoas processou, e sinaliza o que precisa de atenção. Leia estes avisos antes de seguir — eles apontam exatamente onde o fechamento pode estar errado."
);
figura("07-importado.png", "Resultado da importação, com os avisos.");
p("São três avisos possíveis, e eles não têm o mesmo peso:");
itens([
  "Pessoas do arquivo que não estão no cadastro — apuraram valor zero. Cadastre e use Recalcular valores no relatório.",
  "Dias em aberto — batida faltando. O total de horas dessas pessoas sai MENOR do que o trabalhado. Corrija no Passo 7.",
  "Último dia do arquivo truncado — informativo, não é problema. Ver regra 6.3.",
]);

h2("Passo 5 — Conferir o relatório de fechamento");
p(
  "O relatório traz os totalizadores no topo e o resumo por colaborador, até o VALOR A PAGAR de cada um."
);
figura("08-relatorio.png", "Relatório de fechamento — resumo por colaborador.");

h2("Passo 6 — Conferir o detalhe diário");
p(
  "A aba Detalhe diário mostra as batidas dia a dia de cada pessoa. É aqui que se enxerga a origem de cada aviso — repare que os dois tipos têm cores diferentes:"
);
figura("09-detalhe-diario.png", "Detalhe diário — em âmbar o problema real, em cinza a nota informativa.");
itens([
  "Linha em âmbar: batida faltando. Precisa de correção — as horas estão a menor.",
  "Linha em cinza: último dia do arquivo, export truncado. Não precisa de nada.",
]);

h2("Passo 7 — Corrigir a batida esquecida");
p(
  "Na aba Detalhe diário, clique no lápis da linha do dia a corrigir. Abre a janela com as batidas daquele dia, indicando qual ficou sem par."
);
figura("10-editar-batidas.png", "Batidas do dia — a terceira ficou sem par.", LARG * 0.68);
p(
  "Informe o horário que faltou e clique em Incluir. O sistema refaz a conta do dia e do fechamento na hora."
);
figura("11-batida-incluida.png", "Depois de incluir a batida que faltava.", LARG * 0.68);
caixa(
  "As batidas são pareadas por ordem de horário",
  "A primeira com a segunda, a terceira com a quarta, e assim por diante. Por isso o horário que você digita muda o resultado: uma batida incluída na posição errada gera um par sem sentido. A janela mostra o pareamento na hora — confira antes de concluir.",
  "neutra"
);
p("Ao voltar ao resumo, a pessoa corrigida passa a Status OK e o valor sobe:");
figura("12-relatorio-corrigido.png", "Relatório depois da correção.");

h2("Passo 8 — Exportar o fechamento");
p(
  "No topo do relatório, Baixar PDF gera o documento para arquivo ou envio; Excel gera a planilha com as abas de fechamento e detalhe diário. Os botões de CSV continuam disponíveis para quem prefere abrir na planilha direto."
);

// ════════════════════════════════════════════════════════════════════════════
h1("6.", "Regras de negócio");

h2("6.1  Como as horas são apuradas");
p(
  "As batidas do dia são ordenadas por horário e pareadas em sequência: a primeira com a segunda, a terceira com a quarta. O total do dia é a soma dos intervalos entre os pares."
);
p(
  "O campo de entrada/saída que vem no arquivo do relógio é ignorado de propósito: ele vem inconsistente, e ordenar por horário é mais confiável."
);

h2("6.2  Dia com número ímpar de batidas");
p(
  "Com três batidas, o sistema casa as duas primeiras e a terceira fica sem par. O relatório mostra menos horas do que a pessoa trabalhou."
);
caixa(
  "Não é um número incompleto, é um número errado para menos",
  "Se ninguém corrigir, o colaborador recebe a menos. No arquivo de exemplo isso valeu 3 horas e 21 minutos, ou R$ 56 numa única pessoa."
);

h2("6.3  Último dia do arquivo");
p(
  "Quando o arquivo termina no meio de um dia, as batidas soltas desse último dia não são batida faltando — é o export que foi cortado. O sistema as marca como nota informativa, em cinza, e elas não contam como dia com problema."
);
p("Dias anteriores não têm esse tratamento: ali, batida faltando é batida faltando.");

h2("6.4  Status do colaborador no período");
tabela(
  ["Dias com problema", "Status"],
  [["Nenhum", "OK"], ["1 ou 2", "Aviso"], ["3 ou mais", "Crítico"]],
  [150, LARG - 150]
);

h2("6.5  As contas do pagamento");
tabela(
  ["Valor", "Como é calculado"],
  [
    ["Total por Hora", "Horas apuradas (em decimal) × Valor/hora do colaborador"],
    ["Total Passagem", "Dias trabalhados × Passagem/dia"],
    ["Valor Total", "Total por Hora + Total Passagem"],
    ["VALOR A PAGAR", "Valor Total + Acréscimos - Descontos, arredondado para cima"],
  ],
  [120, LARG - 120]
);
p(
  "O arredondamento é sempre para cima, ao real inteiro, e sempre a favor do colaborador: 1.937,28 vira 1.938."
);

h2("6.6  Total por Dia é referência");
caixa(
  "O Total por Dia NÃO entra no valor a pagar",
  "Ele aparece no relatório apenas como referência de comparação. Somá-lo ao pagamento praticamente dobraria todos os valores.",
  "neutra"
);

h2("6.7  Valores congelados na importação");
p(
  "As taxas de cada pessoa são gravadas no fechamento no momento da importação. Alterar o cadastro depois não muda um lote já importado. Para atualizar, use o botão Recalcular valores no topo do relatório: ele relê o cadastro e refaz as contas sem apagar as correções manuais de batida já feitas."
);

// ════════════════════════════════════════════════════════════════════════════
h1("7.", "Validação e conferência");
p("Antes de considerar o fechamento concluído, três conferências:");
itens([
  "Coluna Dias c/ Problema zerada em todas as linhas do relatório.",
  "Quantidade de registros informada na importação igual à do arquivo do relógio.",
  "Totais do PDF e do Excel iguais aos da tela.",
], true);
caixa(
  "Regra de ouro",
  "O fechamento só está concluído quando não resta nenhum dia em aberto. Havendo dia em aberto, identifique de quem é (Passo 6), corrija (Passo 7) e confira de novo — o valor daquela pessoa está a menor até lá."
);

// ════════════════════════════════════════════════════════════════════════════
h1("8.", "Dependências externas");
itens([
  "Exportação do arquivo pelo relógio de ponto: o sistema só apura o que estiver no arquivo. Se o export não cobrir a quinzena inteira, faltam dias no fechamento e ninguém é avisado — o sistema não tem como saber o que deveria estar ali.",
  "Serviço do PostgreSQL no Windows: se estiver parado, o programa não abre. Ver o item 4 dos Comandos Especiais.",
]);
caixa(
  "A validar",
  "Quem exporta o arquivo do relógio, com que critério de período, e como conferir que o export cobriu a quinzena inteira."
);

// ════════════════════════════════════════════════════════════════════════════
h1("9.", "Erros comuns e o que fazer");
tabela(
  ["Situação", "O que fazer"],
  [
    ["Pessoa do arquivo com valor zerado", "Não está no cadastro. Cadastre no menu Colaboradores e use Recalcular valores no relatório."],
    ["Dia em aberto (batida faltando)", "Corrigir pelo lápis no Detalhe diário (Passo 7)."],
    ["Período apurado diferente do esperado", "Conferir o arquivo antes de importar — item 7 dos Comandos Especiais."],
    ["O programa não abre", "Verificar o serviço do PostgreSQL — item 4 dos Comandos Especiais."],
    ["A tela não reflete uma atualização", "Programa antigo ainda rodando — item 3 dos Comandos Especiais."],
    ["Valor mudou depois de mexer no cadastro", "Esperado: as taxas são congeladas na importação. Use Recalcular valores (regra 6.7)."],
  ],
  [170, LARG - 170]
);

// ════════════════════════════════════════════════════════════════════════════
h1("10.", "Pendências a validar (versão 1.1)");
p("Itens não confirmados no momento da elaboração. Quem assumir deve validá-los e atualizar esta IT:");
itens([
  "Dia sem horas apuradas: hoje qualquer dia com registro conta como dia trabalhado e paga diária de referência e passagem, mesmo apurando zero hora. A regra ainda não foi decidida.",
  "Descontos e acréscimos: o cálculo já os soma ao valor a pagar, mas ainda não existe tela para lançá-los.",
  "O sistema ainda não tem login e roda apenas na própria máquina. Não deve ser publicado na rede como está.",
  "Turno que cruza a meia-noite: a regra existe e está testada, mas nenhum arquivo real exercitou esse caso.",
  "Confirmar se o arquivo do relógio cobre sempre a quinzena inteira. Caso observado: arquivo nomeado de 14/08 a 24/08 com registros a partir de 17/08 apenas.",
  "Dia do mês do fechamento e prazo para envio ao pagamento.",
  "Onde arquivar o PDF gerado e por quanto tempo.",
]);

// ════════════════════════════════════════════════════════════════════════════
h1("11.", "Controle de versões");
tabela(
  ["Versão", "Data", "Responsável", "Descrição"],
  [["1.0", new Date().toLocaleDateString("pt-BR"), "Henrique", "Elaboração inicial, a partir do sistema em funcionamento."]],
  [58, 74, 92, LARG - 224]
);

// ════════════════════════════════════════════════════════════════════════════
// Cabeçalho e rodapé em todas as páginas
// ════════════════════════════════════════════════════════════════════════════
const faixa = doc.bufferedPageRange();
for (let i = faixa.start; i < faixa.start + faixa.count; i++) {
  doc.switchToPage(i);
  // Escrever fora das margens faz o pdfkit abrir página nova; zeramos e devolvemos.
  const topo = doc.page.margins.top;
  const base = doc.page.margins.bottom;
  doc.page.margins.top = 0;
  doc.page.margins.bottom = 0;

  doc.font(S).fontSize(7.5).fillColor(APAGADO)
    .text(seguro("IT-FIN-02 · Fechamento Quinzenal de Ponto"), X, 28, { width: LARG, align: "right", lineBreak: false });
  doc.moveTo(X, 42).lineTo(X + LARG, 42).lineWidth(0.5).strokeColor(LINHA).stroke();

  const yRodape = doc.page.height - 38;
  doc.font(S).fontSize(7.5).fillColor(APAGADO)
    .text("Papieri · uso interno", X, yRodape, { width: LARG, align: "left", lineBreak: false });
  doc.text(`Página ${i + 1} de ${faixa.count}`, X, yRodape, { width: LARG, align: "right", lineBreak: false });

  doc.page.margins.top = topo;
  doc.page.margins.bottom = base;
}
doc.flushPages();

doc.end();
pronto.then((conteudo) => {
  writeFileSync(SAIDA, conteudo);
  console.log(`gerado: ${SAIDA} · ${faixa.count} páginas · ${Math.round(conteudo.length / 1024)} KB`);
});
