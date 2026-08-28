/**
 * Identificação da versão em execução.
 *
 * Serve para responder "estou rodando a versão atual?" sem depender de o
 * operador lembrar de conferir no terminal. O servidor lê o commit uma vez, ao
 * iniciar; o frontend carrega o commit que foi gravado nele durante o build.
 * Se os dois divergirem, é porque falta reconstruir as telas ou reiniciar o
 * programa — que é o engano mais fácil de cometer neste projeto.
 */
import { execSync } from "node:child_process";

/**
 * Lê o commit em duas chamadas separadas, de propósito.
 *
 * A tentativa anterior usava `--format=%h|%cd` numa chamada só: o shell trata o
 * `|` como pipe e o comando quebra em silêncio, devolvendo "desconhecida" para
 * todo mundo. A data vem em ISO e é formatada aqui — `--date=format:%d/%m/%Y`
 * teria o mesmo problema no Windows, onde `%` inicia variável no cmd.
 */
function git(args: string, cwd?: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000,
  }).trim();
}

function dataBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}


export interface Versao {
  /** Commit abreviado, ou "desconhecida" quando não há git na pasta. */
  commit: string;
  /** Data do commit no formato DD/MM/AAAA, vazia quando desconhecida. */
  data: string;
}

export function lerVersaoDoGit(): Versao {
  const raiz = new URL("../..", import.meta.url).pathname;
  try {
    return {
      commit: git("rev-parse --short HEAD", raiz) || "desconhecida",
      data: dataBr(git("log -1 --format=%cI", raiz)),
    };
  } catch {
    // Pasta baixada em ZIP não tem git — sem drama, só não dá para comparar.
    return { commit: "desconhecida", data: "" };
  }
}

/** Lida uma vez, na subida do servidor. */
export const VERSAO_SERVIDOR = lerVersaoDoGit();
