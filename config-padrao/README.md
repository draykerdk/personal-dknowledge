# System Definitions

`definicoes.padrao.json` defines the schema and neutral defaults for user-specific configuration (values, areas, quarter focus, decision weight overrides, extra vocabulary terms, labels) so none of it is hardcoded inside plugin code. The plugin's Settings tab exposes these fields; the `🌱` initialization protocol asks for them on first launch and saves `inicializado: true` into `data.json`.

> **Schema note:** JSON field names below stay in Portuguese to match `definicoes.padrao.json` and the `conferir_definicoes.py` validator.

**Status:** `v0` schema (version `1`). Not every plugin reader has migrated to reading from Settings yet — the **"Current code reader"** column documents the transition map as of `v0` extraction.

All defaults are neutral (empty lists, empty strings, skeleton paths, starter cycle protocols). Any key prefixed with `_` is a documentation comment ignored by readers.

## Schema fields

| Field | Type | Default | Current code reader | Effect when migrated |
|---|---|---|---|---|
| `versao` | number | `1` | (new) | Migrates older saved configs; unknown keys are ignored safely |
| `inicializado` | boolean | `false` | (new) | When `false`, plugin startup offers the initialization protocol |
| `pessoa.nome` | string | `""` | `engine/jsonProtocol.ts:3394` & period domains `semana.json`, `trimestre.json` | Personal layer heading and how the system addresses you |
| `pessoa.fuso_horario` | IANA timezone string (e.g., `America/Sao_Paulo`) | `""` = system local | `settings.ts:138` | Timezone used for current week, previous week, and day boundaries |
| `rotulos.nivel_pessoal` | string | `""` = `"Nível pessoal"` | Period personal-level section | Heading shown in Week and Quarter notes |
| `rotulos.agente` | string | `""` = `"o agente"` | (new) | Display name of the proposal-only local agent in the UI |
| `valores` | array of `{ "nome", "porque" }` | `[]` | `engine/nucleoService.ts`, `engine/valorSemana.ts` | Drives quarter hierarchy and weekly value pair; zero hardcoded values |
| `valores_relacoes` | array of `{ "nome", "porque" }` | `[]` | `engine/nucleoService.ts` | Relational half of the weekly value pair |
| `areas` | array of `{ "nome", "pasta", "etiqueta" }` | `[]` | `settings.ts`, `missao/entrada.ts`, `engine/areaIndex.ts`, `project/projectCanvasPath.ts`, `engine/missionControl.ts` | Derives area folders, Mission houses, and organizer tags dynamically |
| `trimestre.foco` | string array (area, department, or project name) | `[]` | Quarter note frontmatter (`engine/temporada.ts`, `board/boardPlugin.ts`, `engine/missionControl.ts`, `engine/missionGraph.ts`, `missao/missaoService.ts`) | Current quarter focus offered and saved by `🧭` |
| `pesos.ajustes` | object `{ category: number or object }` | `{}` = base weights file | `engine/decisionWeights.ts`, `engine/panelWeights.ts` | Overrides layered on top of the canonical weights JSON |
| `vocabulario.termos_extra` | array of `{ "termo", "porque" }` | `[]` | `audit_vocabulary.py` judge | Extra user terms excluded from judgment/gamification scoring |
| `pastas.inbox` | path string | `300 - RUNTIME/001 - INBOX` | `folderInbox` across board/engine | Grouped path config |
| `pastas.protocolos` | path string | `200 - FUNCTIONS/Protocolos` | `folderProtocols` across board/engine | Grouped path config |
| `pastas.revisao_semanal` | path string | `400 - MEMORY/200 - WEEKLY` | `folderReview` in `engine/jsonProtocol.ts` | Grouped path config |
| `pastas.valores` | path string | `400 - MEMORY/Valores` | `engine/nucleoService.ts` | Makes value notes folder configurable |
| `pastas.excluidas` | string array | three system folders | `excludedFolders` in `organizer.ts` | Grouped excluded folder config |
| `arquivos.pesos` | path string | `200 - FUNCTIONS/Config/pesos_decisao.json` | `engine/decisionWeights.ts`, `engine/panelWeights.ts`, judges | Opened from Settings for direct editing |
| `arquivos.reputacao` | path string | `200 - FUNCTIONS/Config/reputacao.json` | `engine/reputacao.ts` | Opened from Settings |
| `arquivos.ech` | path string | `200 - FUNCTIONS/Config/ech.json` | `engine/ech.ts` | Opened from Settings |
| `arquivos.vocabulario` | path string | `200 - FUNCTIONS/Config/vocabulario.json` | Vault judge bench | Opened from Settings |
| `arquivos.reserva` | path string or empty | `""` = disabled | `missao/entrada.ts` & Mission reserve module | Reserve module activates only when a reserve note path is set |
| `arquivos.trilha` | path string | `200 - FUNCTIONS/Config/trilha.json` | `board/boardPlugin.ts`, `missao/trilha.ts` | Usage trail strings (greeting, weekly gesture, first-run hints) |
| `ponte.ligada` | boolean | `false` | `main.ts` (`aplicarPonte`) | Agent loopback bridge stays off unless enabled |
| `ponte.porta` | integer `1024`–`65535` | `3082` | `engine/dshOperatorBridge.ts` | Loopback port published in `.dfm-dsh-operator.json` |
| `trilha.acolhida` | boolean | `true` | `missao/trilha.ts`, `missao/entrada.ts` | Empty afternoon Day opens with *"o que você fez hoje?"* prompt |
| `trilha.hora_da_tarde` | `HH:MM` string | `14:00` | `missao/trilha.ts` | Threshold hour for afternoon greeting |
| `trilha.dias_passados` | integer `0`–`31` | `7` | `missao/trilha.ts` | Lookback window for unlogged days (`0` disables) |
| `trilha.gesto_da_semana` | boolean | `true` | `missao/trilha.ts` | Weekly gesture card shown inside Mission |
| `trilha.vezes` | integer `1`–`30` | `3` | `missao/trilha.ts`, `engine/usoDosGestos.ts` | Days of use before advancing to the next gesture |
| `trilha.dicas` | boolean | `true` | `missao/trilha.ts` | First-time usage hints per gesture and button |
| `protocolos_por_papel.<papel>` | protocol id or `null` | starter roles populated; rest `null` | `engine/protocolForm.ts`, `missao/gaveta.ts`, `missao/ramoPrincipal.ts` | Code requests protocols by role; `null` hides unconfigured buttons/actions |

