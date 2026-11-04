# As definições do sistema

`definicoes.padrao.json` é o esquema e os padrões das definições do sistema: o que é de cada pessoa (os valores, as áreas, o foco do trimestre, os ajustes dos pesos, o vocabulário, os nomes) e que, por isso, não fica escrito no código. A aba de configurações do plugin mostra estas definições; o protocolo de inicialização as pergunta na primeira vez e grava as respostas no `data.json` do plugin, com `inicializado: true` no fim.

**Estado:** o esquema da v0 (versão 1). O código ainda não lê daqui: a coluna "Onde é lido hoje" diz onde cada definição está hoje no código, e cada uma dessas linhas passa a ler `definicoes` no item B3 do mapa da v0. As linhas são do código-fonte de 03/11/2026 (em `plugin/src/`); alguns desses arquivos ainda não estão neste repositório, porque só entram quando a guarda de vazamento passa neles.

Os padrões são neutros: listas vazias, textos vazios, as pastas do esqueleto (`cofre-modelo/`) e os protocolos curtos da v0. Uma chave que começa com `_` é um comentário e o leitor a ignora.

## Os campos

| Campo | Tipo | Padrão | Onde é lido hoje | O que muda |
|---|---|---|---|---|
| `versao` | número | `1` | (novo) | o leitor migra um salvamento de versão antiga; um campo desconhecido é ignorado, nunca derruba |
| `inicializado` | sim/não | `false` | (novo) | com `false`, a carga do plugin abre o protocolo de inicialização |
| `pessoa.nome` | texto | `""` | `engine/jsonProtocol.ts:3394` (a chave do nível pessoal nas notas, ao lado das do ECH, do sono e da energia); a seção do nível pessoal em `Config/dominios/semana.json` e `trimestre.json` | o nome do nível pessoal e o jeito de o sistema chamar a pessoa |
| `pessoa.fuso_horario` | texto (id IANA, como `America/Sao_Paulo`) | `""` = o do sistema | `settings.ts:138` (hoje dentro das configurações do agente do celular, que fica fora da v0) | o fuso do sistema, para a semana corrente, a anterior e as notas do dia |
| `rotulos.nivel_pessoal` | texto | `""` = "Nível pessoal" | a mesma seção do nível pessoal | o título que a Week e o trimestre mostram |
| `rotulos.agente` | texto | `""` = "o agente" | (novo) | o nome que a tela dá ao agente que só propõe |
| `valores` | lista de `{ "nome": texto, "porque": texto }` | `[]` | `engine/nucleoService.ts:710` (o par da semana lê os `valores` da nota do trimestre), `engine/nucleoService.ts:154` (a pasta das notas de valor), `engine/valorSemana.ts` | o par da semana e a hierarquia do trimestre leem esta lista; nenhum valor escrito no código |
| `valores_relacoes` | lista de `{ "nome", "porque" }` | `[]` | `engine/nucleoService.ts:710` (os `valores_relacoes` da nota do trimestre) | o segundo valor do par da semana |
| `areas` | lista de `{ "nome": texto, "pasta": texto, "etiqueta": texto }` | `[]` | `settings.ts:115` (as regras do organizador, uma etiqueta e uma pasta por área), `missao/entrada.ts:193` (as casas da Missão), `engine/areaIndex.ts:15`, `project/projectCanvasPath.ts:26`, `engine/missionControl.ts:527` e `:1527` | as áreas vêm da lista (e das pastas de `100 - AREAS`, que a inicialização cria por ela); o organizador deriva as etiquetas |
| `trimestre.foco` | lista de textos (o nome de uma área, de um departamento ou de um projeto) | `[]` | o frontmatter da nota do trimestre: `engine/temporada.ts:42` e `:68`, `board/boardPlugin.ts:313`, `engine/missionControl.ts:1767`, `engine/missionGraph.ts:303`, `missao/missaoService.ts:354` | a nota de cada trimestre continua guardando o foco dela; aqui fica o do trimestre corrente, que o 🧭 oferece e grava |
| `pesos.ajustes` | objeto `{ categoria: número ou objeto }`, a mesma forma do arquivo de pesos | `{}` = os de partida | `engine/decisionWeights.ts:22`, `engine/panelWeights.ts:166` | um ajuste vale por cima do arquivo; o arquivo segue a fonte única do plugin e da bancada |
| `vocabulario.termos_extra` | lista de `{ "termo", "porque" }` | `[]` | o vocabulário é lido hoje só pela bancada (`200 - FUNCTIONS/Scripts/audit_vocabulary.py`) | termos que a pessoa acrescenta à lista do que o sistema não usa para medir nem julgar |
| `pastas.inbox` | caminho | `300 - RUNTIME/001 - INBOX` | `folderInbox`: `board/boardPlugin.ts:466` e `:1298`, `engine/jsonProtocol.ts:810` e `:4940`, `engine/metadataWatcher.ts:434` | fica como está, agrupado aqui |
| `pastas.protocolos` | caminho | `200 - FUNCTIONS/Protocolos` | `folderProtocols`: `board/boardPlugin.ts:471`, `engine/jsonProtocol.ts:5180` | fica como está |
| `pastas.revisao_semanal` | caminho | `400 - MEMORY/200 - WEEKLY` | `folderReview`: `engine/jsonProtocol.ts:809` | fica como está |
| `pastas.valores` | caminho | `400 - MEMORY/Valores` | `engine/nucleoService.ts:154` (uma constante) | a pasta das notas de valor deixa de ser constante |
| `pastas.excluidas` | lista de caminhos | as três pastas do sistema | `excludedFolders`: `organizer.ts:61` | fica como está |
| `arquivos.pesos` | caminho | `200 - FUNCTIONS/Config/pesos_decisao.json` | `engine/decisionWeights.ts:22`, `engine/panelWeights.ts:166`; a bancada | a aba abre o arquivo para editar |
| `arquivos.reputacao` | caminho | `200 - FUNCTIONS/Config/reputacao.json` | `engine/reputacao.ts:36` | idem |
| `arquivos.ech` | caminho | `200 - FUNCTIONS/Config/ech.json` | `engine/ech.ts:26` | idem |
| `arquivos.vocabulario` | caminho | `200 - FUNCTIONS/Config/vocabulario.json` | a bancada | idem |
| `arquivos.reserva` | caminho de uma nota, ou vazio | `""` = desligado | `missao/entrada.ts:193` (a casa da nota de reserva, escrita no código) e o módulo do dinheiro da Missão | o módulo da reserva só liga com uma nota configurada (A6 do mapa) |
| `ponte.ligada` | sim/não | `false` | `main.ts` (`aplicarPonte`, na carga e ao mudar na aba) | a ponte do agente só sobe ligada; desligada, nada escuta nem avisa |
| `ponte.porta` | número de 1024 a 65535 | `3082` | `engine/dshOperatorBridge.ts` (o servidor e o descritor `.dfm-dsh-operator.json`) | a porta ocupada se troca na aba; o lado do agente lê a porta do descritor |
| `protocolos_por_papel.<papel>` | id de protocolo, ou `null` | os três do ciclo e `inicializacao`; o resto `null` | os ids escritos no código: `engine/protocolForm.ts:324` (os botões do ciclo), `missao/gaveta.ts:20` e `:107`, `missao/ramoPrincipal.ts:585` (os ciclos de cada período) e as portas que chamam um protocolo pelo id | o código pede o protocolo pelo papel; papel sem protocolo esconde o botão ou a opção (D1 do mapa) |

