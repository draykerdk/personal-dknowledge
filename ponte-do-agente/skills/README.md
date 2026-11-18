# Personal Dk Skills

Universal instructions and skills that guide a local agent operating over your vault through the bridge: reading digested Mission state, making grounded recommendations, and queuing triage proposals. Nothing is written to the vault without explicit human confirmation (`Y`).

Each skill lives in `<name>/SKILL.md` with YAML `name` and `description`. They are written in short, direct steps so both larger and smaller models can execute them reliably.

## Two layers

- **Universal layer** (included here): `dk-pessoal` (base persona and safety contract) plus six focused `dk-*` skills. Valid for any user.
- **Personal layer** (stays strictly in your private vault): `dk-pessoal/camada-pessoal.md`, holding your personal rhythm, values, protocols, and vault reading pointers. Start by copying `dk-pessoal/camada-pessoal.exemplo.md`. If missing, the agent follows the universal layer alone.

## Skill catalog

| Skill | Role |
|---|---|
| `dk-pessoal` | Base contract: identity, allowed/forbidden actions, how proposals and speech work, research check rules, and loading `camada-pessoal.md` |
| `dk-estado-agora` | Reads today's and this week's live state from Mission and surfaces one concrete next action |
| `dk-fechar-o-dia` | Reviews what you did today, proposes journal/summary lines, and opens the end-of-day protocol if installed |
| `dk-material-da-semana` | Collects factual weekly inputs for review and planning without planning on your behalf |
| `dk-capturar-tarefas` | Extracts stated tasks into structured proposals with parent project links inside Mission triage |
| `dk-pesquisa-conferida` | Enforces primary sources, dates, unresolved contradictions, and explicit `🤖` / `👤` / `🤝` check status |
| `dk-recomendar` | Gives one reasoned recommendation aligned with active focus and current stakes |

## Bridge tools used

Read-only inspection and vault file reads: `dfm_mission_state`, `dfm_node`, `dfm_operational_context`, `dfm_weekly_context`, `dfm_tasks_query`, `dfm_context_note`, `dfm_working_state`, `dfm_mission_query`, `dfm_proposals_list`, and `dfm_definitions`.

Triage proposals (queued in `Propostas`; committed only when approved with `Y`, with Undo): `dfm_propose`, `dfm_task_create`, and `dfm_line_propose`.

UI navigation: `dfm_note_open`, `dfm_protocol_run`, and `dfm_notice`.

Direct task updates only upon explicit request in conversation: `dfm_task_update` and `dfm_task_complete`.

## Attaching skills

Point your agent runtime to the skill folders in one of two ways:

**Inside your vault** (DSH discovers `.agents/skills/` automatically from the project root):

```sh
mkdir -p /path/to/your/vault/.agents/skills
cp -R ponte-do-agente/skills/dk-* /path/to/your/vault/.agents/skills/
```

**User-wide in `~/.dsh/skills/`** via symlinks so updates track this repository:

```sh
for s in ponte-do-agente/skills/dk-*; do
  ln -s "$(pwd)/$s" ~/.dsh/skills/"$(basename "$s")"
done
```

Then copy `dk-pessoal/camada-pessoal.exemplo.md` to `dk-pessoal/camada-pessoal.md` in your vault's skill folder and customize it.

For automatic base-persona loading on every conversation turn without calling a skill manually, install the DSH preset mode in [`../modo-dk-pessoal/`](../modo-dk-pessoal/README.md).
