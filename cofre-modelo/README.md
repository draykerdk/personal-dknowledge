# O cofre de partida

O esqueleto de um cofre DFM: as pastas de `000 - KERNEL` a `900 - ARCHIVE`, os modelos de tipo (`200 - FUNCTIONS/Config/dominios`), os ramos (`200 - FUNCTIONS/Config/ramos`), as notas-modelo (`200 - FUNCTIONS/Models`), os protocolos do ciclo (`200 - FUNCTIONS/Protocolos`), os moldes (`200 - FUNCTIONS/Templates`) e a bancada de juízes (`200 - FUNCTIONS/Scripts`).

Os protocolos são três, curtos e genéricos: 🌳 planejar a semana (`planejamento_semanal`), 📅 revisar a semana (`review_semanal`) e 🧭 planejar o trimestre (`planejamento_trimestral`). Gravam nas propriedades da nota da semana e da do trimestre, e a revisão da semana numa nota própria em `400 - MEMORY/200 - WEEKLY`. Os protocolos que o autor do sistema usa no dia a dia não entram aqui: ver "O pacote bônus de protocolos" no [CONTRIBUTING.md](../CONTRIBUTING.md).

As pastas vêm vazias. O protocolo de inicialização cria as áreas que você declarar e as notas do primeiro dia, da primeira semana e do primeiro trimestre.

Os arquivos daqui saem do cofre de origem pela exportação (`scripts/exportar-do-cofre.py`), só os da lista de permitidos. Não edite um arquivo exportado aqui: a próxima exportação o sobrescreve. A mudança se faz na origem, ou o arquivo sai da lista e passa a ser mantido aqui. As notas-modelo (o dia, a semana, o trimestre, o longo prazo e o corpo da tarefa), os moldes (área, departamento, projeto, função, SMART, ideia, lição, nota simples e valor), os três protocolos do ciclo, o ramo Criação e o modelo da peça de criação já são mantidos aqui (as linhas `proprio` da lista): foram escritos novos e neutros para o pacote, com os campos que o plugin e os scripts leem. O ramo Criação e o modelo da peça têm os mesmos campos, estados, formatos e colunas dos do cofre de origem; a lista de canais traz só um canal de exemplo (`Canal principal`), para você trocar pelos seus. Da origem ainda saem os modelos de tipo, os scripts da bancada e os moldes que a guarda barra (pessoa e hábito).

Um bloco de nota-modelo que chama um script que ainda não está no pacote só o chama quando o arquivo existe no cofre; sem ele, a seção fica vazia.
