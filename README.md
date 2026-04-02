<p align="center">
  <br />
  <br />

```
   _______ __                        _______ __
  |   _   |  |_.----.-----.-----.---|   _   |  .-----.--.--.---.
  |   |___|   _|   _|  -__|__ --|__ |   |___|  |  _  |  |  |  |
  |____   |____|__| |_____|_____|___|___|   |__|_____|________|
  |:  |   |                                   Teste de Estresse
  |::.. . |                                       Profissional
  `-------'
```

  <br />
  <strong>Ferramenta desktop profissional para testes de estresse e carga HTTP</strong>
  <br />
  Descubra se o seu site aguenta muitos visitantes ao mesmo tempo.
  <br />
  <br />

![Electron](https://img.shields.io/badge/Electron-28-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/Licen%C3%A7a-MIT-green?style=for-the-badge)

</p>

---

## Indice

- [O que e o StressFlow?](#o-que-e-o-stressflow)
- [Screenshots](#screenshots)
- [Funcionalidades](#funcionalidades)
- [Instalacao](#instalacao)
- [Como Usar](#como-usar)
- [Build para Producao](#build-para-producao)
- [Stack Tecnologica](#stack-tecnologica)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Contribuindo](#contribuindo)
- [Licenca](#licenca)

---

## O que e o StressFlow?

O **StressFlow** e um aplicativo desktop que testa se o seu site, API ou servidor aguenta receber muitos acessos ao mesmo tempo. Ele simula centenas ou milhares de visitantes virtuais acessando o seu endereco web simultaneamente e mostra, em tempo real, como o servidor se comporta sob pressao.

Em termos simples: imagine que voce tem uma loja virtual e quer saber se ela vai travar na Black Friday. O StressFlow simula esse cenario para voce antes que aconteca de verdade.

**Para quem e?**

- **Desenvolvedores** que querem validar a performance de suas aplicacoes
- **Equipes de QA** que precisam garantir estabilidade antes de um lancamento
- **Administradores de sistemas** que querem descobrir o limite dos seus servidores
- **Donos de sites** que querem ter tranquilidade em datas de pico

---

## Screenshots

> As imagens abaixo ilustram as principais telas do aplicativo.

| Tela                                                           | Descricao                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ![Configuracao do Teste](docs/screenshots/test-config.png)     | **Configuracao do Teste** -- Escolha a URL, a intensidade e inicie o teste com um clique.           |
| ![Progresso em Tempo Real](docs/screenshots/test-progress.png) | **Progresso em Tempo Real** -- Acompanhe metricas como RPS, latencia e erros enquanto o teste roda. |
| ![Resultados](docs/screenshots/test-results.png)               | **Resultados Detalhados** -- Graficos, score de saude, distribuicao de latencia e recomendacoes.    |
| ![Historico](docs/screenshots/history-panel.png)               | **Historico de Testes** -- Busque, filtre e revisit resultados anteriores.                          |

> **Nota:** Se as imagens nao estiverem disponiveis, execute o aplicativo para visualizar as telas.

---

## Funcionalidades

### Teste de Estresse Simples e Intuitivo

Basta colar a URL do site, escolher a intensidade e clicar em "Iniciar Teste". O StressFlow cuida de todo o resto. Perfis pre-configurados facilitam a escolha:

| Perfil   | Usuarios Simultaneos | Duracao | Ideal para                            |
| -------- | -------------------- | ------- | ------------------------------------- |
| Leve     | 10                   | 15s     | Blogs e sites pessoais                |
| Moderado | 100                  | 30s     | E-commerces e portais                 |
| Pesado   | 500                  | 60s     | Aplicacoes com alto trafego           |
| Extremo  | 2.000                | 120s    | Descobrir o limite maximo do servidor |

### Monitoramento em Tempo Real

Enquanto o teste roda, voce acompanha segundo a segundo:

- **Requests por segundo (RPS)** -- quantas requisicoes o servidor esta processando
- **Latencia** -- quanto tempo o servidor demora para responder
- **Taxa de erros** -- quantas requisicoes estao falhando
- **Usuarios ativos** -- quantos visitantes virtuais estao conectados

### Confiabilidade da Medicao

O StressFlow agora separa duas leituras diferentes:

- **Saude do alvo** -- como o servidor reagiu a carga aplicada
- **Confiabilidade da medicao** -- se o proprio StressFlow permaneceu estavel durante o teste

Isso e importante porque, em cargas extremas, o gerador de carga tambem pode saturar. Quando isso acontece, a interface mostra avisos como:

- **Percentis globais aproximados** -- quando o teste usa reservoir sampling
- **Medicao degradada** -- quando o gerador continua util, mas ja com sinais de oscilacao
- **Gerador saturado** -- quando a carga extrema pode estar contaminando fortemente o resultado

### Score de Saude do Site

Ao final do teste, o StressFlow calcula uma nota de 0 a 100 que resume a performance do servidor. A nota considera taxa de erros, tempo de resposta, throughput e estabilidade. Facil de entender: verde e bom, vermelho e critico.

### Deteccao Automatica de Protecoes

O StressFlow identifica automaticamente se o site possui sistemas de protecao que podem interferir nos resultados:

- **WAF** (Firewall de aplicacao web) -- Cloudflare, AWS WAF, Imperva, etc.
- **CDN** -- CloudFront, Fastly, Akamai, etc.
- **Rate Limiting** -- limites de requisicoes por periodo de tempo
- **Anti-Bot** -- sistemas que detectam acessos automatizados
- **Protecao DDoS** -- mecanismos contra sobrecarga
- **CAPTCHA** -- desafios de verificacao humana

Cada protecao detectada vem com uma explicacao simples do que ela faz e como afeta os resultados.

### Relatorios Profissionais

- **Exportacao em PDF** -- relatorio completo com graficos, metricas e recomendacoes, pronto para compartilhar
- **Exportacao em JSON** -- dados brutos para analise programatica ou integracao com outras ferramentas

### Historico Completo

Todos os testes sao salvos automaticamente. Voce pode:

- Buscar por URL ou metodo HTTP
- Filtrar por status (concluido, cancelado, com erro)
- Ordenar por data, RPS, taxa de erros ou nota de saude
- Visualizar resultados de testes anteriores a qualquer momento

### Configuracoes Avancadas

Para usuarios mais tecnicos, o StressFlow oferece:

- Selecao de metodo HTTP (GET, POST, PUT, DELETE)
- Corpo da requisicao customizado (JSON)
- Tempo de ramp-up (adicionar usuarios gradualmente)
- Ate 10.000 usuarios virtuais simultaneos
- Testes de ate 10 minutos de duracao

> **Importante:** o limite aceito pelo aplicativo nao significa que a medicao tera a mesma confiabilidade em toda a faixa. Em maquina unica, a leitura tende a ser mais confiavel em testes controlados e cargas moderadas do que em cenarios extremos.

---

## Instalacao

### Pre-requisitos

- [Node.js](https://nodejs.org/) versao 18 ou superior
- [npm](https://www.npmjs.com/) (incluso com o Node.js)
- [Git](https://git-scm.com/) (para clonar o repositorio)

### Passo a passo

1. **Clone o repositorio:**

```bash
git clone https://github.com/seu-usuario/stressflow.git
cd stressflow
```

2. **Instale as dependencias:**

```bash
npm install
```

3. **Inicie o aplicativo em modo de desenvolvimento:**

```bash
npm run dev
```

O StressFlow sera aberto automaticamente como um aplicativo desktop. Qualquer alteracao no codigo fonte sera refletida em tempo real gracas ao hot-reload do Vite.

---

## Como Usar

### 1. Informe o endereco do site

Ao abrir o StressFlow, voce vera a tela de configuracao. Cole a URL completa do site que deseja testar no campo principal. A URL precisa comecar com `https://` ou `http://`.

