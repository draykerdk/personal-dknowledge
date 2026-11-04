#!/usr/bin/env python3
"""A guarda gêmea: no cofre de origem, conta o que ainda impede cada pasta de ir para o pacote aberto.

O que faz: lê a mesma lista privada de termos da guarda de vazamento do pacote (o mesmo formato:
cabeçalhos `[categoria modo]` e um termo por linha) e conta, por pasta e por categoria, as
ocorrências nas pastas que a exportação copia (o `src` e os `tests` do plugin, os modelos de tipo,
os ramos, as notas-modelo, os moldes e os scripts da bancada). Procura também as falas citadas
com data. Imprime só contagens: nunca o termo, nunca a linha.

Por quê: a guarda do pacote só vê o que já saiu do cofre. A gêmea mostra, aqui, quanto falta em
cada pasta, para a limpeza andar junto com o trabalho de sempre. É um aviso: sai sempre com 0
(o cofre é pessoal; o que não pode vazar é a cópia), e a contagem aparece na bancada.

De onde vem a lista: a variável `DK_TERMOS_PRIVADOS`, senão `~/.config/dk-personal/termos_privados.txt`.
Sem a lista, diz que pulou e sai com 0. A lista nunca se copia para o cofre nem para o pacote.

Erro e ataque: um cabeçalho com modo desconhecido ou um termo fora de seção derruba a leitura
(sai com 2, como a guarda do pacote); um arquivo binário ou ilegível não é varrido.

Prova: `--teste` (planta um nome numa pasta temporária: a contagem acha; limpa, zera) e o teste
do plugin `tests/opcionais/guardaGemea.test.ts`, que lê a mesma lista.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

VAULT = Path(__file__).resolve().parents[2]
LISTA_PADRAO = Path("~/.config/dk-personal/termos_privados.txt")
MODOS = {"palavra", "palavra_exata", "trecho", "literal"}
PASTAS = (
    ".obsidian/plugins/dfm-system/src",
    ".obsidian/plugins/dfm-system/tests",
    "200 - FUNCTIONS/Config/dominios",
    "200 - FUNCTIONS/Config/ramos",
    "200 - FUNCTIONS/Models",
    "200 - FUNCTIONS/Templates",
    "200 - FUNCTIONS/Scripts",
)
FORA = ("node_modules", "__pycache__", ".git")
EXTENSOES = {".ts", ".js", ".mjs", ".json", ".md", ".py", ".css", ".txt"}
FALAS = (
    re.compile(r"\b[Ee]l[ea],\s*\d{1,2}/\d{1,2}"),
    re.compile(r"\(\s*[Ee]l[ea],?\s*\d{1,2}/\d{1,2}"),
    re.compile(r"\b(palavras|fala|falas|correção|pedido|escada|frase)\s+del[ea]\b"),
    re.compile(r"\b(pedido|resposta|fala|palavras|correção)\s+(de|do dia)\s+\d{1,2}/\d{1,2}\b"),
)


def compilar(modo: str, texto: str) -> re.Pattern:
    t = re.escape(texto)
    if modo == "trecho":
        return re.compile(t, re.IGNORECASE)
    if modo == "literal":
        return re.compile(r"(['\"`])" + t + r"\1")
    borda = r"(?<![\w])" + t + r"(?![\w])"
    return re.compile(borda, re.IGNORECASE) if modo == "palavra" else re.compile(borda)


def ler_termos(caminho: Path) -> list[tuple[str, re.Pattern]]:
    termos, categoria = [], None
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.strip()
        if not linha or linha.startswith("#"):
            continue
        m = re.fullmatch(r"\[(\S+)\s+(\S+)\]", linha)
        if m:
            categoria, modo = m.group(1), m.group(2)
            if modo not in MODOS:
                raise ValueError(f"lista, linha {n}: modo desconhecido")
            continue
        if categoria is None:
            raise ValueError(f"lista, linha {n}: termo fora de seção")
        termos.append((categoria, compilar(modo, linha)))
    return termos + [("falas", f) for f in FALAS]


def contar(raiz: Path, pastas, termos) -> dict[str, Counter]:
    """{pasta: Counter(categoria -> ocorrências)}, só das pastas com alguma ocorrência."""
    saida: dict[str, Counter] = {}
    for pasta in pastas:
        base = raiz / pasta
        if not base.is_dir():
            continue
        for arq in sorted(base.rglob("*")):
            if not arq.is_file() or arq.suffix not in EXTENSOES or any(p in FORA for p in arq.parts):
                continue
            try:
                texto = arq.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            rel = arq.relative_to(raiz).parent.as_posix()
            for linha in [arq.relative_to(raiz).as_posix(), *texto.splitlines()]:
                for categoria, padrao in termos:
                    if padrao.search(linha):
                        saida.setdefault(rel, Counter())[categoria] += 1
    return saida


def autoteste() -> int:
    with tempfile.TemporaryDirectory() as d:
        raiz = Path(d)
        lista = raiz / "lista.txt"
        lista.write_text("[nomes palavra]\nFulano\n", encoding="utf-8")
        termos = ler_termos(lista)
        (raiz / "p").mkdir()
        (raiz / "p" / "a.md").write_text("texto neutro\n", encoding="utf-8")
        if contar(raiz, ["p"], termos):
            print("autoteste: falhou (contou na pasta limpa)")
            return 1
        (raiz / "p" / "a.md").write_text("o fulano e ele, 30/10\n", encoding="utf-8")
        c = contar(raiz, ["p"], termos)
        if c != {"p": Counter({"nomes": 1, "falas": 1})}:
            print(f"autoteste: falhou ({c})")
            return 1
    print("autoteste: ok")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--teste", action="store_true")
    a = p.parse_args(argv)
    if a.teste:
        return autoteste()
    lista = Path(os.environ.get("DK_TERMOS_PRIVADOS") or LISTA_PADRAO).expanduser()
    if not lista.is_file():
        print("Guarda gêmea: sem a lista privada neste computador; pulada.")
        return 0
    try:
        termos = ler_termos(lista)
    except ValueError as erro:
        print(f"Guarda gêmea: a lista não se lê ({erro}).")
        return 2
    contagem = contar(VAULT, PASTAS, termos)
    total = sum(sum(c.values()) for c in contagem.values())
    for pasta in sorted(contagem):
        cats = ", ".join(f"{k} {v}" for k, v in sorted(contagem[pasta].items()))
        print(f"  {pasta}: {cats}")
    print(f"Guarda gêmea: {total} aviso(s) em {len(contagem)} pasta(s) do que vai para o pacote "
          "(só contagens; a guarda do pacote barra a cópia).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
