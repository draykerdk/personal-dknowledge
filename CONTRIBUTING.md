# Contributing

Thank you for helping improve this repository. This project is experimental and very early: conventions and schemas below may still shift across `v0` versions.

## How to make changes

- **One change at a time.** Each pull request should address one clear goal and state what changes and why.
- **Include proof.** Every code change must ship with a test that exercises it (`cd plugin && npm run build && npx vitest run`). If you change UI behavior, state how you verified it.
- **Functions explain themselves.** Inside the codebase, each function states what it does, why it exists, error/attack surfaces, and where its proof lives. Follow the existing style in neighboring files.
- **Zero personal data.** Examples and tests use the synthetic example vault (`cofre-exemplo/`) with fictional data only. Never include real names, real local filesystem paths, or personal email addresses.
- **No personal choices hardcoded.** Areas, projects, values, personal names, and custom labels belong in configuration and notes, never hardcoded in plugin TypeScript. Code knows the universal structure (`000`–`900`, type contracts, conventions) and nothing private.
- **Pass the guards.** Before opening a PR, run `python3 -B scripts/guarda_vazamento.py --teste`, `python3 -B scripts/conferir_definicoes.py`, and `python3 -B scripts/conferir_porta_dos_modulos.py`. Maintainers run the full private leak scan on integration.

## The extended protocol pack

The starter system runs with the short generic protocols bundled here (`🌱`, `🌳`, `📅`, `🧭`, plus the research and learning starters). Beyond them exists a broader catalog of author-written daily, evening, focus, unblocking, travel, study, creation, and decision protocols crafted through long-term daily use.

That broader catalog is intentionally kept out of the `v0` open starter package and will later be offered as an optional bonus protocol pack for contributors and supporters. Those protocols are pure JSON/note data rather than plugin code: the plugin works identically with or without them.

## Questions

Open an issue or discussion with your question. Every clear question improves the docs.
