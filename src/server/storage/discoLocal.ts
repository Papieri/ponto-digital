/**
 * Implementação de `Storage` em disco local. O caminho vem de UPLOAD_DIR.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArquivoSalvo, Storage } from "./index";

export class StorageDiscoLocal implements Storage {
  private readonly raiz: string;

  constructor(raiz = process.env.UPLOAD_DIR ?? "./uploads") {
    this.raiz = path.resolve(raiz);
  }

  /**
   * Resolve a chave dentro da raiz, recusando qualquer coisa que escape dela.
   * A chave vem do nome do arquivo enviado pelo operador — não é confiável.
   */
  private caminho(chave: string): string {
    const destino = path.resolve(this.raiz, chave);
    const raizComBarra = this.raiz.endsWith(path.sep) ? this.raiz : this.raiz + path.sep;
    if (destino !== this.raiz && !destino.startsWith(raizComBarra)) {
      throw new Error(`Chave de storage inválida: ${chave}`);
    }
    return destino;
  }

  async salvar(chave: string, conteudo: Buffer | string): Promise<ArquivoSalvo> {
    const destino = this.caminho(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    const buffer = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, "utf-8");
    await writeFile(destino, buffer);
    return { chave, tamanho: buffer.byteLength };
  }

  async ler(chave: string): Promise<Buffer> {
    return readFile(this.caminho(chave));
  }

  async apagar(chave: string): Promise<void> {
    await rm(this.caminho(chave), { force: true });
  }
}
