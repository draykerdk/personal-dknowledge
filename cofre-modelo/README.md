# The Starter Vault Skeleton

The empty skeleton of a DFM vault: top-level folders from `000 - KERNEL` through `900 - ARCHIVE`, domain type models (`200 - FUNCTIONS/Config/dominios`), branches (`200 - FUNCTIONS/Config/ramos`), period model notes (`200 - FUNCTIONS/Models`), starter cycle protocols (`200 - FUNCTIONS/Protocolos`), note templates (`200 - FUNCTIONS/Templates`), and the validation judge suite (`200 - FUNCTIONS/Scripts`).

> **Language note (`v0`):** Starter folder names, protocol prompts, and initial field identifiers inside `cofre-modelo/` use Portuguese so they match the initial `v0` configuration and scripts.

Three short generic protocols are bundled here: `🌳` plan the week (`planejamento_semanal`), `📅` review the week (`review_semanal`), and `🧭` plan the quarter (`planejamento_trimestral`), alongside `🌱` vault initialization (`inicializacao`), research verification (`conferir_pesquisa`), and the three learning starters (`ingles_de_hoje`, `frase_nova`, `construir_ideia`). Cycle protocols write to period properties or `400 - MEMORY/200 - WEEKLY`. Personal daily protocols from the author's vault stay separate — see [CONTRIBUTING.md](../CONTRIBUTING.md).

Folders ship empty. Running `🌱 Inicializar o cofre` creates your declared areas plus the first day, week, and quarter notes.

## Source ownership rules

Exported files in this directory originate from the upstream vault via `scripts/exportar-do-cofre.py` strictly by allowlist (`scripts/lista_permitidos.txt`). Do not edit exported files directly here unless you first promote them to `proprio` in `scripts/lista_permitidos.txt`; otherwise the next export overwrites them. Files already maintained directly in this repository are marked `proprio` in `lista_permitidos.txt` (period model notes, templates, cycle protocols, Creation branch with `Canal principal` example, learning protocols, and neutral starter configs).

Any DataviewJS block referencing a script not yet present in `200 - FUNCTIONS/Scripts/` checks for file existence first and leaves that section blank if omitted.
