import AppLayout from "@/components/AppLayout";
import EditDayRecordsModal from "@/components/EditDayRecordsModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Pencil,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useParams } from "wouter";

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "R$ 0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `R$ ${num.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function formatMinutes(minutes: number | null | undefined) {
  if (!minutes) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Garante que strings sem timezone sejam interpretadas como UTC
// Ex: "2026-02-02 12:03:57" → "2026-02-02T12:03:57Z"
function toUtcDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  // Substitui espaço por 'T' e adiciona 'Z' se não tiver timezone
  const s = date.replace(' ', 'T');
  const withZ = s.endsWith('Z') || s.includes('+') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z';
  return new Date(withZ);
}
function formatDate(date: Date | string | null | undefined) {
  const d = toUtcDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function formatDateTime(date: Date | string | null | undefined) {
  const d = toUtcDate(date);
  if (!d) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 border gap-1">
        <CheckCircle2 className="w-3 h-3" />
        OK
      </Badge>
    );
  if (status === "warning")
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 border gap-1">
        <AlertTriangle className="w-3 h-3" />
        Aviso
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 border gap-1">
      <XCircle className="w-3 h-3" />
      Crítico
    </Badge>
  );
}

interface EditTarget {
  employeeCode: number;
  employeeName: string;
  department: string;
  workDate: string; // YYYY-MM-DD
}

