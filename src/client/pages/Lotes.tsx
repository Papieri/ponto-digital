/** Lista dos lotes importados — porta de entrada do sistema. */
import { useState } from "react";
import { Link } from "wouter";
import { Calendar, FileStack, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Lotes() {
  const utils = trpc.useUtils();
  const { data: lotes, isLoading } = trpc.import.list.useQuery();
  const { data: colaboradores } = trpc.employee.list.useQuery();
  const [removendo, setRemovendo] = useState<number | null>(null);

  const remover = trpc.import.delete.useMutation({
    onSuccess: () => {
      utils.import.list.invalidate();
      toast.success("Lote removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Lotes de importação</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Cada arquivo do relógio vira um lote, com o fechamento daquela quinzena.
          </p>
        </div>
        <Link href="/importar">
          <Button>
            <Upload className="h-4 w-4" />
            Importar ponto
          </Button>
        </Link>
      </div>

      {colaboradores?.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Nenhum colaborador cadastrado. A apuração de horas funciona, mas os valores
          saem zerados —{" "}
          <Link href="/colaboradores" className="font-medium underline">
            cadastre antes de importar
          </Link>
          .
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="h-4 w-4" />
            Lotes ({lotes?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !lotes?.length ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <FileStack className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum arquivo importado ainda.</p>
              <Link href="/importar">
                <Button size="sm">
                  <Upload className="h-4 w-4" />
                  Importar o primeiro
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Arquivo</th>
                    <th className="px-3 py-2 text-left font-medium">Período</th>
                    <th className="px-3 py-2 text-center font-medium">Registros</th>
                    <th className="px-3 py-2 text-center font-medium">Colaboradores</th>
                    <th className="px-3 py-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/relatorio/${l.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {l.filename}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="tabular flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatarData(l.periodStart)} a {formatarData(l.periodEnd)}
                        </span>
                        {!l.periodConfirmed && (
                          <Badge className="mt-1 border-amber-200 bg-amber-50 text-amber-800">
                            período não confirmado
                          </Badge>
                        )}
                      </td>
                      <td className="tabular px-3 py-2.5 text-center">{l.totalRecords}</td>
                      <td className="tabular px-3 py-2.5 text-center">
                        {l.processedEmployees}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-center gap-2">
                          <Link href={`/relatorio/${l.id}`}>
                            <Button variant="outline" size="sm">
                              Ver relatório
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => setRemovendo(l.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={removendo !== null} onOpenChange={() => setRemovendo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover lote</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apaga as batidas, os resumos diários e o fechamento deste lote. Não dá para
            desfazer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removendo !== null) remover.mutate({ batchId: removendo });
                setRemovendo(null);
              }}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
