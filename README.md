# The Personal Dknowledge

> **Version 2.9.0, experimental and still very early.** This is an initial snapshot of what the system will become: it works, changes significantly from version to version, and nothing here is stable yet. The code comes from an active DFM vault and is separated from it piece by piece; nothing enters this repository without passing the leak guard.
>
> English is the canonical documentation language here. Note that the current `v0` vault skeleton, folder taxonomy, starter protocol prompts, and initial UI labels ship in Portuguese, while your personal definitions (values, areas, quarter focus, weights, and vocabulary) live in the plugin's **Settings** tab rather than in code.

## What it is

A starter vault for [Obsidian](https://obsidian.md) with the DFM organization ready and empty, paired with the plugin that runs it. It is the experimental public prototype of the personal scale: the personal Dknowledge (the vault and its structure) and the personal Dk (the local agent working over it strictly by proposal, never writing on its own).

DFM organizes life and work with a single pattern, from day to long term and from area to task. Every scale runs the same loop: plan, execute, review.

This version includes:

- **the `dfm-system` plugin**: Mission (timeline and active work in a single view, across scales and branches), the protocol engine, and the type domain models;
- **the vault skeleton**: folders from `000 - KERNEL` to `900 - ARCHIVE`, period model notes (day, week, quarter, long term), and type templates (area, department, project, SMART goal, task, period notes, vision, function, person);
- **system definitions in plugin Settings**: your values, areas, quarter focus, weight adjustments, vocabulary, and labels. Code reads from configuration rather than hardcoding personal choices;
- **an initialization protocol** (`🌱 Inicializar o cofre`), which asks for those definitions on first launch and sets up the empty vault;
- **three short generic cycle protocols**: `🌳` plan the week, `📅` review the week, and `🧭` plan the quarter. A cycle button only appears when its protocol exists in the vault;
- **the usage trail** (`trilha`): Mission greets afternoon arrivals with *"what have you done today?"*, shows the gesture of the week, and shows first-time tips for each button; texts live in `Config/trilha.json` and toggles live in Settings;
- **the SMART flow in the engine**: an action created inside a SMART goal inherits its week and impact, a task picked from another day moves to today with its time, and completing a task can prompt the next step on its parent SMART goal (day-level buttons using this arrive with the daily protocols, which are not bundled yet);
- **Creation with campaigns**: each channel and content front tracks weekly pieces; a piece gets destinations (channel profiles by format rules), a campaign link, and an `aprovado` state; `📅` checks what shipped during the week; and `🎥 Para gravar hoje` places ready scripts and teleprompter cues onto the Day note;
- **directional branches**: empty Kanban columns explain the next step, and a project links out to the Creation branch and back;
- **the single task creator**: every task is created through one path, whether triggered from New, a protocol, or the TaskNotes modal;
- **verified research checklist**: tasks tagged `pesquisa` receive the verification checklist (`🔎 Conferir uma pesquisa`) item by item as branch nodes;
- **the learning module**: `cartao` (one phrase per note, in four layers) and `peca_logica` ("how the language works") types with templates, levels, and progression track; `🗣️ Inglês de hoje` queues spaced repetition for the day, while `🗣️ Frase nova` and `🧩 Construir uma ideia` create cards. Target language, folder path, and ladder thresholds are configurable;
- **guarded folder maps**: `dfm.json` manifests across the seven plugin folders, verified against real imports.

Left outside this repository for now: the mobile agent and the extended protocol packs (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Repository layout

| Folder | Contents |
|---|---|
| `plugin/` | TypeScript source and tests for the `dfm-system` Obsidian plugin |
| `cofre-modelo/` | Vault skeleton: folders (`000`–`900`), domain models, templates, period model notes, and judge scripts (`200 - FUNCTIONS/Scripts/`) |
| `config-padrao/` | Neutral starter definitions schema and defaults read before initialization |
| `cofre-exemplo/` | Synthetic notes of a fictional person (areas, projects, tasks, day, week, quarter, habits, one value, and one script), used for tests and to see the system running; `scripts/montar_cofre_exemplo.py` builds it on top of the skeleton in a new directory |
| `ponte-do-agente/` | Agent bridge, DSH side (`@dfm/dsh-vault-bridge`): tools through which the personal agent reads digested Mission state and creates triage proposals, plus setup instructions |
| `ponte-do-agente/skills/` | Universal instructions and `dk-*` skills that make a local agent operate as a personal Dk over the bridge |
| `ponte-do-agente/modo-dk-pessoal/` | Read-only DSH mode preset bundling the `dk-pessoal` base instructions |
| `docs/` | Usage and development documentation |
| `scripts/` | One-command installer, allowlist exporter, leak guard, and pre-commit git hooks |

## Dependencies

| Requirement | Purpose | Required |
|---|---|---|
| [Obsidian](https://obsidian.md) 1.12.2 or newer | Desktop/mobile host application | yes |
| [TaskNotes](https://github.com/callumalpass/tasknotes) (community plugin) | Task notes; Mission, projects, and protocols read and write through it | yes |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview) (community plugin) | Embedded dynamic views in Day, Week, and Quarter notes | yes |
| [Node.js](https://nodejs.org) 20 or newer | Building the plugin from source | for building |
| DSH, the DeepSeek Harness (`npm i -g @deepseek-ai/dsh`) | Live agent runtime connected over the vault bridge: reads Mission state and submits proposals; nothing writes without your explicit approval | for the full system; without it, the vault, Mission, and protocols still work (see [`ponte-do-agente/`](ponte-do-agente/README.md)) |

DSH is the live integrated runtime talking to Obsidian over the loopback bridge. You can also run other external agent tools directly on the Markdown files on disk; those still operate on the vault files, without live UI effects in Mission, TaskNotes, or open protocols.

## Building from source

```sh
cd plugin
npm ci
npm run build   # generates plugin/main.js
npx vitest run  # runs the plugin unit/package test suite
```

## Trying it out

One command builds a ready-to-open vault in a fresh directory:

```sh
python3 -B scripts/instalar.py ~/Vaults/my-vault               # empty vault skeleton
python3 -B scripts/instalar.py ~/Vaults/example --com-exemplo   # pre-populated with synthetic example notes
```

> On macOS, if your system `python3` has issues, run with Python 3.11+ (`python3 -B`).

The installer builds the plugin if `plugin/main.js` does not exist yet (requires Node.js), copies `cofre-modelo/`, places the plugin in `.obsidian/plugins/dfm-system/`, downloads the latest GitHub releases of Dataview and TaskNotes (or copies them from a local directory via `--plugins-de DIR`), enables all three plugins, and enables DataviewJS queries. Then:

1. In Obsidian, choose **Open folder as vault** and select the created folder; trust community plugins when prompted.
2. Run the `🌱 Inicializar o cofre` protocol: it prompts for your name, areas, values, and quarter focus, creates only the missing structure (areas and one note per value), and saves the definitions in plugin Settings ("Definições do sistema").
3. Open **Mission** (`Missão`) and, at the start of the week, run `🌳`.

To attach the live personal agent later, see [`ponte-do-agente/README.md`](ponte-do-agente/README.md).

## Personal Dk skills

The bridge provides the tools; the skills define the behavior. They live in [`ponte-do-agente/skills/`](ponte-do-agente/skills/README.md), one `<name>/SKILL.md` folder per skill, written in short numbered steps so smaller models can follow them reliably:

| Skill | Role |
|---|---|
| `dk-pessoal` | Base instructions: identity, hard limits, how proposals work (via Mission triage under `Propostas`, never auto-writing), tone, and research verification rules |
| `dk-estado-agora` | Digest of what is in play today or this week via Mission, plus one concrete next action |
| `dk-fechar-o-dia` | Closes the day from what you actually did, proposing summary lines and takeaways |
| `dk-material-da-semana` | Gathers factual material for weekly review and planning without planning for you |
| `dk-capturar-tarefas` | Splits spoken/written items into structured task proposals linked to parent initiatives |
| `dk-pesquisa-conferida` | Verified research with sources, dates, and remaining gaps to confirm |
| `dk-recomendar` | Grounded recommendation tied to current focus and stakes, with explicit reasoning |

There are two layers: the **universal layer** shipped here, and your **personal layer**, a single file `dk-pessoal/camada-pessoal.md` kept only inside your private vault (your rhythm, values, protocols, and reading map). Start from `dk-pessoal/camada-pessoal.exemplo.md`; `.gitignore` excludes `camada-pessoal.md`.

**Attaching skills to DSH:** with the bridge enabled, place the skills where DSH discovers them, one directory per skill:

```sh
# project-local inside your vault (DSH scans .agents/skills/ at the workspace root)
mkdir -p /path/to/your/vault/.agents/skills
cp -R ponte-do-agente/skills/dk-* /path/to/your/vault/.agents/skills/

# or user-global for DSH with one symlink per skill
for s in ponte-do-agente/skills/dk-*; do ln -s "$(pwd)/$s" ~/.dsh/skills/"$(basename "$s")"; done
```

In a new session, all seven skills appear in the skill catalog. Ask to load `dk-pessoal` or simply ask *"o que faço agora?"* / *"what should I do now?"*. Details in [`ponte-do-agente/skills/README.md`](ponte-do-agente/skills/README.md).

## The leak guard

Everything published here passes through `scripts/guarda_vazamento.py`, which fails if any term from an external private list appears or if any dated human quote appears. Export from a personal vault is strict allowlist-only (`scripts/lista_permitidos.txt`); files authored and maintained directly inside this repository are marked `proprio` in that same list.

```sh
python3 -B scripts/guarda_vazamento.py --teste        # guard self-test
python3 -B scripts/guarda_vazamento.py                # disk scan (requires DK_TERMOS_PRIVADOS)
python3 -B scripts/guarda_vazamento.py --historico    # full git history, messages, and authors
python3 -B scripts/instalar_gatilhos.py               # installs pre-commit/commit-msg guard hooks
python3 -B scripts/conferir_definicoes.py             # validates definitions schema vs documentation
python3 -B scripts/conferir_porta_dos_modulos.py      # confirms empty optional-modules gate
python3 -B scripts/montar_cofre_exemplo.py DIR        # builds skeleton + example vault into DIR
python3 -B scripts/instalar.py --teste                # installer self-test (offline)
```

Running `scripts/instalar_gatilhos.py` installs hooks from `scripts/gatilhos/` into `.git/hooks/` and records the Python executable and private term list path strictly in local git config (`dk.python`, `dk.termos`). Commits matching a private term, a dated personal quote, or missing the guard configuration fail closed.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). In short: one focused change at a time, with a test proving it, and zero personal data anywhere in tests or examples.

## License

MIT. See [LICENSE](LICENSE).
