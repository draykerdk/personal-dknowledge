#!/usr/bin/env python3
"""A guarda de vazamento: falha se algum termo privado aparece no pacote.

O que faz: varre todos os arquivos de texto de uma pasta (por padrão, a raiz deste repositório)
e procura os termos de uma lista privada (nomes, valores, áreas, ids de protocolo, e-mails,
caminhos, nomes de fornecedores). Procura no conteúdo e nos nomes dos arquivos e das pastas.
Procura também, sem lista, as falas citadas de alguém com data (a categoria `falas`: "ele, 30/10",
"(ela, 29/10)", "o pedido de 28/10", "as palavras dele"), que não nomeiam ninguém mas são o texto
de uma pessoa. Sai com 1 se acha algum, com 0 se não acha nenhum e com 2 se a lista não foi dada.

Os modos de varrer (um por vez):
    (padrão)          a pasta, como está no disco
    --historico       cada versão de cada arquivo em todos os commits do repositório, as mensagens
                      dos commits e os nomes e e-mails de autor e de quem fez o commit: um arquivo
                      que entrou e saiu continua na história
    --indice          o que está preparado para o próximo commit (o índice do git), e não o disco
    --mensagem ARQ    o texto de uma mensagem de commit (as linhas com # são ignoradas)

Por quê: o pacote aberto nasce de um cofre pessoal. A cópia é por lista de permitidos
(`scripts/lista_permitidos.txt`), e esta guarda é a segunda trava: prova, na saída, que nada
pessoal entrou. A lista de termos mora FORA do repositório, porque ela mesma é pessoal. O gatilho
antes do commit (`scripts/gatilhos/`, instalado por `scripts/instalar_gatilhos.py`) roda os modos
`--indice` e `--mensagem`; antes do primeiro envio roda-se o `--historico`.

De onde vem a lista: `--termos CAMINHO`, a variável de ambiente `DK_TERMOS_PRIVADOS` ou, no
repositório, a configuração local `git config dk.termos` (que o instalador grava).
Formato da lista: cabeçalhos `[categoria modo]` e um termo por linha; `#` começa comentário.
Os modos:
    palavra        palavra inteira, sem diferença de maiúscula
    palavra_exata  palavra inteira, com a maiúscula como está
    trecho         qualquer pedaço do texto, sem diferença de maiúscula
    literal        só entre aspas ('x', "x" ou `x`), como um id escrito no código

As exceções (`scripts/guarda_excecoes.json`, dentro do repositório) dizem, por caminho, que
categorias são permitidas ali e por quê, sem nunca escrever o termo. Exemplo: o nome público do
autor no LICENSE. No `--historico`, o autor e quem fez o commit podem ter a categoria
`autor_publico` (o nome público é o autor dos commits), e o número da conta no e-mail sem resposta
do GitHub não conta.

Erro e ataque: a saída padrão mascara o termo (só a primeira letra e o tamanho), para a guarda
poder rodar num lugar público sem publicar a lista; `--mostrar` revela, só para uso local.
Um termo que ninguém pôs na lista passa: por isso a cópia é por lista de permitidos, e não
só por esta guarda. Sem a lista, a guarda sai com 2 e o gatilho barra o commit (falha fechada).

Prova: `python3 -B scripts/guarda_vazamento.py --teste` roda o autoteste (um termo plantado
numa pasta temporária tem de ser achado e a pasta limpa tem de passar; uma fala datada é achada;
num repositório git temporário, um termo que entrou num commit e saiu no seguinte é achado pelo
`--historico` e não pelo disco; o `--indice` vê o que foi preparado e não o disco; a mensagem com
termo é barrada).
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

MODOS = {"palavra", "palavra_exata", "trecho", "literal"}
PASTAS_IGNORADAS = {".git", "node_modules"}
TAMANHO_MAXIMO = 5 * 1024 * 1024  # arquivos maiores que isso são acusados, não lidos
RAIZ_DO_REPO = Path(__file__).resolve().parent.parent
EXCECOES_PADRAO = RAIZ_DO_REPO / "scripts" / "guarda_excecoes.json"


@dataclass(frozen=True)
class Termo:
    categoria: str
    modo: str
    texto: str
    padrao: re.Pattern


@dataclass(frozen=True)
class Achado:
    caminho: str
    linha: int
    categoria: str
    termo: str


# As falas citadas com data: o texto de uma pessoa sem o nome dela. Não dependem da lista privada.
# O `texto` de cada uma é o nome do padrão (é o que a saída mostra), nunca o trecho achado.
FALAS = (
    Termo("falas", "padrao", "ele_ou_ela_com_data", re.compile(r"\b[Ee]l[ea],\s*\d{1,2}/\d{1,2}")),
    Termo("falas", "padrao", "parenteses_ele_com_data", re.compile(r"\(\s*[Ee]l[ea],?\s*\d{1,2}/\d{1,2}")),
    Termo("falas", "padrao", "palavras_dele",
          re.compile(r"\b(palavras|fala|falas|correção|pedido|escada|frase)\s+del[ea]\b")),
    Termo("falas", "padrao", "pedido_de_data",
          re.compile(r"\b(pedido|resposta|fala|palavras|correção)\s+(de|do dia)\s+\d{1,2}/\d{1,2}\b")),
)


def compilar(modo: str, texto: str) -> re.Pattern:
    """O padrão de busca de um termo, pelo modo dele."""
    t = re.escape(texto)
    if modo == "trecho":
        return re.compile(t, re.IGNORECASE)
    if modo == "literal":
        return re.compile(r"(['\"`])" + t + r"\1")
    borda = r"(?<![\w])" + t + r"(?![\w])"
    if modo == "palavra":
        return re.compile(borda, re.IGNORECASE)
    return re.compile(borda)  # palavra_exata


def ler_termos(caminho: Path) -> list[Termo]:
    """Lê a lista privada. Cabeçalho inválido ou termo fora de seção derruba a leitura."""
    termos: list[Termo] = []
    categoria = modo = None
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.strip()
        if not linha or linha.startswith("#"):
            continue
        m = re.fullmatch(r"\[(\S+)\s+(\S+)\]", linha)
        if m:
            categoria, modo = m.group(1), m.group(2)
            if modo not in MODOS:
                raise SystemExit(f"lista de termos, linha {n}: modo desconhecido '{modo}'")
            continue
        if categoria is None:
            raise SystemExit(f"lista de termos, linha {n}: termo antes de qualquer [categoria modo]")
        termos.append(Termo(categoria, modo, linha, compilar(modo, linha)))
    if not termos:
        raise SystemExit("a lista de termos está vazia")
    return termos


def ler_excecoes(caminho: Path | None) -> list[tuple[str, set[str]]]:
    """As exceções por caminho: [(glob, {categorias permitidas})]."""
    if caminho is None or not caminho.exists():
        return []
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    saida = []
    for item in dados.get("excecoes", []):
        if not item.get("porque"):
            raise SystemExit(f"exceção sem porquê: {item.get('caminho')}")
        saida.append((item["caminho"], set(item["categorias"])))
    return saida


def permitidas(rel: str, excecoes: list[tuple[str, set[str]]]) -> set[str]:
    cats: set[str] = set()
    for glob, c in excecoes:
        if fnmatch.fnmatch(rel, glob):
            cats |= c
    return cats


def arquivos(raiz: Path):
    for pasta, subpastas, nomes in os.walk(raiz):
        subpastas[:] = sorted(s for s in subpastas if s not in PASTAS_IGNORADAS)
        for nome in sorted(nomes):
            yield Path(pasta) / nome


def achar_no_nome(rel: str, termos, livres: set[str], rotulo: str | None = None) -> list[Achado]:
    """O caminho também é texto: um nome de pasta pessoal vaza tanto quanto o conteúdo."""
    return [Achado(rotulo or rel, 0, t.categoria, t.texto) for t in termos
            if t.categoria not in livres and t.padrao.search(rel)]


def achar_no_texto(rotulo: str, dados: bytes, termos, livres: set[str]) -> list[Achado]:
    """Os achados num conteúdo. Binário (um NUL no começo) não é varrido; grande demais é acusado."""
    if len(dados) > TAMANHO_MAXIMO:
        return [Achado(rotulo, 0, "arquivo_grande", "(não lido)")]
    if b"\x00" in dados[:8192]:
        return []  # binário: imagens e fontes não são varridos por texto
    achados: list[Achado] = []
    texto = dados.decode("utf-8", errors="replace")
    for n, linha in enumerate(texto.splitlines(), 1):
        for t in termos:
            if t.categoria not in livres and t.padrao.search(linha):
                achados.append(Achado(rotulo, n, t.categoria, t.texto))
    return achados


def varrer(raiz: Path, termos: list[Termo], excecoes: list[tuple[str, set[str]]]) -> list[Achado]:
    """O modo padrão: a pasta como está no disco."""
    achados: list[Achado] = []
    for caminho in arquivos(raiz):
        rel = caminho.relative_to(raiz).as_posix()
        livres = permitidas(rel, excecoes)
        achados += achar_no_nome(rel, termos, livres)
        try:
            if caminho.stat().st_size > TAMANHO_MAXIMO:
                achados.append(Achado(rel, 0, "arquivo_grande", "(não lido)"))
                continue
            dados = caminho.read_bytes()
        except OSError:
            continue
        achados += achar_no_texto(rel, dados, termos, livres)
    return achados


def git(repo: Path, *args: str, entrada: bytes | None = None) -> bytes:
    """Um comando git no repositório, sem as variáveis GIT_* herdadas (um gatilho as define)."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    r = subprocess.run(["git", "-C", str(repo), *args], input=entrada, capture_output=True, env=env)
    if r.returncode != 0:
        raise SystemExit(f"guarda: o git falhou ({' '.join(args[:2])}): {r.stderr.decode(errors='replace').strip()}")
    return r.stdout


