#!/usr/bin/env python3
"""
generate_tree_map.py — extrai a árvore REAL do cofre e escreve o mapa canônico.

Por que existe: manuais que repetem a estrutura de pastas à mão envelhecem em
silêncio. Em 19/07/2026 uma auditoria encontrou referências a `000 - COCKPIT`,
`000 - MISSION CONTROL.md` e `500 - RESOURCES/Knowledge/...` — nomes de
arquiteturas anteriores que já não existiam. A correção não é reescrever texto:
é ter uma fonte única gerada do disco.

Uso:
    python3 "200 - FUNCTIONS/Scripts/generate_tree_map.py"            # escreve o mapa
    python3 "200 - FUNCTIONS/Scripts/generate_tree_map.py" --check    # só verifica se está atualizado

O modo --check devolve exit 1 se o mapa estiver defasado, para servir de juiz.
"""

import os
import sys
import re
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colunas_kanban import COLUNAS  # noqa: E402  (a tabela das colunas mora num lugar só)

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESTINO = os.path.join(VAULT, "000 - KERNEL", "03 - MANUAIS_OPERACIONAIS",
                       "010 - Árvore Real do Cofre (gerado).md")

# Pastas técnicas que não descrevem a estrutura de trabalho e só criariam ruído.
IGNORAR = {".obsidian", ".git", ".trash", "node_modules", ".DS_Store", "__pycache__"}

# Profundidade por raiz: o que interessa é a forma da estrutura, não cada nota.
PROFUNDIDADE = {
    "000 - KERNEL": 2,
    "100 - AREAS": 3,
    "200 - FUNCTIONS": 2,
    "300 - RUNTIME": 2,
    "400 - MEMORY": 2,
    "500 - RESOURCES": 1,
    "900 - ARCHIVE": 2,
    "TaskNotes": 1,
}

COLUNAS_KANBAN = list(COLUNAS)


def subpastas(caminho):
    try:
        nomes = [n for n in os.listdir(caminho) if not n.startswith(".")]
    except OSError:
        return []
    return sorted(n for n in nomes if n not in IGNORAR and os.path.isdir(os.path.join(caminho, n)))


def desenha(caminho, prefixo="", nivel=0, maximo=2):
    if nivel >= maximo:
        return []
    linhas = []
    filhos = subpastas(caminho)
    for i, nome in enumerate(filhos):
        ultimo = i == len(filhos) - 1
        haste = "└── " if ultimo else "├── "
        completo = os.path.join(caminho, nome)
        linhas.append(f"{prefixo}{haste}{nome}")
        linhas.extend(desenha(completo, prefixo + ("    " if ultimo else "│   "), nivel + 1, maximo))
    return linhas


def gera():
    hoje = datetime.now().strftime("%Y-%m-%d")
    out = []
    out.append("---")
    out.append("type: manual_operacional")
    out.append("gerado_por: 200 - FUNCTIONS/Scripts/generate_tree_map.py")
    out.append(f"gerado_em: \"{hoje}\"")
    out.append("---")
    out.append("")
    out.append("# 010 — Árvore Real do Cofre (gerado)")
    out.append("")
    out.append("> ⚠️ **Arquivo gerado. Não editar à mão** — a próxima execução do script sobrescreve.")
    out.append("> Para atualizar: `python3 \"200 - FUNCTIONS/Scripts/generate_tree_map.py\"`")
    out.append(">")
    out.append("> Esta é a estrutura **real, lida do disco**. Os manuais descrevem o *propósito* de cada")
    out.append("> escaninho; este documento é a fonte da verdade sobre o que existe. Quando um manual")
    out.append("> divergir daqui, o disco vence.")
    out.append("")

    raizes = [r for r in sorted(subpastas(VAULT)) if r in PROFUNDIDADE]
    out.append(f"**{len(raizes)} escaninhos estruturais** · levantado em {hoje}")
    out.append("")

    for raiz in raizes:
        caminho = os.path.join(VAULT, raiz)
        out.append(f"## `{raiz}`")
        out.append("")
        out.append("```text")
        out.append(f"{raiz}/")
        out.extend(desenha(caminho, "", 0, PROFUNDIDADE[raiz]))
        out.append("```")
        out.append("")

    # Colunas kanban por área — a esteira de projetos é o que mais muda.
    out.append("## Esteira de projetos por área")
    out.append("")
    out.append("| Área | " + " | ".join(COLUNAS_KANBAN) + " |")
    out.append("|---" * (len(COLUNAS_KANBAN) + 1) + "|")
    areas_dir = os.path.join(VAULT, "100 - AREAS")
    for area in subpastas(areas_dir):
        projetos = os.path.join(areas_dir, area, "100 - PROJECTS")
        if not os.path.isdir(projetos):
            continue
        celulas = []
        for col in COLUNAS_KANBAN:
            p = os.path.join(projetos, col)
            celulas.append(str(len(subpastas(p))) if os.path.isdir(p) else "—")
        out.append(f"| {area} | " + " | ".join(celulas) + " |")
    out.append("")

    # Departamentos: frentes permanentes, que nunca são arquivadas.
    out.append("## Departamentos (frentes permanentes)")
    out.append("")
    out.append("> Departamento não termina — nenhum mecanismo automático os arquiva.")
    out.append("> Ver [[005 - Guia de Estrutura e Fluxo de Trabalho DFM]], seção 7.")
    out.append("")
    for area in subpastas(areas_dir):
        deps = os.path.join(areas_dir, area, "200 - DEPARTMENTS")
        if not os.path.isdir(deps):
            continue
        nomes = subpastas(deps)
        if nomes:
            out.append(f"- **{area}:** " + " · ".join(nomes))
    out.append("")

    return "\n".join(out) + "\n"


def corpo_sem_data(texto):
    """Ignora a linha de geração para comparar só o conteúdo estrutural."""
    texto = re.sub(r'gerado_em: "\d{4}-\d{2}-\d{2}"', "", texto)
    return re.sub(r"levantado em \d{4}-\d{2}-\d{2}", "", texto)


def main():
    novo = gera()
    checar = "--check" in sys.argv

    atual = None
    if os.path.exists(DESTINO):
        with open(DESTINO, encoding="utf-8") as fh:
            atual = fh.read()

    igual = atual is not None and corpo_sem_data(atual) == corpo_sem_data(novo)

    if checar:
        if igual:
            print("✅ Mapa da árvore atualizado.")
            return 0
        print("⚠️  Mapa da árvore DEFASADO — rode generate_tree_map.py sem --check.")
        return 1

    if igual:
        print("✅ Nada mudou na árvore; mapa preservado.")
        return 0

    with open(DESTINO, "w", encoding="utf-8") as fh:
        fh.write(novo)
    print(f"✅ Mapa gerado: {os.path.relpath(DESTINO, VAULT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
