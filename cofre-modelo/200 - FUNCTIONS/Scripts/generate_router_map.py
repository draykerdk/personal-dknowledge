#!/usr/bin/env python3
"""
generate_router_map.py — gera o mapa do 🧭 Router Central a partir dos JSON dos protocolos.

Por que existe: o 🧭 é a porta geral do sistema e precisa chegar a todo protocolo (Fase D,
plano de 22/10/2026, seção 6; arquitetura universal 4.1). A árvore inteira, desenhada à
mão, envelheceria a cada protocolo novo. Como o mapa estrutural (`generate_tree_map.py`),
o mapa é gerado da fonte: as perguntas dos routers viram nós, as opções viram setas e os
protocolos de destino viram cartões, em colunas por profundidade a partir do primeiro
menu. As setas de "❔ Não sei / outra coisa" e de "🔙" não aparecem (estão em toda
parada; uma nota de legenda diz isso).

As situações do nó (o P13, aprovado em 02/11): cada parada mostra, numa linha "Nos nós", os
tipos e as condições (o sinal ou o `estado:<estado>`) que o bloco `situacoes` dos modelos de tipo
(`200 - FUNCTIONS/Config/dominios/*.json`) leva até ela; o 🧭 continua o único mapa das situações,
e o `--check` o mantém em dia quando um modelo muda.

O canvas é só leitura: a próxima execução sobrescreve. O "Mapa de Decisões DFM.canvas",
desenhado à mão, é outro arquivo e não é tocado.

Uso:
    ~/.local/bin/python3.11 "200 - FUNCTIONS/Scripts/generate_router_map.py"          # escreve o mapa
    ~/.local/bin/python3.11 "200 - FUNCTIONS/Scripts/generate_router_map.py" --check  # juiz: exit 1 se defasado
"""

import glob
import hashlib
import json
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from audit_protocols import DONT_KNOW_OPTION, ROUTER_CENTRAL, load_protocols  # noqa: E402

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOMAIN_MODELS_DIR = os.path.join(VAULT, "200 - FUNCTIONS", "Config", "dominios")
DESTINO = os.path.join(VAULT, "000 - KERNEL", "03 - MANUAIS_OPERACIONAIS", "🧭 Router Central — Mapa.canvas")

COL_WIDTH = 560
NODE_WIDTH = 440
QUESTION_HEIGHT = 110
# A linha "Nos nós" das paradas com situação (o P13) pede mais altura no nó da pergunta.
SITUATION_LINE_HEIGHT = 50
CARD_HEIGHT = 80
GAP = 30
COLOR_QUESTION = "6"
COLOR_CARD = "4"


def _id(prefix, *parts):
    return f"{prefix}-" + hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


def _routers(d):
    dnp = d.get("dynamicNextProtocol")
    return [r for r in (dnp if isinstance(dnp, list) else ([dnp] if dnp else [])) if isinstance(r, dict)]


def _is_router(protos, pid):
    return pid in protos and pid.startswith("router_") and not protos[pid][1].get("redirect")


def _navigation(option):
    return isinstance(option, str) and option.strip().startswith(("🔙", "❔"))


def _condition_values(step):
    cond = step.get("condition") or {}
    value = cond.get("value")
    return cond.get("variable"), (value if isinstance(value, list) else [value])


def _resolve(protos, pid, depth=0):
    """O destino real: alias que leva a router vira o router (com as redirectVariables)."""
    d = protos.get(pid, (None, {}))[1]
    target = d.get("redirect")
    if target and depth < 4 and target in protos:
        if target.startswith("router_") or protos[target][1].get("redirect"):
            inner, preset = _resolve(protos, target, depth + 1)
            return inner, {**preset, **(d.get("redirectVariables") or {})}
    return pid, {}


def _entry_step(protos, router, preset):
    """O passo em que o router abre: o primeiro sem condição; com a resposta dele já
    dada (carry ou alias), o passo condicional que essa resposta abre."""
    steps = [s for s in protos[router][1].get("steps", []) or [] if s.get("type") == "suggest" and s.get("options")]
    first = next((s for s in steps if not s.get("condition")), steps[0] if steps else None)
    if first and first.get("id") in preset:
        answer = preset[first["id"]]
        for step in steps:
            var, values = _condition_values(step)
            if var == first["id"] and answer in values:
                return step
    return first