```
Exemplo: https://www.meusite.com.br
```

### 2. Escolha a intensidade

Selecione um dos perfis pre-configurados (Leve, Moderado, Pesado ou Extremo) ou ajuste manualmente o numero de visitantes simultaneos e a duracao do teste.

- **Visitantes Simultaneos**: quantas "pessoas" vao acessar o site ao mesmo tempo (de 1 a 10.000)
- **Duracao do Teste**: por quanto tempo o teste vai rodar (de 5 segundos a 10 minutos)

### 3. Inicie o teste

Clique no botao **"Iniciar Teste"**. O StressFlow comecara a enviar requisicoes para a URL informada e mostrara o progresso em tempo real.

### 4. Acompanhe o progresso

Durante a execucao, voce vera graficos sendo atualizados a cada segundo com as metricas do teste. Se precisar, voce pode cancelar o teste a qualquer momento.

### 5. Analise os resultados

Quando o teste terminar, o StressFlow exibira:

- **Score de Saude** -- nota geral de 0 a 100
- **Metricas principais** -- RPS, latencia media, taxa de erros
- **Distribuicao de latencia** -- percentis P50, P90, P95 e P99
- **Codigos de resposta HTTP** -- quantas respostas 200, 404, 500, etc.
- **Graficos temporais** -- evolucao de RPS, latencia e erros ao longo do teste
- **Deteccao de protecoes** -- se o site possui WAF, CDN, rate limiting, etc.
- **Recomendacoes** -- sugestoes praticas baseadas nos resultados

