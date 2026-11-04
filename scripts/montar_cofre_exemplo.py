#!/usr/bin/env python3
"""Monta o cofre de exemplo numa pasta: o esqueleto e, por cima, as notas da pessoa fictícia.

O que faz: copia `cofre-modelo/` (as pastas, os modelos de tipo, as notas-modelo, os moldes e a
bancada) para a pasta de destino e, por cima, `cofre-exemplo/` (só as notas do exemplo). A pasta
que sai abre como cofre no Obsidian, e a bancada roda nela:
`python3 -B "<destino>/200 - FUNCTIONS/Scripts/run_judges.py"`.

Por quê: o exemplo não repete o esqueleto. Cada nota dele mora no caminho em que mora num cofre
de verdade, e o esqueleto continua com um dono só (`cofre-modelo/`).

Erro e ataque: o destino tem de estar fora do repositório e vazio (ou não existir), para a
montagem nunca escrever no repositório nem misturar com outro cofre; um arquivo do exemplo que
cairia em cima de um arquivo do esqueleto é um erro (o exemplo só acrescenta notas; os dois
READMEs da raiz são a exceção, e o do exemplo vale no cofre montado). Sai com 2 nesses casos.
`--conferir` só confere a sobreposição, sem montar.
Prova: `--conferir` sai com 0 no repositório como está; montar duas vezes em pastas novas dá a
mesma árvore.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODELO = RAIZ / "cofre-modelo"
EXEMPLO = RAIZ / "cofre-exemplo"
PODE_SOBREPOR = {"README.md"}
IGNORAR = {".DS_Store"}


def arquivos(pasta: Path) -> list[Path]:
    return sorted(p.relative_to(pasta) for p in pasta.rglob("*")
                  if p.is_file() and not p.is_symlink() and p.name not in IGNORAR)


def sobreposicoes() -> list[str]:
    do_modelo = {p.as_posix() for p in arquivos(MODELO)}
    return [p.as_posix() for p in arquivos(EXEMPLO)
            if p.as_posix() in do_modelo and p.as_posix() not in PODE_SOBREPOR]


def montar(destino: Path, com_exemplo: bool = True) -> int:
    """O que faz: copia o esqueleto e, com `com_exemplo`, o exemplo por cima, para o destino vazio.

    O instalador (`instalar.py`) chama com `com_exemplo=False` para o cofre só com o esqueleto.
    """
    destino = destino.expanduser().resolve()
    if destino == RAIZ or RAIZ in destino.parents:
        print("montar: o destino não pode ficar dentro do repositório", file=sys.stderr)
        return 2
    if destino.exists() and any(destino.iterdir()):
        print("montar: o destino já tem arquivos; use uma pasta vazia", file=sys.stderr)
        return 2
    conflitos = sobreposicoes() if com_exemplo else []
    if conflitos:
        print("montar: o exemplo cairia em cima do esqueleto: " + ", ".join(conflitos), file=sys.stderr)
        return 2
    n = 0
    for origem in (MODELO, EXEMPLO) if com_exemplo else (MODELO,):
        for rel in arquivos(origem):
            alvo = destino / rel
            alvo.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origem / rel, alvo)
            n += 1
    print(f"montar: {n} arquivo(s) em {destino} ({'o esqueleto e, por cima, o exemplo' if com_exemplo else 'o esqueleto'}).")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("destino", nargs="?", help="a pasta do cofre montado (fora do repositório, vazia)")
    p.add_argument("--conferir", action="store_true", help="só confere que o exemplo não cai em cima do esqueleto")
    a = p.parse_args(argv)
    if a.conferir:
        conflitos = sobreposicoes()
        for c in conflitos:
            print(f"  sobrepõe o esqueleto: {c}")
        print("montar: o exemplo só acrescenta notas. Passou." if not conflitos else f"montar: {len(conflitos)} sobreposição(ões).")
        return 1 if conflitos else 0
    if not a.destino:
        p.error("falta o destino (ou --conferir)")
    return montar(Path(a.destino))


if __name__ == "__main__":
    sys.exit(main())