## Protocol roles

| Role | Purpose | In `v0` |
|---|---|---|
| `planejar_semana` | `🌳` plan the week | `planejamento_semanal` |
| `revisar_semana` | `📅` review the week | `review_semanal` |
| `planejar_trimestre` | `🧭` plan the quarter | `planejamento_trimestral` |
| `inicializar` | First-run definitions setup and empty vault scaffolding | `inicializacao` |
| `abrir_dia`, `fechar_dia`, `planejar_dia` | Day opening, closing, and daily plan | `null` (button hidden) |
| `revisar_trimestre` | Quarter review | `null` |
| `perguntar_a_situacao` | Situation router dispatching to matching protocol | `null` |
| `criar_projeto`, `criar_departamento`, `nova_tarefa_do_projeto` | Create project, department, or project task | `null` (Mission creates via `+ Adicionar`) |
| `destino_da_ideia` | Idea triage destination | `null` |
| `desbloquear` | Unblocking practice | `null` |
| `visao` | Long-term vision | `null` |

Extended optional protocol packs fill the remaining `null` roles cleanly without changing plugin code.

## Legacy settings left out of this schema

Archived gamification/habit ledger keys, vault-specific folder pointers, mobile agent settings (outside `v0`), and manual organizer rules (replaced by derivation from `areas`) do not enter `definicoes.padrao.json`. Existing fields in `data.json` remain readable for backward compatibility (recent files, canvas toggles, project canvas sync, progression trees, panel layout).
