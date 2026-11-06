#!/usr/bin/env python3
"""Confere que cada definição de partida está documentada, e só ela.

O que faz: lê `config-padrao/definicoes.padrao.json` e `config-padrao/README.md` e confere que
cada campo do esquema (as folhas; as chaves que começam com `_` são comentários) tem a sua linha
na tabela dos campos, que cada papel de `protocolos_por_papel` tem a sua linha na tabela dos
papéis, que nenhuma linha da tabela nomeia um campo que não existe, e que os padrões são neutros
(textos vazios, listas e objetos vazios, menos as pastas, os arquivos, a porta da ponte, os papéis da v0
e as chaves da trilha de uso).

Por quê: o esquema e a documentação andam juntos; um campo novo sem o porquê, ou uma linha que
ficou de um campo que saiu, é ponta solta.

Erro e ataque: JSON inválido ou tabela ausente sai com 2; diferença sai com 1 e diz qual.
Prova: rodar sem argumentos (sai com 0 no repositório como está); `--teste` planta um campo sem
linha e confere que é acusado.
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
# a trilha de uso liga e desliga partes da tela e diz horas e números: comportamento, nada da pessoa
NAO_NEUTROS = ("pastas.", "arquivos.", "protocolos_por_papel.", "versao", "ponte.porta", "trilha.")


def folhas(d, prefixo=""):
    for k, v in d.items():
        if k.startswith("_"):
            continue
        caminho = f"{prefixo}{k}"
        if isinstance(v, dict) and v and not caminho.startswith("pesos."):
            yield from folhas(v, caminho + ".")
        else:
            yield caminho, v


def conferir(json_path: Path, readme_path: Path) -> list[str]:
    try:
        dados = json.loads(json_path.read_text(encoding="utf-8"))
        texto = readme_path.read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as erro:
        raise SystemExit(f"conferir_definicoes: não se lê ({erro})")
    linhas = [l for l in texto.splitlines() if l.startswith("| `")]
    documentados = set()
    for l in linhas:
        primeira = l.split("|")[1]
        documentados |= set(re.findall(r"`([^`]+)`", primeira))
    problemas = []
    campos = dict(folhas(dados))
    papeis = {k for k in campos if k.startswith("protocolos_por_papel.")}
    for campo in sorted(campos):
        if campo in papeis:
            if campo.split(".", 1)[1] not in documentados:
                problemas.append(f"papel sem linha na tabela dos papéis: {campo}")
            continue
        if campo not in documentados:
            problemas.append(f"campo sem linha na tabela: {campo}")
    papeis_nomes = {p.split(".", 1)[1] for p in papeis}
    for doc in sorted(documentados):
        if doc in campos or doc in papeis_nomes or doc == "protocolos_por_papel.<papel>":
            continue
        if re.fullmatch(r"[a-z_]+(\.[a-z_<>]+)*", doc):
            problemas.append(f"linha da tabela sem campo no esquema: {doc}")
    for campo, valor in campos.items():
        if campo.startswith(NAO_NEUTROS) or campo == "inicializado":
            continue
        if valor not in ("", [], {}) and valor is not False:
            problemas.append(f"padrão não neutro: {campo}")
    return problemas


def autoteste() -> int:
    with tempfile.TemporaryDirectory() as d:
        j, r = Path(d) / "d.json", Path(d) / "R.md"
        j.write_text('{"versao": 1, "a": {"b": ""}, "c": ["x"]}', encoding="utf-8")
        r.write_text("| Campo |\n|---|\n| `versao` | x |\n| `a.b` | x |\n", encoding="utf-8")
        p = conferir(j, r)
        if p != ["campo sem linha na tabela: c", "padrão não neutro: c"]:
            print(f"autoteste: falhou ({p})")
            return 1
    print("autoteste: ok")
    return 0


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if "--teste" in argv:
        return autoteste()
    problemas = conferir(RAIZ / "config-padrao" / "definicoes.padrao.json", RAIZ / "config-padrao" / "README.md")
    for p in problemas:
        print(p)
    print(f"conferir_definicoes: {len(problemas)} diferença(s).", file=sys.stderr)
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
