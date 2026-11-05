// O que faz: escreve `cordis.patch.yml`, a declaração do modo (preset) Dk pessoal do DSH, com a persona igual ao
// corpo da skill `dk-pessoal` (as instruções-base), e, com `--check`, só confere que o arquivo escrito é o que
// sairia agora (sai 1 se não for).
//
// Por quê: o modo existe para as instruções-base estarem em toda sessão, sem depender do modelo carregar a
// skill (05/11/2026). A skill é a dona do texto; a persona é cópia, e a cópia é vigiada por `--check` (o teste
// `native-dsh/test/dk-pessoal-preset.test.mjs`): mudou a skill, o teste fica vermelho até regerar.
//
// Entra → sai: `--skill <SKILL.md>` (sem ele, o do cofre ou o do pacote aberto, o que existir) → o patch.
// Erro e ataque: a skill sem frontmatter ou vazia falha; o texto entra num bloco literal do YAML (`|-`) com o
// recuo do bloco, então `#`, `:` e aspas da skill não viram YAML; nenhuma linha do texto é interpretada.
// Prova: node --test test/dk-pessoal-preset.test.mjs (na pasta native-dsh).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, "cordis.patch.yml");
const CANDIDATAS = [
  join(AQUI, "../../../Skills/Dk Pessoal/dk-pessoal/SKILL.md"), // o cofre de origem
  join(AQUI, "../skills/dk-pessoal/SKILL.md"), // o pacote aberto (ponte-do-agente/)
];

/** O que faz: o corpo da skill, sem o frontmatter e sem as linhas em branco das pontas. */
export function corpoDaSkill(texto) {
  const m = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(String(texto).replace(/\r\n/g, "\n"));
  if (!m || !m[1].trim()) throw new Error("a skill dk-pessoal não tem frontmatter ou está vazia");
  return m[1].replace(/^\s*\n/, "").replace(/\s+$/, "");
}

/** O que faz: o texto como bloco literal do YAML, cada linha com o recuo dado (a linha vazia fica vazia). */
function bloco(texto, recuo) {
  return texto.split("\n").map(linha => (linha ? `${" ".repeat(recuo)}${linha}` : "")).join("\n");
}

const SUFIXO = [
  "Este é o modo Dk pessoal do DSH: as instruções-base acima já estão na conversa, então não carregue a skill `dk-pessoal`; as outras skills `dk-*` você carrega quando o gatilho delas aparecer.",
  "O passo 0, a camada pessoal: procure o arquivo `camada-pessoal.md` com a busca de arquivos (o padrão `**/dk-pessoal/camada-pessoal.md`) a partir do diretório de trabalho, {{cwd}}, e leia-o inteiro. Se não achar, chame a ferramenta `skill` com `dk-pessoal` só para saber a pasta dela e leia o arquivo de lá. Sem ele, siga só estas instruções.",
  "Neste modo você não tem shell nem escrita de arquivo: lê arquivos, usa as ferramentas `dfm_*` da ponte e propõe. A data e a hora são as da sessão.",
].join(" ");

/** O que faz: o patch inteiro, com a persona do corpo da skill. */
export function patchDoModo(corpo) {
  return `# GERADO por gerar-patch.mjs a partir da skill dk-pessoal (as instruções-base): não edite à mão.
# Regerar: node gerar-patch.mjs  ·  conferir: node gerar-patch.mjs --check
#
# O modo (preset) Dk pessoal do DSH. Desde a 0.2 do DSH, um preset é uma declaração
# \`@deepseek-ai/dsh-agent-preset\` levada pelo patch de um bundle (a pasta \`.agent-presets\` não é mais
# lida). As linhas são as do preset \`standard\` que o Dk pessoal usa, com três desvios de propósito:
#   · a persona é a skill dk-pessoal inteira, para as regras estarem em toda sessão;
#   · sem shell e com a ferramenta de arquivos só de leitura (\`write: false\`, \`edit: false\`): o Dk pessoal
#     nunca grava o cofre; o que ele quer gravar, propõe pela ponte, e a Missão grava com o sim da pessoa;
#   · sem \`agent-instructions\`: as instruções de projeto do cofre são para quem constrói o sistema, e a
#     persona com a camada pessoal são as instruções deste modo. Sem delegação, metas, plano nem tarefas
#     em segundo plano: um agente que lê, recomenda e propõe.
# As ferramentas \`dfm_*\` vêm da ponte, montada no plano do host (o bundle da ponte); não têm linha aqui.
- insert:
    - id: preset-dk-pessoal
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: dk-pessoal
        name: Dk pessoal
        description: O agente pessoal sobre o cofre - lê a Missão, recomenda com o porquê e propõe pela triagem; nada grava sem o seu sim.
        order: 10
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: |-
${bloco(corpo, 16)}
              suffix: >-
                ${SUFIXO}
          - id: time-context
            name: '@deepseek-ai/dsh-time-context'
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config:
              write: false
              edit: false
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
            config:
              sampleOverCapGlobResults: false
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
          - id: tool-skill
            name: '@deepseek-ai/dsh-tool-skill'
          - id: tool-ask-user
            name: '@deepseek-ai/dsh-tool-ask-user'
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config:
              fetch: true
              searchTimeoutMs: 60000
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
              - id: compaction-basic
                name: '@deepseek-ai/dsh-compaction-basic'
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
                config:
                  thresholdChars: 8192
                  headChars: 4096
                  tailChars: 1024
`;
}

function skillDe(args) {
  const i = args.indexOf("--skill");
  if (i >= 0) return resolve(args[i + 1] ?? "");
  const achada = CANDIDATAS.find(caminho => existsSync(caminho));
  if (!achada) throw new Error("a skill dk-pessoal não foi achada; passe --skill <caminho do SKILL.md>");
  return achada;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const novo = patchDoModo(corpoDaSkill(readFileSync(skillDe(args), "utf8")));
  if (args.includes("--check")) {
    const escrito = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8") : "";
    if (escrito !== novo) {
      console.error("cordis.patch.yml difere da skill dk-pessoal: rode `node gerar-patch.mjs`.");
      process.exit(1);
    }
    console.log("cordis.patch.yml segue a skill dk-pessoal.");
  } else {
    writeFileSync(SAIDA, novo);
    console.log(`escrito: ${SAIDA}`);
  }
}