def ler_blobs(repo: Path, shas: list[str]) -> dict[str, bytes]:
    """O conteúdo de cada blob, numa chamada só (`git cat-file --batch`)."""
    if not shas:
        return {}
    saida = git(repo, "cat-file", "--batch", entrada=("\n".join(shas) + "\n").encode())
    blobs: dict[str, bytes] = {}
    i = 0
    for sha in shas:
        fim = saida.index(b"\n", i)
        tamanho = int(saida[i:fim].split()[2])
        blobs[sha] = saida[fim + 1:fim + 1 + tamanho]
        i = fim + 1 + tamanho + 1
    return blobs


def varrer_arvore(repo: Path, pares, termos, excecoes, prefixo=lambda sha, rel: rel) -> list[Achado]:
    """Os achados num conjunto de (blob, caminho); cada blob é lido uma vez."""
    conteudos = ler_blobs(repo, sorted({sha for sha, _ in pares}))
    achados: list[Achado] = []
    for sha, rel in pares:
        livres = permitidas(rel, excecoes)
        rotulo = prefixo(sha, rel)
        achados += achar_no_nome(rel, termos, livres, rotulo)
        achados += achar_no_texto(rotulo, conteudos[sha], termos, livres)
    return achados


def varrer_indice(repo: Path, termos, excecoes) -> list[Achado]:
    """O modo --indice: o que está preparado para o próximo commit."""
    pares = []
    for linha in git(repo, "ls-files", "-s", "-z").decode().split("\0"):
        if not linha:
            continue
        info, rel = linha.split("\t", 1)
        modo, sha, _ = info.split()
        if modo != "160000":  # um submódulo não tem blob aqui
            pares.append((sha, rel))
    return varrer_arvore(repo, pares, termos, excecoes)