def situations_by_stop(models_dir=DOMAIN_MODELS_DIR):
    """O que faz: as situações dos modelos de tipo por parada do 🧭 (o P13, 02/11): `<router>.<passo>` →
    [(o domínio, [as condições])], na ordem dos arquivos e das situações.
    Por quê: o mapa mostra, em cada parada, os nós que chegam a ela; o modelo do tipo é o dono do
    mapeamento (a chave `situacoes`), e a forma dele é do juiz `audit_architecture.py`.
    Erro e ataque: JSON ilegível ou situação fora da forma fica de fora (o juiz já diz o problema)."""
    out = {}
    for path in sorted(glob.glob(os.path.join(models_dir, "*.json"))):
        try:
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            continue
        dominio = data.get("dominio") if isinstance(data, dict) else None
        for sit in (data.get("situacoes") if isinstance(data, dict) and isinstance(data.get("situacoes"), list) else []):
            if not isinstance(sit, dict) or not isinstance(sit.get("situacao"), str) or not isinstance(sit.get("quando"), str):
                continue
            por = out.setdefault(sit["situacao"], [])
            linha = next((x for x in por if x[0] == dominio), None)
            if linha is None:
                linha = (dominio, [])
                por.append(linha)
            if sit["quando"] not in linha[1]:
                linha[1].append(sit["quando"])
    return out


def situation_line(entries):
    """O que faz: a linha "Nos nós" de uma parada: "tarefa (prazo-vencido, estado:esperando) · smart (…)"."""
    return " · ".join(f"{dominio} ({', '.join(quando)})" for dominio, quando in entries)


