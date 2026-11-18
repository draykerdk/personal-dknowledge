# The Personal Dk Preset Mode for DSH

A DSH bundle declaring the **Dk pessoal** mode (preset): select **"Dk pessoal"** in the mode picker when starting a session and the base contract is always active, without relying on the model remembering to load the skill.

## What the preset mounts

- **Persona:** the full body of `dk-pessoal/SKILL.md` (role, boundaries, proposal rules, tool list) plus a suffix instructing the agent to load `camada-pessoal.md`.
- **Read-only filesystem & search:** `tool-fs` with `write: false` and `edit: false`, file search, `skill` loading (for `dk-*`), user prompt, web search/fetch (for verified research), time context, and compaction.
- **Intentionally omitted:** shell execution, file writes/edits, delegation, and system-builder workspace instructions. The personal agent reads, recommends, and proposes; any vault mutation goes through the bridge and is approved inside Mission.
- The `dfm_*` tools come from the host-mounted bridge plugin (`@dfm/dsh-vault-bridge`), not from this preset patch.

## Regenerating the patch

`cordis.patch.yml` is generated directly from `dk-pessoal/SKILL.md`. After editing the skill:

```sh
node gerar-patch.mjs          # writes cordis.patch.yml
node gerar-patch.mjs --check  # verifies zero drift (exits 1 on mismatch)
```

The generator searches `200 - FUNCTIONS/Skills/Dk Pessoal/dk-pessoal/SKILL.md` or `ponte-do-agente/skills/dk-pessoal/SKILL.md` (override with `--skill <path>`).

## Enabling in DSH

Since DSH 0.2, `.agent-presets` directories are no longer scanned; modes are registered via `@deepseek-ai/dsh-agent-preset` in a bundle patch. Two options:

**Single session without installing:**

```sh
dsh web --patch "/path/to/repo/ponte-do-agente/modo-dk-pessoal/cordis.patch.yml"
```

**Persistent installation in your `web` profile:**

```sh
dsh plugin --profile web add "file:/path/to/repo/ponte-do-agente/modo-dk-pessoal"
```

Then append `"@dfm/dsh-dk-pessoal-preset"` to `dsh.profile.bundles` in `$DSH_HOME/profiles/web/package.json` and restart DSH (`headless` has no UI mode selector; this requires `@deepseek-ai/dsh-web-app`). Remove the bundle entry and restart to disable.
