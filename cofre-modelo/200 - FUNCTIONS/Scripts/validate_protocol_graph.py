#!/usr/bin/env python3
"""
Validador do GRAFO de navegação dos protocolos DFM (complementa validate_protocols.py,
que só valida campos/estatísticas). Detecta exatamente o problema "cliquei e não aconteceu nada".

Regras (convenção formalizada 2026-07-05, Plano v3):
 R1. Todo JSON em 200 - FUNCTIONS/Protocolos/ (fora de pastas _*) deve parsear.
 R2. Todo destino de nextProtocol / dynamicNextProtocol.map deve existir (null = fim intencional, ok).
 R3. Toda option de um step referenciado em dynamicNextProtocol deve ter entrada no map
     (use null para fim intencional) OU ser coberta por um step condicional (condition.value).
 R4. Toda chave do map deve corresponder a uma option existente do step (sem chaves órfãs).
 R5. Todo step com options de um router (id router_*) deve incluir uma opção "Voltar".
 R6. Um step não oferece duas opções "🔙 Voltar…" (ex.: "🔙 Voltar / Cancelar" e "🔙 Voltar"):
     só "🔙 Voltar" volta a quem chamou; a outra vai sempre ao router fixo do JSON, e o
     menu parece ter dois caminhos iguais que se comportam diferente. Abrir outro menu
     ("🔙 Abrir Router Central") é ação própria e não conta.
 Passos comuns (21/10/2026): `_comuns/` não é protocolo; o `{ "usar": ... }` de um
 protocolo é expandido (common_steps.py) antes das regras, como o motor faz na carga.
 Os problemas do `usar` são do audit_protocols.py ([PASSO COMUM]).

Uso:  python3 "200 - FUNCTIONS/Scripts/validate_protocol_graph.py"
Sai com código 0 se limpo, 1 se houver problemas.
Ritual: rodar na janela semanal de manutenção; cada achado vira nota em
300 - RUNTIME/305 - P&D/Backlog_Sistema/ — nunca correção ad-hoc durante execução de projeto.
"""
import json, glob, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common_steps import expand_steps, load_commons  # noqa: E402

VAULT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROTO_DIR = os.path.join(VAULT, "200 - FUNCTIONS", "Protocolos")

def main():
    files = [f for f in glob.glob(os.path.join(PROTO_DIR, "**", "*.json"), recursive=True)
             if os.sep + "_" not in f.replace(PROTO_DIR, "")]
    protos, issues = {}, []
    commons, _ = load_commons(PROTO_DIR)
    for f in files:
        rel = os.path.relpath(f, PROTO_DIR)
        try:
            with open(f, encoding="utf-8") as handle:
                d = json.load(handle)
            pid = d.get("id") or os.path.basename(f)[:-5]
            if pid in protos:
                first_rel = protos[pid][0]
                issues.append(f"[R1 ID DUPLICADO] '{pid}' aparece em {first_rel} e {rel}")
                continue
            if isinstance(d.get("steps"), list):
                d["steps"], _ = expand_steps(d["steps"], commons)
            protos[pid] = (rel, d)
        except Exception as e:
            issues.append(f"[R1 PARSE] {rel}: {e}")
    ids = set(protos)

    for pid, (rel, d) in protos.items():
        steps = d.get("steps", [])
        dnp = d.get("dynamicNextProtocol")
        routers = dnp if isinstance(dnp, list) else ([dnp] if dnp else [])
        maps = {r.get("stepId"): r.get("map", {}) for r in routers}

        cond_covered = set()
        for s in steps:
            c = s.get("condition")
            if c:
                vals = c["value"] if isinstance(c.get("value"), list) else [c.get("value")]
                cond_covered.update(v for v in vals if v)

        nx = d.get("nextProtocol")
        if nx and nx not in ids:
            issues.append(f"[R2 DESTINO] {pid} ({rel}): nextProtocol -> '{nx}' não existe")

        for s in steps:
            opts = s.get("options", [])
            m = maps.get(s.get("id"))
            if pid.startswith("router") and opts and not any("Voltar" in o for o in opts):
                issues.append(f"[R5 SEM VOLTAR] {pid} ({rel}): step '{s.get('id')}'")
            backs = [o for o in opts if isinstance(o, str) and o.startswith("🔙 Voltar")]
            if len(backs) > 1:
                issues.append(f"[R6 VOLTAR DUPLICADO] {pid} ({rel}): step '{s.get('id')}' tem {backs}; deixe só '🔙 Voltar'")
            if m is None:
                continue
            for o in opts:
                if o in m:
                    tgt = m[o]
                    if tgt is not None and tgt not in ids:
                        issues.append(f"[R2 DESTINO] {pid} ({rel}): '{o}' -> '{tgt}' não existe")
                elif o not in cond_covered and not nx:
                    issues.append(f"[R3 OPÇÃO MORTA] {pid} ({rel}): step '{s.get('id')}' opção '{o}' sem destino nem step condicional")
            for k in m:
                if opts and k not in opts:
                    issues.append(f"[R4 KEY ÓRFÃ] {pid} ({rel}): step '{s.get('id')}' chave '{k}' não é uma option")

    print(f"Protocolos ativos: {len(protos)}")
    if issues:
        print(f"\n❌ {len(issues)} problema(s):")
        for i in sorted(issues):
            print("  " + i)
        sys.exit(1)
    print("✅ Grafo limpo — nenhuma referência quebrada, opção morta ou chave órfã.")
    sys.exit(0)

if __name__ == "__main__":
    main()
