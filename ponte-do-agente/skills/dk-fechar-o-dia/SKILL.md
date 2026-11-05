---
name: dk-fechar-o-dia
description: Fecha o dia pelo que a pessoa fez, no fim da tarde ou à noite - lê a nota do dia e as tarefas feitas, propõe as linhas do fechamento e as conclusões, e abre o protocolo de fechar o dia para ela responder. Use quando ela disser "fechar o dia", "registrar o dia", "o que eu fiz hoje" ou contar o que fez. Nada é gravado sem o sim dela.
---

# Fechar o dia

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou).

## Gatilho

"Fechar o dia", "registrar o dia", "o que eu fiz hoje", ou a pessoa contando o que fez. Vale também para um dia que já passou ("fechar ontem"): use a data dele.

## Passos

1. Ache a data do dia (a de hoje, ou a que a pessoa disse).
2. Chame `dfm_mission_state` com `periodo: hoje`: guarde as feitas e as abertas. Para outro dia, use `dfm_tasks_query` com a semana e olhe as datas.
3. Chame `dfm_weekly_context` e pegue o caminho da nota do dia (a Day). Leia a nota do dia como arquivo, só para ler. Sem nota do dia: diga "não há nota deste dia" e siga com as tarefas e o que a pessoa contou.
4. Monte a proposta no chat, curta, com estas linhas (pule a que não tiver dado):
   - **O que ficou no mundo:** as feitas e o que a nota ou a pessoa contam, uma linha cada.
   - **Fora do plano:** o que ela fez e não era tarefa.
   - **Aprendizado:** só se ela escreveu ou disse um. Não invente.
   - **Compromisso de amanhã:** uma sugestão, tirada das abertas de amanhã (`dfm_mission_state` com `periodo: amanha`), marcada "sugestão".
5. **As conclusões:** para cada tarefa aberta que a pessoa disse, nesta conversa, que terminou, pergunte "Concluo …?". Com o sim, chame `dfm_task_complete` com `operador_disse: true` e, como evidência, o que ela disse, do jeito que disse.
6. **O que ela fez e não tem tarefa:** pergunte se quer registrar. Com o sim, proponha pela skill `dk-capturar-tarefas`.
7. Abra o protocolo de fechar o dia, se a lista de `dfm_protocol_run` tiver um (a camada pessoal diz o id). Diga: "Abri o fechamento; as linhas acima servem de resposta." Sem protocolo, abra a nota do dia com `dfm_note_open` para ela colar.

## Ferramentas

`dfm_mission_state`, `dfm_weekly_context`, `dfm_tasks_query`, a leitura da nota do dia, `dfm_task_complete` (com o sim), `dfm_protocol_run` ou `dfm_note_open`.

## Nunca

- Gravar na nota do dia. O texto vai no chat; quem responde no protocolo ou cola é a pessoa.
- Concluir tarefa pelo que você deduziu da nota. Só pelo que ela disse.
- Julgar o dia, contar o que faltou ou pedir compensação amanhã.
- Pôr a sugestão de amanhã na agenda. Ela só aparece no chat.

## Exemplo

> **O que ficou no mundo:** o reembolso saiu · o roteiro do vídeo foi revisado.
> **Fora do plano:** a conversa com o fornecedor.
> **Compromisso de amanhã (sugestão):** gravar a primeira cena.
> Você disse que terminou "Revisar o roteiro". Concluo?
> Abri o fechamento do dia; as linhas acima servem de resposta.
