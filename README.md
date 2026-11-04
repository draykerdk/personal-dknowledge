# The Personal Dknowledge

> **Versão 2.8.0, experimental e ainda muito inicial.** É um primeiro retrato do que o sistema vai ser: funciona, mas muda bastante de uma versão para outra, e nada aqui é estável ainda. O código nasceu num cofre pessoal e é separado dele peça por peça; só entra aqui o que passa pela guarda de vazamento.

## O que é

Um cofre de partida para o Obsidian com a organização DFM pronta e vazia, e o plugin que a faz funcionar. É o protótipo da escala pessoal: o Dknowledge pessoal (o cofre e a organização dele) e o Dk pessoal (o agente que trabalha sobre ele e só propõe, nunca grava sozinho).

O DFM organiza a vida e o trabalho com um padrão só, do dia ao longo prazo e da área à tarefa. Cada escala tem o mesmo ciclo: planejar, executar, revisar.

Esta versão traz:

- **o plugin** `dfm-system`: a Missão (a linha do tempo e o trabalho numa tela, com as escalas e os ramos), o motor de protocolos e os modelos de tipo;
- **o esqueleto do cofre**: as pastas de `000 - KERNEL` a `900 - ARCHIVE`, as notas-modelo do dia, da semana e do trimestre, e os modelos de tipo (área, departamento, projeto, SMART, tarefa, os períodos, a visão, a função, a pessoa);
- **as definições do sistema na aba de configurações do plugin**: os seus valores, as suas áreas, o foco do trimestre, os pesos, o vocabulário e os nomes. O código lê de lá, e nada disso vem escrito no código;
- **um protocolo de inicialização**, que pergunta essas definições na primeira vez e monta o cofre vazio;
- **três protocolos curtos e genéricos do ciclo**: 🌳 planejar a semana, 📅 revisar a semana e 🧭 planejar o trimestre. Um botão do ciclo só aparece quando o protocolo dele existe no cofre.

O que fica de fora por enquanto: o agente do celular e os pacotes de protocolo (ver [CONTRIBUTING.md](CONTRIBUTING.md)).

## Como está organizado

| Pasta | O que tem |
|---|---|
| `plugin/` | o código do plugin `dfm-system` (TypeScript) e os testes |
| `cofre-modelo/` | o esqueleto do cofre: as pastas, os modelos de tipo, as notas-modelo, os moldes e a bancada de juízes |
| `config-padrao/` | as definições de partida que a aba de configurações usa antes da inicialização |
| `cofre-exemplo/` | as notas de uma pessoa fictícia (áreas, projetos, tarefas, o dia, a semana, o trimestre, hábitos, um valor e um roteiro), para os testes e para ver o sistema funcionando; `scripts/montar_cofre_exemplo.py` o monta por cima do esqueleto numa pasta nova |
| `ponte-do-agente/` | a ponte do agente, o lado do DSH (o pacote `dsh-vault-bridge`): as ferramentas pelas quais o Dk pessoal lê o estado da Missão e propõe, e o passo a passo para ligar |
| `docs/` | a documentação de uso e de desenvolvimento |
| `scripts/` | o instalador de um comando, a exportação por lista de permitidos, a guarda de vazamento e os gatilhos do git que a rodam antes de cada commit |

## Dependências

