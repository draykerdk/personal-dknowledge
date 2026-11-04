#!/usr/bin/env python3
"""
Os passos comuns dos protocolos (núcleo de 21/10/2026, plano da etapa 1, seção 4).

Cada arquivo de `200 - FUNCTIONS/Protocolos/_comuns/` é `{ "comum", "objetivo", "steps" }`.
Não é protocolo: a pasta começa com `_`, e os juízes já não a leem como protocolo. Um
protocolo usa um comum no `steps` com `{ "usar": "<nome>", "prefixo": "<p>", "next": "<id>" }`,
que se expande nos passos do comum, com os ids prefixados (`<p>_<id>`) e as referências
internas acompanhando (condição, `returnTo`, `{{tokens}}`). O motor segue a lista em
ordem; o `next` confere que o passo seguinte é o que o autor quis.

É a gêmea de `src/engine/commonSteps.ts` (o motor expande na carga; os juízes, aqui, ao
ler os protocolos), com as mesmas mensagens. Usado por `validate_protocol_graph.py` e
`audit_protocols.py`. Só lê; nunca escreve.
"""
import copy
import json
import os
import re

COMMONS_FOLDER = "_comuns"
SNAKE = re.compile(r"^[a-z][a-z0-9_]*$")
COMMON_KEYS = ("comum", "objetivo", "steps")
USE_KEYS = ("usar", "prefixo", "next")
TOKEN = re.compile(r"\{\{([^}]*)\}\}")


def parse_common(raw, file_stem=None):
    """O que faz: confere um arquivo de comum.
    Por quê: um comum quebrado vira passo sem tipo em todo protocolo que o usa.
    Entra → sai: o JSON e o nome do arquivo (sem `.json`) → (comum ou None, problemas).
    Erro e ataque: nome diferente do arquivo, objetivo em mais de uma linha, passo sem id
    ou tipo, id repetido, `usar` dentro de um comum.
    Prova: test_common_steps_parse_and_expand."""
    problems = []
    if not isinstance(raw, dict):
        return None, ["o comum não é um objeto JSON"]
    name = raw.get("comum") if isinstance(raw.get("comum"), str) else (file_stem or "?")
    where = f"comum '{name}'"
    for key in raw:
        if key not in COMMON_KEYS:
            problems.append(f"{where}: chave desconhecida '{key}'")
    comum = raw.get("comum")
    if not isinstance(comum, str) or not SNAKE.match(comum):
        problems.append(f"{where}: `comum` precisa ser um nome em snake_case")
    elif file_stem is not None and comum != file_stem:
        problems.append(f"{where}: o nome difere do arquivo '{file_stem}.json'")
    objetivo = raw.get("objetivo")
    if not isinstance(objetivo, str) or not objetivo.strip() or "\n" in objetivo or "\r" in objetivo:
        problems.append(f"{where}: `objetivo` precisa ser uma linha de texto")
    steps = raw.get("steps")
    steps_ok = isinstance(steps, list) and len(steps) > 0
    if not steps_ok:
        problems.append(f"{where}: `steps` precisa ser uma lista com ao menos um passo")
    ids = set()
    for step in steps if isinstance(steps, list) else []:
        if not isinstance(step, dict):
            problems.append(f"{where}: passo que não é objeto")
            steps_ok = False
            continue
        if "usar" in step:
            problems.append(f"{where}: `usar` dentro de um comum não é aceito")
            steps_ok = False
            continue
        sid = step.get("id")
        if not isinstance(sid, str) or not sid:
            problems.append(f"{where}: passo sem `id`")
            steps_ok = False
            continue
        if not isinstance(step.get("type"), str) or not step.get("type"):
            problems.append(f"{where}: passo '{sid}' sem `type`")
            steps_ok = False
        if sid in ids:
            problems.append(f"{where}: id repetido '{sid}'")
            steps_ok = False
        ids.add(sid)
    usable = isinstance(comum, str) and SNAKE.match(comum) and steps_ok
    return ({"comum": comum, "objetivo": objetivo or "", "steps": steps} if usable else None), problems


