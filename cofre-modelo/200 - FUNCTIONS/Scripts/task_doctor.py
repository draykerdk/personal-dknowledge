#!/usr/bin/env python3
"""
Task Doctor — detector de incoerências no fluxo de tarefas (TaskNotes + DFM).

Só RELATA; nunca corrige sozinho. "Automação sugere rota, humano muda rota."

Existe porque duas camadas leem tarefas de formas diferentes (ver
`dfm-operator/references/convencoes.md`): os painéis do DFM enxergam por PASTA +
campos; o TaskNotes enxerga por TAG (`task`) e arquiva por TAG (`archived`).
Escrever só para uma delas produz tarefa fantasma — que aparece num lugar e não
no outro. Os casos aqui são os que já morderam de verdade (auditoria 2026-07-20).

Uso:  python3 "200 - FUNCTIONS/Scripts/task_doctor.py"
Rodar na sexta, junto dos outros juízes (playbook P4). Exit 1 se achar algo.
"""
import os, re, sys, glob, json

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TASKS, ARCHIVE = "TaskNotes/Tasks", "TaskNotes/Archive"
ATIVOS = {"next-action", "in-progress", "inbox", "waiting-on"}
IGNORAR = (".obsidian", "900 - ARCHIVE")

def cfg():
    """Lê status/tag válidos do próprio TaskNotes — nunca hardcodar o que ele define."""
    p = os.path.join(VAULT, ".obsidian/plugins/tasknotes/data.json")
    try:
        with open(p, encoding="utf-8") as handle:
            d = json.load(handle)
    except Exception:  # fallback só se o data.json sumir/corromper — a fonte é ele
        return ({"inbox","next-action","in-progress","done","waiting-on","someday","cancelled"},
                "task", "archived")
    st = {s.get("value") for s in d.get("customStatuses", []) if s.get("value")}
    return st, d.get("taskTag", "task"), d.get("fieldMapping", {}).get("archiveTag", "archived")

def frontmatter(txt):
    if not txt.startswith("---"): return None
    fim = txt.find("\n---", 3)
    return txt[4:fim] if fim != -1 else None

def tags_de(fm):
    m = re.search(r'^tags:\s*(.*?)(?=^\S|\Z)', fm, re.M | re.S)
    if not m: return []
    b = m.group(0)
    if "[" in b:
        return [x.strip().strip('"\'') for x in b[b.find("[")+1:b.find("]")].split(",") if x.strip()]
    itens = [l.strip("- \t").strip('"\'') for l in b.splitlines()[1:] if l.strip().startswith("-")]
    if itens: return itens
    # tags escalar (`tags: task`) — forma aceita pelo Obsidian e pelo TaskNotes;
    # sem isto a nota era acusada de "sem a tag" mesmo tendo a tag.
    escalar = b.split(":", 1)[1].strip().strip('"\'')
    return [escalar] if escalar else []

def campo(fm, k):
    m = re.search(rf'^{k}:[ \t]*(\S.*)$', fm, re.M)  # não atravessa a quebra: `peca: ` vazio não lê a linha de baixo
    return m.group(1).strip().strip('"\'') if m else None

PECAS = {"ignicao", "soltar"}  # 🔥 ignição e 📤 soltar do fluxo de criação

# Onde dá para fazer: o vocabulário do campo `contexts` (16/10/2026). Fonte no plugin:
# `.obsidian/plugins/dfm-system/src/engine/taskContexts.ts` (TASK_CONTEXTS); um teste
# do plugin confere que esta cópia é igual. "🚶 Campo" e "🌍 Externo" são diferentes.
CONTEXTOS = {"💻 Computador", "🌍 Externo", "📱 Celular", "🎬 Criação", "🤝 Relacional", "🚶 Campo"}

def contextos_de(fm):
    """Valores de `contexts`, em lista de bloco (`- "x"`) ou em fluxo (`["x", "y"]`)."""
    m = re.search(r'^contexts:(.*?)(?=^\S|\Z)', fm, re.M | re.S)
    if not m: return []
    bloco = m.group(1).strip()
    if bloco.startswith("["):
        itens = bloco[1:bloco.find("]")].split(",") if "]" in bloco else []
    else:
        itens = [l.strip()[1:] for l in bloco.splitlines() if l.strip().startswith("-")] or ([bloco] if bloco else [])
    return [x.strip().strip('"\'') for x in itens if x.strip().strip('"\'')]