# O e-mail sem resposta do GitHub (`<número>+<nome>@users.noreply.github.com`) é o endereço público
# da conta: no campo de autor, o número da conta não conta como termo (o nome continua contando,
# com a exceção de `autor_publico`).
NOREPLY = re.compile(r"\b\d+\+([^@\s<>]+)@users\.noreply\.github\.com")


def varrer_historico(repo: Path, termos, excecoes) -> list[Achado]:
    """O modo --historico: cada versão de cada arquivo, as mensagens e os autores de todos os commits."""
    commits = git(repo, "rev-list", "--all").decode().split()
    pares: dict[tuple[str, str], str] = {}  # (blob, caminho) -> o primeiro commit em que apareceu
    achados: list[Achado] = []
    for c in reversed(commits):
        for linha in git(repo, "ls-tree", "-r", "-z", c).decode().split("\0"):
            if not linha:
                continue
            info, rel = linha.split("\t", 1)
            _, tipo, sha = info.split()
            if tipo == "blob":
                pares.setdefault((sha, rel), c[:7])
        mensagem = git(repo, "log", "-1", "--format=%B", c)
        achados += achar_no_texto(f"{c[:7]} (mensagem)", mensagem, termos, set())
        pessoas = NOREPLY.sub(r"\1@users.noreply.github.com", git(repo, "log", "-1", "--format=%an <%ae>%n%cn <%ce>", c).decode())
        pessoas = pessoas.encode()
        achados += achar_no_texto(f"{c[:7]} (autor)", pessoas, termos, {"autor_publico"})
    achados += varrer_arvore(repo, list(pares), termos, excecoes,
                             prefixo=lambda sha, rel: f"{pares[(sha, rel)]}:{rel}")
    return achados


def varrer_mensagem(arquivo: Path, termos) -> list[Achado]:
    """O modo --mensagem: o texto de uma mensagem de commit, sem as linhas de comentário do git."""
    linhas = [l for l in arquivo.read_text(encoding="utf-8", errors="replace").splitlines() if not l.startswith("#")]
    return achar_no_texto("(mensagem do commit)", "\n".join(linhas).encode(), termos, set())


