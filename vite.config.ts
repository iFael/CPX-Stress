/**
 * Configuração principal do Vite para o projeto StressFlow.
 *
 * O Vite é o bundler e servidor de desenvolvimento utilizado neste projeto.
 * Aqui configuramos os plugins (React e Electron), aliases de importação
 * e otimizações para builds de produção.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

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
      },
      preload: {
        /** Script de preload que roda antes do renderer, com acesso ao Node.js */
        input: 'electron/preload.ts',
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