export default function ReportPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = parseInt(params.batchId ?? "0", 10);
  const [, navigate] = useLocation();
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const utils = trpc.useUtils();

  const { data: batch } = trpc.import.getById.useQuery({ id: batchId });
  const { data: payrollPeriods, isLoading: loadingPayroll } =
    trpc.import.getPayrollPeriods.useQuery({ batchId });
  const { data: dailySummaries, isLoading: loadingDaily } =
    trpc.import.getDailySummaries.useQuery({ batchId });
  const { data: summary } = trpc.import.getPayrollSummary.useQuery({ batchId });
  const { data: employees } = trpc.employee.list.useQuery();

  const summaryData = summary?.[0];

  // Build employee map for name lookup
  const employeeMap = new Map(employees?.map((e) => [e.code, e]) ?? []);

  // Group daily summaries by employee
  const dailyByEmployee = new Map<number, typeof dailySummaries>();
  if (dailySummaries) {
    for (const ds of dailySummaries) {
      const list = dailyByEmployee.get(ds.employeeCode) ?? [];
      list.push(ds);
      dailyByEmployee.set(ds.employeeCode, list);
    }
  }

  function exportCSV() {
    if (!payrollPeriods || !batch) return;

    const periodLabel = `${formatDate(batch.periodStart)}_${formatDate(batch.periodEnd)}`.replace(/\//g, "-");

    const header = [
      "Código",
      "Nome",
      "Dias Trabalhados",
      "Total Horas",
      "Valor/Hora Base",
      "Total por Hora",
      "Valor/Dia Base",
      "Total por Dia",
      "Passagem/Dia",
      "Total Passagem",
      "Valor Total",
      "Dias c/ Problema",
      "Status",
    ].join(";");
    const rows = payrollPeriods.map((p) => {
      const valorTotal = (parseFloat(String(p.totalByHour ?? "0")) || 0) + (parseFloat(String(p.transportTotal ?? "0")) || 0);
      return [
        p.employeeCode,
        p.employeeName,
        p.workedDays ?? 0,
        formatMinutes(p.totalMinutes ?? 0),
        (p.hourlyRate ?? "0").replace(".", ","),
        (p.totalByHour ?? "0").replace(".", ","),
        (p.dailyRate ?? "0").replace(".", ","),
        (p.totalByDay ?? "0").replace(".", ","),
        (p.transportAllowance ?? "0").replace(".", ","),
        (p.transportTotal ?? "0").replace(".", ","),
        valorTotal.toFixed(2).replace(".", ","),
        p.missingDays ?? 0,
        p.status === "ok" ? "OK" : p.status === "warning" ? "Aviso" : "Crítico",
      ].join(";");
    });;

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fechamento_${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportDetailedCSV() {
    if (!dailySummaries || !batch) return;

    const periodLabel = `${formatDate(batch.periodStart)}_${formatDate(batch.periodEnd)}`.replace(/\//g, "-");

    const header = [
      "Código",
      "Nome",
      "Data",
      "Qtd Registros",
      "Primeira Entrada",
      "Última Saída",
      "Total Horas",
      "Problema",
      "Descrição",
    ].join(";");

    const rows = dailySummaries.map((ds) => {
      const emp = employeeMap.get(ds.employeeCode);
      return [
        ds.employeeCode,
        emp?.name ?? ds.employeeCode,
        formatDate(ds.workDate),
        ds.recordCount ?? 0,
        formatDateTime(ds.firstIn),
        formatDateTime(ds.lastOut),
        formatMinutes(ds.totalMinutes ?? 0),
        ds.hasIssue ? "SIM" : "NÃO",
        ds.issueDescription ?? "",
      ].join(";");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `detalhado_${periodLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-foreground">
              Relatório de Fechamento
            </h1>
            {batch && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                Período: {formatDate(batch.periodStart)} a {formatDate(batch.periodEnd)}
                <span className="text-border">•</span>
                <FileText className="w-3.5 h-3.5" />
                {batch.filename}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Resumo
            </Button>
            <Button variant="outline" size="sm" onClick={exportDetailedCSV} className="gap-2">
              <Download className="w-4 h-4" />
              Exportar Detalhado
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summaryData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Funcionários</span>
                </div>
                <p className="text-xl font-semibold">{summaryData.totalEmployees ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Dias Trabalhados</span>
                </div>
                <p className="text-xl font-semibold">{summaryData.totalWorkedDays ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Total Horas</span>
                </div>
                <p className="text-xl font-semibold font-mono">
                  {formatMinutes(Number(summaryData.totalMinutes ?? 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">Total por Hora</span>
                </div>
                <p className="text-xl font-semibold text-blue-700">
                  {formatCurrency(summaryData.totalByHour)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">Total por Dia</span>
                </div>
                <p className="text-xl font-semibold text-green-700">
                  {formatCurrency(summaryData.totalByDay)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">Passagens</span>
                </div>
                <p className="text-xl font-semibold text-purple-700">
                  {formatCurrency(summaryData.totalTransport)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Alerts */}
        {summaryData && (Number(summaryData.criticalCount) > 0 || Number(summaryData.warningCount) > 0) && (
          <div className="flex flex-col sm:flex-row gap-3">
            {Number(summaryData.criticalCount) > 0 && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{summaryData.criticalCount}</strong> funcionário(s) com situação
                  crítica (3+ dias com registros incompletos)
                </span>
              </div>
            )}
            {Number(summaryData.warningCount) > 0 && (
              <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{summaryData.warningCount}</strong> funcionário(s) com aviso
                  (1-2 dias com registros incompletos)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Resumo por Funcionário</TabsTrigger>
            <TabsTrigger value="daily">Detalhe Diário</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardContent className="pt-0">
                {loadingPayroll ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                            Cód.
                          </th>
                          <th className="text-left py-3 px-3 font-medium text-muted-foreground">
                            Nome
                          </th>
                          <th className="text-center py-3 px-3 font-medium text-muted-foreground">
                            Dias
                          </th>
                          <th className="text-center py-3 px-3 font-medium text-muted-foreground">
                            Total Horas
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Vlr/Hora
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Total/Hora
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Vlr/Dia
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Total/Dia
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Passagem
                          </th>
                          <th className="text-right py-3 px-3 font-medium text-muted-foreground">
                            Valor Total
                          </th>
                          <th className="text-center py-3 px-3 font-medium text-muted-foreground">
                            Problemas
                          </th>
                          <th className="text-center py-3 px-3 font-medium text-muted-foreground">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollPeriods?.map((p) => (
                          <tr
                            key={p.id}
                            className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                              p.status === "critical"
                                ? "bg-red-50/50"
                                : p.status === "warning"
                                  ? "bg-yellow-50/50"
                                  : ""
                            }`}
                          >
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="font-mono text-xs">
                                {p.employeeCode}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 font-medium">{p.employeeName}</td>
                            <td className="py-3 px-3 text-center">{p.workedDays ?? 0}</td>
                            <td className="py-3 px-3 text-center font-mono">
                              {formatMinutes(p.totalMinutes ?? 0)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(p.hourlyRate)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-blue-700">
                              {formatCurrency(p.totalByHour)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(p.dailyRate)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-green-700">
                              {formatCurrency(p.totalByDay)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-purple-700">
                              {parseFloat(p.transportTotal ?? "0") > 0
                                ? formatCurrency(p.transportTotal)
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-semibold text-orange-700">
                              {formatCurrency(
                                (parseFloat(String(p.totalByHour ?? "0")) || 0) + (parseFloat(String(p.transportTotal ?? "0")) || 0)
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {(p.missingDays ?? 0) > 0 ? (
                                <span className="text-red-600 font-semibold">
                                  {p.missingDays}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <StatusBadge status={p.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Totals row */}
                      {summaryData && (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                            <td colSpan={2} className="py-3 px-3 text-right text-muted-foreground">
                              TOTAIS
                            </td>
                            <td className="py-3 px-3 text-center">
                              {summaryData.totalWorkedDays ?? 0}
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              {formatMinutes(Number(summaryData.totalMinutes ?? 0))}
                            </td>
                            <td colSpan={2} className="py-3 px-3 text-right text-blue-700">
                              {formatCurrency(summaryData.totalByHour)}
                            </td>
                            <td colSpan={2} className="py-3 px-3 text-right text-green-700">
                              {formatCurrency(summaryData.totalByDay)}
                            </td>
                            <td className="py-3 px-3 text-right text-purple-700">
                              {formatCurrency(summaryData.totalTransport)}
                            </td>
                            <td className="py-3 px-3 text-right text-orange-700">
                              {formatCurrency(
                                (Number(summaryData.totalByHour) || 0) + (Number(summaryData.totalTransport) || 0)
                              )}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Daily Detail Tab */}
          <TabsContent value="daily" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Registros Diários por Funcionário
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDaily ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payrollPeriods?.map((p) => {
                      const days = dailyByEmployee.get(p.employeeCode) ?? [];
                      return (
                        <div key={p.employeeCode} className="border border-border rounded-lg overflow-hidden">
                          <div
                            className={`flex items-center justify-between px-4 py-2.5 ${
                              p.status === "critical"
                                ? "bg-red-50 border-b border-red-200"
                                : p.status === "warning"
                                  ? "bg-yellow-50 border-b border-yellow-200"
                                  : "bg-muted/40 border-b border-border"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="font-mono text-xs">
                                {p.employeeCode}
                              </Badge>
                              <span className="font-semibold text-sm">{p.employeeName}</span>
                              <StatusBadge status={p.status} />
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{days.length} dias</span>
                              <span className="font-mono font-semibold">
                                {formatMinutes(p.totalMinutes ?? 0)}h
                              </span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/20">
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                                    Data
                                  </th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                                    Registros
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                                    1ª Entrada
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                                    Última Saída
                                  </th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                                    Total
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                                    Observação
                                  </th>
                                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">
                                    Ação
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((ds) => (
                                  <tr
                                    key={ds.id}
                                    className={`border-t border-border/50 ${
                                      ds.hasIssue ? "bg-red-50/40" : "hover:bg-muted/20"
                                    }`}
                                  >
                                    <td className="px-3 py-2 font-medium">
                                      {formatDate(ds.workDate)}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span
                                        className={`font-semibold ${
                                          ds.hasIssue ? "text-red-600" : "text-foreground"
                                        }`}
                                      >
                                        {ds.recordCount ?? 0}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 font-mono">
                                      {ds.firstIn
                                        ? toUtcDate(ds.firstIn)!.toLocaleTimeString("pt-BR", {
                                            timeZone: "UTC",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : <span className="text-red-500">—</span>}
                                    </td>
                                    <td className="px-3 py-2 font-mono">
                                      {ds.lastOut
                                        ? toUtcDate(ds.lastOut)!.toLocaleTimeString("pt-BR", {
                                            timeZone: "UTC",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : <span className="text-red-500">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-center font-mono">
                                      {formatMinutes(ds.totalMinutes ?? 0)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {ds.hasIssue ? (
                                        <span className="flex items-center gap-1 text-red-600">
                                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                          {ds.issueDescription}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                                        onClick={() => {
                                          const dateStr = toUtcDate(ds.workDate)!
                                            .toISOString()
                                            .slice(0, 10);
                                          setEditTarget({
                                            employeeCode: ds.employeeCode,
                                            employeeName: p.employeeName,
                                            department: "PRODUCAO",
                                            workDate: dateStr,
                                          });
                                        }}
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Modal de edição de registros - sempre montado para evitar erro React insertBefore
           ao desmontar o componente durante invalidações de cache do tRPC */}
      <EditDayRecordsModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          utils.import.getDailySummaries.invalidate({ batchId });
          utils.import.getPayrollPeriods.invalidate({ batchId });
          utils.import.getPayrollSummary.invalidate({ batchId });
        }}
        batchId={batchId ?? 0}
        employeeCode={editTarget?.employeeCode ?? 0}
        employeeName={editTarget?.employeeName ?? ""}
        department={editTarget?.department ?? "PRODUCAO"}
        workDate={editTarget?.workDate ?? ""}
      />
    </AppLayout>
  );
}
