/**
 * Edição das batidas de um dia. Portado de
 * `referencia/.../EditDayRecordsModal.tsx`.
 *
 * Os horários são exibidos e digitados em UTC, exatamente como estão no
 * arquivo do relógio — sem conversão de fuso em ponto nenhum (CLAUDE.md).
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatarData, formatarMinutos } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  batchId: number;
  employeeCode: number;
  employeeName: string;
  department: string;
  /** 'YYYY-MM-DD' */
  workDate: string;
}

export default function EditarBatidasDia({
  aberto,
  aoFechar,
  batchId,
  employeeCode,
  employeeName,
  department,
  workDate,
}: Props) {
  const utils = trpc.useUtils();
  const [horario, setHorario] = useState("");

  const { data: batidas, isLoading } = trpc.import.getDayRecords.useQuery(
    { batchId, employeeCode, workDate },
    { enabled: aberto }
  );

  function aoMudar() {
    utils.import.getDayRecords.invalidate({ batchId, employeeCode, workDate });
    utils.import.getDailySummaries.invalidate({ batchId });
    utils.import.getPayrollPeriods.invalidate({ batchId });
  }

  const incluir = trpc.import.addRecord.useMutation({
    onSuccess: (r) => {
      aoMudar();
      setHorario("");
      toast.success(`Batida incluída · ${formatarMinutos(r.totalMinutes)} no dia`);
    },
    onError: (e) => toast.error(e.message),
  });

  const remover = trpc.import.removeRecord.useMutation({
    onSuccess: (r) => {
      aoMudar();
      toast.success(`Batida removida · ${formatarMinutos(r.totalMinutes)} no dia`);
    },
    onError: (e) => toast.error(e.message),
  });

  const quantidade = batidas?.length ?? 0;
  const impar = quantidade % 2 !== 0;
  const ocupado = incluir.isPending || remover.isPending;

  /** Prévia local do total, com o mesmo pareamento da apuração: 1º→2º, 3º→4º. */
  const minutos = (() => {
    if (!batidas) return 0;
    const ordenadas = [...batidas]
      .map((b) => b.recordedAt)
      .sort()
      .map((s) => new Date(s.replace(" ", "T") + "Z").getTime());
    let total = 0;
    for (let i = 0; i + 1 < ordenadas.length; i += 2) {
      const diff = ordenadas[i + 1]! - ordenadas[i]!;
      if (diff > 0) total += Math.floor(diff / 60000);
    }
    return total;
  })();

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Batidas de {employeeName}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatarData(`${workDate} 12:00:00`)} · horários em UTC, como vêm do relógio
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              impar
                ? "bg-amber-50 text-amber-900"
                : quantidade === 0
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-50 text-emerald-900"
            }`}
          >
            {impar ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : quantidade === 0 ? (
              <Info className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>
              {quantidade} batida{quantidade === 1 ? "" : "s"} ·{" "}
              <strong>{formatarMinutos(minutos)}</strong>
              {impar && " · número ímpar: a última fica sem par e as horas saem a menor"}
              {quantidade === 0 && " · o dia sai do fechamento se ficar vazio"}
            </span>
          </div>

          <div className="rounded-lg border border-border">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : quantidade === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma batida neste dia.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Horário</th>
                    <th className="px-3 py-2 text-left font-medium">Par</th>
                    <th className="px-3 py-2 text-left font-medium">Origem</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {batidas!.map((b, i) => (
                    <tr key={b.id} className="border-b border-border/50 last:border-0">
                      <td className="tabular px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="tabular px-3 py-2 font-medium">
                        {b.recordedAt.slice(11, 19)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {i === quantidade - 1 && impar ? (
                          <span className="text-amber-700">sem par</span>
                        ) : i % 2 === 0 ? (
                          "entrada"
                        ) : (
                          "saída"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {b.isManual ? (
                          <Badge className="border-blue-200 bg-blue-50 text-blue-800">
                            manual
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">relógio</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          disabled={ocupado}
                          onClick={() => remover.mutate({ recordId: b.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="horario">Incluir batida (HH:MM)</Label>
              <Input
                id="horario"
                type="time"
                step="60"
                value={horario}
                className="w-40"
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
            <Button
              disabled={!horario || ocupado}
              onClick={() =>
                incluir.mutate({
                  batchId,
                  employeeCode,
                  employeeName,
                  department,
                  workDate,
                  horario,
                })
              }
            >
              {ocupado ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Incluir
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            As batidas são ordenadas por horário e pareadas em sequência: 1ª com 2ª, 3ª
            com 4ª. O campo entrada/saída do relógio é ignorado de propósito, por vir
            inconsistente.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={aoFechar}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
