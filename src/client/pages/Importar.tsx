/**
 * Importação do TXT do relógio. Portado de `referencia/.../ImportPage.tsx`.
 *
 * Duas diferenças em relação ao original:
 *
 * 1. O arquivo é enviado em base64 e a codificação é decidida no servidor
 *    (UTF-8 com queda para latin1). O original lia sempre como latin1, o que
 *    embaralharia acentos num export UTF-8.
 * 2. O período detectado aparece como sugestão editável antes de processar —
 *    é a correção 6.2 da especificação.
 */
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  Upload,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type Resultado = NonNullable<ReturnType<typeof trpc.import.process.useMutation>["data"]>;

/** Lê 'DD.MM.AAAA HH:MM:SS' das linhas e devolve o menor e o maior dia. */
function detectarPeriodo(texto: string): { inicio: string; fim: string } | null {
  const datas: string[] = [];
  for (const linha of texto.split("\n")) {
    const m = linha.match(/(\d{2})\.(\d{2})\.(\d{4})\s+\d{2}:\d{2}:\d{2}/);
    if (m) datas.push(`${m[3]}-${m[2]}-${m[1]}`);
  }
  if (datas.length === 0) return null;
  datas.sort();
  return { inicio: datas[0]!, fim: datas[datas.length - 1]! };
}

function paraBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let binario = "";
  for (let i = 0; i < u8.length; i += 0x8000) {
    binario += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export default function Importar() {
  const [, navegar] = useLocation();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string[][]>([]);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processar = trpc.import.process.useMutation({
    onSuccess: (d) => {
      setResultado(d);
      toast.success("Arquivo processado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const lerArquivo = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".txt")) {
      toast.error("Só arquivos .txt do relógio de ponto.");
      return;
    }
    const bytes = await f.arrayBuffer();
    // Só para a prévia e a detecção do período; quem decide a codificação de
    // verdade é o servidor.
    const texto = new TextDecoder("utf-8").decode(bytes);
    const linhas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("Tra.") && !l.startsWith("No."))
      .map((l) => l.split("\t").map((p) => p.trim()));

    setArquivo(f);
    setBase64(paraBase64(bytes));
    setPrevia(linhas.slice(0, 15));
    setTotalLinhas(linhas.length);

    const periodo = detectarPeriodo(texto);
    setInicio(periodo?.inicio ?? "");
    setFim(periodo?.fim ?? "");
  }, []);

  function limpar() {
    setArquivo(null);
    setBase64(null);
    setPrevia([]);
    setTotalLinhas(0);
    setInicio("");
    setFim("");
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function enviar() {
    if (!arquivo || !base64) return;
    processar.mutate({
      filename: arquivo.name,
      contentBase64: base64,
      // 6.2: o operador confirmou ou ajustou o período sugerido.
      periodo:
        inicio && fim
          ? { periodStart: `${inicio} 00:00:00`, periodEnd: `${fim} 23:59:59` }
          : undefined,
    });
  }

  if (resultado) {
    return (
      <div className="max-w-3xl space-y-5">
        <h1 className="text-2xl font-semibold">Importar Ponto</h1>

        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <h2 className="text-xl font-semibold">Arquivo processado</h2>
              <p className="text-sm text-muted-foreground">
                Período: {formatarData(resultado.periodStart)} a{" "}
                {formatarData(resultado.periodEnd)}
                {resultado.periodConfirmed && " · confirmado"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { rotulo: "Registros", valor: resultado.totalRecords, cor: "" },
                { rotulo: "Colaboradores", valor: resultado.processedEmployees, cor: "" },
                {
                  rotulo: "Críticos",
                  valor: resultado.criticalCount,
                  cor: resultado.criticalCount > 0 ? "text-red-700" : "text-emerald-700",
                },
                {
                  rotulo: "Avisos",
                  valor: resultado.warningCount,
                  cor: resultado.warningCount > 0 ? "text-amber-700" : "text-emerald-700",
                },
              ].map((c) => (
                <div key={c.rotulo} className="rounded-lg bg-muted p-3 text-center">
                  <p className={`text-2xl font-semibold ${c.cor}`}>{c.valor}</p>
                  <p className="text-xs text-muted-foreground">{c.rotulo}</p>
                </div>
              ))}
            </div>

            {resultado.semCadastro.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <UserX className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {resultado.semCadastro.length} pessoa(s) do arquivo não estão no
                    cadastro — apuraram valor zero.
                  </p>
                  <p className="mt-1">
                    {resultado.semCadastro.map((p) => `${p.name} (${p.code})`).join(", ")}
                  </p>
                  <p className="mt-1.5">
                    Cadastre e use "Recalcular valores" no relatório.
                  </p>
                </div>
              </div>
            )}

            {resultado.diasEmAberto.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {resultado.diasEmAberto.length} dia(s) em aberto — batida faltando.
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {resultado.diasEmAberto.map((d) => (
                      <li key={`${d.employeeCode}-${d.workDate}`}>
                        {d.employeeName} em {formatarData(d.workDate)} · {d.recordCount}{" "}
                        batidas
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">
                    O total de horas dessas pessoas sai <strong>menor</strong> do que o
                    trabalhado.
                  </p>
                </div>
              </div>
            )}

            {resultado.diasTruncados.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">
                    O arquivo termina no meio do último dia.
                  </p>
                  <p className="mt-1">
                    {resultado.diasTruncados.length} batida(s) solta(s) em{" "}
                    {formatarData(resultado.diasTruncados[0]!.workDate)} não contam como
                    problema — é export truncado, não batida faltando.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3 pt-1">
              <Button onClick={() => navegar(`/relatorio/${resultado.batchId}`)}>
                Ver relatório de fechamento
              </Button>
              <Button variant="outline" onClick={limpar}>
                Importar outro
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Importar Ponto</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Envie o arquivo TXT do relógio para apurar as horas da quinzena.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            role="button"
            tabIndex={0}
            onClick={() => !arquivo && inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && !arquivo && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const f = e.dataTransfer.files[0];
              if (f) void lerArquivo(f);
            }}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              arrastando
                ? "border-primary bg-primary/5"
                : arquivo
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
            {arquivo ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-emerald-600" />
                <p className="font-semibold">{arquivo.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(arquivo.size / 1024).toFixed(1)} KB · {totalLinhas} registros
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    limpar();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">Arraste o arquivo aqui ou clique para escolher</p>
                <p className="text-sm text-muted-foreground">Somente .txt do relógio</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {arquivo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Período do lote</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sugerido a partir do menor e do maior registro do arquivo. Confira antes
                de processar — um export com intervalo errado rotula o lote errado.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="inicio">Início</Label>
                  <Input
                    id="inicio"
                    type="date"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fim">Fim</Label>
                  <Input
                    id="fim"
                    type="date"
                    value={fim}
                    onChange={(e) => setFim(e.target.value)}
                  />
                </div>
              </div>
              {inicio && fim && (
                <p className="text-sm">
                  Vai ser gravado como{" "}
                  <strong>
                    {formatarData(`${inicio} 00:00:00`)} a {formatarData(`${fim} 00:00:00`)}
                  </strong>
                  . O campo acima usa o formato de data do seu sistema.
                </p>
              )}
            </CardContent>
          </Card>

          {previa.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prévia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Cód.</th>
                        <th className="px-3 py-2 text-left font-medium">Nome</th>
                        <th className="px-3 py-2 text-left font-medium">Departamento</th>
                        <th className="px-3 py-2 text-left font-medium">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {previa.map((linha, i) => (
                        <tr key={i} className="border-t border-border/60">
                          <td className="px-3 py-1.5">{linha[0]}</td>
                          <td className="px-3 py-1.5">{linha[1]}</td>
                          <td className="px-3 py-1.5">{linha[2]}</td>
                          <td className="px-3 py-1.5">{linha[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalLinhas > previa.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    … e mais {totalLinhas - previa.length} registros.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button onClick={enviar} disabled={processar.isPending}>
              <Upload className="h-4 w-4" />
              {processar.isPending ? "Processando…" : "Processar arquivo"}
            </Button>
            <Button variant="outline" onClick={limpar}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