def mascarar_caminho(rel: str, termos: list[Termo]) -> str:
    """O caminho com cada termo achado trocado por `?` (um por letra), para uma lista de barrados
    poder nomear o arquivo sem escrever o termo. O `?` casa um caractere só: o padrão barra o
    arquivo e, no pior caso, um vizinho de nome parecido (o lado seguro)."""
    for t in termos:
        rel = t.padrao.sub(lambda m: m.group(0)[0] + "?" * (len(m.group(0)) - 2) + m.group(0)[-1]
                           if t.modo == "literal" else "?" * len(m.group(0)), rel)
    return rel


def mascarar(termo: str) -> str:
    return termo[:1] + "*" * max(len(termo) - 1, 0)


def relatar(achados: list[Achado], mostrar: bool, resumo: bool) -> None:
    if resumo:
        por_arquivo: dict[str, dict[str, int]] = {}
        for a in achados:
            por_arquivo.setdefault(a.caminho, {}).setdefault(a.categoria, 0)
            por_arquivo[a.caminho][a.categoria] += 1
        for caminho in sorted(por_arquivo):
            cats = ", ".join(f"{c} {n}" for c, n in sorted(por_arquivo[caminho].items()))
            print(f"{caminho}: {cats}")
        return
    for a in achados:
        # o nome de um padrão de fala não é privado: aparece inteiro
        termo = a.termo if (mostrar or a.categoria == "falas") else mascarar(a.termo)
        onde = f"{a.caminho}:{a.linha}" if a.linha else f"{a.caminho} (nome)"
        print(f"{onde}: [{a.categoria}] {termo}")


def autoteste() -> int:
    """O autoteste: o disco, as falas, a exceção, e num repositório git temporário a história, o
    índice e a mensagem. Cada caso diz o que falhou."""
    def falha(msg: str) -> int:
        print(f"autoteste: falhou ({msg})")
        return 1

    with tempfile.TemporaryDirectory() as d:
        raiz = Path(d)
        lista = raiz / "termos.txt"
        lista.write_text("[nomes palavra]\nFulano\n[ids literal]\nprotocolo_x\n", encoding="utf-8")
        termos = ler_termos(lista)
        todos = [*termos, *FALAS]
        pacote = raiz / "pacote"
        pacote.mkdir()
        (pacote / "a.md").write_text("texto neutro, abaixo dele\n", encoding="utf-8")
        (pacote / "b.ts").write_text("const id = protocolo_x; // sem aspas, não é id\n", encoding="utf-8")
        if varrer(pacote, todos, []):
            return falha("achou termo na pasta limpa")
        (pacote / "a.md").write_text("o fulano escreveu\n", encoding="utf-8")
        (pacote / "b.ts").write_text("run('protocolo_x');\n", encoding="utf-8")
        (pacote / "c.ts").write_text('// Por quê: ele, 30/10: "assim não"\n// o pedido de 28/10 (rolar)\n', encoding="utf-8")
        achados = varrer(pacote, todos, [])
        if {(a.caminho, a.categoria) for a in achados} != {("a.md", "nomes"), ("b.ts", "ids"), ("c.ts", "falas")}:
            return falha(f"achados {achados}")
        if {a.linha for a in achados if a.caminho == "c.ts"} != {1, 2}:
            return falha("as duas falas datadas não foram achadas")
        if sorted({a.caminho for a in varrer(pacote, todos, [("a.md", {"nomes"})])}) != ["b.ts", "c.ts"]:
            return falha("a exceção por caminho não valeu")

        repo = raiz / "repo"
        repo.mkdir()
        try:
            git(repo, "init", "-q")
        except (SystemExit, FileNotFoundError):
            print("autoteste: ok (sem git: os modos do git não foram testados)")
            return 0
        git(repo, "config", "user.name", "Teste")
        git(repo, "config", "user.email", "teste@example.invalid")
        git(repo, "config", "core.hooksPath", "/dev/null")
        (repo / "nota.md").write_text("o Fulano passou aqui\n", encoding="utf-8")
        git(repo, "add", "nota.md")
        git(repo, "commit", "-q", "-m", "primeira")
        (repo / "nota.md").write_text("texto neutro\n", encoding="utf-8")
        git(repo, "add", "nota.md")
        git(repo, "commit", "-q", "-m", "segunda, com o id citado: 'protocolo_x'")
        if varrer(repo, todos, []):
            return falha("o disco do repositório limpo acusou")
        hist = varrer_historico(repo, todos, [])
        if sorted({a.categoria for a in hist}) != ["ids", "nomes"] \
                or not any(a.caminho.endswith(":nota.md") for a in hist) \
                or not any(a.caminho.endswith("(mensagem)") for a in hist):
            return falha(f"o histórico não achou o que entrou e saiu: {hist}")
        (repo / "nota.md").write_text("o fulano voltou\n", encoding="utf-8")
        if varrer_indice(repo, todos, []):
            return falha("o índice acusou o que ainda não foi preparado")
        git(repo, "add", "nota.md")
        (repo / "nota.md").write_text("texto neutro\n", encoding="utf-8")
        if [a.categoria for a in varrer_indice(repo, todos, [])] != ["nomes"]:
            return falha("o índice não viu o que foi preparado")
        msg = raiz / "MSG"
        msg.write_text("# Fulano numa linha de comentário não conta\nmudança neutra\n", encoding="utf-8")
        if varrer_mensagem(msg, todos):
            return falha("a linha de comentário da mensagem contou")
        msg.write_text("mudança para o Fulano\n", encoding="utf-8")
        if [a.categoria for a in varrer_mensagem(msg, todos)] != ["nomes"]:
            return falha("a mensagem com termo passou")
    print("autoteste: ok")
    return 0


