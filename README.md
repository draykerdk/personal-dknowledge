# The Personal Dknowledge

> **Versão 2.9.0, experimental e ainda muito inicial.** É um primeiro retrato do que o sistema vai ser: funciona, mas muda bastante de uma versão para outra, e nada aqui é estável ainda. O código nasceu num cofre pessoal e é separado dele peça por peça; só entra aqui o que passa pela guarda de vazamento.

## O que é

Um cofre de partida para o Obsidian com a organização DFM pronta e vazia, e o plugin que a faz funcionar. É o protótipo da escala pessoal: o Dknowledge pessoal (o cofre e a organização dele) e o Dk pessoal (o agente que trabalha sobre ele e só propõe, nunca grava sozinho).

O DFM organiza a vida e o trabalho com um padrão só, do dia ao longo prazo e da área à tarefa. Cada escala tem o mesmo ciclo: planejar, executar, revisar.

Esta versão traz:

- **o plugin** `dfm-system`: a Missão (a linha do tempo e o trabalho numa tela, com as escalas e os ramos), o motor de protocolos e os modelos de tipo;
- **o esqueleto do cofre**: as pastas de `000 - KERNEL` a `900 - ARCHIVE`, as notas-modelo do dia, da semana e do trimestre, e os modelos de tipo (área, departamento, projeto, SMART, tarefa, os períodos, a visão, a função, a pessoa);
- **as definições do sistema na aba de configurações do plugin**: os seus valores, as suas áreas, o foco do trimestre, os pesos, o vocabulário e os nomes. O código lê de lá, e nada disso vem escrito no código;
- **um protocolo de inicialização**, que pergunta essas definições na primeira vez e monta o cofre vazio;
- **três protocolos curtos e genéricos do ciclo**: 🌳 planejar a semana, 📅 revisar a semana e 🧭 planejar o trimestre. Um botão do ciclo só aparece quando o protocolo dele existe no cofre.
- **a trilha de uso**: a Missão recebe quem chega à tarde com "o que você fez hoje?", mostra o gesto da semana e a dica da primeira vez de cada botão; os textos ficam em `Config/trilha.json` e o que liga, nas definições;
- **o fluxo SMART no motor**: a ação criada numa SMART herda a semana e o impacto dela, a tarefa escolhida de outro dia passa para hoje com a hora, e a tarefa concluída pode abrir o próximo passo na SMART (os botões do dia que usam isso chegam com os protocolos do dia, que o pacote ainda não traz);
- **a Criação com campanha**: cada canal e cada frente contam as peças da semana; a peça ganha os destinos (os perfis do canal, pela regra de cada formato), o link da campanha e o estado `aprovado`; o 📅 confere o publicado da semana; e o 🎥 Para gravar hoje põe na Day a peça pronta e a fala do teleprompter;
- **os ramos com direção**: cada coluna vazia diz o próximo passo, e o projeto leva ao ramo Criação e volta;
- **o criador único de tarefa**: toda tarefa nasce pela mesma forma, venha do Novo, de um protocolo ou do formulário do TaskNotes aberto pelo Novo;
- **a conferência da pesquisa**: a tarefa com a tag `pesquisa` recebe a lista de verificação (🔎 Conferir uma pesquisa), item por item, como nós do ramo dela;
- **o módulo de aprendizado**: os tipos `cartao` (uma frase por nota, em quatro camadas) e `peca_logica` (o "como funciona" da língua), com os moldes, os níveis e a trilha; o 🗣️ Inglês de hoje traz a fila do dia pela repetição espaçada, o 🗣️ Frase nova e o 🧩 Construir uma ideia criam cartões. A língua, a pasta do módulo e os números da escada são seus;
- **os mapas com guarda** das sete pastas do plugin (`dfm.json` em cada uma), conferidos contra os imports reais.

O que fica de fora por enquanto: o agente do celular e os pacotes de protocolo (ver [CONTRIBUTING.md](CONTRIBUTING.md)).

## Como está organizado

| Pasta | O que tem |
|---|---|
| `plugin/` | o código do plugin `dfm-system` (TypeScript) e os testes |
| `cofre-modelo/` | o esqueleto do cofre: as pastas, os modelos de tipo, as notas-modelo, os moldes e a bancada de juízes |
| `config-padrao/` | as definições de partida que a aba de configurações usa antes da inicialização |
| `cofre-exemplo/` | as notas de uma pessoa fictícia (áreas, projetos, tarefas, o dia, a semana, o trimestre, hábitos, um valor e um roteiro), para os testes e para ver o sistema funcionando; `scripts/montar_cofre_exemplo.py` o monta por cima do esqueleto numa pasta nova |
| `ponte-do-agente/` | a ponte do agente, o lado do DSH (o pacote `dsh-vault-bridge`): as ferramentas pelas quais o Dk pessoal lê o estado da Missão e propõe, e o passo a passo para ligar |
| `ponte-do-agente/skills/` | as instruções e as skills do Dk pessoal: o que fazem o agente local agir como o Dk pessoal sobre a ponte (ver "As skills do Dk pessoal", abaixo) |
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

## As skills do Dk pessoal

A ponte dá as ferramentas; as skills dão o comportamento. Elas ficam em [`ponte-do-agente/skills/`](ponte-do-agente/skills/README.md), uma pasta `<nome>/SKILL.md` por skill, escritas em passos curtos para funcionar também com modelos menores:

| Skill | O que faz |
|---|---|
| `dk-pessoal` | as instruções-base: quem o Dk é, o que pode e não pode, como propõe (pela triagem da Missão, em Propostas, nada sem o seu sim), como fala e a regra de conferir pesquisa |
| `dk-estado-agora` | o que está em jogo hoje ou na semana pela Missão, e uma próxima ação |
| `dk-fechar-o-dia` | fecha o dia pelo que você fez, propondo as linhas e as conclusões |
| `dk-material-da-semana` | junta o material para revisar e planejar a semana, sem planejar por você |
| `dk-capturar-tarefas` | propõe as tarefas que você disse, cada uma com o pai e o porquê |
| `dk-pesquisa-conferida` | a pesquisa com fonte, data e o que falta conferir |
| `dk-recomendar` | uma recomendação com o porquê |

São duas camadas: a universal, que vem aqui, e a pessoal, um arquivo `dk-pessoal/camada-pessoal.md` que só existe no seu cofre (o seu ritmo, os seus valores, os seus protocolos e onde ler o que muda). O ponto de partida é `dk-pessoal/camada-pessoal.exemplo.md`, e o `.gitignore` barra a camada pessoal.

**Como ligar ao DSH.** Com a ponte já ligada, ponha as skills numa pasta que o DSH varre, uma pasta por skill:

```sh
# no cofre, sem mexer na configuração do DSH (ele varre .agents/skills/ na raiz do projeto)
mkdir -p /caminho/do/cofre/.agents/skills
cp -R ponte-do-agente/skills/dk-* /caminho/do/cofre/.agents/skills/

# ou na pasta do usuário do DSH, com um symlink por skill
for s in ponte-do-agente/skills/dk-*; do ln -s "$(pwd)/$s" ~/.dsh/skills/"$(basename "$s")"; done
```

Numa sessão nova, as sete aparecem no catálogo de skills; peça "carregue a skill dk-pessoal" ou pergunte "o que faço agora?". O detalhe está em [`ponte-do-agente/skills/README.md`](ponte-do-agente/skills/README.md).

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