def build(protos, situations=None):
    """O que faz: o canvas do 🧭 (nós, setas) a partir dos protocolos carregados e, em cada parada, os nós
    que chegam a ela pelas situações dos modelos (`situations_by_stop`)."""
    situations = situations or {}
    questions, cards, edges = {}, {}, {}
    order = []  # (node id, kind) na ordem em que aparecem

    def question_node(router, step):
        nid = _id("q", router, step["id"])
        if nid not in questions:
            name = protos[router][1].get("name", router)
            text = f"**{name}**\n{step.get('prompt', '')}\n`{router}` · `{step['id']}`"
            nos = situations.get(f"{router}.{step['id']}")
            if nos:
                text += f"\n**Nos nós:** {situation_line(nos)}"
            questions[nid] = {"router": router, "step": step, "text": text, "nos": bool(nos)}
            order.append(nid)
        return nid

    def card_node(pid):
        nid = _id("p", pid)
        if nid not in cards:
            d = protos.get(pid, (None, {}))[1]
            line = f"**{d.get('name', pid)}**\n`{pid}`"
            if d.get("redirect"):
                line += f" → `{d['redirect']}`"
            if d.get("fase_uso"):
                line += f" · {d['fase_uso']}"
            cards[nid] = {"text": line}
            order.append(nid)
        return nid

    root_step = _entry_step(protos, ROUTER_CENTRAL, {})
    root = question_node(ROUTER_CENTRAL, root_step)
    queue = deque([root])
    seen = set()
    while queue:
        nid = queue.popleft()
        if nid in seen or nid not in questions:
            continue
        seen.add(nid)
        router, step = questions[nid]["router"], questions[nid]["step"]
        d = protos[router][1]
        maps = {r.get("stepId"): r.get("map") or {} for r in _routers(d)}
        m = maps.get(step["id"], {})
        steps = [s for s in d.get("steps", []) or [] if s.get("type") == "suggest" and s.get("options")]
        carry = d.get("carry") if isinstance(d.get("carry"), dict) else {}
        for option in step.get("options", []):
            if _navigation(option):
                continue
            target_node = None
            if option in m:
                target = m[option]
                if not isinstance(target, str) or not target or target not in protos:
                    continue
                real, preset = _resolve(protos, target)
                if _is_router(protos, real):
                    preset = {**preset, **(carry.get(target) or {})}
                    entry = _entry_step(protos, real, preset)
                    if entry is None:
                        continue
                    target_node = question_node(real, entry)
                else:
                    target_node = card_node(target)
            else:
                sub = next((s for s in steps if _condition_values(s)[0] == step["id"] and option in _condition_values(s)[1]), None)
                if sub is None:
                    continue
                target_node = question_node(router, sub)
            eid = _id("e", nid, target_node, option)
            edges.setdefault(eid, {"id": eid, "fromNode": nid, "fromSide": "right", "toNode": target_node, "toSide": "left", "label": option})
            if target_node in questions:
                queue.append(target_node)

    # profundidade: o menor número de setas a partir do primeiro menu
    depth = {root: 0}
    adjacency = {}
    for edge in edges.values():
        adjacency.setdefault(edge["fromNode"], []).append(edge["toNode"])
    bfs = deque([root])
    while bfs:
        node = bfs.popleft()
        for nxt in adjacency.get(node, []):
            if nxt not in depth:
                depth[nxt] = depth[node] + 1
                bfs.append(nxt)

    nodes = [{
        "id": "legenda-router-central",
        "type": "text",
        "text": ("## 🧭 Router Central — mapa (gerado)\n"
                 "Gerado por `200 - FUNCTIONS/Scripts/generate_router_map.py` a partir dos JSON. **Não editar:** "
                 "a próxima execução sobrescreve.\n\n"
                 "- Roxo: uma pergunta (o router e o passo). Verde: o protocolo que abre.\n"
                 "- As setas são as opções, em colunas pela distância do primeiro menu.\n"
                 f"- Toda parada também tem **{DONT_KNOW_OPTION}** (volta ao primeiro menu) e **🔙 Voltar**: "
                 "essas setas não aparecem.\n"
                 "- **Nos nós:** o tipo e a condição (o sinal, ou `estado:<estado>`) que o bloco `situacoes` do modelo "
                 "do tipo leva até a parada; os protocolos dela sobem no painel daquele nó.\n"
                 f"- {len(questions)} perguntas · {len(cards)} protocolos · {len(edges)} setas."),
        "x": 0, "y": -360, "width": NODE_WIDTH + COL_WIDTH, "height": 300,
    }]
    column_y = {}
    for nid in order:
        if nid not in depth:
            continue
        col = depth[nid]
        is_question = nid in questions
        height = (QUESTION_HEIGHT + (SITUATION_LINE_HEIGHT if questions[nid]["nos"] else 0)) if is_question else CARD_HEIGHT
        y = column_y.get(col, 0)
        column_y[col] = y + height + GAP
        nodes.append({
            "id": nid,
            "type": "text",
            "text": questions[nid]["text"] if is_question else cards[nid]["text"],
            "x": col * COL_WIDTH,
            "y": y,
            "width": NODE_WIDTH,
            "height": height,
            "color": COLOR_QUESTION if is_question else COLOR_CARD,
        })
    kept = {n["id"] for n in nodes}
    edge_list = [e for e in edges.values() if e["fromNode"] in kept and e["toNode"] in kept]
    return {"nodes": nodes, "edges": edge_list}


def render(canvas):
    return json.dumps(canvas, ensure_ascii=False, indent="\t") + "\n"


def main():
    protos, errors = load_protocols()
    if errors or ROUTER_CENTRAL not in protos:
        print(f"❌ Protocolos ilegíveis ou sem {ROUTER_CENTRAL}: {errors}")
        return 1
    canvas = build(protos, situations_by_stop())
    novo = render(canvas)
    atual = None
    if os.path.exists(DESTINO):
        with open(DESTINO, encoding="utf-8") as handle:
            atual = handle.read()
    questions = sum(1 for n in canvas["nodes"] if n.get("color") == COLOR_QUESTION)
    cards = sum(1 for n in canvas["nodes"] if n.get("color") == COLOR_CARD)
    resumo = f"{questions} perguntas · {cards} protocolos · {len(canvas['edges'])} setas"
    if "--check" in sys.argv:
        if atual == novo:
            print(f"✅ Mapa do 🧭 atualizado ({resumo}).")
            return 0
        print("⚠️  Mapa do 🧭 DEFASADO — rode generate_router_map.py sem --check.")
        return 1
    if atual == novo:
        print(f"✅ Nada mudou nos routers; mapa preservado ({resumo}).")
        return 0
    with open(DESTINO, "w", encoding="utf-8") as handle:
        handle.write(novo)
    print(f"✅ Mapa gerado: {os.path.relpath(DESTINO, VAULT)} ({resumo})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
