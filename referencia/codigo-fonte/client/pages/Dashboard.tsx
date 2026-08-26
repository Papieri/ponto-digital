import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function statusBadge(status: string) {
  if (status === "completed")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 border">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Concluído
      </Badge>
    );
  if (status === "processing")
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200 border">
        <Clock className="w-3 h-3 mr-1" />
        Processando
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 border">
      <XCircle className="w-3 h-3 mr-1" />
      Erro
    </Badge>
  );
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; filename: string } | null>(null);

  const { data: batches, isLoading } = trpc.import.list.useQuery();
  const { data: employees } = trpc.employee.list.useQuery();

  const deleteMutation = trpc.import.deleteBatch.useMutation({
    onSuccess: () => {
      toast.success("Importação excluída com sucesso.");
      utils.import.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(`Erro ao excluir: ${err.message}`);
      setDeleteTarget(null);
    },
  });

  const totalBatches = batches?.length ?? 0;
  const totalEmployees = employees?.length ?? 0;
  const completedBatches = batches?.filter((b) => b.status === "completed").length ?? 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visão geral do sistema de ponto eletrônico
            </p>
          </div>
          <Button onClick={() => navigate("/import")} className="gap-2">
            <Plus className="w-4 h-4" />
            Importar Ponto
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalBatches}</p>
                  <p className="text-sm text-muted-foreground">Importações</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-100">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{completedBatches}</p>
                  <p className="text-sm text-muted-foreground">Concluídas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-100">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalEmployees}</p>
                  <p className="text-sm text-muted-foreground">Funcionários</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-orange-100">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">15d</p>
                  <p className="text-sm text-muted-foreground">Período de fechamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Batches list */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">
              Histórico de Importações
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/import")}
              className="gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova importação
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                </div>
              </div>
            ) : !batches || batches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhuma importação realizada ainda
                </p>
                <Button size="sm" onClick={() => navigate("/import")} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Importar primeiro arquivo
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Arquivo
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Período
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                        Funcionários
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                        Registros
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate max-w-[200px]">
                              {batch.filename}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {formatDate(batch.periodStart)} — {formatDate(batch.periodEnd)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {batch.processedEmployees ?? 0}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {batch.totalRecords ?? 0}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {statusBadge(batch.status)}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/report/${batch.id}`)}
                              disabled={batch.status !== "completed"}
                            >
                              Ver relatório
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                              onClick={() =>
                                setDeleteTarget({ id: batch.id, filename: batch.filename })
                              }
                            >
                              <Trash2 className="w-4 h-4" />
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

        {/* Quick tips */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-1">Como usar o sistema</p>
                <ol className="text-blue-800 space-y-1 list-decimal list-inside">
                  <li>
                    Cadastre os funcionários com seus valores de hora e dia em{" "}
                    <button
                      className="underline font-medium"
                      onClick={() => navigate("/employees")}
                    >
                      Funcionários
                    </button>
                  </li>
                  <li>
                    Importe o arquivo TXT de registros de ponto em{" "}
                    <button
                      className="underline font-medium"
                      onClick={() => navigate("/import")}
                    >
                      Importar Ponto
                    </button>
                  </li>
                  <li>Visualize o relatório de fechamento quinzenal gerado automaticamente</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá remover permanentemente a importação{" "}
              <strong>{deleteTarget?.filename}</strong> e todos os seus registros de ponto,
              resumos diários e períodos de folha. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() =>
                deleteTarget && deleteMutation.mutate({ batchId: deleteTarget.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