## Os papéis de protocolo

| Papel | O que faz | Na v0 |
|---|---|---|
| `planejar_semana` | 🌳 planejar a semana | `planejamento_semanal` |
| `revisar_semana` | 📅 revisar a semana | `review_semanal` |
| `planejar_trimestre` | 🧭 planejar o trimestre | `planejamento_trimestral` |
| `inicializar` | perguntar as definições e montar o cofre vazio | `inicializacao` |
| `abrir_dia`, `fechar_dia`, `planejar_dia` | o começo, o fim e o plano do dia | sem protocolo: o botão não aparece |
| `revisar_trimestre` | a revisão do trimestre | sem protocolo |
| `perguntar_a_situacao` | a pergunta da situação, que leva ao protocolo certo | sem protocolo |
| `criar_projeto`, `criar_departamento`, `nova_tarefa_do_projeto` | criar o projeto, o departamento e a tarefa de um projeto | sem protocolo (a Missão cria pelo ＋ Adicionar) |
| `destino_da_ideia` | o destino de uma ideia na triagem | sem protocolo |
| `desbloquear` | a prática de desbloqueio | sem protocolo |
| `visao` | a visão de longo prazo | sem protocolo |

Os pacotes de protocolos (o do autor, depois, como bônus para quem contribui) preenchem os papéis que hoje são `null`.

## O que sai das configurações de hoje

Os campos atuais do plugin que não viram definição: os dados arquivados da gamificação e do razão dos hábitos, as pastas de dois protocolos de pacote, as configurações do agente do celular (fora da v0) e as regras do organizador (que passam a ser derivadas de `areas`). O salvamento antigo continua sendo lido, para nada se perder. Ficam como estão: os arquivos recentes, os interruptores do canvas, a sincronia do canvas de projeto, as árvores de progressão e o layout do painel.