def lista_do_repo(repo: Path) -> str | None:
    """A lista gravada pelo instalador (`git config dk.termos`), se houver."""
    try:
        r = subprocess.run(["git", "-C", str(repo), "config", "--get", "dk.termos"], capture_output=True, text=True)
    except FileNotFoundError:
        return None
    return r.stdout.strip() or None


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("raiz", nargs="?", default=str(RAIZ_DO_REPO), help="a pasta a varrer (padrão: o repositório)")
    p.add_argument("--termos", default=os.environ.get("DK_TERMOS_PRIVADOS"), help="a lista privada (ou DK_TERMOS_PRIVADOS)")
    p.add_argument("--excecoes", default=str(EXCECOES_PADRAO))
    p.add_argument("--sem-excecoes", action="store_true", help="ignora as exceções (para medir uma pasta de fora)")
    p.add_argument("--sem-falas", action="store_true", help="não procura as falas datadas")
    modo = p.add_mutually_exclusive_group()
    modo.add_argument("--historico", action="store_true", help="varre todos os commits do repositório")
    modo.add_argument("--indice", action="store_true", help="varre o que está preparado para o commit")
    modo.add_argument("--mensagem", metavar="ARQ", help="varre uma mensagem de commit")
    p.add_argument("--mostrar", action="store_true", help="mostra o termo achado (só para uso local)")
    p.add_argument("--resumo", action="store_true", help="uma linha por arquivo, com as categorias")
    p.add_argument("--teste", action="store_true", help="roda o autoteste e sai")
    a = p.parse_args(argv)
    if a.teste:
        return autoteste()
    raiz = Path(a.raiz).expanduser().resolve()
    termos_arg = a.termos or lista_do_repo(raiz)
    if not termos_arg:
        print("guarda: falta a lista de termos (--termos, DK_TERMOS_PRIVADOS ou git config dk.termos)", file=sys.stderr)
        return 2
    lista = Path(termos_arg).expanduser().resolve()
    if not lista.is_file():
        print("guarda: a lista de termos não existe no caminho dado", file=sys.stderr)
        return 2
    if lista.is_relative_to(raiz):
        print("guarda: a lista de termos está dentro da pasta varrida; ela tem de morar fora", file=sys.stderr)
        return 2
    termos = ler_termos(lista)
    todos = termos if a.sem_falas else [*termos, *FALAS]
    excecoes = [] if a.sem_excecoes else ler_excecoes(Path(a.excecoes))
    if a.historico:
        achados, nome = varrer_historico(raiz, todos, excecoes), f"{raiz.name} (história)"
    elif a.indice:
        achados, nome = varrer_indice(raiz, todos, excecoes), f"{raiz.name} (índice)"
    elif a.mensagem:
        achados, nome = varrer_mensagem(Path(a.mensagem), todos), "a mensagem do commit"
    else:
        achados, nome = varrer(raiz, todos, excecoes), raiz.name
    relatar(achados, a.mostrar, a.resumo)
    if achados:
        lugares = len({x.caminho for x in achados})
        print(f"guarda: {len(achados)} ocorrência(s) em {lugares} lugar(es) de {nome}. Falhou.", file=sys.stderr)
        return 1
    falas = 0 if a.sem_falas else len(FALAS)
    print(f"guarda: 0 ocorrência em {nome} ({len(termos)} termos e {falas} padrões de fala). Passou.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
