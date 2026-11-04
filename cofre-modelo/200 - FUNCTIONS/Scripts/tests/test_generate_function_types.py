"""O hub dos tipos de função sai dos modelos (02/11/2026).

`generate_function_types.py` escreve `015 - Tipos de Função (gerado).md` a partir de
`Config/dominios/*.json`. Os casos: um cofre de exemplo com dois modelos pequenos dá o texto
esperado (`fixtures/tipos_de_funcao/esperado.md`); o `--check` acusa a nota defasada e a nota
cujo exemplo saiu, e não acusa a nota nova que só mudaria o exemplo; a chave `situacoes` pode
faltar; o peso inicial só aparece com a ligação declarada; as exclusões das casas valem.
"""
import importlib.util
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
ESPERADO = Path(__file__).resolve().parent / "fixtures" / "tipos_de_funcao" / "esperado.md"


def load_script(name):
    path = SCRIPTS / name
    spec = importlib.util.spec_from_file_location(f"test_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MOD = load_script("generate_function_types.py")

ALFA = {
    "dominio": "alfa",
    "descricao": "O alfa (o módulo de cima, `type: alfa`). Mora na pasta Alfa.",
    "candidatos": {"pasta": "Casa/Alfa", "type": "alfa"},
    "campos": [
        {"nome": "titulo", "rotulo": "Título", "tipo": "texto", "formato": "curto", "obrigatorio": True, "dono": "nota"},
        {"nome": "fase", "rotulo": "Fase", "tipo": "escolha", "valores": ["aberta", "fechada"], "dono": "protocolo:criar_alfa#fase"},
    ],
    "criar": {"via": "protocolo", "protocolo": "criar_alfa"},
    "protocolos": [{"id": "criar_alfa", "papel": "cria"}, {"id": "rever_alfa", "papel": "revisa"}],
    "estados": [
        {"valor": "aberta", "estado": "aberta", "rotulo": "aberta", "mostrar": "contorno"},
        {"valor": "fechada", "estado": "feita", "rotulo": "feita", "mostrar": "cheio", "marca": "✓"},
    ],
}
BETA = {
    "dominio": "beta",
    "descricao": "O beta | a peça de baixo (liga ao alfa). Tem um par ao lado.",
    "candidatos": {"pasta": "Casa/Beta", "type": "beta"},
    "campos": [
        {"nome": "alfa", "rotulo": "Alfa", "tipo": "link", "alvo": ["alfa"], "ramo": "acima", "dono": "nota"},
        {"nome": "par", "rotulo": "Par", "tipo": "link", "alvo": ["beta"], "multiplo": True, "ramo": "lado", "dono": "derivado"},
    ],
    "criar": {"via": "nota", "titulo": "titulo"},
    "protocolos": [{"id": "usar_beta", "papel": "usa"}],
    "situacoes": [{"id": "parado", "quando": "sem par"}],
}


def nota(tipo):
    return f"---\ntype: {tipo}\n---\n\ntexto\n"


def cofre(raiz: Path, modelos=(ALFA, BETA), reputacao=None):
    dominios = raiz / MOD.DOMINIOS
    dominios.mkdir(parents=True)
    for m in modelos:
        (dominios / f"{m['dominio']}.json").write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    protos = raiz / MOD.PROTOCOLOS
    (protos / "_comuns").mkdir(parents=True)
    (protos / "criar_alfa.json").write_text(json.dumps({"id": "criar_alfa", "name": "🅰️ Criar Alfa"}), encoding="utf-8")
    (protos / "rever_alfa.json").write_text(json.dumps({"id": "rever_alfa", "name": "🔄 Rever Alfa"}), encoding="utf-8")
    (protos / "_comuns" / "usar_beta.json").write_text(json.dumps({"id": "usar_beta", "name": "comum"}), encoding="utf-8")
    if reputacao is not None:
        (raiz / MOD.REPUTACAO).write_text(json.dumps(reputacao, ensure_ascii=False), encoding="utf-8")
    arquivos = {
        "Casa/Alfa/Zeta.md": nota("alfa"),
        "Casa/Alfa/Meio.md": nota("alfa"),
        "Casa/Alfa/Alfa modelo.md": nota("alfa"),          # nome de modelo
        "Casa/Alfa/Templates/Aaa.md": nota("alfa"),        # pasta de templates
        "Casa/Alfa/300 - ARCHIVES/Aab.md": nota("alfa"),   # arquivo da área
        f"Casa/Alfa/{MOD.PASTA_DO_LIVRO}/Aac.md": nota("alfa"),  # a pasta do livro
        "Casa/Alfa/Aad.md": nota("outro"),                 # outro tipo
        "Fora/Aae.md": nota("alfa"),                       # fora da casa
    }
    for rel, texto in arquivos.items():
        caminho = raiz / rel
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_text(texto, encoding="utf-8")
    return raiz


def rodar(raiz, *argv):
    with redirect_stdout(StringIO()) as out:
        code = MOD.main(list(argv), vault=str(raiz))
    return code, out.getvalue()


class FunctionTypesTest(unittest.TestCase):
    def test_two_models_give_the_expected_markdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            novo, candidatos, total = MOD.construir(str(cofre(Path(tmp))))
        self.assertEqual(total, 2)
        # O exemplo: o primeiro pelo nome, na casa, fora das exclusões; o beta ainda não tem nota.
        self.assertEqual(candidatos, {"alfa": ["Casa/Alfa/Meio.md", "Casa/Alfa/Zeta.md"], "beta": []})
        self.assertEqual(novo, ESPERADO.read_text(encoding="utf-8"))

    def test_check_flags_stale_note_and_write_fixes_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            raiz = cofre(Path(tmp))
            code, out = rodar(raiz, "--check")
            self.assertEqual(code, 1)
            self.assertIn("DEFASADOS", out)
            self.assertEqual(rodar(raiz, "--write")[0], 0)
            self.assertEqual(rodar(raiz, "--check")[0], 0)
            # Uma nota nova que vem antes no nome não deixa a nota defasada: o exemplo gravado ainda vale.
            (raiz / "Casa/Alfa/Aaa novo.md").write_text(nota("alfa"), encoding="utf-8")
            self.assertEqual(rodar(raiz, "--check")[0], 0)
            code, out = rodar(raiz, "--write")
            self.assertIn("preservada", out)
            # O exemplo gravado que saiu deixa a nota defasada, com o tipo no motivo.
            (raiz / "Casa/Alfa/Meio.md").unlink()
            code, out = rodar(raiz, "--check")
            self.assertEqual(code, 1)
            self.assertIn("alfa", out)
            rodar(raiz, "--write")
            self.assertIn("[[Casa/Alfa/Aaa novo]]", (raiz / MOD.DESTINO).read_text(encoding="utf-8"))
            # O primeiro exemplo de um tipo sem nenhum também pede regravar.
            (raiz / "Casa/Beta/Um.md").parent.mkdir(parents=True)
            (raiz / "Casa/Beta/Um.md").write_text(nota("beta"), encoding="utf-8")
            self.assertEqual(rodar(raiz, "--check")[0], 1)
            rodar(raiz, "--write")
            # O modelo que muda deixa a nota defasada.
            self.assertEqual(rodar(raiz, "--check")[0], 0)
            mudado = dict(BETA, descricao="O beta, agora outro.")
            (raiz / MOD.DOMINIOS / "beta.json").write_text(json.dumps(mudado), encoding="utf-8")
            self.assertEqual(rodar(raiz, "--check")[0], 1)

    def test_missing_situacoes_is_fine(self):
        semsit = {k: v for k, v in BETA.items() if k != "situacoes"}
        texto = MOD.gera([ALFA, semsit], {}, {}, {})
        self.assertNotIn("### Situações", texto)
        self.assertIn("### Situações", MOD.gera([ALFA, BETA], {}, {}, {}))

    def test_initial_weight_only_with_a_declared_link(self):
        reputacao = {"tipos": [{"id": "captura", "p0": 1, "protocolos": [{"fase": ["captura"]}]}]}
        self.assertNotIn("P₀", MOD.gera([ALFA, BETA], {}, {}, reputacao))
        reputacao["tipos"].append({"id": "estrutura", "p0": 2, "dominios": ["alfa"]})
        texto = MOD.gera([ALFA, BETA], {}, {}, reputacao)
        self.assertIn("| Tipo | O que é | Onde mora | Acima | Abaixo · ao lado | P₀ |", texto)
        self.assertIn("- **Peso inicial (P₀):** 2", texto)

    def test_branch_reads_both_directions(self):
        rs = MOD.ramos([ALFA, BETA])
        self.assertEqual(rs["alfa"]["apontado"]["abaixo"], [("beta", "alfa")])
        self.assertEqual(rs["beta"]["proprio"]["acima"], [("alfa", ["alfa"])])
        # O lado para o mesmo tipo aparece uma vez, no próprio.
        self.assertEqual(rs["beta"]["apontado"]["lado"], [])

    def test_first_sentence_ignores_dots_in_parentheses(self):
        self.assertEqual(MOD.primeira_frase("A ação (arquitetura 3.1. e mais). Depois."), "A ação (arquitetura 3.1. e mais).")
        self.assertEqual(MOD.primeira_frase("Sem ponto"), "Sem ponto")

    def test_runner_runs_the_check(self):
        runner = load_script("run_judges.py")
        comandos = [" ".join(str(p) for p in cmd) for _, cmd in runner.JUDGES]
        self.assertTrue(any("generate_function_types.py --check" in c for c in comandos))


if __name__ == "__main__":
    unittest.main()
