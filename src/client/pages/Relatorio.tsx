/**
 * Relatório de fechamento. Portado de `referencia/.../ReportPage.tsx`.
 *
 * "Total por Dia" aparece como REFERÊNCIA e não entra no Valor Total nem no
 * VALOR A PAGAR — conferido contra o fechamento real (ver `calculo.ts`).
 *
 * Todos os horários são exibidos em UTC, sem conversão de fuso (CLAUDE.md).
 */
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Pencil,
  RefreshCw,
  Table2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatarData, formatarDataHora, formatarMinutos, formatarReais } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EditarBatidasDia from "@/components/EditarBatidasDia";

function Situacao({ status }: { status: string }) {
  if (status === "ok")
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
        <CheckCircle2 className="h-3 w-3" /> OK
      </Badge>
    );
  if (status === "warning")
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-3 w-3" /> Aviso
      </Badge>
    );
  return (
    <Badge className="border-red-200 bg-red-50 text-red-800">
      <XCircle className="h-3 w-3" /> Crítico
    </Badge>
  );
}

/** Separador `;`, UTF-8 com BOM, vírgula decimal — abre no Excel em português. */
function baixarCsv(nome: string, linhas: string[][]) {
  const csv = linhas.map((l) => l.join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const virgula = (v: string | number) => String(v).replace(".", ",");

export default function Relatorio() {
  const params = useParams<{ batchId: string }>();
  const batchId = parseInt(params.batchId ?? "0", 10);
  const [, navegar] = useLocation();
  const utils = trpc.useUtils();
  const [aba, setAba] = useState("resumo");
  const [editando, setEditando] = useState<{
    employeeCode: number;
    employeeName: string;
    department: string;
    workDate: string;
  } | null>(null);

  const { data: lote } = trpc.import.getById.useQuery({ id: batchId });
  const { data: periodos, isLoading } = trpc.import.getPayrollPeriods.useQuery({ batchId });
  const { data: resumosDiarios } = trpc.import.getDailySummaries.useQuery({ batchId });

  const recalcular = trpc.import.recalcular.useMutation({
    onSuccess: (r) => {
      utils.import.getPayrollPeriods.invalidate({ batchId });
      toast.success(`Valores recalculados para ${r.colaboradoresAtualizados} colaborador(es).`);
    },
    onError: (e) => toast.error(e.message),
  });

  const totais = (periodos ?? []).reduce(
    (acc, p) => ({
      dias: acc.dias + p.workedDays,
      minutos: acc.minutos + p.totalMinutes,
      hora: acc.hora + parseFloat(p.totalByHour),
      dia: acc.dia + parseFloat(p.totalByDay),
      passagem: acc.passagem + parseFloat(p.transportTotal),
      valor: acc.valor + parseFloat(p.totalValue),
      pagar: acc.pagar + parseFloat(p.amountToPay),
    }),
    { dias: 0, minutos: 0, hora: 0, dia: 0, passagem: 0, valor: 0, pagar: 0 }
  );

  const periodoLabel = lote
    ? `${formatarData(lote.periodStart)}_${formatarData(lote.periodEnd)}`.replace(/\//g, "-")
    : "lote";

  function exportarResumo() {
    if (!periodos) return;
    baixarCsv(`fechamento_${periodoLabel}.csv`, [
      [
        "Código", "Nome", "Dias Trabalhados", "Total Horas", "Valor/Hora Base",
        "Total por Hora", "Valor/Dia Base", "Total por Dia", "Passagem/Dia",
        "Total Passagem", "Valor Total", "Acréscimos", "Descontos",
        "VALOR A PAGAR", "Dias c/ Problema", "Status",
      ],
      ...periodos.map((p) => [
        String(p.employeeCode),
        p.employeeName,
        String(p.workedDays),
        formatarMinutos(p.totalMinutes),
        virgula(p.hourlyRate),
        virgula(p.totalByHour),
        virgula(p.dailyRate),
        virgula(p.totalByDay),
        virgula(p.transportAllowance),
        virgula(p.transportTotal),
        virgula(p.totalValue),
        virgula(p.additionsTotal),
        virgula(p.deductionsTotal),
        virgula(p.amountToPay),
        String(p.missingDays),
        p.status === "ok" ? "OK" : p.status === "warning" ? "Aviso" : "Crítico",
      ]),
    ]);
  }

  function exportarDetalhado() {
    if (!resumosDiarios) return;
    baixarCsv(`detalhado_${periodoLabel}.csv`, [
      ["Código", "Data", "Qtd Registros", "Primeira Entrada", "Última Saída", "Total Horas", "Problema", "Observação"],
      ...resumosDiarios.map((d) => [
        String(d.employeeCode),
        formatarData(d.workDate),
        String(d.recordCount),
        formatarDataHora(d.firstIn),
        formatarDataHora(d.lastOut),
        formatarMinutos(d.totalMinutes),
        d.hasIssue ? "SIM" : "NÃO",
        d.issueDescription ?? "",
      ]),
    ]);
  }

  const porColaborador = new Map<number, NonNullable<typeof resumosDiarios>>();
  for (const d of resumosDiarios ?? []) {
    const lista = porColaborador.get(d.employeeCode) ?? [];
    lista.push(d);
    porColaborador.set(d.employeeCode, lista);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navegar("/")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Relatório de Fechamento</h1>
          {lote && (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              {formatarData(lote.periodStart)} a {formatarData(lote.periodEnd)}
              {!lote.periodConfirmed && (
                <span className="text-amber-700">· período não confirmado</span>
              )}
              <span>·</span>
              <FileText className="h-3.5 w-3.5" />
              {lote.filename}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalcular.mutate({ batchId })}
            disabled={recalcular.isPending}
            title="Relê o cadastro e refaz as contas, sem apagar correções manuais"
          >
            <RefreshCw className={`h-4 w-4 ${recalcular.isPending ? "animate-spin" : ""}`} />
            Recalcular valores
          </Button>
          <Button
            size="sm"
            onClick={() => {
              window.location.href = `/api/lote/${batchId}/planilha.xlsx`;
            }}
          >
            <Table2 className="h-4 w-4" />
            Baixar Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportarResumo}>
            <Download className="h-4 w-4" />
            Resumo CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportarDetalhado}>
            <Download className="h-4 w-4" />
            Detalhado CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { rotulo: "Colaboradores", valor: String(periodos?.length ?? 0) },
          { rotulo: "Dias trabalhados", valor: String(totais.dias) },
          { rotulo: "Total de horas", valor: formatarMinutos(totais.minutos) },
          { rotulo: "Valor total", valor: formatarReais(totais.valor) },
          { rotulo: "Valor a pagar", valor: formatarReais(totais.pagar), destaque: true },
        ].map((c) => (
          <Card key={c.rotulo}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{c.rotulo}</p>
              <p
                className={`tabular mt-1 text-xl font-semibold ${
                  c.destaque ? "text-emerald-700" : ""
                }`}
              >
                {c.valor}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="resumo">Resumo por colaborador</TabsTrigger>
          <TabsTrigger value="diario">Detalhe diário</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              {isLoading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-2 text-left font-medium">Cód.</th>
                        <th className="px-2 py-2 text-left font-medium">Nome</th>
                        <th className="px-2 py-2 text-center font-medium">Dias</th>
                        <th className="px-2 py-2 text-center font-medium">Horas</th>
                        <th className="px-2 py-2 text-right font-medium">Vlr/Hora</th>
                        <th className="px-2 py-2 text-right font-medium">Total/Hora</th>
                        <th className="px-2 py-2 text-right font-medium">
                          Total/Dia <span className="font-normal">(ref.)</span>
                        </th>
                        <th className="px-2 py-2 text-right font-medium">Passagem</th>
                        <th className="px-2 py-2 text-right font-medium">Valor Total</th>
                        <th className="px-2 py-2 text-right font-medium">A PAGAR</th>
                        <th className="px-2 py-2 text-center font-medium">Probl.</th>
                        <th className="px-2 py-2 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodos?.map((p) => (
                        <tr
                          key={p.id}
                          className={`border-b border-border/50 hover:bg-muted/40 ${
                            p.status === "critical"
                              ? "bg-red-50/50"
                              : p.status === "warning"
                                ? "bg-amber-50/40"
                                : ""
                          }`}
                        >
                          <td className="px-2 py-2.5">
                            <Badge className="tabular border-border">{p.employeeCode}</Badge>
                          </td>
                          <td className="px-2 py-2.5 font-medium">{p.employeeName}</td>
                          <td className="tabular px-2 py-2.5 text-center">{p.workedDays}</td>
                          <td className="tabular px-2 py-2.5 text-center">
                            {formatarMinutos(p.totalMinutes)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right text-muted-foreground">
                            {formatarReais(p.hourlyRate)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right font-medium">
                            {formatarReais(p.totalByHour)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right text-muted-foreground">
                            {formatarReais(p.totalByDay)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right">
                            {parseFloat(p.transportTotal) > 0 ? (
                              formatarReais(p.transportTotal)
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right font-medium">
                            {formatarReais(p.totalValue)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right font-semibold text-emerald-700">
                            {formatarReais(p.amountToPay)}
                          </td>
                          <td className="tabular px-2 py-2.5 text-center">
                            {p.missingDays > 0 ? (
                              <span className="font-semibold text-red-600">{p.missingDays}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <Situacao status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                        <td colSpan={2} className="px-2 py-2.5 text-right text-muted-foreground">
                          TOTAIS
                        </td>
                        <td className="tabular px-2 py-2.5 text-center">{totais.dias}</td>
                        <td className="tabular px-2 py-2.5 text-center">
                          {formatarMinutos(totais.minutos)}
                        </td>
                        <td />
                        <td className="tabular px-2 py-2.5 text-right">
                          {formatarReais(totais.hora)}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right text-muted-foreground">
                          {formatarReais(totais.dia)}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">
                          {formatarReais(totais.passagem)}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right">
                          {formatarReais(totais.valor)}
                        </td>
                        <td className="tabular px-2 py-2.5 text-right text-emerald-700">
                          {formatarReais(totais.pagar)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Total/Dia é referência e não entra no valor a pagar. O VALOR A PAGAR é
                arredondado para cima, ao real inteiro, sempre a favor do colaborador.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diario" className="mt-4">
          <div className="space-y-4">
            {periodos?.map((p) => {
              const dias = porColaborador.get(p.employeeCode) ?? [];
              return (
                <Card key={p.employeeCode}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <CardTitle>
                      {p.employeeName}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {p.workedDays} dias · {formatarMinutos(p.totalMinutes)}
                      </span>
                    </CardTitle>
                    <Situacao status={p.status} />
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-2 py-2 text-left font-medium">Data</th>
                            <th className="px-2 py-2 text-center font-medium">Batidas</th>
                            <th className="px-2 py-2 text-center font-medium">Entrada</th>
                            <th className="px-2 py-2 text-center font-medium">Saída</th>
                            <th className="px-2 py-2 text-center font-medium">Horas</th>
                            <th className="px-2 py-2 text-left font-medium">Observação</th>
                            <th className="px-2 py-2 text-center font-medium">Editar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dias.map((d) => (
                            <tr
                              key={d.id}
                              className={`border-b border-border/50 ${
                                d.hasIssue ? "bg-amber-50/50" : ""
                              }`}
                            >
                              <td className="tabular px-2 py-2">{formatarData(d.workDate)}</td>
                              <td className="tabular px-2 py-2 text-center">{d.recordCount}</td>
                              <td className="tabular px-2 py-2 text-center">
                                {formatarDataHora(d.firstIn)}
                              </td>
                              <td className="tabular px-2 py-2 text-center">
                                {formatarDataHora(d.lastOut)}
                              </td>
                              <td className="tabular px-2 py-2 text-center font-medium">
                                {formatarMinutos(d.totalMinutes)}
                              </td>
                              <td
                                className={`px-2 py-2 text-xs ${
                                  d.hasIssue ? "text-amber-800" : "text-muted-foreground"
                                }`}
                              >
                                {d.issueDescription ?? "—"}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Editar as batidas deste dia"
                                  onClick={() =>
                                    setEditando({
                                      employeeCode: p.employeeCode,
                                      employeeName: p.employeeName,
                                      department: "PRODUCAO",
                                      workDate: d.workDate.slice(0, 10),
                                    })
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {editando && (
        <EditarBatidasDia
          aberto
          aoFechar={() => setEditando(null)}
          batchId={batchId}
          employeeCode={editando.employeeCode}
          employeeName={editando.employeeName}
          department={editando.department}
          workDate={editando.workDate}
        />
      )}
    </div>
  );
}
