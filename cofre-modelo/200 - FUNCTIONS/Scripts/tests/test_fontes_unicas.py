"""As cópias à mão leem a fonte (harmonização H2a, 29/10/2026).

PRINCIPIOS_Logica_e_Integridade_DFM_2026-10-29.md, §4 ("Onde ainda não há guarda", item 6) e
§5.3, item 3: a lista de status do `audit_protocols` (sem `cancelled`), a dos tipos de passo e a
das colunas em vários scripts eram cópias que ninguém comparava com a fonte. Cada teste aqui
cai se a cópia voltar ou se a fonte mudar sem a cópia.
"""
import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
VAULT = SCRIPTS.parents[1]
PLUGIN_SRC = VAULT / ".obsidian" / "plugins" / "dfm-system" / "src"


def load_script(name):
    path = SCRIPTS / name
    spec = importlib.util.spec_from_file_location(f"fontes_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ts_string_list(path, name):
    """Os textos de uma lista `export const NOME = [ '…', … ]` de um arquivo TypeScript."""
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"{name}\s*=\s*\[(.*?)\]", text, re.S)
    if not match:
        return None
    return re.findall(r"'([^']*)'", match.group(1))


class KanbanColumnsTest(unittest.TestCase):
    def test_kanban_columns_have_one_source(self):
        """A tabela coluna → status mora em `colunas_kanban.py`; os scripts a importam, e a
        ordem é a do plugin (`PROJECT_STAGES`)."""
        sys.path.insert(0, str(SCRIPTS))
        from colunas_kanban import COL_STATUS, COLUNAS

        self.assertIs(load_script("validate_projects.py").COL_STATUS, COL_STATUS)
        self.assertIs(load_script("sync_project_status.py").COL_STATUS, COL_STATUS)
        self.assertIs(load_script("audit_architecture.py").PORTFOLIO_COLUMNS, COL_STATUS)
        self.assertEqual(load_script("generate_tree_map.py").COLUNAS_KANBAN, list(COLUNAS))
        modes = load_script("activate_project.py").MODES
        self.assertTrue(all(COL_STATUS[coluna] == status for coluna, status in modes.values()))
        doctor = load_script("canvas_doctor.py")
        for coluna in COLUNAS:
            self.assertEqual(doctor.project_root(f"100 - AREAS/A/100 - PROJECTS/{coluna}/P/P.canvas"),
                             f"100 - AREAS/A/100 - PROJECTS/{coluna}/P")

        # Nenhum outro script volta a escrever a tabela à mão.
        copia = re.compile(r'"1 - Backlog"\s*:\s*"backlog"')
        copias = [p.name for p in SCRIPTS.glob("*.py") if p.name != "colunas_kanban.py"
                  and copia.search(p.read_text(encoding="utf-8"))]
        self.assertEqual(copias, [])

        stages = ts_string_list(PLUGIN_SRC / "engine" / "missionPortfolio.ts", "PROJECT_STAGES")
        if stages is None:
            self.skipTest("o plugin não está neste checkout")
        self.assertEqual(list(COLUNAS), stages)


class StepTypesTest(unittest.TestCase):
    def test_step_types_copy_matches_engine_dispatch(self):
        """`ALLOWED_STEP_TYPES` é o conjunto dos `step.type === '…'` do despacho do motor,
        o bloco que termina em "Tipo de passo não suportado" (`engine/jsonProtocol.ts`)."""
        source = PLUGIN_SRC / "engine" / "jsonProtocol.ts"
        if not source.exists():
            self.skipTest("o plugin não está neste checkout")
        text = source.read_text(encoding="utf-8")
        end = text.index("Tipo de passo não suportado")
        start = text.rindex("if (step.type === 'text')", 0, end)
        engine = set(re.findall(r"step\.type === '([a-z_]+)'", text[start:end]))
        self.assertEqual(load_script("audit_protocols.py").ALLOWED_STEP_TYPES, engine)


class TaskContextsTest(unittest.TestCase):
    def test_task_doctor_contexts_match_plugin(self):
        """O vocabulário do `contexts` no `task_doctor.py` é o `TASK_CONTEXTS` do plugin. O
        `livroNoSistemaEtapaC.test.ts` confere o mesmo do lado do plugin; este roda na bancada,
        quando é o juiz que muda."""
        contexts = ts_string_list(PLUGIN_SRC / "engine" / "taskContexts.ts", "TASK_CONTEXTS")
        if contexts is None:
            self.skipTest("o plugin não está neste checkout")
        self.assertEqual(load_script("task_doctor.py").CONTEXTOS, set(contexts))


class TaskNotesCatalogTest(unittest.TestCase):
    def test_protocol_audit_reads_status_catalog_from_tasknotes(self):
        """O status que um protocolo grava numa tarefa é conferido contra o catálogo do
        TaskNotes, não contra uma cópia: `cancelled` vale; sem o data.json, um aviso."""
        module = load_script("audit_protocols.py")
        protocolo = lambda status, prio="normal": {
            "targetFolder": "TaskNotes/Tasks",
            "properties": {"tags": ["task"], "type": "task", "status": status, "priority": prio}}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = root / ".obsidian" / "plugins" / "tasknotes" / "data.json"
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({
                "customStatuses": [{"value": v} for v in ("next-action", "cancelled", "pausada")],
                "customPriorities": [{"value": v} for v in ("normal", "urgente")],
            }), encoding="utf-8")
            module.VAULT = str(root)
            for status, prio, esperado in (("cancelled", "normal", []), ("pausada", "urgente", []),
                                           ("someday", "normal", ["[STATUS INVÁLIDO]"]),
                                           ("next-action", "high", ["[PRIORITY INVÁLIDA]"]),
                                           ("{{status}}", "normal", [])):
                issues, warnings = [], []
                module.check_properties_enum("p", protocolo(status, prio), issues, warnings)
                self.assertEqual([i.split("]")[0] + "]" for i in issues], esperado, status)
                self.assertEqual(warnings, [])
            config.unlink()
            issues, warnings = [], []
            module.check_properties_enum("p", protocolo("next-action"), issues, warnings)
            self.assertEqual(issues, [])
            self.assertTrue(warnings and warnings[0].startswith("[STATUS SEM CATÁLOGO]"))

    def test_real_catalog_has_cancelled(self):
        """No cofre real o catálogo tem o `cancelled`, o estado neutro (arquitetura universal)."""
        module = load_script("audit_protocols.py")
        statuses, _ = module.tasknotes_catalog()
        if statuses is None:
            self.skipTest("o TaskNotes não está neste checkout")
        self.assertIn("cancelled", statuses)


if __name__ == "__main__":
    unittest.main()
