/**
 * =============================================================================
 *  StressFlow - Declaracoes de Ambiente (Environment Declarations)
 * =============================================================================
 *
 *  O QUE FAZ ESTE ARQUIVO?
 *  ------------------------
 *  Este arquivo fornece declaracoes de tipo para o TypeScript entender:
 *  1. As variaveis de ambiente disponibilizadas pelo Vite (import.meta.env)
 *  2. A API global `window.stressflow` exposta pelo preload do Electron
 *  3. Tipos para modulos de assets (imagens, estilos, etc.)
 *
 *  POR QUE E NECESSARIO?
 *  ----------------------
 *  O TypeScript precisa saber quais propriedades existem em objetos globais
 *  como `import.meta.env` e `window`. Sem estas declaracoes, o compilador
 *  acusaria erros ao tentar acessar essas propriedades.
 *
 *  IMPORTANTE:
 *  -----------
 *  A tipagem completa de `window.stressflow` esta definida em `src/types/index.ts`
 *  usando `declare global`. Este arquivo complementa aquela declaracao com os
 *  tipos de ambiente especificos do Vite e dos modulos de assets.
 *
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Referencia aos tipos built-in do Vite
// -----------------------------------------------------------------------------
// Esta diretiva carrega as declaracoes de tipo padrao do Vite, que incluem:
// - Tipos para import.meta.env (variaveis de ambiente basicas)
// - Tipos para import.meta.hot (Hot Module Replacement)
// - Tipos para modulos de assets comuns (.css, .svg, .png, etc.)
// -----------------------------------------------------------------------------
/// <reference types="vite/client" />

// -----------------------------------------------------------------------------
// Variaveis de ambiente do Vite (import.meta.env)
// -----------------------------------------------------------------------------
// Todas as variaveis de ambiente personalizadas devem comecar com o prefixo
// VITE_ para serem expostas ao codigo do lado do cliente (renderer).
// Variaveis sem o prefixo VITE_ so ficam disponiveis no lado do servidor.
//
// Para adicionar uma nova variavel de ambiente:
// 1. Crie um arquivo .env na raiz do projeto (ex: VITE_API_URL=http://...)
// 2. Adicione a declaracao de tipo aqui em ImportMetaEnv
// 3. Acesse no codigo via import.meta.env.VITE_API_URL
// -----------------------------------------------------------------------------

/**
 * Declaracao das variaveis de ambiente personalizadas do Vite.
 * Estende a interface base do Vite para incluir variaveis especificas do projeto.
 */
interface ImportMetaEnv {
  /** Indica se a aplicacao esta rodando em modo de desenvolvimento */
  readonly DEV: boolean
  /** Indica se a aplicacao esta rodando em modo de producao */
  readonly PROD: boolean
  /** O modo atual do Vite (ex: 'development', 'production') */
  readonly MODE: string
  /** A URL base configurada no vite.config.ts */
  readonly BASE_URL: string
  /** Indica se a aplicacao esta sendo servida em modo SSR (Server-Side Rendering) */
  readonly SSR: boolean

  // -------------------------------------------------------------------------
  // Variaveis customizadas do projeto (prefixo VITE_)
  // -------------------------------------------------------------------------
  // Adicione aqui novas variaveis de ambiente conforme necessario.
  // Exemplo:
  //   readonly VITE_API_URL: string
  //   readonly VITE_ANALYTICS_ID: string
  // -------------------------------------------------------------------------
}

/**
 * Estende o tipo ImportMeta do TypeScript para incluir o `env` tipado do Vite.
 * Isso permite que `import.meta.env` tenha autocompletar e verificacao de tipos.
 */
interface ImportMeta {
  readonly env: ImportMetaEnv
}

// -----------------------------------------------------------------------------
// Declaracoes de modulos de assets
// -----------------------------------------------------------------------------
// Estas declaracoes permitem importar arquivos de assets diretamente no
// TypeScript sem erros de compilacao. O Vite ja fornece algumas dessas
// declaracoes via `vite/client`, mas podemos estender para tipos adicionais
// especificos do projeto.
// -----------------------------------------------------------------------------

/** Permite importar arquivos SVG como modulos (retorna a URL do asset) */
declare module '*.svg' {
  const content: string
  export default content
}

/** Permite importar imagens PNG (retorna a URL do asset) */
declare module '*.png' {
  const content: string
  export default content
}

/** Permite importar imagens JPG/JPEG (retorna a URL do asset) */
declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.jpeg' {
  const content: string
  export default content
}

/** Permite importar imagens WebP (retorna a URL do asset) */
declare module '*.webp' {
  const content: string
  export default content
}

/** Permite importar imagens GIF (retorna a URL do asset) */
declare module '*.gif' {
  const content: string
  export default content
}

/** Permite importar icones ICO (retorna a URL do asset) */
declare module '*.ico' {
  const content: string
  export default content
}

/** Permite importar fontes WOFF (retorna a URL do asset) */
declare module '*.woff' {
  const content: string
  export default content
}

/** Permite importar fontes WOFF2 (retorna a URL do asset) */
declare module '*.woff2' {
  const content: string
  export default content
}
