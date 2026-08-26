/**
 * Acesso a arquivos atrás de uma interface.
 *
 * O sistema original usava o proxy de storage da plataforma Manus, espalhado
 * pelo código. Aqui existe um contrato só — `salvar`, `ler`, `apagar` — e uma
 * implementação em disco local. Trocar por storage remoto depois é escrever
 * outra implementação, não caçar `fs.writeFile` pelo projeto (CLAUDE.md).
 */

export interface ArquivoSalvo {
  /** Identificador do arquivo no storage. Vai para `import_batches.storage_key`. */
  chave: string;
  tamanho: number;
}

export interface Storage {
  salvar(chave: string, conteudo: Buffer | string): Promise<ArquivoSalvo>;
  ler(chave: string): Promise<Buffer>;
  apagar(chave: string): Promise<void>;
}

export { StorageDiscoLocal } from "./discoLocal";
