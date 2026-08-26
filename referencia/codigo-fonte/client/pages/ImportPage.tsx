import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type UploadState = "idle" | "reading" | "uploading" | "success" | "error";

export default function ImportPage() {
  const [, navigate] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [result, setResult] = useState<{
    batchId: number;
    totalRecords: number;
    processedEmployees: number;
    periodStart: string;
    periodEnd: string;
    criticalCount: number;
    warningCount: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processMutation = trpc.import.process.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setUploadState("success");
      toast.success("Arquivo processado com sucesso!");
    },
    onError: (err) => {
      setUploadState("error");
      toast.error(`Erro ao processar: ${err.message}`);
    },
  });

  const readFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".txt")) {
      toast.error("Apenas arquivos .TXT são aceitos.");
      return;
    }
    setFile(f);
    setUploadState("reading");
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      setUploadState("idle");
    };
    reader.onerror = () => {
      toast.error("Erro ao ler o arquivo.");
      setUploadState("error");
    };
    reader.readAsText(f, "latin1");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) readFile(f);
    },
    [readFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) readFile(f);
    },
    [readFile]
  );

  function handleProcess() {
    if (!file || !fileContent) return;
    setUploadState("uploading");
    processMutation.mutate({
      filename: file.name,
      content: fileContent,
      isBase64: false,
    });
  }

  function handleReset() {
    setFile(null);
    setFileContent(null);
    setUploadState("idle");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Preview: count lines and detect period
  const previewLines = fileContent ? fileContent.split("\n").filter((l) => l.trim()) : [];
  const dataLines = previewLines.filter((l) => {
    const p = l.split("\t");
    return p.length >= 4 && !isNaN(parseInt(p[0] ?? "", 10));
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Importar Ponto</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Importe o arquivo TXT de registros de ponto para processamento
          </p>
        </div>

        {uploadState !== "success" ? (
          <>
            {/* Drop zone */}
            <Card>
              <CardContent className="pt-6">
                <div
                  className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : file
                        ? "border-green-400 bg-green-50"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => !file && inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".txt"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  {file ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-100">
                        <FileText className="w-7 h-7 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{file.name}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {(file.size / 1024).toFixed(1)} KB •{" "}
                          {dataLines.length} registros detectados
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReset();
                        }}
                        className="text-muted-foreground gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Remover arquivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
                        <Upload className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          Arraste o arquivo aqui ou clique para selecionar
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Apenas arquivos .TXT de registro de ponto
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            {fileContent && dataLines.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Pré-visualização
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-muted/50 border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-48">
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              Cód.
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              Nome
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              Departamento
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              Data/Hora
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataLines.slice(0, 20).map((line, i) => {
                            const parts = line.split("\t").map((p) => p.trim());
                            return (
                              <tr
                                key={i}
                                className="border-t border-border/50 hover:bg-muted/30"
                              >
                                <td className="px-3 py-1.5">{parts[0]}</td>
                                <td className="px-3 py-1.5">{parts[1]}</td>
                                <td className="px-3 py-1.5">{parts[2]}</td>
                                <td className="px-3 py-1.5">{parts[3]}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {dataLines.length > 20 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
                        ... e mais {dataLines.length - 20} registros
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Format info */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Formato esperado do arquivo</p>
                    <p className="font-mono text-xs bg-blue-100 rounded px-2 py-1 mb-2">
                      ID &nbsp; Nome &nbsp; Departamento &nbsp; DD.MM.AAAA &nbsp;
                      HH:MM:SS &nbsp; Máquina
                    </p>
                    <p>
                      O sistema reconhece automaticamente o padrão de{" "}
                      <strong>4 registros por dia</strong> (entrada, saída almoço,
                      retorno almoço, saída) e exceções com{" "}
                      <strong>6 registros</strong> (pausas adicionais).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action */}
            <div className="flex gap-3">
              <Button
                onClick={handleProcess}
                disabled={!file || !fileContent || uploadState === "uploading"}
                className="gap-2"
              >
                {uploadState === "uploading" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Processar arquivo
                  </>
                )}
              </Button>
              {file && (
                <Button variant="outline" onClick={handleReset}>
                  Cancelar
                </Button>
              )}
            </div>
          </>
        ) : (
          /* Success state */
          result && (
            <Card className="border-green-200">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      Arquivo processado com sucesso!
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Período:{" "}
                      {new Date(result.periodStart).toLocaleDateString("pt-BR")} a{" "}
                      {new Date(result.periodEnd).toLocaleDateString("pt-BR")}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-lg">
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-2xl font-semibold">{result.totalRecords}</p>
                      <p className="text-xs text-muted-foreground">Registros</p>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-2xl font-semibold">
                        {result.processedEmployees}
                      </p>
                      <p className="text-xs text-muted-foreground">Funcionários</p>
                    </div>
                    <div
                      className={`rounded-lg p-3 ${result.criticalCount > 0 ? "bg-red-50" : "bg-green-50"}`}
                    >
                      <p
                        className={`text-2xl font-semibold ${result.criticalCount > 0 ? "text-red-700" : "text-green-700"}`}
                      >
                        {result.criticalCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Críticos</p>
                    </div>
                    <div
                      className={`rounded-lg p-3 ${result.warningCount > 0 ? "bg-yellow-50" : "bg-green-50"}`}
                    >
                      <p
                        className={`text-2xl font-semibold ${result.warningCount > 0 ? "text-yellow-700" : "text-green-700"}`}
                      >
                        {result.warningCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Avisos</p>
                    </div>
                  </div>

                  {(result.criticalCount > 0 || result.warningCount > 0) && (
                    <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      Foram encontrados registros incompletos. Verifique o relatório.
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button onClick={() => navigate(`/report/${result.batchId}`)}>
                      Ver relatório de fechamento
                    </Button>
                    <Button variant="outline" onClick={handleReset}>
                      Importar outro arquivo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </AppLayout>
  );
}
