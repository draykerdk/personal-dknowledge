"""O catálogo dos códigos dos juízes fica completo (harmonização H2a, 29/10/2026).

JUDGES.md, "Catálogo dos códigos": todo código que um juiz emite aparece lá, com a severidade, o
princípio que guarda e o porquê. Um código novo sem linha no catálogo derruba este teste: o
documento aponta para o que o código faz, e a divergência entre os dois é um defeito
(PRINCIPIOS_Logica_e_Integridade_DFM_2026-10-29.md, §4, item 5).
"""
import re
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
JUDGES_MD = SCRIPTS / "JUDGES.md"

# Os juízes que falam por código entre colchetes.
JUIZES_COM_CODIGO = ("validate_protocol_graph.py", "audit_protocols.py", "validate_projects.py",
                     "audit_architecture.py", "contratos_do_cofre.py", "audit_vocabulary.py")
# Um código: texto entre colchetes no começo de uma string, com uma palavra em maiúsculas.
CODIGO = re.compile(r'''(?:f|rf|fr)?["']\[((?=[^\]]*[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3})[^\]\n{}"']{2,70})\]''')
# As categorias do task_doctor.py: o primeiro argumento de `flag(` e de `avisar(`.
CATEGORIA = re.compile(r'''\b(?:flag|avisar)\(\s*["']([^"']+)["']''')


def codigos(script):
    return set(CODIGO.findall((SCRIPTS / script).read_text(encoding="utf-8")))


class CatalogTest(unittest.TestCase):
    def test_judges_md_lists_every_issue_code(self):
        doc = JUDGES_MD.read_text(encoding="utf-8").replace("\\`", "`")
        catalogo = doc[doc.index("## Catálogo dos códigos"):]
        faltam = [f"{s}: [{c}]" for s in JUIZES_COM_CODIGO for c in sorted(codigos(s)) if f"[{c}]" not in catalogo]
        categorias = set(CATEGORIA.findall((SCRIPTS / "task_doctor.py").read_text(encoding="utf-8")))
        self.assertGreaterEqual(len(categorias), 15)
        faltam += [f"task_doctor.py: {c}" for c in sorted(categorias) if f"`{c}`" not in catalogo]
        self.assertEqual(faltam, [])

    def test_the_extractor_sees_the_codes(self):
        """O extrator não está cego: acha os códigos conhecidos de cada juiz."""
        self.assertIn("R6 VOLTAR DUPLICADO", codigos("validate_protocol_graph.py"))
        self.assertIn("SEM CAMINHO NO 🧭", codigos("audit_protocols.py"))
        self.assertIn("RAMO", codigos("audit_architecture.py"))
        self.assertIn("P5 PRIORITY NO PROJETO", codigos("validate_projects.py"))
        self.assertIn("PASSAGENS", codigos("contratos_do_cofre.py"))
        self.assertIn("VOCABULÁRIO", codigos("audit_vocabulary.py"))


if __name__ == "__main__":
    unittest.main()
