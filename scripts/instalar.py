#!/usr/bin/env python3
"""Instala um cofre novo do The Personal Dknowledge numa pasta, com um comando.

O que faz, na ordem:
1. recusa a pasta que já existe com arquivos (ou que fica dentro do repositório);
2. constrói o plugin (`npm ci` e `npm run build` em `plugin/`) se `plugin/main.js` não existe;
3. copia o esqueleto (`cofre-modelo/`) e, com `--com-exemplo`, o cofre de exemplo por cima
   (pelo `montar_cofre_exemplo.py`);
4. põe `main.js`, `manifest.json` e `styles.css` do plugin em `.obsidian/plugins/dfm-system/`;
5. instala o Dataview e o TaskNotes: baixa os mesmos três arquivos da última versão publicada de
   cada um no GitHub (os anexos da release), ou os copia de uma pasta local (`--plugins-de PASTA`,
   com `PASTA/dataview/` e `PASTA/tasknotes/`);
6. grava `.obsidian/community-plugins.json` com os três e o `data.json` de partida do Dataview com
   as consultas JavaScript ligadas (as notas do dia e da semana usam blocos `dataviewjs`);
7. imprime os próximos passos.

Por quê: o pacote só funciona com o plugin construído, os dois plugins da comunidade e o JavaScript
do Dataview ligado; fazer isso à mão era a parte difícil de experimentar.

Erro e ataque: nada é escrito antes de a pasta ser conferida; o download só aceita anexos da release
do próprio repositório do plugin (`https://github.com/<dono>/<repo>/releases/download/...`), com
tamanho máximo; da pasta local só se copiam os três nomes conhecidos, e o `manifest.json` tem de
dizer o id esperado (nunca se copia o `data.json` de outro cofre). Uma falha no meio deixa a pasta
como está e diz o que faltou; a pasta não é apagada.

Prova: `python3 -B scripts/instalar.py --teste` roda o autoteste (a escolha dos anexos a partir de
uma release de exemplo, a recusa da pasta com arquivos, os dois JSON gravados); a jornada inteira
se prova abrindo a pasta no Obsidian.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PLUGIN = RAIZ / "plugin"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from montar_cofre_exemplo import montar  # noqa: E402  (o esqueleto e o exemplo têm um dono só)

# ── Os dados ────────────────────────────────────────────────────────────────────────────────

#: Os arquivos de um plugin do Obsidian; o `styles.css` pode faltar numa release.
ARQUIVOS_DO_PLUGIN = ("main.js", "manifest.json", "styles.css")
OBRIGATORIOS = ("main.js", "manifest.json")

#: Os plugins da comunidade que o pacote pede: o id (a pasta e o `id` do manifesto) e o repositório.
COMUNIDADE = (("dataview", "blacksmithgu/obsidian-dataview"), ("tasknotes", "callumalpass/tasknotes"))

#: O id do plugin do pacote (o `id` de `plugin/manifest.json`).
ID_DO_PACOTE = "dfm-system"

#: As chaves do Dataview que ligam as consultas JavaScript (as de `DEFAULT_SETTINGS` dele).
DATAVIEW_JS = {"enableDataviewJs": True, "enableInlineDataviewJs": True}

#: Os estados das tarefas do sistema para o TaskNotes (o TaskNotes de fábrica traz outros).
ESTADOS_DO_TASKNOTES = RAIZ / "config-padrao" / "tasknotes.json"


def data_do_tasknotes() -> dict:
    """O que faz: o `data.json` de partida do TaskNotes: o estado padrão e os estados do sistema, sem a nota `_sobre`."""
    cfg = json.loads(ESTADOS_DO_TASKNOTES.read_text(encoding="utf-8"))
    return {k: v for k, v in cfg.items() if not k.startswith("_")}


#: O teto de um anexo baixado.
TAMANHO_MAXIMO = 20 * 1024 * 1024


# ── As funções (puras) ──────────────────────────────────────────────────────────────────────

def anexos_da_release(release: object, repositorio: str) -> dict[str, str] | str:
    """O que faz: os endereços de `main.js`, `manifest.json` e `styles.css` numa release do GitHub.

    Entra → sai: o JSON da release (`/releases/latest`) e `dono/repo` → `{nome: url}`, ou o motivo.
    Erro e ataque: anexo fora de `https://github.com/<dono/repo>/releases/download/` não vale (um
    JSON adulterado não aponta para outro lugar); faltar `main.js` ou `manifest.json` é o motivo;
    o `styles.css` pode faltar; nome repetido fica com o primeiro.
    """
    if not isinstance(release, dict) or not isinstance(release.get("assets"), list):
        return "a resposta não é uma release com anexos"
    prefixo = f"https://github.com/{repositorio}/releases/download/"
    achados: dict[str, str] = {}
    for anexo in release["assets"]:
        nome = anexo.get("name") if isinstance(anexo, dict) else None
        url = anexo.get("browser_download_url") if isinstance(anexo, dict) else None
        if nome in ARQUIVOS_DO_PLUGIN and nome not in achados and isinstance(url, str) and url.startswith(prefixo):
            achados[nome] = url
    faltam = [n for n in OBRIGATORIOS if n not in achados]
    return f"a release não tem {', '.join(faltam)}" if faltam else achados


def lista_da_comunidade() -> list[str]:
    """O que faz: o conteúdo de `.obsidian/community-plugins.json`: os dois da comunidade e o do pacote."""
    return [id_ for id_, _ in COMUNIDADE] + [ID_DO_PACOTE]


def problema_do_destino(destino: Path) -> str | None:
    """O que faz: o motivo de recusar a pasta de destino, ou `None`.

    Erro e ataque: a pasta com arquivos (mesmo ocultos) e a pasta dentro do repositório são
    recusadas; um arquivo no lugar da pasta também.
    """
    destino = destino.expanduser().resolve()
    if destino == RAIZ or RAIZ in destino.parents:
        return "a pasta não pode ficar dentro do repositório"
    if destino.exists() and not destino.is_dir():
        return "o destino é um arquivo, não uma pasta"
    if destino.exists() and any(destino.iterdir()):
        return "a pasta já existe e tem arquivos; use uma pasta nova ou vazia"
    return None


def manifesto_confere(pasta: Path, id_esperado: str) -> str | None:
    """O que faz: o motivo de recusar uma pasta de plugin (faltam arquivos ou o id é outro), ou `None`."""
    faltam = [n for n in OBRIGATORIOS if not (pasta / n).is_file()]
    if faltam:
        return f"{pasta} não tem {', '.join(faltam)}"
    try:
        id_ = json.loads((pasta / "manifest.json").read_text(encoding="utf-8")).get("id")
    except (OSError, ValueError, AttributeError):
        return f"o manifest.json de {pasta} não se lê"
    return None if id_ == id_esperado else f"o manifest.json de {pasta} diz o id {id_!r}, e não {id_esperado!r}"


# ── Os efeitos (o disco, o npm, a rede) ─────────────────────────────────────────────────────

def construir_plugin() -> str | None:
    """O que faz: constrói o plugin se `plugin/main.js` falta; devolve o motivo da falha, ou `None`."""
    if (PLUGIN / "main.js").is_file():
        return None
    npm = shutil.which("npm")
    if not npm or not shutil.which("node"):
        return ("o plugin ainda não foi construído e falta o Node.js: instale o Node.js 20 ou mais novo "
                "(https://nodejs.org) e rode de novo")
    print("instalar: construindo o plugin (npm ci e npm run build em plugin/)…")
    for comando in ([npm, "ci"], [npm, "run", "build"]):
        r = subprocess.run(comando, cwd=PLUGIN)
        if r.returncode != 0:
            return f"`{' '.join(comando[1:])}` falhou em plugin/ (código {r.returncode})"
    return None if (PLUGIN / "main.js").is_file() else "o build terminou sem gerar plugin/main.js"


def copiar_plugin(origem: Path, destino: Path, nomes=ARQUIVOS_DO_PLUGIN) -> None:
    """O que faz: copia os arquivos conhecidos de um plugin que existem na origem (nunca o `data.json`)."""
    destino.mkdir(parents=True, exist_ok=True)
    for nome in nomes:
        if (origem / nome).is_file():
            shutil.copyfile(origem / nome, destino / nome)


def baixar(url: str) -> bytes:
    """O que faz: o corpo de um endereço https, com teto de tamanho e tempo."""
    pedido = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "instalar-dknowledge"})
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        corpo = resposta.read(TAMANHO_MAXIMO + 1)
    if len(corpo) > TAMANHO_MAXIMO:
        raise ValueError(f"{url} passa de {TAMANHO_MAXIMO // (1024 * 1024)} MB")
    return corpo


def baixar_plugin(repositorio: str, destino: Path) -> str | None:
    """O que faz: baixa os arquivos da última release de um plugin para a pasta dele; o motivo da falha, ou `None`."""
    try:
        release = json.loads(baixar(f"https://api.github.com/repos/{repositorio}/releases/latest"))
    except Exception as erro:  # a rede é a borda: o erro vira o motivo
        return f"não consegui ler a última release de {repositorio} ({erro})"
    anexos = anexos_da_release(release, repositorio)
    if isinstance(anexos, str):
        return f"{repositorio}: {anexos}"
    destino.mkdir(parents=True, exist_ok=True)
    for nome, url in anexos.items():
        try:
            (destino / nome).write_bytes(baixar(url))
        except Exception as erro:
            return f"não consegui baixar {nome} de {repositorio} ({erro})"
    return None


def instalar(destino: Path, com_exemplo: bool, plugins_de: Path | None) -> int:
    """O módulo: confere, constrói, copia, instala os plugins, grava a configuração e diz os passos."""
    destino = destino.expanduser().resolve()
    problema = problema_do_destino(destino)
    if problema:
        print(f"instalar: {problema}.", file=sys.stderr)
        return 2
    if plugins_de is not None:
        for id_, _ in COMUNIDADE:
            problema = manifesto_confere(plugins_de / id_, id_)
            if problema:
                print(f"instalar: {problema}.", file=sys.stderr)
                return 2
    problema = construir_plugin()
    if problema:
        print(f"instalar: {problema}.", file=sys.stderr)
        return 1
    if montar(destino, com_exemplo=com_exemplo) != 0:
        return 1
    plugins = destino / ".obsidian" / "plugins"
    copiar_plugin(PLUGIN, plugins / ID_DO_PACOTE)
    for id_, repositorio in COMUNIDADE:
        if plugins_de is not None:
            copiar_plugin(plugins_de / id_, plugins / id_)
            print(f"instalar: {id_} copiado de {plugins_de / id_}.")
            continue
        problema = baixar_plugin(repositorio, plugins / id_)
        if problema:
            print(f"instalar: {problema}. O cofre está em {destino}; instale o {id_} pelo Obsidian "
                  "(Plugins da comunidade) ou rode de novo numa pasta nova.", file=sys.stderr)
            return 1
        print(f"instalar: {id_} baixado da última versão de {repositorio}.")
    (destino / ".obsidian" / "community-plugins.json").write_text(json.dumps(lista_da_comunidade(), indent=2) + "\n", encoding="utf-8")
    (plugins / "dataview" / "data.json").write_text(json.dumps(DATAVIEW_JS, indent=2) + "\n", encoding="utf-8")
    (plugins / "tasknotes" / "data.json").write_text(json.dumps(data_do_tasknotes(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"""
