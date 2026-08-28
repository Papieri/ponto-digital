import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * A versão do frontend é decidida no momento do build e fica gravada no
 * arquivo gerado. Assim a tela sabe de qual commit ela veio, mesmo que o
 * código na pasta tenha mudado depois — que é justamente o caso a detectar.
 */
function versaoDoBuild() {
  const git = (args: string) =>
    execSync(`git ${args}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const iso = git("log -1 --format=%cI");
    const d = new Date(iso);
    return {
      commit: git("rev-parse --short HEAD") || "desconhecida",
      data: Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR"),
    };
  } catch {
    return { commit: "desconhecida", data: "" };
  }
}

export default defineConfig({
  define: {
    __VERSAO_CLIENTE__: JSON.stringify(versaoDoBuild()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src/client"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