### 6. Exporte e compartilhe

Use os botoes **"Exportar PDF"** ou **"JSON"** para salvar os resultados. O PDF gera um relatorio profissional com graficos, ideal para enviar a equipe ou ao cliente.

### 7. Consulte o historico

Acesse o menu **"Historico"** na barra lateral para ver todos os testes realizados anteriormente. Voce pode buscar, filtrar e reabrir qualquer resultado salvo.

> **Importante:** Use o StressFlow apenas em sites que voce tem autorizacao para testar. O envio de muitas requisicoes simultaneas pode ser considerado um ataque se feito sem permissao.

---

## Build para Producao

### Compilar o projeto

Para compilar o codigo TypeScript e gerar os arquivos otimizados:

```bash
npm run build
```

### Gerar o instalador do aplicativo

Para criar o executavel distribuivel (instalador para Windows, macOS ou Linux):

```bash
npm run dist
```

Este comando executa o build e em seguida usa o [electron-builder](https://www.electron.build/) para empacotar o aplicativo. O instalador sera gerado na pasta `dist/`.

### Outros comandos uteis

| Comando                 | Descricao                                                                   |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run dev`           | Inicia o aplicativo em modo de desenvolvimento com hot-reload               |
| `npm run build`         | Compila TypeScript e gera o bundle de producao                              |
| `npm run preview`       | Visualiza o build de producao no navegador (sem Electron)                   |
| `npm run dist`          | Gera o instalador do aplicativo desktop                                     |
| `npm run audit:ssrf`    | Valida bloqueio de localhost, IPs privados, link-local e metadata endpoints |
| `npm run audit:engine`  | Sobe o mock server e executa a auditoria funcional completa do engine       |
| `npm run audit:extreme` | Sobe o mock server e executa auditoria de carga extrema do gerador          |
| `npm run verify`        | Executa lint, format check, typecheck, build e auditorias principais        |

### Capacidade do alvo x capacidade do StressFlow

Ao interpretar um teste, diferencie:

- **Capacidade do alvo** -- o quanto o site/API suportou
- **Capacidade do StressFlow** -- o quanto a maquina local conseguiu gerar carga sem distorcer a medicao

Em especial:

- Testes contra `localhost` e ambientes single-node sao otimos para desenvolvimento e auditoria do engine, mas nao representam internet real.
- Testes de carga muito alta em uma unica maquina podem refletir limites do Node.js, do event loop e do sistema operacional local, nao apenas do servidor avaliado.

---

## Stack Tecnologica

| Tecnologia                                               | Versao | Funcao                                               |
| -------------------------------------------------------- | ------ | ---------------------------------------------------- |
| [Electron](https://www.electronjs.org/)                  | 28     | Framework para aplicativos desktop multiplataforma   |
| [React](https://react.dev/)                              | 18     | Biblioteca para construcao da interface do usuario   |
| [TypeScript](https://www.typescriptlang.org/)            | 5.7    | Tipagem estatica para JavaScript, reduzindo bugs     |
| [Vite](https://vitejs.dev/)                              | 5      | Bundler ultrarapido com hot-reload instantaneo       |
| [Zustand](https://zustand-demo.pmnd.rs/)                 | 4.5    | Gerenciamento de estado global leve e simples        |
| [Tailwind CSS](https://tailwindcss.com/)                 | 3.4    | Framework CSS utilitario para estilizacao rapida     |
| [Recharts](https://recharts.org/)                        | 2      | Biblioteca de graficos responsivos baseada em React  |
| [jsPDF](https://github.com/parallax/jsPDF)               | 2.5    | Geracao de relatorios em PDF no lado do cliente      |
| [date-fns](https://date-fns.org/)                        | 3      | Manipulacao e formatacao de datas                    |
| [Lucide React](https://lucide.dev/)                      | --     | Biblioteca de icones consistentes e acessiveis       |
| [html-to-image](https://github.com/bubkoo/html-to-image) | 1.11   | Captura de graficos para inclusao nos relatorios PDF |

---

## Estrutura do Projeto

```
stressflow/
├── electron/                      # Processo principal do Electron (backend)
│   ├── main.ts                    # Ponto de entrada: janela, IPC, historico, exportacao
│   ├── preload.ts                 # Bridge segura entre Electron e React
│   └── engine/
│       ├── stress-engine.ts       # Motor de testes de estresse (execucao HTTP)
│       └── protection-detector.ts # Deteccao automatica de WAF, CDN, rate limiting
│
├── src/                           # Processo de renderizacao (frontend React)
│   ├── main.tsx                   # Ponto de entrada do React
│   ├── App.tsx                    # Componente raiz: roteamento de telas
│   ├── index.css                  # Estilos globais e tema dark
│   ├── env.d.ts                   # Declaracoes de tipos do ambiente
│   │
│   ├── components/                # Componentes visuais da interface
│   │   ├── Layout.tsx             # Estrutura geral da pagina (header + conteudo)
│   │   ├── Sidebar.tsx            # Barra lateral de navegacao
│   │   ├── TestConfig.tsx         # Formulario de configuracao do teste
│   │   ├── TestProgress.tsx       # Tela de progresso em tempo real
│   │   ├── TestResults.tsx        # Tela de resultados com metricas e graficos
│   │   ├── ResultsSummary.tsx     # Resumo em linguagem natural dos resultados
│   │   ├── MetricsChart.tsx       # Componente de graficos (Recharts)
│   │   ├── HistoryPanel.tsx       # Painel de historico com busca e filtros
│   │   ├── ProtectionReport.tsx   # Relatorio de protecoes detectadas
│   │   ├── InfoTooltip.tsx        # Tooltip explicativo para leigos
│   │   └── results-constants.ts   # Textos explicativos e labels de metricas
│   │
│   ├── services/
│   │   └── pdf-generator.ts       # Geracao de relatorios PDF com jsPDF
│   │
│   ├── stores/
│   │   └── test-store.ts          # Estado global da aplicacao (Zustand)
│   │
│   └── types/
│       └── index.ts               # Definicoes de tipos TypeScript compartilhados
│
├── index.html                     # HTML base carregado pelo Vite
├── package.json                   # Dependencias e scripts do projeto
├── tsconfig.json                  # Configuracao do TypeScript
├── vite.config.ts                 # Configuracao do Vite + plugins Electron
├── tailwind.config.mjs            # Configuracao do Tailwind CSS (tema customizado)
├── postcss.config.mjs             # Configuracao do PostCSS
└── electron-builder.json5         # Configuracao do empacotamento (instalador)
```

### Arquitetura

O StressFlow segue a arquitetura padrao do Electron com dois processos isolados:

- **Main Process** (`electron/`) -- Tem acesso total ao sistema operacional. Executa os testes de estresse, salva dados em disco, gera PDFs e gerencia a janela do aplicativo. A comunicacao com o frontend acontece via canais IPC (Inter-Process Communication).

- **Renderer Process** (`src/`) -- Roda isolado como um navegador web. Responsavel por toda a interface visual: formularios, graficos, historico e relatorios. Usa React com Zustand para gerenciamento de estado.

A ponte entre os dois processos e feita pelo `preload.ts`, que expoe apenas as funcoes necessarias de forma segura (context isolation + sandbox).

---

## Contribuindo

Contribuicoes sao muito bem-vindas! Se voce quer ajudar a melhorar o StressFlow, siga os passos abaixo.

### Como contribuir

1. **Fork** este repositorio

2. **Crie uma branch** para sua feature ou correcao:

```bash
git checkout -b minha-feature
```

3. **Faca suas alteracoes** e commite:

```bash
git commit -m "feat: descricao da minha alteracao"
```

4. **Envie para o seu fork:**

```bash
git push origin minha-feature
```

5. **Abra um Pull Request** descrevendo suas alteracoes

### Padrao de commits

Este projeto segue o [Conventional Commits](https://www.conventionalcommits.org/):

| Prefixo     | Uso                                |
| ----------- | ---------------------------------- |
| `feat:`     | Nova funcionalidade                |
| `fix:`      | Correcao de bug                    |
| `docs:`     | Alteracao em documentacao          |
| `style:`    | Formatacao (sem mudanca de logica) |
| `refactor:` | Refatoracao de codigo              |
| `test:`     | Adicao ou correcao de testes       |
| `chore:`    | Tarefas de manutencao              |

### Diretrizes

- Escreva comentarios e nomes de variaveis de forma clara e descritiva
- Mantenha a interface acessivel (ARIA labels, navegacao por teclado)
- Teste manualmente as alteracoes antes de abrir o PR
- Siga o estilo de codigo ja existente no projeto

---

## Licenca

Este projeto esta licenciado sob a **Licenca MIT** -- veja o arquivo [LICENSE](LICENSE) para detalhes.

```
MIT License

Copyright (c) 2026 StressFlow

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<p align="center">
  Feito com dedicacao pela equipe <strong>StressFlow</strong>
  <br />
  <sub>Se este projeto te ajudou, considere dar uma estrela no repositorio.</sub>
</p>
