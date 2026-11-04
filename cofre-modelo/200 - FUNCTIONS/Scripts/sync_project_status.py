#!/usr/bin/env python3
"""
Sincroniza o `status` do frontmatter da nota-índice de cada projeto com a coluna
kanban (pasta) real — mecânica da Decisão D1 do Plano v3.1: a pasta é a fonte da
verdade do estágio; o frontmatter é espelho.

Só o `status`: o foco do trimestre não é do projeto (o `quarter` e o `foco_12_semanas`
do projeto se aposentaram no Passo 0 da Missão, 0c; o foco é da nota do trimestre).

Uso:
  python3 "200 - FUNCTIONS/Scripts/sync_project_status.py"           # dry-run (padrão): só imprime
  python3 "200 - FUNCTIONS/Scripts/sync_project_status.py" --apply   # aplica de verdade

Reaproveita o parser de frontmatter de validate_projects.py (copiado aqui, sem
dependências externas, para manter o script standalone).
"""
import os, re, glob, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colunas_kanban import COL_STATUS  # noqa: E402  (a tabela das colunas mora num lugar só)

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

EXCEPTIONS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "judges_exceptions.json")

def third_party_repos():
    """Repositórios de outra pessoa montados no vault (judges_exceptions.json): lidos, nunca cobrados."""
    try:
        with open(EXCEPTIONS_PATH, encoding="utf-8") as handle:
            return tuple(json.load(handle).get("third_party_repos", {}).get("paths", []))
    except (OSError, ValueError, AttributeError):
        return ()

def is_third_party(rel):
    return any(rel == p or rel.startswith(p + os.sep) for p in third_party_repos())


def frontmatter(path):
    try:
        with open(path, encoding="utf-8") as handle:
            t = handle.read()
        m = re.match(r"^---\n(.*?)\n---", t, re.S)
        if not m:
            return None
        fm = {}
        for line in m.group(1).splitlines():
            kv = re.match(r"^(\w[\w_-]*):\s*(.*)$", line)
            if kv:
                fm[kv.group(1)] = kv.group(2).strip().strip('"').strip("'")
        return fm
    except Exception:
        return None


def set_status_in_content(content, new_status):
    """Troca (ou insere) a linha `status:` só dentro do bloco de frontmatter."""
    m = re.match(r"^(---\n)(.*?)(\n---)", content, re.S)
    if not m:
        return content, False
    head, fm_block, tail = m.group(1), m.group(2), m.group(3)
    lines = fm_block.split("\n")
    changed = False
    for i, line in enumerate(lines):
        if re.match(r"^status:\s*", line):
            lines[i] = f"status: {new_status}"
            changed = True
            break
    if not changed:
        lines.append(f"status: {new_status}")
        changed = True
    new_fm_block = "\n".join(lines)
    new_content = head + new_fm_block + tail + content[m.end():]
    return new_content, changed


def main():
    apply = "--apply" in sys.argv
    changes = []

    for area_dir in sorted(glob.glob(os.path.join(VAULT, "100 - AREAS", "*", "100 - PROJECTS", "*"))):
        col = os.path.basename(area_dir)
        expected = COL_STATUS.get(col)
        if expected is None:
            continue
        for proj in sorted(glob.glob(os.path.join(area_dir, "*"))):
            if not os.path.isdir(proj) or is_third_party(os.path.relpath(proj, VAULT)):
                continue
            candidates = [os.path.join(proj, "README.md"),
                          os.path.join(proj, os.path.basename(proj) + ".md")]
            readme = next((c for c in candidates if os.path.isfile(c)), None)
            if readme is None:
                continue
            fm = frontmatter(readme)
            if not fm or fm.get("type") != "iniciativa":
                continue
            st = fm.get("status", "")
            if st != expected:
                rel = os.path.relpath(readme, VAULT)
                changes.append((readme, rel, st, expected))

    if not changes:
        print("✅ Nada para sincronizar — status já reflete a coluna em todos os projetos.")
        sys.exit(0)

    print(f"{'Aplicando' if apply else '[dry-run] Proponho'} {len(changes)} mudança(s) de status:")
    for readme, rel, st, expected in changes:
        print(f"   {rel}: status '{st}' -> '{expected}'")
        if apply:
            with open(readme, encoding="utf-8") as handle:
                content = handle.read()
            new_content, changed = set_status_in_content(content, expected)
            if changed:
                with open(readme, "w", encoding="utf-8") as handle:
                    handle.write(new_content)

    if not apply:
        print("\nRode novamente com --apply para gravar essas mudanças.")
        sys.exit(1)
    else:
        print("\n✅ Aplicado.")


if __name__ == "__main__":
    main()
