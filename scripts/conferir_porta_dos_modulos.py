#!/usr/bin/env python3
"""Confere que o pacote sai sem os módulos opcionais.

O que faz: lê `plugin/src/modulosOpcionais.ts` e confere que a lista exportada
`MODULOS_OPCIONAIS` é a vazia e que o arquivo não importa nada de `opcionais/` nem de `mobile/`;
e confere que as pastas `plugin/src/opcionais` e `plugin/src/mobile` não existem.

Por quê: a v0 sai sem o agente do celular e sem as vistas do agente. No cofre de origem a porta
dos módulos tem duas listas (a cheia e a vazia), e a exportação copia a vazia com o nome que o
`main.ts` importa. A prova do grafo de imports fica no cofre, porque lê as duas listas; aqui
basta conferir que o pacote recebeu a vazia e nenhum dos arquivos que ela deixa de fora.

Erro e ataque: o arquivo ausente ou ilegível sai com 2; uma lista com algum item, um import de
`opcionais/` ou `mobile/`, ou uma das pastas presente saem com 1 e dizem o quê.
Prova: rodar sem argumentos (sai com 0 no repositório como está); `--teste` monta pacotes falsos
numa pasta temporária, um certo e um para cada erro, e confere o veredito de cada um.
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
LISTA = Path("plugin/src/modulosOpcionais.ts")
PASTAS_FORA = (Path("plugin/src/opcionais"), Path("plugin/src/mobile"))

# A declaração da lista: `export const MODULOS_OPCIONAIS ... = [ ... ];`, com o tipo opcional.
DECLARACAO = re.compile(r"export\s+const\s+MODULOS_OPCIONAIS\b[^=]*=\s*\[(.*?)\]\s*;", re.S)
IMPORT_FORA = re.compile(r"""(?:import|from|require\()\s*[^;]*?['"]\.{1,2}/(?:[^'"]*/)?(?:opcionais|mobile)(?:/|['"])""")


def sem_comentarios(codigo: str) -> str:
    codigo = re.sub(r"/\*.*?\*/", "", codigo, flags=re.S)
    return re.sub(r"//[^\n]*", "", codigo)


def conferir(raiz: Path) -> list[str]:
    try:
        codigo = (raiz / LISTA).read_text(encoding="utf-8")
    except OSError as erro:
        raise SystemExit(f"conferir_porta_dos_modulos: não se lê {LISTA} ({erro})")
    problemas = []
    limpo = sem_comentarios(codigo)
    achados = DECLARACAO.findall(limpo)
    if len(achados) != 1:
        problemas.append(f"{LISTA}: esperava uma declaração de MODULOS_OPCIONAIS, achei {len(achados)}")
    elif achados[0].strip():
        problemas.append(f"{LISTA}: a lista MODULOS_OPCIONAIS não está vazia ({achados[0].strip()[:60]})")
    if IMPORT_FORA.search(limpo):
        problemas.append(f"{LISTA}: importa de opcionais/ ou mobile/")
    for pasta in PASTAS_FORA:
        if (raiz / pasta).exists():
            problemas.append(f"{pasta}: existe no pacote")
    return problemas


VAZIA = """import type { ModuloOpcional } from './moduloOpcional';
/** A lista do pacote: nenhum (um comentário com [ algo ] não conta). */
export const MODULOS_OPCIONAIS: readonly ModuloOpcional[] = [];
"""
CHEIA = """import type { ModuloOpcional } from './moduloOpcional';
import { moduloDoAgente } from './opcionais/agente';
export const MODULOS_OPCIONAIS: readonly ModuloOpcional[] = [moduloDoAgente];
"""
SO_IMPORT = """import type { ModuloOpcional } from './moduloOpcional';
import './mobile/registro';
export const MODULOS_OPCIONAIS: readonly ModuloOpcional[] = [];
"""


def autoteste() -> int:
    casos = [
        ("a lista vazia, sem as pastas", VAZIA, (), 0),
        ("a lista com um módulo", CHEIA, (), 2),  # a lista não vazia e o import
        ("um import de mobile/", SO_IMPORT, (), 1),
        ("a pasta opcionais presente", VAZIA, ("plugin/src/opcionais",), 1),
        ("a pasta mobile presente", VAZIA, ("plugin/src/mobile",), 1),
    ]
    falhas = 0
    for nome, codigo, pastas, esperado in casos:
        with tempfile.TemporaryDirectory() as tmp:
            raiz = Path(tmp)
            (raiz / LISTA).parent.mkdir(parents=True)
            (raiz / LISTA).write_text(codigo, encoding="utf-8")
            for pasta in pastas:
                (raiz / pasta).mkdir(parents=True)
            achados = conferir(raiz)
        certo = len(achados) == esperado
        falhas += not certo
        print(f"  {'ok ' if certo else 'ERRO'} {nome}: {len(achados)} problema(s), esperado {esperado}")
    print("autoteste: passou." if not falhas else f"autoteste: {falhas} caso(s) falharam.")
    return 1 if falhas else 0


def main(argv: list[str]) -> int:
    if "--teste" in argv:
        return autoteste()
    problemas = conferir(RAIZ)
    for p in problemas:
        print(f"  {p}")
    if problemas:
        print(f"porta dos módulos: {len(problemas)} problema(s).")
        return 1
    print("porta dos módulos: a lista do pacote é a vazia e não há opcionais/ nem mobile/. Passou.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