Pronto: o cofre está em {destino}.

Próximos passos:
  1. No Obsidian, "Abrir pasta como cofre" e escolha essa pasta.
  2. Quando ele perguntar, confie no autor e ligue os plugins da comunidade
     (Dataview, TaskNotes e The Personal Dknowledge já estão na lista).
  3. Rode o protocolo 🌱 Inicializar o cofre (Ctrl/Cmd+D, ou a paleta de comandos):
     ele pergunta o seu nome, as áreas, os valores e o foco, e monta o resto.
  4. Abra a Missão e, no começo da semana, o 🌳.
""")
    return 0


# ── O autoteste ─────────────────────────────────────────────────────────────────────────────

def autoteste() -> int:
    """Prova: a escolha dos anexos, a recusa da pasta e os dois JSON, sem rede nem npm."""
    repo = "dono/plugin"
    base = f"https://github.com/{repo}/releases/download/1.2.3/"
    release = {"tag_name": "1.2.3", "assets": [
        {"name": "main.js", "browser_download_url": base + "main.js"},
        {"name": "manifest.json", "browser_download_url": base + "manifest.json"},
        {"name": "styles.css", "browser_download_url": base + "styles.css"},
        {"name": "plugin.zip", "browser_download_url": base + "plugin.zip"},
    ]}
    falhas = []
    def conferir(cond, oque):
        if not cond:
            falhas.append(oque)
    conferir(anexos_da_release(release, repo) == {n: base + n for n in ARQUIVOS_DO_PLUGIN}, "os três anexos da release")
    sem_css = {"assets": release["assets"][:2]}
    conferir(anexos_da_release(sem_css, repo) == {n: base + n for n in OBRIGATORIOS}, "o styles.css pode faltar")
    conferir(anexos_da_release({"assets": release["assets"][1:]}, repo) == "a release não tem main.js", "sem main.js é o motivo")
    outro = {"assets": [{"name": "main.js", "browser_download_url": "https://exemplo.invalido/main.js"}] + release["assets"][1:]}
    conferir(isinstance(anexos_da_release(outro, repo), str), "anexo de fora do repositório não vale")
    conferir(isinstance(anexos_da_release({"message": "Not Found"}, repo), str), "a resposta sem anexos é o motivo")
    conferir(isinstance(anexos_da_release([], repo), str), "a resposta que não é objeto é o motivo")
    conferir(lista_da_comunidade() == ["dataview", "tasknotes", "dfm-system"], "a lista dos plugins da comunidade")
    conferir(DATAVIEW_JS == {"enableDataviewJs": True, "enableInlineDataviewJs": True}, "o JavaScript do Dataview ligado")
    tn = data_do_tasknotes()
    valores = [e.get("value") for e in tn.get("customStatuses", [])]
    conferir({"inbox", "next-action", "in-progress", "waiting-on", "someday", "done"} <= set(valores)
             and tn.get("defaultTaskStatus") in valores and "_sobre" not in tn, "os estados do sistema no TaskNotes")
    with tempfile.TemporaryDirectory() as d:
        pasta = Path(d)
        conferir(problema_do_destino(pasta / "nova") is None, "a pasta nova vale")
        conferir(problema_do_destino(pasta) is None, "a pasta vazia vale")
        (pasta / ".oculto").write_text("x", encoding="utf-8")
        conferir(problema_do_destino(pasta) is not None, "a pasta com arquivos é recusada")
        conferir(problema_do_destino(RAIZ / "cofre-novo") is not None, "a pasta dentro do repositório é recusada")
        plugin = pasta / "p"
        plugin.mkdir()
        conferir(manifesto_confere(plugin, "dataview") is not None, "a pasta sem main.js é recusada")
        (plugin / "main.js").write_text("", encoding="utf-8")
        (plugin / "manifest.json").write_text('{"id": "outro"}', encoding="utf-8")
        conferir(manifesto_confere(plugin, "dataview") is not None, "o manifesto de outro plugin é recusado")
        (plugin / "manifest.json").write_text('{"id": "dataview"}', encoding="utf-8")
        conferir(manifesto_confere(plugin, "dataview") is None, "o manifesto certo vale")
        (plugin / "data.json").write_text("{}", encoding="utf-8")
        copiar_plugin(plugin, pasta / "copia")
        conferir(sorted(p.name for p in (pasta / "copia").iterdir()) == ["main.js", "manifest.json"], "o data.json nunca é copiado")
    for f in falhas:
        print(f"autoteste: falhou: {f}")
    print("autoteste: ok" if not falhas else f"autoteste: {len(falhas)} falha(s)")
    return 1 if falhas else 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("destino", nargs="?", help="a pasta do cofre novo (nova ou vazia, fora do repositório)")
    p.add_argument("--com-exemplo", action="store_true", help="põe por cima as notas da pessoa fictícia (cofre-exemplo/)")
    p.add_argument("--plugins-de", type=Path, metavar="PASTA", help="copia o Dataview e o TaskNotes de PASTA/dataview e PASTA/tasknotes, sem baixar")
    p.add_argument("--teste", action="store_true", help="roda o autoteste e sai")
    a = p.parse_args(argv)
    if a.teste:
        return autoteste()
    if not a.destino:
        p.error("falta a pasta do cofre (ou --teste)")
    return instalar(Path(a.destino), a.com_exemplo, a.plugins_de.expanduser().resolve() if a.plugins_de else None)


if __name__ == "__main__":
    sys.exit(main())
