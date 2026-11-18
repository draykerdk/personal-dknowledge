# The Agent Bridge

The contract through which the personal Dk (a local agent runtime) works safely over an open Obsidian vault: it reads digested Mission state, inspects a node, reads daily/weekly summaries, and submits proposals. Proposals land in Mission triage (`Propostas`) and wait for explicit human approval (`Y`). The bridge never mutates notes directly on its own: every vault write passes through the plugin with Undo support.

The bridge has two halves:

- **The Obsidian side**, built into the plugin (`plugin/src/engine/dshOperatorBridge.ts`): an HTTP server bound strictly to `127.0.0.1` with a fresh session token on each start, writing the descriptor `.dfm-dsh-operator.json` (port and token) at the vault root. It stays **off** until you toggle it on;
- **The agent side**, in this folder: the `@dfm/dsh-vault-bridge` package (`ponte-do-agente/dsh-vault-bridge/`), exposing `dfm_*` tools to DSH (the DeepSeek Harness). It reads the descriptor, talks only to `127.0.0.1`, and validates the contract, token, and workspace on every call.

## Setup

1. **Install DSH** (requires Node.js 20 or newer):

   ```sh
   npm i -g @deepseek-ai/dsh
   ```

2. **Add the bridge package to your DSH profile.** DSH keeps a profile per mode (`web` and `headless`); repeat for each profile you use. In `~/.dsh/profiles/web/package.json`, add the local file path under dependencies:

   ```json
   "dependencies": {
     "@dfm/dsh-vault-bridge": "file:/path/to/repo/ponte-do-agente/dsh-vault-bridge"
   }
   ```

   and install via DSH:

   ```sh
   dsh plugin --profile web install
   ```

3. **Mount the bridge plugin in the profile patch.** In `~/.dsh/profiles/web/cordis.patch.yml` (a YAML list), add:

   ```yaml
   - insert:
       - id: dfm-vault-bridge
         name: '@dfm/dsh-vault-bridge'
         config:
           # all options are optional:
           # state_note: '000 - KERNEL/Estado.md'                 # optional vault state note
           # protocol_ids: [planejamento_semanal, review_semanal] # protocols the bridge may open
           # closed_folders: []                                   # project folders excluded from reads
           # github_owners: []                                    # GitHub accounts inspected on request
   ```

   When `protocol_ids` is omitted, the bridge falls back to the bundled starter protocols (`🌳` and `📅`).

4. **Enable the bridge in Obsidian:** Settings → The Personal Dknowledge → **"Ponte do agente"** → toggle on. Default port is `3082`; if busy, change it in Settings (the descriptor automatically publishes the active port for the agent side).

5. **Launch DSH inside your vault root** so the bridge finds `.dfm-dsh-operator.json`.

## Verification

```sh
dsh --profile web --dump-config   # lists dfm-vault-bridge with no warnings
```

With Obsidian open on your vault and the bridge enabled, `.dfm-dsh-operator.json` appears in the vault root. In a new DSH session, invoke `dfm_mission_state` or `dfm_tasks_query` (both strictly read-only). If you get `bridge_offline`, check that Obsidian is open on the same vault and the bridge toggle is enabled.

Run package unit tests offline without DSH:

```sh
node --test ponte-do-agente/dsh-vault-bridge/test/*.mjs
```

## Personal Dk skills & preset mode

The universal instructions and skills that turn DSH into a personal Dk behaviorally live in [`skills/`](skills/README.md). Without them, DSH calls the bridge tools using its generic defaults.

A standalone read-only DSH preset bundle (`@dfm/dsh-dk-pessoal-preset`) that loads the base persona automatically on every turn without shell or file-write access lives in [`modo-dk-pessoal/`](modo-dk-pessoal/README.md).

## Using external agents instead

You can also point any file-capable agent tool directly at the vault Markdown directory. It can read and edit files through normal filesystem tools, though without the live Obsidian bridge effects (Mission triage queue, TaskNotes mutations, or opening live protocols in the UI).
