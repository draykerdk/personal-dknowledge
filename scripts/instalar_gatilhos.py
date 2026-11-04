#!/usr/bin/env python3
"""Instala os gatilhos do git deste repositório: a guarda de vazamento antes de cada commit.

O que faz: põe em `.git/hooks/` dois gatilhos curtos, `pre-commit` e `commit-msg`, que chamam os
gatilhos versionados em `scripts/gatilhos/` (o `pre-commit` roda a guarda sobre o índice; o
`commit-msg`, sobre a mensagem). Grava na configuração LOCAL do repositório o Python que os roda
(`dk.python`, o interpretador que rodou este instalador) e o caminho da lista privada
(`dk.termos`, de `--termos` ou de `DK_TERMOS_PRIVADOS`). `--remover` desfaz tudo isso.

Por quê: a guarda só protege se roda sempre. Com o gatilho, um commit com termo privado, com uma
fala datada ou sem a lista não entra. Os gatilhos vão para `.git/hooks/` e o `core.hooksPath` não
muda: quem já tem gatilhos globais que encadeiam o do repositório continua com os dois. O caminho
da lista mora só na configuração local do git (`.git/config`), que nunca é enviada; a lista mesma
fica fora do repositório.

Erro e ataque: a lista dentro do repositório é recusada; sem lista, o instalador sai com 2 e não
instala nada. Um gatilho que já existe em `.git/hooks/` e não é deste instalador não é
sobrescrito (sai com 2 e diz qual). Os gatilhos falham fechados: sem a lista no momento do
commit, o commit não entra. `git commit --no-verify` pula os gatilhos (é do git); por isso,
antes do envio, roda-se `guarda_vazamento.py --historico`, que vê todos os commits.

Prova: `python3 -B scripts/instalar_gatilhos.py --teste` (num repositório temporário: sem lista
não instala; instalado, um commit limpo entra, um com termo é barrado, um com termo só na
mensagem é barrado, um sem a lista é barrado; um gatilho alheio não é sobrescrito; o `--remover`
tira os gatilhos e a configuração).
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GATILHOS = ("pre-commit", "commit-msg")
MARCA = "# dk-personal: instalado por scripts/instalar_gatilhos.py"


def git(repo: Path, *args: str, ok=(0,)) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, env=env)
    if r.returncode not in ok:
        raise SystemExit(f"instalar_gatilhos: o git falhou ({' '.join(args)}): {r.stderr.strip()}")
    return r


def pasta_dos_gatilhos(repo: Path) -> Path:
    comum = Path(git(repo, "rev-parse", "--git-common-dir").stdout.strip())
    return (comum if comum.is_absolute() else repo / comum) / "hooks"


def embrulho(nome: str) -> str:
    return f'#!/bin/sh\n{MARCA}\nexec "$(git rev-parse --show-toplevel)/scripts/gatilhos/{nome}" "$@"\n'


def instalar(repo: Path, termos: str | None) -> int:
    if not termos:
        print("instalar_gatilhos: falta a lista (--termos ou DK_TERMOS_PRIVADOS)", file=sys.stderr)
        return 2
    lista = Path(termos).expanduser().resolve()
    if not lista.is_file():
        print("instalar_gatilhos: a lista não existe no caminho dado", file=sys.stderr)
        return 2
    if lista.is_relative_to(repo.resolve()):
        print("instalar_gatilhos: a lista está dentro do repositório; ela tem de morar fora", file=sys.stderr)
        return 2
    destino = pasta_dos_gatilhos(repo)
    for nome in GATILHOS:
        versionado = repo / "scripts" / "gatilhos" / nome
        if not versionado.is_file():
            print(f"instalar_gatilhos: falta scripts/gatilhos/{nome}", file=sys.stderr)
            return 2
        alvo = destino / nome
        if alvo.exists() and MARCA not in alvo.read_text(encoding="utf-8", errors="replace"):
            print(f"instalar_gatilhos: já existe um gatilho {nome} que não é deste instalador; nada mudou",
                  file=sys.stderr)
            return 2
    destino.mkdir(parents=True, exist_ok=True)
    for nome in GATILHOS:
        versionado = repo / "scripts" / "gatilhos" / nome
        versionado.chmod(versionado.stat().st_mode | 0o111)
        alvo = destino / nome
        alvo.write_text(embrulho(nome), encoding="utf-8")
        alvo.chmod(0o755)
    git(repo, "config", "--local", "dk.python", sys.executable)
    git(repo, "config", "--local", "dk.termos", str(lista))
    print("instalar_gatilhos: gatilhos instalados (pre-commit, commit-msg).")
    return 0


def remover(repo: Path) -> int:
    destino = pasta_dos_gatilhos(repo)
    for nome in GATILHOS:
        alvo = destino / nome
        if alvo.exists() and MARCA in alvo.read_text(encoding="utf-8", errors="replace"):
            alvo.unlink()
    for chave in ("dk.python", "dk.termos"):
        git(repo, "config", "--local", "--unset", chave, ok=(0, 5))
    print("instalar_gatilhos: gatilhos removidos.")
    return 0


def autoteste() -> int:
    def falha(msg: str) -> int:
        print(f"autoteste: falhou ({msg})")
        return 1

    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        lista = base / "termos.txt"
        lista.write_text("[nomes palavra]\nSicrano\n", encoding="utf-8")
        repo = base / "repo"
        (repo / "scripts").mkdir(parents=True)
        for f in ("guarda_vazamento.py", "guarda_excecoes.json"):
            shutil.copy(RAIZ / "scripts" / f, repo / "scripts" / f)
        shutil.copytree(RAIZ / "scripts" / "gatilhos", repo / "scripts" / "gatilhos")
        git(repo, "init", "-q")
        git(repo, "config", "user.name", "Teste")
        git(repo, "config", "user.email", "teste@example.invalid")
        if instalar(repo, None) != 2:
            return falha("instalou sem a lista")
        if instalar(repo, str(lista)) != 0:
            return falha("não instalou")
        if instalar(repo, str(lista)) != 0:
            return falha("reinstalar por cima do próprio gatilho falhou")

        def commit(msg: str) -> int:
            return git(repo, "commit", "-q", "-m", msg, ok=(0, 1)).returncode

        git(repo, "add", "scripts")
        if commit("a guarda") != 0:
            return falha("o commit limpo foi barrado")
        (repo / "nota.md").write_text("o Sicrano\n", encoding="utf-8")
        git(repo, "add", "nota.md")
        if commit("nota") == 0:
            return falha("o commit com termo entrou")
        (repo / "nota.md").write_text("neutro\n", encoding="utf-8")
        git(repo, "add", "nota.md")
        if commit("nota para o Sicrano") == 0:
            return falha("a mensagem com termo entrou")
        if commit("nota neutra") != 0:
            return falha("o commit limpo, depois, foi barrado")
        git(repo, "config", "--local", "dk.termos", str(base / "nao-existe.txt"))
        (repo / "outra.md").write_text("neutro\n", encoding="utf-8")
        git(repo, "add", "outra.md")
        if commit("sem lista") == 0:
            return falha("o commit sem a lista entrou (o gatilho tem de falhar fechado)")
        remover(repo)
        destino = pasta_dos_gatilhos(repo)
        if any((destino / n).exists() for n in GATILHOS):
            return falha("o --remover não tirou os gatilhos")
        if git(repo, "config", "--local", "--get", "dk.termos", ok=(0, 1)).returncode == 0:
            return falha("o --remover não tirou a configuração")
        (destino / "pre-commit").write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        if instalar(repo, str(lista)) != 2 or MARCA in (destino / "pre-commit").read_text():
            return falha("sobrescreveu um gatilho alheio")
    print("autoteste: ok")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--termos", default=os.environ.get("DK_TERMOS_PRIVADOS"))
    p.add_argument("--remover", action="store_true")
    p.add_argument("--teste", action="store_true")
    a = p.parse_args(argv)
    if a.teste:
        return autoteste()
    if a.remover:
        return remover(RAIZ)
    return instalar(RAIZ, a.termos)


if __name__ == "__main__":
    sys.exit(main())
