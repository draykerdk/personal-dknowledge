# O modo Dk pessoal do DSH

Um bundle do DSH que declara o modo (preset) **Dk pessoal**: numa sessão nova, escolha "Dk pessoal" no seletor de modo, e as instruções-base do Dk pessoal vêm em toda conversa, sem depender do modelo carregar a skill.

## O que o modo monta

- **A persona:** o corpo da skill `dk-pessoal` inteiro (quem o Dk é, o que pode e nunca faz, como propõe, as ferramentas), e uma linha que manda ler a camada pessoal (`camada-pessoal.md`).
- **A leitura:** a ferramenta de arquivos só de leitura (`write: false`, `edit: false`), a busca de arquivos, as skills (para as `dk-*`), a pergunta ao usuário, a web (para a pesquisa conferida), a data e a hora, e a compactação.
- **O que fica de fora, de propósito:** o shell, a escrita de arquivo, a delegação e as instruções de projeto do cofre (essas são para quem constrói o sistema). O Dk pessoal lê, recomenda e propõe; o que ele quer gravar vai pela ponte, e a Missão grava com o sim da pessoa.
- As ferramentas `dfm_*` vêm da ponte (`@dfm/dsh-vault-bridge`), que o host monta; o modo não as declara.

## Gerar

O `cordis.patch.yml` é gerado da skill. Depois de mudar a skill `dk-pessoal`:

```sh
node gerar-patch.mjs          # escreve o patch
node gerar-patch.mjs --check  # confere (sai 1 se a persona divergiu da skill)
```

O gerador acha a skill no cofre (`200 - FUNCTIONS/Skills/Dk Pessoal/dk-pessoal/SKILL.md`) ou no pacote aberto (`ponte-do-agente/skills/dk-pessoal/SKILL.md`); `--skill <caminho>` escolhe outra.

## Ligar

Desde a 0.2, o DSH não lê mais a pasta `.agent-presets`: um modo é uma declaração `@deepseek-ai/dsh-agent-preset` levada pelo patch de um bundle. Duas formas:

**Para uma sessão, sem instalar nada:** passe o patch ao subir o DSH.

```sh
dsh web --patch "/caminho/do/bundle/cordis.patch.yml"
```

**Para ficar:** instale o bundle no perfil e ponha-o na lista de bundles do perfil.

```sh
dsh plugin --profile web add "file:/caminho/do/bundle"
```

e, no `package.json` do perfil (`$DSH_HOME/profiles/web/package.json`), acrescente `"@dfm/dsh-dk-pessoal-preset"` ao fim de `dsh.profile.bundles`. Reinicie o DSH. O perfil precisa do registro dos modos (o bundle `@deepseek-ai/dsh-web-app` o traz); o perfil `headless` não tem seletor de modo.

Para desligar: tire o nome de `dsh.profile.bundles` e reinicie.
