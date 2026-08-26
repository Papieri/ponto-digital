import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Garante que strings sem timezone sejam interpretadas como UTC
function toUtcDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  const s = date.replace(' ', 'T');
  const withZ = s.endsWith('Z') || s.includes('+') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z';
  return new Date(withZ);
}

interface EditDayRecordsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  batchId: number;
  employeeCode: number;
  employeeName: string;
  department: string;
  workDate: string; // YYYY-MM-DD
}

function formatMinutes(minutes: number | null | undefined) {
  if (!minutes) return "00:00";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function EditDayRecordsModal({
  open,
  onClose,
  onSaved,
  batchId,
  employeeCode,
  employeeName,
  department,
  workDate,
}: EditDayRecordsModalProps) {
  const [newTime, setNewTime] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: records, isLoading } = trpc.import.getDayRecords.useQuery(
    { batchId, employeeCode, workDate },
    { enabled: open }
  );

  const addMutation = trpc.import.addRecord.useMutation({
    onSuccess: () => {
      toast.success("Registro adicionado e horas recalculadas!");
      setNewTime("");
      // Primeiro atualiza apenas a lista local do modal
      utils.import.getDayRecords.invalidate({ batchId, employeeCode, workDate });
      // Depois, com um pequeno delay, notifica o ReportPage para atualizar
      // os totais — isso evita re-renders simultâneos que causam o erro insertBefore
      setTimeout(() => onSaved(), 50);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const removeMutation = trpc.import.removeRecord.useMutation({
    onSuccess: () => {
      toast.success("Registro removido e horas recalculadas!");
      setRemovingId(null);
      // Primeiro atualiza apenas a lista local do modal
      utils.import.getDayRecords.invalidate({ batchId, employeeCode, workDate });
      // Depois, com um pequeno delay, notifica o ReportPage para atualizar
      // os totais — isso evita re-renders simultâneos que causam o erro insertBefore
      setTimeout(() => onSaved(), 50);
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
      setRemovingId(null);
    },
  });

  function handleAdd() {
    if (!newTime) {
      toast.error("Informe o horário da batida.");
      return;
    }
    // O input type="time" com step="1" retorna "HH:MM:SS" ou "HH:MM"
    // Normaliza para sempre ter segundos antes de montar o ISO
    const timePart = newTime.split(":").length === 2 ? `${newTime}:00` : newTime;
    // IMPORTANTE: adicionar 'Z' para forçar UTC e evitar que o navegador
    // converta o horário para o fuso local (ex: UTC-3 no Brasil somaria 3h)
    const isoString = `${workDate}T${timePart}Z`;
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) {
      toast.error("Horário inválido.");
      return;
    }
    addMutation.mutate({
      batchId,
      employeeCode,
      employeeName,
      department,
      recordedAt: dt.toISOString(),
      workDate,
    });
  }

  function handleRemove(id: number) {
    setRemovingId(id);
    removeMutation.mutate({ recordId: id, batchId, employeeCode, workDate });
  }

  const sortedRecords = records
    ? [...records].sort(
        (a, b) => toUtcDate(a.recordedAt).getTime() - toUtcDate(b.recordedAt).getTime()
      )
    : [];

  const count = sortedRecords.length;
  const isEven = count % 2 === 0;
  const isExpected = count === 4 || count === 6;
  const isOk = isEven && isExpected;

  // Calculate total minutes from current records
  let totalMinutes = 0;
  if (isEven && count > 0) {
    for (let i = 0; i < count / 2; i++) {
      const entrada = sortedRecords[i * 2];
      const saida = sortedRecords[i * 2 + 1];
      if (entrada && saida) {
        const diff =
          toUtcDate(saida.recordedAt).getTime() -
          toUtcDate(entrada.recordedAt).getTime();
        if (diff > 0) totalMinutes += Math.floor(diff / 60000);
      }
    }
  }

  const formattedDate = new Date(workDate + "T12:00:00Z").toLocaleDateString(
    "pt-BR",
    { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" />
            Editar Registros do Dia
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{employeeName}</span>
            {" · "}
            <span className="capitalize">{formattedDate}</span>
          </div>
        </DialogHeader>

        {/* Status atual */}
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
            isOk
              ? "bg-green-50 border-green-200"
              : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <div className="flex items-center gap-2 text-sm">
            {isOk ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            )}
            <span className={isOk ? "text-green-800" : "text-yellow-800"}>
              {count} registro(s) — {isOk ? "OK" : isEven ? `${count} registros (esperado: 4 ou 6)` : "Número ímpar — batida faltando"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-mono font-semibold">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            {formatMinutes(totalMinutes)}
          </div>
        </div>

        {/* Lista de registros */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedRecords.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Nenhum registro encontrado para este dia
            </div>
          ) : (
            sortedRecords.map((rec, idx) => {
              const isEntrada = idx % 2 === 0;
              const time = toUtcDate(rec.recordedAt).toLocaleTimeString("pt-BR", {
                timeZone: "UTC",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              return (
                <div
                  key={rec.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    isEntrada
                      ? "bg-blue-50/60 border-blue-100"
                      : "bg-orange-50/60 border-orange-100"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        isEntrada
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {isEntrada ? "Entrada" : "Saída"}
                    </span>
                    <span className="font-mono text-sm font-semibold">{time}</span>
                    {rec.isManual && (
                      <Badge
                        variant="outline"
                        className="text-xs text-purple-600 border-purple-200 bg-purple-50"
                      >
                        Manual
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleRemove(rec.id)}
                    disabled={removingId === rec.id}
                  >
                    {removingId === rec.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Adicionar nova batida */}
        <div className="border-t border-border pt-4">
          <Label className="text-sm font-medium mb-2 block">
            Adicionar batida manual
          </Label>
          <div className="flex gap-2">
            <Input
              type="time"
              step="1"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="font-mono"
              placeholder="HH:MM"
            />
            <Button
              onClick={handleAdd}
              disabled={!newTime || addMutation.isPending}
              className="gap-2 shrink-0"
            >
              {addMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Os registros são ordenados automaticamente por horário. Após adicionar, as horas são recalculadas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