| O quê | Para quê | Obrigatório |
|---|---|---|
| [Obsidian](https://obsidian.md) 1.12.2 ou mais novo | o aplicativo | sim |
| [TaskNotes](https://github.com/callumalpass/tasknotes) (plugin da comunidade) | as tarefas: cada tarefa é uma nota, e a Missão, os projetos e os protocolos leem e gravam por ele | sim |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview) (plugin da comunidade) | os blocos das notas do dia, da semana e do trimestre | sim |
| [Node.js](https://nodejs.org) 20 ou mais novo | só para construir o plugin a partir do código | para construir |
| DSH, o DeepSeek Harness (`npm i -g @deepseek-ai/dsh`) | o Dk pessoal, o agente local que trabalha sobre o cofre pela ponte do agente: lê o estado da Missão e propõe; nada grava sem o seu sim | para o sistema completo: sem ele, o cofre, a Missão e os protocolos funcionam, mas o Dk pessoal não (ver [ponte-do-agente/](ponte-do-agente/README.md)) |

O DSH é o agente integrado: ele fala com o Obsidian ao vivo pela ponte. Também dá para usar outras ferramentas de agente no lugar dele, de forma externa, do jeito de sempre: lendo e editando as notas, as instruções e as pastas do cofre como arquivos. Assim o agente trabalha sobre o cofre, mas sem os efeitos ao vivo da ponte (a Missão, as tarefas do TaskNotes e os protocolos abertos na tela).

## Como construir

```sh
cd plugin
npm ci
npm run build   # gera plugin/main.js
npx vitest run  # os testes do pacote
```

## Como experimentar

Um comando monta um cofre pronto numa pasta nova:

```sh
python3 -B scripts/instalar.py ~/Cofres/meu-cofre               # o cofre vazio
python3 -B scripts/instalar.py ~/Cofres/exemplo --com-exemplo   # com as notas de uma pessoa fictícia
```

Ele constrói o plugin se ainda não foi construído (pede o Node.js), copia o esqueleto, põe o plugin em `.obsidian/plugins/dfm-system/`, baixa a última versão do Dataview e do TaskNotes do GitHub (ou os copia de uma pasta sua, com `--plugins-de PASTA`), liga os três e as consultas JavaScript do Dataview. Depois:

1. No Obsidian, "Abrir pasta como cofre" e escolha a pasta; confie nos plugins da comunidade quando ele perguntar.
2. Rode o protocolo 🌱 Inicializar o cofre: ele pergunta o seu nome, as suas áreas, os seus valores e o foco do trimestre, cria só o que falta (as áreas e uma nota para cada valor) e grava as respostas nas definições. Tudo se edita depois na aba de configurações do plugin, em "Definições do sistema".
3. Abra a Missão e, no começo da semana, o 🌳.

O Dk pessoal (o agente local) se liga à parte, pela [ponte do agente](ponte-do-agente/README.md).

## A guarda de vazamento

Tudo o que entra aqui passa por `scripts/guarda_vazamento.py`, que falha se aparecer qualquer termo de uma lista privada mantida fora do repositório, ou uma fala de alguém citada com data. A cópia é por lista de permitidos (`scripts/lista_permitidos.txt`): só sai o que alguém listou de propósito. Os arquivos escritos aqui, e não copiados, estão na mesma lista como `proprio`.

```sh
python3 -B scripts/guarda_vazamento.py --teste        # o autoteste da guarda
python3 -B scripts/guarda_vazamento.py                # a varredura do disco (pede DK_TERMOS_PRIVADOS)
python3 -B scripts/guarda_vazamento.py --historico    # todos os commits, as mensagens e os autores
python3 -B scripts/instalar_gatilhos.py               # a guarda antes de cada commit (o índice e a mensagem)
python3 -B scripts/conferir_definicoes.py             # o esquema das definições e a documentação dele
python3 -B scripts/conferir_porta_dos_modulos.py     # o pacote sai com a lista vazia de módulos opcionais
python3 -B scripts/montar_cofre_exemplo.py PASTA      # o esqueleto e o cofre de exemplo numa pasta nova
python3 -B scripts/instalar.py --teste                # o autoteste do instalador (sem rede)
```

O instalador põe os gatilhos de `scripts/gatilhos/` em `.git/hooks/` e grava, só na configuração local do git, o Python e o caminho da lista. Um commit com termo, com fala datada ou sem a lista não entra. A exportação deixa em `scripts/exportados.txt` (fora do git) a lista do que copiou, para a vez seguinte apagar o que saiu da lista de permitidos; rodar duas vezes dá o mesmo repositório.

## Como contribuir

Leia o [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo: uma mudança por vez, com o teste que a prova, e nada de dados pessoais nos exemplos.

## Licença

MIT. Veja [LICENSE](LICENSE).
