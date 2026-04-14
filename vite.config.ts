/**
 * Configuração principal do Vite para o projeto StressFlow.
 *
 * O Vite é o bundler e servidor de desenvolvimento utilizado neste projeto.
 * Aqui configuramos os plugins (React e Electron), aliases de importação
 * e otimizações para builds de produção.
 */

import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { treeKillSync } from "vite-plugin-electron";
import path from 'node:path'

type ElectronStartArgs = {
  startup: () => Promise<void>;
  reload: () => void;
};

const require = createRequire(import.meta.url);
const electronBinary = require("electron") as string;
let electronProcess: ChildProcess | null = null;

function isElectronRunning(): boolean {
  return !!electronProcess && electronProcess.exitCode === null && !electronProcess.killed;
}

function stopElectronApp(): void {
  if (!electronProcess?.pid) return;

  electronProcess.removeAllListeners();

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(electronProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      treeKillSync(electronProcess.pid);
    } catch {
      // Ignora race conditions em que o Electron já saiu por conta própria.
    }
  }

  electronProcess = null;
}

async function safeStartup(): Promise<void> {
  stopElectronApp();

  const child = spawn(electronBinary, [".", "--no-sandbox"], {
    stdio: "inherit",
    env: process.env,
  });

  child.once("exit", () => {
    if (electronProcess?.pid === child.pid) {
      electronProcess = null;
    }
  });

  electronProcess = child;
}

async function handleMainStart(_args: ElectronStartArgs): Promise<void> {
  await safeStartup();
}

async function handlePreloadStart({
  reload,
}: ElectronStartArgs): Promise<void> {
  if (isElectronRunning()) {
    reload();
    return;
  }

  await safeStartup();
}

export default defineConfig({
  /**
   * Plugins utilizados pelo Vite.
   * - react(): Habilita suporte ao React com Fast Refresh (HMR instantâneo).
   * - electron(): Integra o Vite com o Electron, configurando o processo
   *   principal (main), o preload e o renderer.
   */
  plugins: [
    react(),
    electron({
      main: {
        /** Ponto de entrada do processo principal do Electron */
        entry: 'electron/main.ts',
        onstart: handleMainStart,
        /**
         * Módulos nativos (*.node) não podem ser empacotados pelo Rollup.
         * better-sqlite3 usa bindings dinâmicos para carregar o binário nativo,
         * por isso deve ser marcado como externo e resolvido pelo Node.js em runtime.
         */
        vite: {
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        /** Script de preload que roda antes do renderer, com acesso ao Node.js */
        input: 'electron/preload.ts',
        onstart: handlePreloadStart,
      },
      /** Configuração do processo renderer (utiliza as configurações padrão do Vite) */
      renderer: {},
    }),
  ],

  /**
   * Configuração de resolução de módulos.
   * O alias '@' aponta para a pasta 'src', permitindo importações mais limpas.
   * Exemplo: import { Component } from '@/components/Component'
   */
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  /**
   * Otimizações para o build de produção.
   * Configura o Rollup (bundler interno do Vite) para gerar chunks otimizados,
   * separando dependências de terceiros do código da aplicação.
   */
  build: {
    /** Gera sourcemaps para facilitar depuração em produção */
    sourcemap: false,

    /** Tamanho mínimo (em bytes) para criar um chunk separado via compressão */
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        /**
         * Estratégia de divisão de chunks (code splitting).
         * Separa bibliotecas grandes em arquivos próprios para melhor cache
         * e carregamento paralelo no navegador.
         */
        manualChunks: {
          /** Bibliotecas React são agrupadas em um chunk separado */
          'vendor-react': ['react', 'react-dom'],

          /** Biblioteca de gráficos (Recharts) em chunk próprio por ser pesada */
          'vendor-charts': ['recharts'],

          /** Bibliotecas de geração de PDF agrupadas juntas */
          'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html-to-image'],
        },
      },
    },

    /** Reduz o tamanho final do bundle removendo console.log e debugger em produção */
    minify: 'esbuild',
  },

  /**
   * Configuração do servidor de desenvolvimento.
   * Define a porta padrão e o comportamento ao iniciar.
   */
  server: {
    /** Porta do servidor de desenvolvimento */
    port: 5173,

    /** Abre automaticamente o navegador apenas quando NÃO estiver em modo Electron */
    open: false,

    /** Habilita Hot Module Replacement para atualizações instantâneas */
    hmr: true,
  },
})
