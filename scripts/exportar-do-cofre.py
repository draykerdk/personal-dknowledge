#!/usr/bin/env python3
"""Exporta do cofre de origem para este repositório só o que a lista de permitidos nomeia.

O que faz: lê `scripts/lista_permitidos.txt`, copia do cofre de origem cada arquivo que uma
linha `copiar` pega e nenhuma linha `nunca` barra, cria as pastas vazias das linhas `pasta`
(o esqueleto do cofre) e, no fim, roda a guarda de vazamento sobre o repositório inteiro.
Sai com o código da guarda (0 = nada vazou).

Por quê: o pacote aberto nasce de um cofre pessoal. Copiar por lista de permitidos garante que
só sai o que alguém listou de propósito; o que ninguém listou fica, mesmo que seja novo.
A guarda é a segunda trava, na saída.

De onde vem o cofre: `--cofre CAMINHO` ou a variável de ambiente `DK_COFRE`. O caminho nunca
fica escrito aqui, porque ele mesmo é pessoal.

A gramática da lista (uma instrução por linha; `#` começa comentário):
    copiar <padrão no cofre> -> <pasta no repositório>
        o padrão aceita `*` e `**`; o arquivo vai para a pasta com o caminho relativo à parte
        fixa do padrão (a que vem antes do primeiro curinga)
    nunca <padrão no cofre>
        barra o que casar, mesmo que um `copiar` pegue; aqui `*` atravessa as barras
    copiar-como <arquivo no cofre> -> <arquivo no repositório>
        copia um arquivo só, com outro nome ou noutro lugar (sem curinga); as linhas `nunca`
        valem para ele como para as outras, e nenhum `copiar` com curinga o copia de novo com
        o nome de origem
    pasta <pasta no repositório>
        cria a pasta vazia, com um `.gitkeep` (não lê nada do cofre)
    proprio <padrão no repositório>
        o arquivo é escrito e mantido aqui, no repositório, e não sai do cofre: a exportação
        nunca o apaga nem o sobrescreve (um `copiar` que caia nele é um erro)

Erro e ataque: o que estiver fora do cofre (`..`, caminho absoluto, atalho simbólico) não é
copiado; nenhum destino sai do repositório; a trava fixa (`NUNCA_FIXO`) barra as pastas de
notas pessoais e os dados do plugin mesmo que a lista erre. Os arquivos exportados da última
vez ficam em `scripts/exportados.txt` (um relatório local, fora do git: ver o `.gitignore`); a
exportação seguinte apaga esses antes de copiar, para um arquivo tirado da lista sair também do
repositório, e nunca apaga um arquivo `proprio`. Rodar duas vezes seguidas dá o mesmo
repositório (a exportação é idempotente).

`--podar`: exporta, roda a guarda por arquivo e acrescenta à lista uma linha `nunca` para cada
arquivo de origem com vazamento, com as categorias achadas (nunca o termo). Depois exporta de
novo, já sem eles. É o jeito de estreitar a lista sem esconder o que ficou de fora: cada linha
podada é uma pendência.

Prova: `python3 -B scripts/exportar-do-cofre.py --seco` lista o que copiaria, sem gravar.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path, PurePosixPath

RAIZ = Path(__file__).resolve().parent.parent
LISTA = RAIZ / "scripts" / "lista_permitidos.txt"
EXPORTADOS = RAIZ / "scripts" / "exportados.txt"
GUARDA = RAIZ / "scripts" / "guarda_vazamento.py"

# A trava fixa: o que nunca sai, mesmo que a lista erre. São as pastas das notas da pessoa,
# os protocolos dela, os dados gravados do plugin e o que é gerado ou baixado.
NUNCA_FIXO = (
    "100 - AREAS/*",
    "300 - RUNTIME/*",
    "400 - MEMORY/*",
    "500 - RESOURCES/*",
    "900 - ARCHIVE/*",
    "TaskNotes/*",
    "000 - KERNEL/*",
    "200 - FUNCTIONS/Protocolos/*",
    "200 - FUNCTIONS/Habits/*",
    "*/data.json",
    "*/.git/*",
    "*/node_modules/*",
    "*/__pycache__/*",
    "*/main.js",
    "*-propostas.json",
    "*.canvas",
    "*.log",
)
CURINGAS = set("*?[")


def ler_lista(caminho: Path):
    copiar, nunca, pastas, como, proprios = [], [], [], [], []
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.split("#", 1)[0].strip()
        if not linha:
            continue
        verbo, _, resto = linha.partition(" ")
        resto = resto.strip()
        if verbo == "copiar":
            origem, seta, destino = resto.partition(" -> ")
            if not seta or not origem.strip() or not destino.strip():
                raise SystemExit(f"lista, linha {n}: use 'copiar <padrão> -> <pasta>'")
            copiar.append((origem.strip(), destino.strip(), n))
        elif verbo == "copiar-como":
            origem, seta, destino = resto.partition(" -> ")
            if not seta or not origem.strip() or not destino.strip():
                raise SystemExit(f"lista, linha {n}: use 'copiar-como <arquivo> -> <arquivo>'")
            if CURINGAS & set(origem):
                raise SystemExit(f"lista, linha {n}: copiar-como é para um arquivo só, sem curinga")
            como.append((origem.strip(), destino.strip(), n))
        elif verbo == "proprio":
            proprios.append(resto)
        elif verbo == "nunca":
            nunca.append(resto)
        elif verbo == "pasta":
            pastas.append(resto)
        else:
            raise SystemExit(f"lista, linha {n}: instrução desconhecida '{verbo}'")
    return copiar, nunca, pastas, como, proprios


def parte_fixa(padrao: str) -> PurePosixPath:
    partes = []
    for p in PurePosixPath(padrao).parts:
        if CURINGAS & set(p):
            break
        partes.append(p)
    return PurePosixPath(*partes)


def seguro_no_repo(destino: Path) -> Path:
    destino = destino.resolve()
    if destino != RAIZ and RAIZ not in destino.parents:
        raise SystemExit(f"destino fora do repositório: {destino}")
    if (RAIZ / ".git") in destino.parents or destino == RAIZ / ".git":
        raise SystemExit("destino dentro de .git")
    return destino


def barrado(rel: str, nunca: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel, p) for p in (*NUNCA_FIXO, *nunca))


def e_proprio(rel_repo: str, proprios: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel_repo, p) for p in proprios)


def planejar(cofre: Path, copiar, nunca, como=(), proprios=()):
    """O plano: {destino no repositório: origem no cofre}, e as contas por linha da lista."""
    plano: dict[Path, Path] = {}
    contas: dict[int, int] = defaultdict(int)
    renomeados = {PurePosixPath(o).as_posix() for o, _, _ in como}
    for padrao, pasta, n in copiar:
        if padrao.startswith("/") or ".." in PurePosixPath(padrao).parts:
            raise SystemExit(f"lista, linha {n}: o padrão tem de ficar dentro do cofre")
        fixa = parte_fixa(padrao)
        achados = [cofre / padrao] if not (CURINGAS & set(padrao)) else sorted(cofre.glob(padrao))
        for origem in achados:
            if origem.is_symlink() or not origem.is_file():
                continue
            try:
                rel = origem.resolve().relative_to(cofre).as_posix()
            except ValueError:
                continue  # saiu do cofre por algum caminho: não copia
            if barrado(rel, nunca) or rel in renomeados:
                continue
            base = fixa if (CURINGAS & set(padrao)) else fixa.parent
            destino = seguro_no_repo(RAIZ / pasta / PurePosixPath(rel).relative_to(base))
            if destino in plano and plano[destino] != origem:
                raise SystemExit(f"dois arquivos para o mesmo destino: {destino.relative_to(RAIZ)}")
            plano[destino] = origem
            contas[n] += 1
    for padrao, alvo, n in como:
        if padrao.startswith("/") or ".." in PurePosixPath(padrao).parts:
            raise SystemExit(f"lista, linha {n}: o arquivo tem de ficar dentro do cofre")
        origem = cofre / padrao
        if origem.is_symlink() or not origem.is_file():
            continue
        rel = origem.resolve().relative_to(cofre).as_posix()
        if barrado(rel, nunca):
            continue
        destino = seguro_no_repo(RAIZ / alvo)
        if destino in plano and plano[destino] != origem:
            raise SystemExit(f"dois arquivos para o mesmo destino: {destino.relative_to(RAIZ)}")
        plano[destino] = origem
        contas[n] += 1
    for destino in plano:
        rel_repo = destino.relative_to(RAIZ).as_posix()
        if e_proprio(rel_repo, list(proprios)):
            raise SystemExit(f"a lista copia por cima de um arquivo proprio do repositório: {rel_repo}")
    return plano, contas


def apagar_exportados_antes(proprios=()) -> int:
    if not EXPORTADOS.exists():
        return 0
    apagados = 0
    for linha in EXPORTADOS.read_text(encoding="utf-8").splitlines():
        if not linha.strip():
            continue
        alvo = seguro_no_repo(RAIZ / linha)
        if e_proprio(linha, list(proprios)):
            continue  # escrito aqui: a exportação nunca o apaga
        if alvo.is_file():
            alvo.unlink()
            apagados += 1
    # as pastas que ficaram vazias saem também (as do esqueleto têm .gitkeep e ficam)
    for pasta, _, _ in sorted(os.walk(RAIZ), key=lambda x: -len(x[0])):
        p = Path(pasta)
        if ".git" in p.parts or "node_modules" in p.parts or p == RAIZ:
            continue
        if not any(p.iterdir()):
            p.rmdir()
    return apagados


def exportar(cofre: Path, seco: bool) -> dict[Path, Path]:
    copiar, nunca, pastas, como, proprios = ler_lista(LISTA)
    plano, contas = planejar(cofre, copiar, nunca, como, proprios)
    for padrao, pasta, n in copiar:
        print(f"  {contas.get(n, 0):4d}  copiar {padrao} -> {pasta}")
    for padrao, alvo, n in como:
        print(f"  {contas.get(n, 0):4d}  copiar-como {padrao} -> {alvo}")
    print(f"  {len(proprios):4d}  arquivos proprios do repositório (nunca exportados nem apagados)")
    print(f"  {len(pastas):4d}  pastas do esqueleto")
    if seco:
        for destino in sorted(plano):
            print(f"        {destino.relative_to(RAIZ).as_posix()}")
        return plano
    apagados = apagar_exportados_antes(proprios)
    for destino, origem in sorted(plano.items()):
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origem, destino)
    for pasta in pastas:
        alvo = seguro_no_repo(RAIZ / pasta)
        alvo.mkdir(parents=True, exist_ok=True)
        (alvo / ".gitkeep").touch()
    EXPORTADOS.write_text("".join(f"{d.relative_to(RAIZ).as_posix()}\n" for d in sorted(plano)), encoding="utf-8")
    print(f"exportação: {len(plano)} arquivo(s) copiado(s), {apagados} da vez anterior apagado(s).")
    return plano


def guarda(*extra: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-B", str(GUARDA), str(RAIZ), *extra], capture_output=True, text=True)


def podar(plano: dict[Path, Path], cofre: Path) -> int:
    r = guarda("--resumo")
    if r.returncode == 2:
        print(r.stderr, file=sys.stderr)
        raise SystemExit(2)
    por_origem: dict[str, str] = {}
    exportados = {d.relative_to(RAIZ).as_posix(): o for d, o in plano.items()}
    for linha in r.stdout.splitlines():
        caminho, _, cats = linha.partition(": ")
        if caminho in exportados:
            por_origem[exportados[caminho].relative_to(cofre).as_posix()] = cats
    if not por_origem:
        return 0
    g = carregar_guarda()
    termos = g.ler_termos(Path(os.environ["DK_TERMOS_PRIVADOS"]).expanduser())
    with LISTA.open("a", encoding="utf-8") as f:
        f.write("\n# podados pela guarda (o arquivo tem termo privado; volta quando a pendência fechar).\n")
        f.write("# Um termo no nome do arquivo aparece como ?, para a lista não o escrever.\n")
        for origem, cats in sorted(por_origem.items()):
            f.write(f"nunca {g.mascarar_caminho(origem, termos)}  # guarda: {cats}\n")
    return len(por_origem)


def carregar_guarda():
    """A guarda como módulo, para usar a mesma lista e o mesmo jeito de mascarar."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("guarda_vazamento", GUARDA)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["guarda_vazamento"] = mod
    spec.loader.exec_module(mod)
    return mod


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--cofre", default=os.environ.get("DK_COFRE"), help="o cofre de origem (ou DK_COFRE)")
    p.add_argument("--seco", action="store_true", help="só lista o que copiaria")
    p.add_argument("--podar", action="store_true", help="estreita a lista pelos achados da guarda e exporta de novo")
    p.add_argument("--sem-guarda", action="store_true", help="não roda a guarda no fim")
    a = p.parse_args(argv)
    if not a.cofre:
        print("exportar: falta o cofre (--cofre ou DK_COFRE)", file=sys.stderr)
        return 2
    cofre = Path(a.cofre).expanduser().resolve()
    if not cofre.is_dir():
        print("exportar: o cofre não existe no caminho dado", file=sys.stderr)
        return 2
    if cofre == RAIZ or RAIZ in cofre.parents or cofre in RAIZ.parents:
        print("exportar: o cofre e o repositório não podem estar um dentro do outro", file=sys.stderr)
        return 2
    plano = exportar(cofre, a.seco)
    if a.seco or a.sem_guarda:
        return 0
    if a.podar:
        n = podar(plano, cofre)
        print(f"podar: {n} arquivo(s) de origem barrado(s) na lista; exportando de novo.")
        if n:
            exportar(cofre, False)
    r = guarda()
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
