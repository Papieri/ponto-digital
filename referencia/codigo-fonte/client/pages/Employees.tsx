import AppLayout from "@/components/AppLayout";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Edit2, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type EmployeeForm = {
  id?: number;
  code: string;
  name: string;
  department: string;
  hourlyRate: string;
  dailyRate: string;
  transportAllowance: string;
};

const emptyForm: EmployeeForm = {
  code: "",
  name: "",
  department: "PRODUCAO",
  hourlyRate: "0.00",
  dailyRate: "0.00",
  transportAllowance: "0.00",
};

function formatCurrency(value: string | null | undefined) {
  if (!value) return "R$ 0,00";
  return `R$ ${parseFloat(value).toFixed(2).replace(".", ",")}`;
}

export default function Employees() {
  const utils = trpc.useUtils();
  const { data: employees, isLoading } = trpc.employee.list.useQuery();
  const upsertMutation = trpc.employee.upsert.useMutation({
    onSuccess: () => {
      utils.employee.list.invalidate();
      setDialogOpen(false);
      setForm(emptyForm);
      toast.success("Funcionário salvo com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });
  const deleteMutation = trpc.employee.delete.useMutation({
    onSuccess: () => {
      utils.employee.list.invalidate();
      toast.success("Funcionário removido.");
    },
    onError: (err) => toast.error(`Erro ao remover: ${err.message}`),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  function openNew() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(emp: NonNullable<typeof employees>[0]) {
    setForm({
      id: emp.id,
      code: String(emp.code),
      name: emp.name,
      department: emp.department ?? "PRODUCAO",
      hourlyRate: emp.hourlyRate,
      dailyRate: emp.dailyRate,
      transportAllowance: emp.transportAllowance ?? "0.00",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    const code = parseInt(form.code, 10);
    if (isNaN(code) || code <= 0) {
      toast.error("Código inválido.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    upsertMutation.mutate({
      code,
      name: form.name.trim(),
      department: form.department,
      hourlyRate: parseFloat(form.hourlyRate || "0").toFixed(2),
      dailyRate: parseFloat(form.dailyRate || "0").toFixed(2),
      transportAllowance: parseFloat(form.transportAllowance || "0").toFixed(2),
      active: true,
    });
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Funcionários</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cadastro e configuração de valores por colaborador
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo funcionário
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Lista de Funcionários ({employees?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !employees || employees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <Users className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Nenhum funcionário cadastrado
                </p>
                <Button size="sm" onClick={openNew} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Cadastrar primeiro funcionário
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Código
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Nome
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">
                        Departamento
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                        Valor/Hora
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                        Valor/Dia
                      </th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                        Passagem/Dia
                      </th>
                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <Badge variant="outline" className="font-mono">
                            {emp.code}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 font-medium">{emp.name}</td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {emp.department}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatCurrency(emp.hourlyRate)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatCurrency(emp.dailyRate)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {parseFloat(emp.transportAllowance ?? "0") > 0
                            ? formatCurrency(emp.transportAllowance)
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(emp)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(emp.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar Funcionário" : "Novo Funcionário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  type="number"
                  placeholder="Ex: 15"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!form.id}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept">Departamento</Label>
                <Input
                  id="dept"
                  placeholder="PRODUCAO"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo *</Label>
              <Input
                id="name"
                placeholder="Nome do funcionário"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hourly">Valor/Hora (R$)</Label>
                <Input
                  id="hourly"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daily">Valor/Dia (R$)</Label>
                <Input
                  id="daily"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.dailyRate}
                  onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transport">Passagem/Dia (R$)</Label>
                <Input
                  id="transport"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.transportAllowance}
                  onChange={(e) =>
                    setForm({ ...form, transportAllowance: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar remoção</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja remover este funcionário? Esta ação não pode ser
            desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm !== null) {
                  deleteMutation.mutate({ id: deleteConfirm });
                  setDeleteConfirm(null);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
