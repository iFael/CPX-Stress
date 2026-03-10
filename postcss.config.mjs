/**
 * postcss.config.mjs - Configuração do PostCSS para o projeto StressFlow.
 *
 * O PostCSS é um processador de CSS que transforma estilos através de plugins.
 * Neste projeto, ele é responsável por:
 * 1. Processar as diretivas do Tailwind CSS (@tailwind, @apply, etc.)
 * 2. Adicionar prefixos de navegador automaticamente (autoprefixer)
 *
 * Este arquivo é lido automaticamente pelo Vite durante o build e o dev server.
 */
export default {
  plugins: {
    /**
     * Tailwind CSS - Framework de CSS utilitário.
     * Processa as classes utilitárias (ex: bg-blue-500, p-4, flex)
     * e as diretivas (@tailwind base, @tailwind components, @tailwind utilities).
     * Em produção, remove automaticamente classes CSS não utilizadas (purge/tree-shaking).
     */
    tailwindcss: {},

    /**
     * Autoprefixer - Adiciona prefixos de navegador automaticamente.
     * Transforma propriedades CSS modernas para garantir compatibilidade
     * com navegadores mais antigos.
     * Exemplo: display: flex -> display: -webkit-flex; display: flex;
     *
     * Os navegadores alvo são definidos pelo campo "browserslist" no package.json
     * ou pelo arquivo .browserslistrc (se existir).
     */
    autoprefixer: {},
  },
}
