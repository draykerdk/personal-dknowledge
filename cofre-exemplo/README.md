# The Synthetic Example Vault

A full snapshot of one week in a fictional person's vault: **Irene Paiva**, a freelance illustrator working from home. It serves two roles: showing how notes connect in practice, and giving automated tests a clean synthetic fixture with zero personal data.

**Rule:** zero real names, places, values, or text from any real person. Every file here is synthetic and carries `exemplo: true` in frontmatter so it is trivial to inspect or strip out.

## How to materialize

These notes sit at the real vault relative paths without duplicating the skeleton owned by `cofre-modelo/`. Build a complete runnable example vault in a fresh directory outside the repo:

```sh
python3 -B scripts/montar_cofre_exemplo.py /path/to/new-example-vault
```

The output directory merges `cofre-modelo/` and `cofre-exemplo/`, opens directly in Obsidian (with `dfm-system`, TaskNotes, and Dataview), and passes the vault judge bench:

```sh
python3 -B "/path/to/new-example-vault/200 - FUNCTIONS/Scripts/run_judges.py"
python3 -B scripts/montar_cofre_exemplo.py --conferir  # verifies zero file collisions with skeleton
```

## Contents

Dates are frozen (`2026-03-04`, `2026-W10`, `2026-Q1`) so tests stay deterministic:

| Artifact | Location | What it demonstrates |
|---|---|---|
| Three areas: `Trabalho`, `Saúde`, `Casa` | `100 - AREAS/NN - Área/000 - INDEX/README.md` (`type: area`) | Two areas with active projects, one maintenance area |
| Two active projects: `Portfólio novo` and `Correr 5 km` | `100 - AREAS/<área>/100 - PROJECTS/2 - Active/<projeto>/<projeto>.md` (`type: iniciativa`) | Folder column is ground truth; `status` mirrors folder |
| Two weekly SMART goals | `TaskNotes/Tasks/` (`type: tarefa_smart`, with `week`, `due`, `projects`) | One active, one upcoming |
| Eight actions | `TaskNotes/Tasks/` (`type: task`) | Done, in progress, waiting, next-action, someday, inbox without project, and script-linked |
| Day note | `300 - RUNTIME/302 - Daymiss/Day/2026-03-04.md` | Model Day note with sample journal entries |
| Week note | `300 - RUNTIME/302 - Daymiss/Week/2026-W10.md` | Mid-week state: `🌳` fields, weekly values pair, supports, and empty `📨` placeholder |
| Quarter note | `300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q1.md` | Theme, vision, goals, values, season, focus, milestones |
| Three habits | `200 - FUNCTIONS/Habits/Tracker/` (`type: habit`) | Weekly target, daily habit, and language habit with `entries` |
| One value: `Curiosidade` | `400 - MEMORY/Valores/` (`type: valor`, `ordem`, `grupo`) | Value referenced by quarter and week |
| One video script | `400 - MEMORY/200 - WEEKLY/Roteiros/` (`type: roteiro_video`) | Creation branch piece in `roteiro` state linked to project |
| Learning module: `Inglês` | `100 - AREAS/01 - Trabalho/200 - DEPARTMENTS/Inglês/` (`type: departamento`), `Cartões/` (`cartao`), `Lógica/` (`peca_logica`) | Ordered spaced-repetition card activating a logic piece |

`definicoes.exemplo.json` populates the schema in `config-padrao/definicoes.padrao.json` for this fictional persona. In a live vault those values live in plugin Settings (`data.json`).

## Scripts still omitted in `v0`

Context/kernel/sentinel day helpers and the weekly factual digest helper are not exported yet; sections invoking them render empty safely.
