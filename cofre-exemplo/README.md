# O cofre de exemplo

O sistema em uso, numa semana de uma pessoa inventada: Irene Paiva, ilustradora, que trabalha em casa. Serve para ver como as notas se ligam e para os testes lerem um cofre que não é de ninguém.

**Regra:** nenhum nome, lugar, valor ou texto de uma pessoa real. Tudo aqui é inventado. Cada nota tem `exemplo: true` nas propriedades, para ser fácil de achar e de apagar.

## Como abrir

As notas daqui moram nos mesmos caminhos de um cofre de verdade, mas sem o esqueleto, que tem um dono só (`cofre-modelo/`). Para ter o cofre inteiro numa pasta nova, fora do repositório:

```sh
python3 -B scripts/montar_cofre_exemplo.py /caminho/para/um/cofre-novo
```

A pasta que sai é o esqueleto com estas notas por cima. Ela abre como cofre no Obsidian (com o plugin, o TaskNotes e o Dataview), e a bancada roda nela: `python3 -B "/caminho/para/um/cofre-novo/200 - FUNCTIONS/Scripts/run_judges.py"`. `scripts/montar_cofre_exemplo.py --conferir` confere que o exemplo só acrescenta notas e nunca cai em cima de um arquivo do esqueleto.

## O que tem

As datas são fixas, para os testes não dependerem do dia de hoje: a quarta-feira 2026-03-04, a semana 2026-W10 e o trimestre 2026-Q1.

| O quê | Onde | O que mostra |
|---|---|---|
| três áreas: Trabalho, Saúde, Casa | `100 - AREAS/NN - Área/000 - INDEX/README.md` (`type: area`) | uma área com projeto, outra com projeto, uma só de manutenção |
| dois projetos ativos: Portfólio novo e Correr 5 km | `100 - AREAS/<área>/100 - PROJECTS/2 - Active/<projeto>/<projeto>.md` (`type: iniciativa`) | a coluna é a pasta; o `status` espelha a coluna |
| duas SMART da semana | `TaskNotes/Tasks` (`type: tarefa_smart`, com `week`, `due` e `projects` apontando para o projeto) | uma em curso, uma ainda por começar |
| oito ações | `TaskNotes/Tasks` (`type: task`) | os estados: feita, em curso, esperando, próxima, algum dia e uma na entrada, sem projeto; uma aponta para o roteiro |
| o dia | `300 - RUNTIME/302 - Daymiss/Day/2026-03-04.md` | a nota-modelo do dia com o diário escrito |
| a semana | `300 - RUNTIME/302 - Daymiss/Week/2026-W10.md` | a semana na quarta-feira: as propriedades que o 🌳 grava, o valor da semana, os suportes e a colheita até ali; a conversa da semana (📨) ainda vazia, porque ela acontece no fim da semana |
| o trimestre | `300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q1.md` | o tema, a visão, os objetivos, os valores, a temporada, o foco e os marcos |
| dois hábitos | `200 - FUNCTIONS/Habits/Tracker` (`type: habit`) | um com meta por semana, outro de todo dia; os dias marcados em `entries` |
| um valor: Curiosidade | `400 - MEMORY/Valores` (`type: valor`, `ordem`, `grupo`) | o valor que o trimestre lista e a semana escolhe |
| um roteiro de vídeo | `400 - MEMORY/200 - WEEKLY/Roteiros` (`type: roteiro_video`) | uma peça do ramo Criação, no estado `roteiro`, ligada ao projeto |

`definicoes.exemplo.json` são as definições do sistema desta pessoa, no esquema de `config-padrao/definicoes.padrao.json` (as mesmas chaves, preenchidas). No cofre, elas moram nas configurações do plugin; o arquivo fica aqui para os testes e para quem quiser ver as definições preenchidas.

## O que ainda não está no pacote

Os scripts do contexto, do núcleo e da sentinela do dia e o da leitura factual da semana não estão no pacote; as seções que os chamam ficam vazias.
