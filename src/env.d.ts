/**
 * =============================================================================
 *  StressFlow - Declaracoes de Ambiente (Environment Declarations)
 * =============================================================================
 *
 *  O QUE FAZ ESTE ARQUIVO?
 *  ------------------------
 *  Este arquivo fornece declaracoes de tipo para o TypeScript entender:
 *  1. As variáveis de ambiente disponibilizadas pelo Vite (import.meta.env)
 *  2. A API global `window.stressflow` exposta pelo preload do Electron
 *  3. Tipos para módulos de assets (imagens, estilos, etc.)
 *
 *  POR QUE E NECESSÁRIO?
 *  ----------------------
 *  O TypeScript precisa saber quais propriedades existem em objetos globais
 *  como `import.meta.env` e `window`. Sem estas declaracoes, o compilador
 *  acusaria erros ao tentar acessar essas propriedades.
 *
 *  IMPORTANTE:
 *  -----------
 *  A tipagem completa de `window.stressflow` esta definida em `src/types/index.ts`
 *  usando `declare global`. Este arquivo complementa aquela declaração com os
 *  tipos de ambiente específicos do Vite e dos módulos de assets.
 *
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// Referência aos tipos built-in do Vite
// -----------------------------------------------------------------------------
// Esta diretiva carrega as declaracoes de tipo padrão do Vite, que incluem:
// - Tipos para import.meta.env (variáveis de ambiente basicas)
// - Tipos para import.meta.hot (Hot Module Replacement)
// - Tipos para módulos de assets comuns (.css, .svg, .png, etc.)
// -----------------------------------------------------------------------------
/// <reference types="vite/client" />

// -----------------------------------------------------------------------------
// Variáveis de ambiente do Vite (import.meta.env)
// -----------------------------------------------------------------------------
// Todas as variáveis de ambiente personalizadas devem comecar com o prefixo
// VITE_ para serem expostas ao código do lado do cliente (renderer).
// Variáveis sem o prefixo VITE_ so ficam disponiveis no lado do servidor.
//
// Para adicionar uma nova variável de ambiente:
// 1. Crie um arquivo .env na raiz do projeto (ex: VITE_API_URL=http://...)
// 2. Adicione a declaração de tipo aqui em ImportMetaEnv
// 3. Acesse no código via import.meta.env.VITE_API_URL
// -----------------------------------------------------------------------------

/**
 * Declaração das variáveis de ambiente personalizadas do Vite.
 * Estende a interface base do Vite para incluir variáveis especificas do projeto.
 */
interface ImportMetaEnv {
  /** Indica se a aplicação esta rodando em modo de desenvolvimento */
  readonly DEV: boolean;
  /** Indica se a aplicação esta rodando em modo de produção */
  readonly PROD: boolean;
  /** O modo atual do Vite (ex: 'development', 'production') */
  readonly MODE: string;
  /** A URL base configurada no vite.config.ts */
  readonly BASE_URL: string;
  /** Indica se a aplicação esta sendo servida em modo SSR (Server-Side Rendering) */
  readonly SSR: boolean;

  // -------------------------------------------------------------------------
  // Variáveis customizadas do projeto (prefixo VITE_)
  // -------------------------------------------------------------------------
  // Adicione aqui novas variáveis de ambiente conforme necessário.
  // Exemplo:
  //   readonly VITE_API_URL: string
  //   readonly VITE_ANALYTICS_ID: string
  // -------------------------------------------------------------------------
}

/**
 * Estende o tipo ImportMeta do TypeScript para incluir o `env` tipado do Vite.
 * Isso permite que `import.meta.env` tenha autocompletar e verificação de tipos.
 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// -----------------------------------------------------------------------------
// Declaracoes de módulos de assets
// -----------------------------------------------------------------------------
// Estas declaracoes permitem importar arquivos de assets diretamente no
// TypeScript sem erros de compilacao. O Vite ja fornece algumas dessas
// declaracoes via `vite/client`, mas podemos estender para tipos adicionais
// específicos do projeto.
// -----------------------------------------------------------------------------

/** Permite importar arquivos SVG como módulos (retorna a URL do asset) */
declare module "*.svg" {
  const content: string;
  export default content;
}

/** Permite importar imagens PNG (retorna a URL do asset) */
declare module "*.png" {
  const content: string;
  export default content;
}

/** Permite importar imagens JPG/JPEG (retorna a URL do asset) */
declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.jpeg" {
  const content: string;
  export default content;
}

/** Permite importar imagens WebP (retorna a URL do asset) */
declare module "*.webp" {
  const content: string;
  export default content;
}

/** Permite importar imagens GIF (retorna a URL do asset) */
declare module "*.gif" {
  const content: string;
  export default content;
}

/** Permite importar icones ICO (retorna a URL do asset) */
declare module "*.ico" {
  const content: string;
  export default content;
}

/** Permite importar fontes WOFF (retorna a URL do asset) */
declare module "*.woff" {
  const content: string;
  export default content;
}

/** Permite importar fontes WOFF2 (retorna a URL do asset) */
declare module "*.woff2" {
  const content: string;
  export default content;
}
