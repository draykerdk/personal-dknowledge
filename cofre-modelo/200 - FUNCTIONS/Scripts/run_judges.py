#!/usr/bin/env python3
"""Executa a bancada canônica de juízes DFM em modo somente leitura.

Cada juiz continua independente e pode ser chamado isoladamente. Este runner é a
fonte única da composição da bancada: imprime uma linha por check e devolve exit 1
se qualquer contrato falhar. Use --verbose para expandir a saída completa.

Uso:
  python3 "200 - FUNCTIONS/Scripts/run_judges.py"
  python3 "200 - FUNCTIONS/Scripts/run_judges.py" --verbose
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path


VAULT = Path(__file__).resolve().parents[2]
SCRIPTS = VAULT / "200 - FUNCTIONS" / "Scripts"

JUDGES = [
    ("Protocolos · grafo", [sys.executable, str(SCRIPTS / "validate_protocol_graph.py")]),
    ("Protocolos · contratos", [sys.executable, str(SCRIPTS / "audit_protocols.py"), "--all", "--sim-dates"]),
    ("Projetos e tarefas · pipeline", [sys.executable, str(SCRIPTS / "validate_projects.py")]),
    ("Tarefas · TaskNotes", [sys.executable, str(SCRIPTS / "task_doctor.py")]),
    # Os invariantes de dados que só o vitest do plugin conferia (H2a, 29/10/2026).
    ("Cofre · contratos", [sys.executable, str(SCRIPTS / "contratos_do_cofre.py")]),
    # O normalizador em simulação: uma regra com algo a mudar sai com 1 (a invariante dela regrediu).
    ("Propriedades · normalizador (simulação)", [sys.executable, str(SCRIPTS / "normalizar_propriedades.py")]),
    ("Arquitetura · gramática e pesos", [sys.executable, str(SCRIPTS / "audit_architecture.py")]),
    # O vocabulário vetado, de uma lista só (Config/vocabulario.json), no texto que a pessoa lê (H2a).
    ("Vocabulário · o que a pessoa lê", [sys.executable, str(SCRIPTS / "audit_vocabulary.py")]),
    ("Árvores de Progressão", [sys.executable, str(SCRIPTS / "progression_tree.py"), "--all", "--check"]),
    ("Canvas", [sys.executable, str(SCRIPTS / "canvas_doctor.py")]),
    ("Projetos · status espelho", [sys.executable, str(SCRIPTS / "sync_project_status.py")]),
    ("Mapa estrutural", [sys.executable, str(SCRIPTS / "generate_tree_map.py"), "--check"]),
    ("Mapa do 🧭 Router Central", [sys.executable, str(SCRIPTS / "generate_router_map.py"), "--check"]),
    # O hub dos tipos de função, gerado dos modelos de Config/dominios (02/11/2026).
    ("Tipos de função · hub gerado", [sys.executable, str(SCRIPTS / "generate_function_types.py"), "--check"]),
    # Os resumos que o agente do sistema lê no lugar das notas inteiras (02/11/2026).
    ("Resumos do agente · gerados", [sys.executable, str(SCRIPTS / "generate_agent_summaries.py"), "--check"]),
    ("Agent Commons", [sys.executable, str(SCRIPTS / "agent_commons.py"), "doctor"]),
    # Aviso: conta, por pasta, o que ainda impede a cópia para o pacote aberto (sai sempre com 0).
    # A guarda gêmea do pacote aberto (guarda_gemea.py) não roda na bancada diária: ~20 s e milhares de avisos
    # esperados (os nomes dele no próprio cofre). Ela roda antes da exportação para o dk-personal (03/11).
]


def advisory_summary(output: str) -> str:
    matches = re.findall(r"(?:⚠️\s*)?(\d+)\s+(?:warning|warnings|aviso|avisos)", output, re.I)
    if matches:
        total = max(int(value) for value in matches)
        if total:
            return f" · {total} aviso(s)"
    summary = re.search(r"Resumo:\s*\d+ erro\(s\),\s*(\d+) aviso\(s\)", output)
    if summary and int(summary.group(1)):
        return f" · {summary.group(1)} aviso(s)"
    return ""


def indent(text: str) -> str:
    return "\n".join("    " + line for line in text.rstrip().splitlines())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", action="store_true", help="mostra a saída completa de cada juiz")
    args = parser.parse_args()

    failures = 0
    started = time.monotonic()
    print(f"Bancada DFM · {len(JUDGES)} checks somente leitura\n")

    for label, command in JUDGES:
        check_started = time.monotonic()
        result = subprocess.run(
            command,
            cwd=VAULT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        elapsed = time.monotonic() - check_started
        marker = "✅" if result.returncode == 0 else "❌"
        advisory = advisory_summary(result.stdout)
        print(f"{marker} {label} · exit {result.returncode} · {elapsed:.2f}s{advisory}")
        # Warning não pode ficar escondido atrás de um verde: se existir, mostra a
        # evidência completa mesmo sem --verbose. Exceções conhecidas são filtradas
        # no juiz que conhece o contrato, não neste agregador.
        if args.verbose or result.returncode != 0 or advisory:
            if result.stdout.strip():
                print(indent(result.stdout))
        failures += result.returncode != 0

    elapsed = time.monotonic() - started
    print(f"\n{'✅ Bancada limpa' if not failures else f'❌ {failures} juiz(es) falharam'} · {elapsed:.2f}s")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
