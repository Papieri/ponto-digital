/**
 * Cadastro de colaboradores. Portado de `referencia/.../Employees.tsx`.
 *
 * Valor/hora, valor/dia e passagem são INDIVIDUAIS por pessoa. Nos dados atuais
 * o valor/hora equivale à diária dividida por 9, mas isso é coincidência de
 * configuração — os campos são independentes de propósito (CLAUDE.md).
 */
import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatarReais } from "@/lib/utils";
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
import { Input, Label } from "@/components/ui/input";

interface Formulario {
  id?: number;
  code: string;
  name: string;
  department: string;
  hourlyRate: string;
  dailyRate: string;
  transportAllowance: string;
}

const formularioVazio: Formulario = {
  code: "",
  name: "",
  department: "PRODUCAO",
  hourlyRate: "0.00",
  dailyRate: "0.00",
  transportAllowance: "0.00",
};

export default function Colaboradores() {
  const utils = trpc.useUtils();
  const { data: colaboradores, isLoading } = trpc.employee.list.useQuery();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Formulario>(formularioVazio);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const salvar = trpc.employee.upsert.useMutation({
    onSuccess: () => {
      utils.employee.list.invalidate();
      setAberto(false);
      toast.success("Colaborador salvo.");
    },
    onError: (e) => toast.error(e.message),
  });

  const remover = trpc.employee.delete.useMutation({
    onSuccess: () => {
      utils.employee.list.invalidate();
      toast.success("Colaborador removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  function novo() {
    setForm(formularioVazio);
    setAberto(true);
  }

  function editar(c: NonNullable<typeof colaboradores>[number]) {
    setForm({
      id: c.id,
      code: String(c.code),
      name: c.name,
      department: c.department ?? "PRODUCAO",
      hourlyRate: c.hourlyRate,
      dailyRate: c.dailyRate,
      transportAllowance: c.transportAllowance ?? "0.00",
    });
    setAberto(true);
  }

  function confirmar() {
    const code = parseInt(form.code, 10);
    if (!Number.isInteger(code) || code <= 0) return toast.error("Código inválido.");
    if (!form.name.trim()) return toast.error("O nome é obrigatório.");

    const decimal = (v: string) => {
      const n = parseFloat((v || "0").replace(",", "."));
      return (Number.isFinite(n) ? n : 0).toFixed(2);
    };

    salvar.mutate({
      code,
      name: form.name.trim(),
      department: form.department.trim() || "PRODUCAO",
      hourlyRate: decimal(form.hourlyRate),
      dailyRate: decimal(form.dailyRate),
      transportAllowance: decimal(form.transportAllowance),
      active: true,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Colaboradores</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O código precisa ser o mesmo do campo "Tra. No." do arquivo do relógio.
          </p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" />
          Novo colaborador
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Cadastro ({colaboradores?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !colaboradores?.length ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum colaborador cadastrado. Sem cadastro, a apuração roda mas os
                valores saem zerados.
              </p>
              <Button size="sm" onClick={novo}>
                <Plus className="h-4 w-4" />
                Cadastrar o primeiro
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Código</th>
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Departamento</th>
                    <th className="px-3 py-2 text-right font-medium">Valor/Hora</th>
                    <th className="px-3 py-2 text-right font-medium">Valor/Dia</th>
                    <th className="px-3 py-2 text-right font-medium">Passagem/Dia</th>
                    <th className="px-3 py-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradores.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <Badge className="tabular border-border">{c.code}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.department}</td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {formatarReais(c.hourlyRate)}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-muted-foreground">
                        {formatarReais(c.dailyRate)}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {parseFloat(c.transportAllowance ?? "0") > 0 ? (
                          formatarReais(c.transportAllowance)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => editar(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => setRemovendo(c.id)}
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

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  type="number"
                  placeholder="Ex.: 3"
                  value={form.code}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dept">Departamento</Label>
                <Input
                  id="dept"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hora">Valor/Hora</Label>
                <Input
                  id="hora"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dia">Valor/Dia</Label>
                <Input
                  id="dia"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.dailyRate}
                  onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passagem">Passagem/Dia</Label>
                <Input
                  id="passagem"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.transportAllowance}
                  onChange={(e) =>
                    setForm({ ...form, transportAllowance: e.target.value })
                  }
                />
              </div>
            </div>

            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              O Valor/Dia entra no relatório apenas como referência — não é somado ao
              valor a pagar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removendo !== null} onOpenChange={() => setRemovendo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover colaborador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ele sai do cadastro, mas os lotes já apurados continuam intactos.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removendo !== null) remover.mutate({ id: removendo });
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
