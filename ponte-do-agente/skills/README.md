# As skills do Dk pessoal

As instruções e as skills que fazem o agente local se comportar como o Dk pessoal sobre o cofre: ler o estado da Missão, recomendar com o porquê e propor pela triagem. Nada é gravado sem o seu sim.

Cada skill é uma pasta `<nome>/SKILL.md`, com `name` e `description` no frontmatter. Elas foram escritas para funcionar com modelos menores: passos curtos e numerados, as ferramentas pelo nome e o que nunca fazer.

## As duas camadas

- **A universal**, aqui: `dk-pessoal` (as instruções-base) e as seis skills `dk-*`. Valem para qualquer pessoa.
- **A pessoal**, só no seu cofre: o arquivo `dk-pessoal/camada-pessoal.md`, com o seu ritmo, os seus valores, os seus protocolos e onde ler o que muda. Comece de `dk-pessoal/camada-pessoal.exemplo.md`. Sem ele, o Dk segue só a camada universal.

## As skills

| Skill | O que faz |
|---|---|
| `dk-pessoal` | as instruções-base: quem o Dk é, o que pode e não pode, como propõe e fala, a regra da pesquisa; lê a camada pessoal |
| `dk-estado-agora` | o que está em jogo hoje ou na semana pela Missão, e uma próxima ação |
| `dk-fechar-o-dia` | fecha o dia pelo que você fez: propõe as linhas e as conclusões e abre o protocolo de fechar o dia |
| `dk-material-da-semana` | junta o material para revisar e planejar a semana, sem planejar por você |
| `dk-capturar-tarefas` | separa o que você disse em tarefas e as propõe na triagem, em Propostas |
| `dk-pesquisa-conferida` | a pesquisa com fonte, data e a conferência: 🤖 o agente, 👤 você, 🤝 os dois |
| `dk-recomendar` | uma recomendação ligada ao seu foco e ao que está em jogo, com o porquê |

## As ferramentas que elas usam

Só as da ponte (ver [../README.md](../README.md)) e a leitura de arquivos do cofre. Leem: `dfm_mission_state`, `dfm_node`, `dfm_operational_context`, `dfm_weekly_context`, `dfm_tasks_query`, `dfm_context_note`, `dfm_working_state`, `dfm_mission_query`. Propõem na triagem: `dfm_propose` e `dfm_task_create`. Abrem na tela: `dfm_note_open`, `dfm_protocol_run`, `dfm_notice`. Gravam, e só com o seu pedido na conversa: `dfm_task_update` e `dfm_task_complete`.

## Como ligar

O agente acha as skills numa das pastas que ele varre, uma pasta por skill. Duas formas:

**No cofre, sem mexer na configuração do agente.** Ele varre `.agents/skills/` na raiz do projeto (a pasta com `.git` mais próxima da pasta de trabalho). Com o cofre como pasta de trabalho:

```sh
mkdir -p /caminho/do/cofre/.agents/skills
cp -R ponte-do-agente/skills/dk-* /caminho/do/cofre/.agents/skills/
```

**Na pasta do usuário do agente** (`~/.dsh/skills/`), com um symlink por skill, para elas acompanharem o repositório:

```sh
for s in ponte-do-agente/skills/dk-*; do
  ln -s "$(pwd)/$s" ~/.dsh/skills/"$(basename "$s")"
done
```

Depois, ponha a sua camada pessoal: copie `dk-pessoal/camada-pessoal.exemplo.md` para `dk-pessoal/camada-pessoal.md` na pasta que o agente lê, e preencha.

Numa sessão nova, peça "carregue a skill dk-pessoal" ou pergunte "o que faço agora?".