def alvos_blocked_by(fm):
    """Nomes que `blockedBy` aponta, nas duas formas do TaskNotes: `- "[[x]]"` e
    `- uid: "[[x]]"` (com `reltype`), em lista de bloco ou em fluxo `["[[x]]"]`."""
    m = re.search(r'^blockedBy:(.*?)(?=^\S|\Z)', fm, re.M | re.S)
    if not m: return []
    return [alvo.split("|")[0].split("#")[0].strip() for alvo in re.findall(r'\[\[([^\]]+)\]\]', m.group(1))]

# O pai de uma tarefa vive num campo só: `projects` (a SMART, o projeto ou o
# departamento). Arquitetura universal de 19/10/2026, 3.1 e 3.2: os campos antigos
# `parent` e `meta_smart` saem, e o juiz os recusa em tarefa aberta. A arquivada
# guarda o registro de quando foi feita e não é apontada.
LIGACOES_ANTIGAS = ("parent", "meta_smart")
TERMINAIS = {"done", "cancelled"}

# Um nome só para a criação e para a conclusão (Passo 0 da Missão, 0a, 27/10/2026):
# `dateCreated` e `completedDate`, os nomes do TaskNotes (`fieldMapping`). O `created`
# e o `completed` antigos se aposentam em TODA TaskNote, a arquivada também: ela
# conta no lugar no tempo (a feita cai no dia da conclusão), e com a reserva o lugar
# tinha duas fontes. Quem tira as chaves é `normalizar_propriedades.py`.
# O T da SMART é o `due` (Passo 0 da Missão, 0e): o `smart_t` também se aposenta (sem
# `due`, a SMART vale pela `week`). O `smart_s/m/a/r` antigos ficam como legado (0b).
CHAVES_APOSENTADAS = {"created": "dateCreated", "completed": "completedDate", "smart_t": "due"}

def chaves_aposentadas(fm):
    """As chaves aposentadas presentes no frontmatter, com o nome que fica."""
    return [(k, novo) for k, novo in CHAVES_APOSENTADAS.items() if re.search(rf'^{k}:', fm, re.M)]

# O `projects` liga a tarefa ao projeto; o `relacoes`, ao resto (Passo 0 da Missão, 0d,
# 27/10/2026). O item de `relacoes` que abre uma nota de projeto ou de departamento
# repete o pai ou o contradiz. Quem tira os repetidos é `normalizar_propriedades.py`.
TIPOS_PROJETO = {"iniciativa", "projeto", "departamento"}

def nome_de_link(rel):
    """O nome pelo qual a nota é ligada: o arquivo; o README é o nome da pasta."""
    nome = os.path.basename(rel)[:-3]
    return os.path.basename(os.path.dirname(rel)) if nome.lower() == "readme" else nome

def nomes_de_projeto():
    """Os nomes (em minúsculas) das notas de projeto e de departamento em `100 - AREAS`."""
    nomes = set()
    for path in glob.glob(os.path.join(VAULT, "100 - AREAS", "**", "*.md"), recursive=True):
        with open(path, encoding="utf-8", errors="replace") as handle:
            fm = frontmatter(handle.read())
        if fm is not None and campo(fm, "type") in TIPOS_PROJETO:
            nomes.add(nome_de_link(os.path.relpath(path, VAULT)).casefold())
    return nomes

def relacoes_de(fm):
    """Os nomes que `relacoes` aponta, em lista de bloco ou em fluxo."""
    m = re.search(r'^relacoes:(.*?)(?=^\S|\Z)', fm, re.M | re.S)
    if not m: return []
    return [alvo.split("|")[0].split("#")[0].strip().split("/")[-1] for alvo in re.findall(r'\[\[([^\]]+)\]\]', m.group(1))]

# O `type` de toda TaskNote (harmonização H2a, 29/10/2026, PRINCIPIOS §4, item 2): a ação é
# `task` e a SMART é `tarefa_smart` (convenções, "Cada tipo"). O modelo do tipo, o painel do
# nó e a Missão acham o modelo pelo `type`; quem cria pelo plugin já o grava
# (`engine/tasknotesCreate.ts`). Na aberta é contrato; a arquivada de antes disso (as criadas
# pela vista do TaskNotes até out/2026) é informação, e não aviso: o arquivo é histórico e não
# se regrava (a mesma regra das Weeks e dos trimestres antigos, que aparecem como modelo antigo),
# e os leitores já leem a falta como `task` (`tasks/taskRecord.ts`). H3 de 29/10/2026.
TIPOS_TASKNOTE = {"task", "tarefa_smart"}