def load_commons(proto_dir):
    """O que faz: os comuns de `<pasta de protocolos>/_comuns/`, por nome, e os problemas.
    Entra → sai: pasta → ({nome: comum}, [(arquivo relativo, problema)])."""
    commons, problems = {}, []
    folder = os.path.join(proto_dir, COMMONS_FOLDER)
    if not os.path.isdir(folder):
        return commons, problems
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json"):
            continue
        rel = f"{COMMONS_FOLDER}/{name}"
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as handle:
                raw = json.load(handle)
        except (OSError, ValueError) as error:
            problems.append((rel, f"JSON inválido: {error}"))
            continue
        comum, found = parse_common(raw, name[:-5])
        problems.extend((rel, problem) for problem in found)
        if comum:
            commons[comum["comum"]] = comum
    return commons, problems


def _renamed(name, ids, prefixo):
    if not prefixo:
        return name
    own = any(name == sid or name.startswith(sid + "_") for sid in ids)
    return f"{prefixo}_{name}" if own else name


def _rename_tokens(value, ids, prefixo):
    if isinstance(value, str):
        def swap(match):
            token = match.group(1).strip()
            if re.match(r"^[A-Za-z0-9_]+$", token):
                return "{{" + _renamed(token, ids, prefixo) + "}}"
            return match.group(0)
        return TOKEN.sub(swap, value)
    if isinstance(value, list):
        return [_rename_tokens(item, ids, prefixo) for item in value]
    if isinstance(value, dict):
        return {key: _rename_tokens(inner, ids, prefixo) for key, inner in value.items()}
    return value


def prefix_common_steps(steps, prefixo):
    """O que faz: os passos de um comum com os ids e as referências internas prefixados
    (gêmea de `prefixCommonSteps`). Sem prefixo, cópia igual."""
    ids = [str(step.get("id")) for step in steps or [] if isinstance(step, dict) and step.get("id")]
    out = []
    for step in steps or []:
        item = _rename_tokens(copy.deepcopy(step), ids, prefixo)
        if prefixo:
            item["id"] = f"{prefixo}_{item['id']}"
            condition = item.get("condition")
            if isinstance(condition, dict) and isinstance(condition.get("variable"), str):
                condition["variable"] = _renamed(condition["variable"], ids, prefixo)
            return_to = item.get("returnTo")
            if isinstance(return_to, dict):
                for option, target in list(return_to.items()):
                    if isinstance(target, str) and target in ids:
                        return_to[option] = f"{prefixo}_{target}"
        out.append(item)
    return out


def expand_steps(steps, commons):
    """O que faz: expande cada `{ usar, prefixo, next }` da lista de passos.
    Por quê: o comum é escrito uma vez e usado por todos; os juízes conferem o protocolo
    como o motor o roda (os passos já expandidos).
    Entra → sai: passos e comuns por nome → (passos, problemas). Sem `usar`, a mesma
    lista. Entrada com problema sai da lista, como no motor.
    Prova: test_common_steps_parse_and_expand."""
    if not isinstance(steps, list) or not any(isinstance(step, dict) and "usar" in step for step in steps):
        return steps, []
    problems, out, checks = [], [], []
    for step in steps:
        if not isinstance(step, dict) or "usar" not in step:
            out.append(step)
            continue
        nome = str(step.get("usar") if step.get("usar") is not None else "")
        where = f"usar '{nome}'"
        extras = [key for key in step if key not in USE_KEYS]
        if extras:
            problems.append(f"{where}: chave desconhecida {', '.join(repr(k) for k in extras)}")
            continue
        comum = commons.get(nome)
        if not comum:
            problems.append(f"{where}: o comum não existe em _comuns/")
            continue
        prefixo = step.get("prefixo", "")
        if not isinstance(prefixo, str) or (prefixo and not SNAKE.match(prefixo)):
            problems.append(f"{where}: `prefixo` precisa ser um nome em snake_case")
            continue
        if "next" in step and not isinstance(step["next"], str):
            problems.append(f"{where}: `next` precisa ser o id de um passo")
            continue
        out.extend(prefix_common_steps(comum["steps"], prefixo))
        if isinstance(step.get("next"), str):
            checks.append((nome, step["next"], len(out)))
    for nome, nxt, after in checks:
        following = out[after].get("id", "") if after < len(out) and isinstance(out[after], dict) else ""
        if nxt != following:
            problems.append(f"usar '{nome}': next '{nxt}' não é o passo seguinte ('{following or 'fim'}'); "
                            f"o motor segue a ordem da lista")
    seen = set()
    for step in out:
        sid = step.get("id") if isinstance(step, dict) else None
        if not isinstance(sid, str):
            continue
        if sid in seen:
            problems.append(f"id repetido '{sid}' depois de expandir os comuns (use `prefixo`)")
        seen.add(sid)
    return out, problems
