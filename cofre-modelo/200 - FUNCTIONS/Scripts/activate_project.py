#!/usr/bin/env python3
"""
Ativa, pausa ou devolve um projeto ao backlog — em um comando, mantendo as duas
verdades sincronizadas (pasta kanban e o `status` do frontmatter, o espelho dela).

Uso (da raiz do vault):
  python3 "200 - FUNCTIONS/Scripts/activate_project.py" "<nome do projeto>" activate
  python3 "200 - FUNCTIONS/Scripts/activate_project.py" "<nome do projeto>" wait      # pausa (3 - Waiting)
  python3 "200 - FUNCTIONS/Scripts/activate_project.py" "<nome do projeto>" backlog   # devolve (1 - Backlog)
  ... adicione --apply para executar (default é dry-run).

O que "activate" faz: move a pasta para `2 - Active` e seta `status: active` na
nota-índice. Ativar não põe o projeto no foco: o foco do trimestre é só da nota do
trimestre (`temporada` e `projetos_foco`, gravados pelo 🧭); o `quarter` do projeto se
aposentou no Passo 0 da Missão (0c, 27/10/2026), e este script não o grava mais.
Nunca cria projeto (isso é do protocolo novo_projeto) e nunca decide QUAL projeto
ativar — isso é decisão humana do planejamento trimestral.
"""
import os, re, sys, glob, shutil, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colunas_kanban import COL_STATUS  # noqa: E402  (a tabela das colunas mora num lugar só)

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODES = {modo: (coluna, COL_STATUS[coluna])
         for modo, coluna in (("activate", "2 - Active"), ("wait", "3 - Waiting"), ("backlog", "1 - Backlog"))}

def find_project(name):
    hits = [p for p in glob.glob(os.path.join(VAULT, "100 - AREAS", "*", "100 - PROJECTS", "*", "*"))
            if os.path.isdir(p) and os.path.basename(p).lower() == name.lower()]
    if not hits:
        hits = [p for p in glob.glob(os.path.join(VAULT, "100 - AREAS", "*", "100 - PROJECTS", "*", "*"))
                if os.path.isdir(p) and name.lower() in os.path.basename(p).lower()]
    return hits

def index_note(proj):
    for c in (os.path.join(proj, "README.md"), os.path.join(proj, os.path.basename(proj) + ".md")):
        if os.path.isfile(c):
            return c
    return None

def set_fm(path, key, value, apply):
    t = open(path, encoding="utf-8").read()
    m = re.match(r"^(---\n)(.*?)(\n---)", t, re.S)
    if not m:
        print(f"  ⚠️ sem frontmatter: {path}")
        return
    fm = m.group(2)
    line = f"{key}: {value}" if value != "" else f"{key}: "
    fm = re.sub(rf"^{key}:.*$", line, fm, count=1, flags=re.M) if re.search(rf"^{key}:", fm, re.M) else fm + f"\n{line}"
    if apply:
        open(path, "w", encoding="utf-8").write(m.group(1) + fm + m.group(3) + t[m.end():])
    print(f"  {'✏️' if apply else '(dry-run)'} {key}: {value or '(vazio)'} em {os.path.relpath(path, VAULT)}")

def main():
    args = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv
    if len(args) != 2 or args[1] not in MODES:
        print(__doc__); sys.exit(2)
    name, mode = args
    col, status = MODES[mode]

    hits = find_project(name)
    if len(hits) != 1:
        print(f"❌ {'Nenhum projeto' if not hits else 'Mais de um projeto'} encontrado para '{name}':")
        for h in hits: print("   -", os.path.relpath(h, VAULT))
        sys.exit(1)
    proj = hits[0]
    dest = os.path.join(os.path.dirname(os.path.dirname(proj)), col, os.path.basename(proj))
    print(f"Projeto: {os.path.relpath(proj, VAULT)}\nModo: {mode} → coluna '{col}'")

    if os.path.abspath(proj) != os.path.abspath(dest):
        print(f"  {'📦' if apply else '(dry-run)'} mover para {os.path.relpath(dest, VAULT)}")
        if apply:
            old_rel, new_rel = os.path.relpath(proj, VAULT), os.path.relpath(dest, VAULT)
            shutil.move(proj, dest)
            proj = dest
            # Nós de arquivo de Canvas guardam caminho completo — atualizar em TODOS os
            # canvases do vault (senão o mapa do projeto abre quebrado após o kanban-move).
            fixed = 0
            for c in glob.glob(os.path.join(VAULT, "**", "*.canvas"), recursive=True):
                if "900 - ARCHIVE" in c:
                    continue
                try:
                    d = json.load(open(c, encoding="utf-8"))
                except Exception:
                    continue
                changed = False
                for n in d.get("nodes", []):
                    f = n.get("file", "")
                    if n.get("type") == "file" and (f == old_rel or f.startswith(old_rel + "/")):
                        n["file"] = new_rel + f[len(old_rel):]
                        changed = True
                        fixed += 1
                if changed:
                    json.dump(d, open(c, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            if fixed:
                print(f"  🩹 {fixed} nó(s) de canvas atualizados para o novo caminho")
        elif not os.path.isdir(dest):
            pass  # dry-run: só informa
    idx = index_note(proj if os.path.isdir(proj) else dest) or index_note(proj)
    if not idx:
        print("  ⚠️ sem nota-índice (README.md) — crie antes de ativar"); sys.exit(1)
    set_fm(idx, "status", status, apply)

    if apply:
        print("\nRode agora os juízes:")
        print('  python3 "200 - FUNCTIONS/Scripts/validate_projects.py"')
    else:
        print("\nDry-run — nada foi alterado. Adicione --apply para executar.")

if __name__ == "__main__":
    main()
