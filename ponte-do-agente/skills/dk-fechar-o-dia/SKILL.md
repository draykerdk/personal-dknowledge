---
name: dk-fechar-o-dia
description: Fecha o dia pelo que a pessoa fez, no fim da tarde ou à noite - lê a nota do dia e as tarefas feitas, monta as linhas do fechamento, propõe cada linha na nota do dia pela triagem e as conclusões, ou abre o protocolo de fechar o dia. Use quando ela disser "fechar o dia", "registrar o dia", "o que eu fiz hoje" ou contar o que fez. Nada é gravado sem o sim dela.
---

# Fechar o dia

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou; no modo Dk pessoal, elas já vêm na conversa).

## Gatilho

"Fechar o dia", "registrar o dia", "o que eu fiz hoje", ou a pessoa contando o que fez. Vale também para um dia que já passou ("fechar ontem"): use a data dele.

## Passos

1. Ache a data do dia (a de hoje, ou a que a pessoa disse).
2. Chame `dfm_mission_state` com `periodo: hoje`: guarde as feitas e as abertas. Para outro dia, use `dfm_tasks_query` com a semana e olhe as datas.
3. Chame `dfm_weekly_context` e pegue o caminho da nota do dia (a Day). Leia a nota do dia como arquivo, só para ler: o que ela já tem e os títulos das seções. Sem nota do dia: diga "não há nota deste dia" e siga com as tarefas e o que a pessoa contou.
4. Monte as linhas no chat, curtas, uma ideia por linha, cada uma começando com `- ` (pule a que não tiver dado):
   - **O que ficou no mundo:** as feitas e o que a nota ou a pessoa contam, uma linha cada.
   - **Fora do plano:** o que ela fez e não era tarefa.
   - **Aprendizado:** só se ela escreveu ou disse um. Não invente.
   - **Compromisso de amanhã:** uma sugestão, tirada das abertas de amanhã (`dfm_mission_state` com `periodo: amanha`), marcada "sugestão".
   Não repita o que a nota do dia já tem.
5. **A seção:** a camada pessoal diz em que seção da nota do dia o fechamento entra. Sem isso, pergunte, com os títulos da nota pelo nome.
6. Pergunte: "Proponho estas linhas na nota do dia?" Deixe a pessoa tirar ou mudar uma linha antes.
7. Com o sim, para cada linha, chame `dfm_line_propose` com `dia` (a data do passo 1), `secao` (o título exato, com os #), `linha` e `porque` (uma linha: "você contou" ou "da tarefa concluída"). A sugestão de amanhã só entra se a pessoa quis.
   - Se a ponte recusar dizendo que a seção falta, ela lista as seções da nota: escolha a certa e proponha de novo, uma vez.
   - `repetida: true`: a linha já espera; siga.
   - Diga quantas propôs e onde: "Propus 3 linhas na triagem, em Propostas. Y grava na nota do dia; X recusa."
8. **As conclusões:** para cada tarefa aberta que a pessoa disse, nesta conversa, que terminou, pergunte "Concluo …?". Com o sim, chame `dfm_task_complete` com `operador_disse: true` e, como evidência, o que ela disse, do jeito que disse.
9. **O que ela fez e não tem tarefa:** pergunte se quer registrar como tarefa. Com o sim, proponha pela skill `dk-capturar-tarefas`.
10. **Sem nota do dia, ou se ela preferir responder o fechamento:** abra o protocolo de fechar o dia, se a lista de `dfm_protocol_run` tiver um (a camada pessoal diz o id). Diga: "Abri o fechamento; as linhas acima servem de resposta." Sem protocolo, abra a nota do dia com `dfm_note_open` para ela colar. Não proponha as linhas e abra o protocolo para as mesmas linhas: é um caminho ou o outro.

## Ferramentas

`dfm_mission_state`, `dfm_weekly_context`, `dfm_tasks_query`, a leitura da nota do dia, `dfm_line_propose` (com o sim), `dfm_proposals_list` (o que já espera), `dfm_task_complete` (com o sim), `dfm_protocol_run` ou `dfm_note_open`.

## Nunca

- Gravar na nota do dia. A linha vai pela triagem; quem grava é a Missão, quando a pessoa aceita.
- Propor uma linha que a pessoa não viu no chat.
- Concluir tarefa pelo que você deduziu da nota. Só pelo que ela disse.
- Julgar o dia, contar o que faltou ou pedir compensação amanhã.
- Pôr a sugestão de amanhã na agenda. Ela é uma linha na nota, se a pessoa quiser, nunca uma data numa tarefa.

## Exemplo

> - o reembolso saiu
> - o roteiro do vídeo foi revisado
> - fora do plano: a conversa com o fornecedor
> - amanhã (sugestão): gravar a primeira cena
> Proponho estas linhas na nota do dia?
> Pessoa: "sim, sem a de amanhã"
> Dk: Propus 3 linhas na triagem, em Propostas. Y grava na nota do dia; X recusa.
> Você disse que terminou "Revisar o roteiro". Concluo?
