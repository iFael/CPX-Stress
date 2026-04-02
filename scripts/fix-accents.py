#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
fix-accents.py — Corrige acentuação em textos PT-BR nos arquivos do projeto.

Varre todos os arquivos .ts/.tsx/.css/.html do projeto (src/, electron/, index.html)
e substitui palavras sem acento pelas versões corretas em português brasileiro.

Uso:
    python scripts/fix-accents.py          # modo dry-run (apenas mostra o que seria alterado)
    python scripts/fix-accents.py --apply  # aplica as correções nos arquivos

Segurança:
    - Só altera texto em COMENTÁRIOS (// /* */ *), STRINGS (entre aspas/template literals)
      e conteúdo JSX (entre > <). Nunca altera nomes de variáveis, funções ou identificadores.
    - Gera backup (.bak) de cada arquivo alterado antes de sobrescrever.
    - Exibe diff colorido no terminal para revisão.
"""

import re
import sys
import shutil
from pathlib import Path
from difflib import unified_diff

# ============================================================================
# DICIONÁRIO DE CORREÇÕES
# Mapeamento: palavra_sem_acento -> palavra_com_acento
# Cada entrada é case-sensitive na substituição, mas o match é case-insensitive.
# ============================================================================

WORD_MAP: dict[str, str] = {
    # -ção / -ções
    "configuracao": "configuração",
    "configuracoes": "configurações",
    "descricao": "descrição",
    "descricoes": "descrições",
    "execucao": "execução",
    "execucoes": "execuções",
    "navegacao": "navegação",
    "protecao": "proteção",
    "deteccao": "detecção",
    "exportacao": "exportação",
    "notificacao": "notificação",
    "notificacoes": "notificações",
    "visualizacao": "visualização",
    "duracao": "duração",
    "producao": "produção",
    "homologacao": "homologação",
    "simulacao": "simulação",
    "validacao": "validação",
    "conclusao": "conclusão",
    "atualizacao": "atualização",
    "animacao": "animação",
    "animacoes": "animações",
    "interacao": "interação",
    "interacoes": "interações",
    "confirmacao": "confirmação",
    "operacao": "operação",
    "operacoes": "operações",
    "conexao": "conexão",
    "conexoes": "conexões",
    "funcao": "função",
    "funcoes": "funções",
    "aplicacao": "aplicação",
    "aplicacoes": "aplicações",
    "informacao": "informação",
    "informacoes": "informações",
    "atencao": "atenção",
    "excecao": "exceção",
    "excecoes": "exceções",
    "posicao": "posição",
    "posicoes": "posições",
    "restricao": "restrição",
    "restricoes": "restrições",
    "classificacao": "classificação",
    "classificacoes": "classificações",
    "resolucao": "resolução",
    "exclusao": "exclusão",
    "requisicao": "requisição",
    "requisicoes": "requisições",
    "geracoes": "gerações",
    "geracao": "geração",
    "reconstrucao": "reconstrução",
    "renderizacao": "renderização",
    "inicializacao": "inicialização",
    "paginacao": "paginação",
    "autenticacao": "autenticação",
    "autorizacao": "autorização",
    "migracao": "migração",
    "integracao": "integração",
    "integracoes": "integrações",
    "obrigacao": "obrigação",
    "alteracao": "alteração",
    "alteracoes": "alterações",
    "recomendacao": "recomendação",
    "recomendacoes": "recomendações",
    "apresentacao": "apresentação",
    "situacao": "situação",
    "manipulacao": "manipulação",
    "comunicacao": "comunicação",
    "declaracao": "declaração",
    "instalacao": "instalação",
    "verificacao": "verificação",
    "distribuicao": "distribuição",
    "recuperacao": "recuperação",

    # -ário(s) / -ária(s) (palavras com sufixo -ario sem acento)
    "usuario": "usuário",
    "usuarios": "usuários",
    "usuaria": "usuária",

    # -ão (sem -ção)
    "nao": "não",
    "sao": "são",
    "serao": "serão",
    "estarao": "estarão",
    "entao": "então",
    "padrao": "padrão",
    "padroes": "padrões",
    "botao": "botão",
    "botoes": "botões",
    "sessao": "sessão",
    "sessoes": "sessões",
    "versao": "versão",
    "versoes": "versões",

    # -ência / -ância
    "latencia": "latência",
    "frequencia": "frequência",
    "experiencia": "experiência",
    "referencia": "referência",
    "sequencia": "sequência",
    "existencia": "existência",
    "ocorrencia": "ocorrência",
    "persistencia": "persistência",
    "tolerancia": "tolerância",
    "instancia": "instância",
    "distancia": "distância",

    # -ário / -ória / -ório
    "historico": "histórico",
    "temporario": "temporário",
    "necessario": "necessário",
    "primario": "primário",
    "secundario": "secundário",
    "obrigatorio": "obrigatório",
    # "relatorio" removido — usado como nome de variável no código
    "relatorios": "relatórios",
    "repositorio": "repositório",
    "comentario": "comentário",
    "comentarios": "comentários",
    "dicionario": "dicionário",
    "voluntario": "voluntário",
    "memoria": "memória",
    "categoria": "categoria",  # já correto, mas mantido por segurança

    # -ível / -ável
    "visivel": "visível",
    "invisivel": "invisível",
    "disponivel": "disponível",
    "responsavel": "responsável",
    "acessivel": "acessível",
    "compativel": "compatível",
    "possivel": "possível",
    "impossivel": "impossível",
    "legivel": "legível",
    "variavel": "variável",
    "variaveis": "variáveis",
    "estavel": "estável",
    "instaveis": "instáveis",

    # -ético / -ático / -ístico / -ético
    "estatisticas": "estatísticas",
    "estatistica": "estatística",
    "diagnostico": "diagnóstico",
    "diagnosticos": "diagnósticos",
    "automatico": "automático",
    "automaticamente": "automaticamente",  # sem acento na escrita — correto
    "semantico": "semântico",
    "sintatico": "sintático",
    "grafico": "gráfico",
    "graficos": "gráficos",
    "unico": "único",
    "unicos": "únicos",
    "basico": "básico",
    "basicos": "básicos",
    "publico": "público",
    "publicos": "públicos",
    "especifico": "específico",
    "especificos": "específicos",
    "generico": "genérico",
    "genericos": "genéricos",
    "dinamico": "dinâmico",
    "dinamicos": "dinâmicos",
    "dinamicamente": "dinamicamente",  # correto sem acento
    "metrica": "métrica",
    "metricas": "métricas",
    "tecnico": "técnico",
    "tecnicos": "técnicos",
    "pratico": "prático",

    # -ançada / -ançado
    "avancada": "avançada",
    "avancadas": "avançadas",
    "avancado": "avançado",
    "avancados": "avançados",

    # -ês / -ês
    "portugues": "português",
    "ingles": "inglês",

    # Acentos diversos
    "pagina": "página",
    "paginas": "páginas",
    "codigo": "código",
    "codigos": "códigos",
    "valido": "válido",
    "validos": "válidos",
    "invalido": "inválido",
    "invalidos": "inválidos",
    "numero": "número",
    "numeros": "números",
    "minimo": "mínimo",
    "minimos": "mínimos",
    "maximo": "máximo",
    "maximos": "máximos",
    "titulo": "título",
    "titulos": "títulos",
    "indice": "índice",
    "indices": "índices",
    "inicio": "início",
    "metodo": "método",
    "metodos": "métodos",
    "periodo": "período",
    "periodos": "períodos",
    "rotulo": "rótulo",
    "rotulos": "rótulos",
    "calculo": "cálculo",
    "calculos": "cálculos",
    "modulo": "módulo",
    "modulos": "módulos",
    "simbolo": "símbolo",
    "simbolos": "símbolos",
    "ultimo": "último",
    "ultimos": "últimos",
    "proximo": "próximo",
    "proximos": "próximos",
    "propria": "própria",
    "proprio": "próprio",
    "proprios": "próprios",

    # Verbos / particípios
    "tambem": "também",
    "apos": "após",
    "porem": "porém",
    "voce": "você",
    "contem": "contém",
    "mantem": "mantém",
    "conteudo": "conteúdo",
    "conteudos": "conteúdos",
    "saida": "saída",
    "saidas": "saídas",
    "incluido": "incluído",
    "destruido": "destruído",
    "excluido": "excluído",
    "construido": "construído",

    # Til
    "simultaneas": "simultâneas",
    "simultaneo": "simultâneo",
    "simultaneos": "simultâneos",
    "analise": "análise",
    "analises": "análises",
    "parametro": "parâmetro",
    "parametros": "parâmetros",

    # Cedilha (ç sem acento, que pode ter ficado sem cedilha)
    "cabecalho": "cabeçalho",
    "preco": "preço",
    "precos": "preços",
    "orcamento": "orçamento",
    "orcamentos": "orçamentos",
    "servico": "serviço",
    "servicos": "serviços",
    "espaco": "espaço",
    "espacos": "espaços",
    "endereco": "endereço",
    "enderecos": "endereços",
    "comeco": "começo",
    "almoco": "almoço",
    "licenca": "licença",
    "licencas": "licenças",
    "forca": "força",
    "forcas": "forças",
    "avanco": "avanço",
    "avancos": "avanços",
}

# Palavras curtas que precisam de contexto extra para evitar falsos positivos.
# Estas são tratadas apenas quando estão cercadas por espaços/pontuação.
CONTEXT_SENSITIVE = {
    "nao",    # "nao" quase sempre é "não", mas exige word boundary
    "sao",    # "sao" quase sempre é "são"
}

# ============================================================================
# EXTENSÕES E DIRETÓRIOS
# ============================================================================

EXTENSIONS = {".ts", ".tsx", ".css", ".html"}
SCAN_DIRS = ["src", "electron"]
SCAN_FILES = ["index.html"]

# ============================================================================
# REGEX PARA ZONAS SEGURAS (comentários, strings, JSX text)
# ============================================================================

# Identifica zonas seguras para substituição:
#   1. Comentários de linha: // ...
#   2. Comentários de bloco: /* ... */
#   3. Strings com aspas duplas: "..."
#   4. Strings com aspas simples: '...'
#   5. Template literals: `...`
#   6. Texto JSX: >texto<
SAFE_ZONE_RE = re.compile(
    r"(//[^\n]*)"                     # comentário de linha
    r"|(/\*[\s\S]*?\*/)"             # comentário de bloco
    r'|("(?:[^"\\]|\\.)*")'          # string aspas duplas
    r"|('(?:[^'\\]|\\.)*')"          # string aspas simples
    r"|(`(?:[^`\\]|\\.)*`)"          # template literal
    r"|(>[^<]+<)",                    # texto JSX entre > e <
    re.MULTILINE,
)


def preserve_case(original: str, replacement: str) -> str:
    """Preserva o case da palavra original na substituição.

    Exemplos:
        preserve_case("Configuracao", "configuração") -> "Configuração"
        preserve_case("CONFIGURACAO", "configuração") -> "CONFIGURAÇÃO"
        preserve_case("configuracao", "configuração") -> "configuração"
    """
    if original.isupper():
        return replacement.upper()
    if original[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def replace_in_safe_zone(match: re.Match, replacements: dict[str, str]) -> str:
    """Aplica substituições somente dentro de uma zona segura (comentário/string/JSX)."""
    text = match.group(0)
    for pattern, (word_re, correct) in replacements.items():
        def do_replace(m: re.Match) -> str:
            return preserve_case(m.group(0), correct)
        text = word_re.sub(do_replace, text)
    return text


def build_replacements() -> dict[str, tuple[re.Pattern, str]]:
    """Compila as regex para cada palavra do dicionário.

    Retorna dict: chave_lower -> (regex_compilada, forma_correta)
    """
    result = {}
    for wrong, correct in WORD_MAP.items():
        if wrong == correct:
            continue  # pula entradas onde já está correto

        if wrong in CONTEXT_SENSITIVE:
            # Exige word boundary + contexto de espaços/pontuação ao redor
            pattern = re.compile(
                r"(?<![a-zA-ZÀ-ÿ])" + re.escape(wrong) + r"(?![a-zA-ZÀ-ÿ])",
                re.IGNORECASE,
            )
        else:
            # Word boundary padrão
            pattern = re.compile(
                r"\b" + re.escape(wrong) + r"\b",
                re.IGNORECASE,
            )
        result[wrong] = (pattern, correct)
    return result


def process_file(filepath: Path, replacements: dict, dry_run: bool) -> int:
    """Processa um arquivo, substituindo palavras sem acento em zonas seguras.

    Retorna o número de substituições feitas.
    """
    try:
        original_content = filepath.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as exc:
        print(f"  ⚠ Erro ao ler {filepath}: {exc}")
        return 0

    change_count = 0

    def safe_zone_replacer(match: re.Match) -> str:
        nonlocal change_count
        text = match.group(0)
        new_text = text
        for _key, (word_re, correct) in replacements.items():
            def do_replace(m: re.Match) -> str:
                nonlocal change_count
                replaced = preserve_case(m.group(0), correct)
                if replaced != m.group(0):
                    change_count += 1
                return replaced
            new_text = word_re.sub(do_replace, new_text)
        return new_text

    new_content = SAFE_ZONE_RE.sub(safe_zone_replacer, original_content)

    if change_count == 0:
        return 0

    # Exibe diff
    rel_path = filepath.relative_to(Path.cwd()) if filepath.is_relative_to(Path.cwd()) else filepath
    diff = unified_diff(
        original_content.splitlines(keepends=True),
        new_content.splitlines(keepends=True),
        fromfile=f"a/{rel_path}",
        tofile=f"b/{rel_path}",
        lineterm="",
    )
    diff_lines = list(diff)
    if diff_lines:
        print(f"\n{'=' * 70}")
        print(f"📄 {rel_path}  ({change_count} correções)")
        print("=" * 70)
        for line in diff_lines:
            if line.startswith("+") and not line.startswith("+++"):
                print(f"\033[32m{line}\033[0m")
            elif line.startswith("-") and not line.startswith("---"):
                print(f"\033[31m{line}\033[0m")
            else:
                print(line)

    if not dry_run:
        # Backup
        backup_path = filepath.with_suffix(filepath.suffix + ".bak")
        shutil.copy2(filepath, backup_path)
        filepath.write_text(new_content, encoding="utf-8")
        print(f"  ✅ Salvo (backup: {backup_path.name})")

    return change_count


def collect_files(project_root: Path) -> list[Path]:
    """Coleta todos os arquivos elegíveis para correção."""
    files: list[Path] = []

    for scan_dir in SCAN_DIRS:
        dir_path = project_root / scan_dir
        if dir_path.is_dir():
            for ext in EXTENSIONS:
                files.extend(dir_path.rglob(f"*{ext}"))

    for scan_file in SCAN_FILES:
        f = project_root / scan_file
        if f.is_file():
            files.append(f)

    return sorted(set(files))


def main() -> None:
    # Força UTF-8 no stdout/stderr (Windows usa cp1252 por padrão)
    import io
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    apply_mode = "--apply" in sys.argv
    project_root = Path(__file__).resolve().parent.parent

    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  fix-accents.py — Correção de acentuação PT-BR             ║")
    print(f"║  Modo: {'APLICAR CORREÇÕES' if apply_mode else 'DRY-RUN (apenas visualização)':42s}  ║")
    print(f"║  Projeto: {str(project_root)[:47]:47s}  ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    files = collect_files(project_root)
    print(f"\n🔍 {len(files)} arquivos encontrados para análise.\n")

    replacements = build_replacements()
    total_changes = 0
    files_changed = 0

    for filepath in files:
        count = process_file(filepath, replacements, dry_run=not apply_mode)
        if count > 0:
            total_changes += count
            files_changed += 1

    print(f"\n{'─' * 70}")
    if total_changes == 0:
        print("✨ Nenhuma correção necessária — todos os arquivos já estão corretos!")
    else:
        print(f"📊 Total: {total_changes} correções em {files_changed} arquivo(s).")
        if not apply_mode:
            print("\n💡 Execute com --apply para aplicar as correções:")
            print("   python scripts/fix-accents.py --apply")
        else:
            print("\n✅ Correções aplicadas! Backups (.bak) criados para cada arquivo.")
            print("   Para remover backups: find . -name '*.bak' -delete")


if __name__ == "__main__":
    main()