def ligacoes_antigas(fm):
    """Os campos de ligação antigos presentes no frontmatter (vazios também contam:
    a chave sozinha já é uma segunda fonte do pai)."""
    return [k for k in LIGACOES_ANTIGAS if re.search(rf'^{k}:', fm, re.M)]

def main():
    validos, TAG_TASK, TAG_ARQ = cfg()
    achados = []
    # Nomes de todas as TaskNotes (abertas e arquivadas): o alvo de `blockedBy`
    # tem de ser uma delas, senão a dependência aponta para o nada.
    nomes_tarefas = {os.path.basename(p)[:-3]
                     for pasta in (TASKS, ARCHIVE)
                     for p in glob.glob(os.path.join(VAULT, pasta, "**", "*.md"), recursive=True)}
    projetos = nomes_de_projeto()
    # categoria → nomes do arquivo de antes: um fato do catálogo, uma linha (JUDGES.md,
    # Política de saída). É informação: não é erro nem aviso, porque o arquivo não se regrava.
    historico = {}
    def flag(cat, path, detalhe):
        achados.append((cat, os.path.relpath(path, VAULT), detalhe))
    def registrar_historico(cat, path):
        historico.setdefault(cat, []).append(os.path.basename(path)[:-3])

    for path in glob.glob(os.path.join(VAULT, "**", "*.md"), recursive=True):
        rel = os.path.relpath(path, VAULT)
        if rel.startswith(IGNORAR): continue
        with open(path, encoding="utf-8", errors="replace") as handle:
            # Arquivo INTEIRO: o corte em 4.000 chars descartava em silêncio toda nota
            # com frontmatter maior que isso (o fecho `---` ficava fora da leitura).
            fm = frontmatter(handle.read())
        if fm is None: continue
        tags, nome = tags_de(fm), os.path.basename(path)[:-3]
        eh_task = TAG_TASK in tags
        em_tasks, em_arch = rel.startswith(TASKS), rel.startswith(ARCHIVE)
        status, arquivada = campo(fm, "status"), (TAG_ARQ in tags)

        # 1. tarefa fora das pastas de tarefa (qualquer nota com a tag vira card)
        if eh_task and not (em_tasks or em_arch):
            flag("nota com tag de tarefa fora de TaskNotes/", path, f"status={status}")
        # 2. está em Tasks/ mas o plugin não a vê (sem a tag)
        if em_tasks and not eh_task:
            flag("em Tasks/ sem a tag do plugin", path, "invisível no Kanban/Agenda")

        # Daqui pra baixo: só o que o sistema de tarefas realmente enxerga. Nota legada
        # arquivada dentro de pasta de projeto NÃO é tarefa e não deve virar alerta —
        # falso positivo no dia 1 é o jeito mais rápido de um detector perder a confiança.
        if not (eh_task or em_tasks or em_arch): continue
        # 3. status inválido → vira coluna paralela no Kanban (groupBy status)
        if (eh_task or em_tasks) and status and status not in validos:
            flag("status inválido (cria coluna paralela)", path, f"status={status}")
        # 4. arquivada mas ainda com status ativo
        if (arquivada or em_arch) and status in ATIVOS:
            flag("arquivada com status ativo", path, f"status={status}")
        # 5. arquivada pelo campo mas não pela tag (some do DFM, segue ativa no plugin)
        if campo(fm, "archived") == "true" and not arquivada:
            flag("archived:true sem a tag (plugin ainda a vê ativa)", path, "")
        # 6. arquivada morando em Tasks/ (convenção: moveArchivedTasks)
        if arquivada and em_tasks:
            flag("arquivada ainda em Tasks/", path, "mover para TaskNotes/Archive/")
        # 7. cancelada no título mas sem status terminal
        if ("~~" in nome or "CANCELAD" in nome.upper()) and status in ATIVOS:
            flag("cancelada no título com status ativo", path, f"status={status}")
        # 8. peça do fluxo de criação fora de 🔥 ignicao / 📤 soltar: a grade, a pauta
        #    e o "no ar" da semana não a reconhecem (vazio = não é peça, vale)
        peca = campo(fm, "peca")
        if peca and peca not in PECAS:
            flag("peca fora de ignicao/soltar", path, f"peca={peca}")
        # 9. blockedBy para tarefa que não existe: a dependência (e a seta vermelha
        #    do canvas) aponta para o nada. Só tarefa viva: a arquivada não aparece
        #    na grade nem no canvas, e o vínculo velho dela não bloqueia nada.
        for alvo in (alvos_blocked_by(fm) if not (arquivada or em_arch) else []):
            if alvo.split("/")[-1] not in nomes_tarefas:
                flag("blockedBy aponta para tarefa inexistente", path, f"blockedBy=[[{alvo}]]")
        # 10. contexto fora do vocabulário: a pauta (🧭 Aqui e agora) o mostra como um
        #     lugar à parte e o "🧭 Onde dá para fazer?" nunca o oferece. Só tarefa viva.
        for contexto in (contextos_de(fm) if not (arquivada or em_arch) else []):
            if contexto not in CONTEXTOS:
                flag("contexto fora do vocabulário", path, f"contexts={contexto}")

        # 11. campo de ligação antigo em tarefa aberta: o pai é só `projects`; com
        #     `parent` ou `meta_smart` a tarefa tem duas fontes do pai, e o canvas, a
        #     pauta e as contagens leem só uma. Mova o valor para `projects`.
        if not (arquivada or em_arch) and status not in TERMINAIS:
            for chave in ligacoes_antigas(fm):
                flag("campo de ligação antigo (o pai é só `projects`)", path, f"{chave}={campo(fm, chave) or ''}")

        # 12. chave aposentada (`created`, `completed`, `smart_t`) em qualquer TaskNote,
        #     aberta ou arquivada: a criação é `dateCreated`, a conclusão é
        #     `completedDate` e o T da SMART é o `due`.
        for chave, novo in chaves_aposentadas(fm):
            flag("chave aposentada (o nome é o do TaskNotes)", path, f"{chave} → {novo}")

        # 13. `relacoes` que aponta um projeto, em tarefa aberta ou arquivada: o projeto
        #     da tarefa é o `projects` (direto ou pela SMART mãe); o `relacoes` é o resto.
        for alvo in relacoes_de(fm):
            if alvo.casefold() in projetos:
                flag("relacoes aponta um projeto (o projeto é o `projects`)", path, f"relacoes=[[{alvo}]]")

        # 14. o `type` da TaskNote: `task` ou `tarefa_smart`. Na aberta (em Tasks/) é erro;
        #     na arquivada, informação (o arquivo de antes não se regrava, e os leitores
        #     leem a falta como `task`).
        tipo = campo(fm, "type")
        if (em_tasks or em_arch) and tipo not in TIPOS_TASKNOTE:
            if em_tasks and not arquivada:
                flag("TaskNote sem `type: task` ou `tarefa_smart`", path, f"type={tipo or ''}")
            else:
                registrar_historico("arquivada sem `type: task` ou `tarefa_smart` (o leitor a lê como `task`)", path)

        # 15. a SMART não tem `scheduled`: o T dela é o `due`, e ela vale pela `week`
        #     (convenções, "Cada tipo"; o modelo `smart.json` não tem o campo). Na aberta é
        #     erro; na arquivada, informação (o registro de antes, que não se regrava).
        if tipo == "tarefa_smart" and re.search(r'^scheduled:', fm, re.M):
            if em_tasks and not arquivada:
                flag("SMART com `scheduled` (o T da SMART é o `due`)", path, f"scheduled={campo(fm, 'scheduled') or ''}")
            else:
                registrar_historico("SMART arquivada com `scheduled` (o T da SMART é o `due`)", path)

    if historico:
        print("ℹ️  arquivo de antes: modelo antigo, não se regrava (o histórico fica como foi gravado; "
              "não é erro nem aviso):")
        for cat, nomes in historico.items():
            print(f"  [{cat}] {len(nomes)}: {', '.join(n[:60] for n in sorted(nomes))}")
        print()

    if not achados:
        print("✅ Fluxo de tarefas coerente — nenhuma incoerência encontrada.")
        return 0

    print(f"⚠️ {len(achados)} incoerência(s) — corrija à mão (este script nunca escreve):\n")
    for cat in dict.fromkeys(c for c, _, _ in achados):
        itens = [(p, d) for c, p, d in achados if c == cat]
        print(f"  {cat}  ({len(itens)})")
        for p, d in itens:
            print(f"     · {os.path.basename(p)[:-3][:70]}" + (f"   [{d}]" if d else ""))
        print()
    return 1

if __name__ == "__main__":
    sys.exit(main())
