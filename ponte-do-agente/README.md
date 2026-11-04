# A ponte do agente

O contrato pelo qual o Dk pessoal, o agente local, trabalha sobre o cofre: lê o estado digerido da Missão, consulta um nó, lê resumos e propõe. A proposta cai na triagem da Missão e espera o seu sim. A ponte nunca grava nada por conta própria: o que muda no cofre passa pelo plugin, com Desfazer.

A ponte tem dois lados:

- **o lado do Obsidian**, que já vem no plugin (`plugin/src/engine/dshOperatorBridge.ts`): um servidor só no `127.0.0.1`, com um token novo a cada abertura, que escreve na raiz do cofre o descritor `.dfm-dsh-operator.json` (a porta e o token). Ele fica **desligado** até você o ligar;
- **o lado do agente**, nesta pasta: o pacote `dsh-vault-bridge` (`@dfm/dsh-vault-bridge`), que dá ao DSH (o DeepSeek Harness) as ferramentas `dfm_*`. Ele lê o descritor, fala só com o `127.0.0.1` e confere o contrato, o token e o cofre em cada chamada.

## Como ligar

1. **Instale o DSH**, com o Node.js 20 ou mais novo:

   ```sh
   npm i -g @deepseek-ai/dsh
   ```

2. **Ponha o pacote da ponte no perfil do DSH.** O DSH tem um perfil por modo (`web` e `headless`); faça os passos em cada um que você usa. No `package.json` do perfil (`~/.dsh/profiles/web/package.json`), acrescente a dependência com o caminho desta pasta:

   ```json
   "dependencies": {
     "@dfm/dsh-vault-bridge": "file:/caminho/do/repositorio/ponte-do-agente/dsh-vault-bridge"
   }
   ```

   e instale pelo próprio DSH:

   ```sh
   dsh plugin --profile web install
   ```

3. **Monte a ponte no perfil.** No arquivo de ajustes do perfil (`~/.dsh/profiles/web/cordis.patch.yml`, uma lista YAML), acrescente:

   ```yaml
   - insert:
       - id: dfm-vault-bridge
         name: '@dfm/dsh-vault-bridge'
         config:
           # tudo opcional:
           # state_note: '000 - KERNEL/Estado.md'   # uma nota de estado do seu cofre, se tiver
           # protocol_ids: [planejamento_semanal, review_semanal]   # os protocolos que a ponte abre
           # closed_folders: []                     # pastas de projeto que a ponte não abre
           # github_owners: []                      # contas do GitHub que o panorama lê, sob pedido
   ```

   Sem `protocol_ids`, a ponte abre os protocolos do pacote que fazem um papel dela (o 🌳 e o 📅).

4. **Ligue a ponte no Obsidian:** Configurações → The Personal Dknowledge → "Ponte do agente" → "Ligar a ponte". A porta padrão é a 3082; se ela estiver ocupada, troque-a ali (o descritor leva a porta nova, e o pacote a lê dele).

5. **Abra o DSH com o cofre como pasta de trabalho** (o pacote acha o descritor na raiz dela).

## Como conferir

```sh
dsh --profile web --dump-config   # a lista mostra a linha dfm-vault-bridge, sem aviso
```

Com o Obsidian aberto no cofre e a ponte ligada, o arquivo `.dfm-dsh-operator.json` aparece na raiz do cofre. Numa sessão nova do DSH, peça o estado da Missão de hoje (a ferramenta `dfm_mission_state`) ou uma consulta de tarefas (`dfm_tasks_query`): as duas só leem. Se vier `bridge_offline`, confira se o Obsidian está aberto neste cofre e se a ponte está ligada.

Os testes do pacote, sem o DSH:

```sh
node --test ponte-do-agente/dsh-vault-bridge/test/*.mjs
```

## O que fica de fora por enquanto

As instruções e as skills que fazem o DSH se comportar como o Dk pessoal ainda não estão aqui: sem elas, o DSH usa as ferramentas da ponte com o comportamento padrão dele.

Também dá para usar outras ferramentas de agente, por fora, lendo e editando as notas do cofre como arquivos; aí não há os efeitos ao vivo da ponte (a Missão, as tarefas do TaskNotes e os protocolos abertos na tela).
