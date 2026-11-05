---
name: dk-estado-agora
description: O estado agora pela Missão - o que está em jogo hoje e na semana, e a próxima ação real, com o porquê. Use quando a pessoa perguntar "o que faço agora", "o que tem hoje", "como está a semana" ou "por onde começo". Só lê; termina numa ação só.
---

# O estado agora

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou).

## Gatilho

"O que faço agora?", "o que tem hoje?", "e a semana?", "por onde começo?", "tô perdido".

## Passos

1. Chame `dfm_mission_state` com `periodo: hoje` (ou `semana`, se a pergunta for a semana).
2. Se a lista vier vazia ou a ponte estiver desligada, diga isso numa linha e pare.
3. Pegue o item `n=1`. Não reordene: a ordem é a da Missão, com os pesos da pessoa.
4. Chame `dfm_node` com o `caminho` desse item.
5. Monte a resposta em até 6 linhas:
   - **Agora:** o item 1 e o `porque` dele.
   - **Hoje (ou na semana):** os itens 2 e 3, um por linha, só o título.
   - **Sinais:** os sinais do nó, se houver (um fato por linha, sem cobrança).
   - **Triagem:** quantas propostas e entradas esperam, se houver.
   - **Próximo passo:** uma ação física pequena do item 1 (o "próximo passo" do nó, se houver).
6. Se o nó tiver um protocolo com `pode_abrir: true` que serve ao passo, ofereça abrir ("Quer que eu abra …?"). Só abra (`dfm_protocol_run`) com o sim.
7. Se a pessoa disser que já fez um item, siga a skill `dk-fechar-o-dia`, passo 5 (concluir só com o que ela disse).

## Ferramentas

`dfm_mission_state`, `dfm_node`, `dfm_protocol_run` (com o sim). Para o panorama dos projetos, `dfm_operational_context`.

## Nunca

- Reordenar a lista ou trocar o item 1 por gosto seu.
- Dar mais de uma próxima ação.
- Mudar a data ou a semana de uma tarefa. Se a pessoa quiser mover, proponha com `dfm_propose` (`dia` ou `semana`).
- Comentar o que ela não fez.

## Exemplo

> **Agora:** Gravar o vídeo da semana — está marcado para hoje e é do projeto em foco.
> **Hoje:** Responder o fornecedor · Revisar o roteiro.
> **Sinais:** o dia passa de 2 h agendadas.
> **Triagem:** 2 propostas esperam.
> **Próximo passo:** abrir o roteiro e ler a primeira cena em voz alta.
