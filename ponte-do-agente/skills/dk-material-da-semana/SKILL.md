---
name: dk-material-da-semana
description: Prepara o material para a pessoa revisar e planejar a semana - o que ficou, o que foi feito, o que espera e o foco do trimestre - sem planejar por ela. Use quando ela pedir "prepara a semana", "material da semana", "como foi a semana" ou antes do protocolo de revisar ou planejar a semana. Não põe datas, não cria metas.
---

# O material da semana

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou; no modo Dk pessoal, elas já vêm na conversa).

A semana é da pessoa. Você junta o material; ela decide.

## Gatilho

"Prepara a semana", "material da semana", "como foi a semana", "vou planejar a semana", ou o dia de revisar a semana.

## Passos

1. Ache a semana-alvo: a que fecha (para revisar) ou a próxima (para planejar). Na dúvida, pergunte qual.
2. Chame `dfm_weekly_context` com a semana-alvo. Anote as fontes em `missingSources`.
3. Chame `dfm_mission_state` com `periodo: semana` (a que fecha) e, para planejar, com `periodo: proxima_semana`.
4. Chame `dfm_operational_context` para o foco do trimestre e os projetos, e `dfm_proposals_list` para o que espera na triagem.
5. Monte o material em blocos curtos, só com fatos e caminhos:
   - **Feitas:** quantas e quais, por projeto.
   - **O que ficou:** as abertas da semana que fecha, uma por linha.
   - **Sinais:** os sinais do plano (dia vazio, tarefa fora da semana, projeto fora do foco), como fato.
   - **O foco do trimestre:** o que a nota do trimestre diz, em uma ou duas linhas.
   - **Candidatas:** as abertas dos projetos do foco sem semana, no máximo 5.
   - **Na triagem:** as propostas que esperam, uma por linha (o texto delas).
   - **Fontes ausentes:** o que não veio.
6. Pergunte se quer abrir o protocolo de revisar ou de planejar a semana (os que `dfm_protocol_run` oferece). Abra com o sim.
7. Se ela decidir algo na conversa ("põe essa na semana que vem"), proponha com `dfm_propose` (`semana`), uma proposta por tarefa.
8. Se ela quiser guardar uma linha do material na nota da semana (a Week), proponha com `dfm_line_propose` (`semana`, a seção que ela disser, com o título exato), uma proposta por linha. Só com o sim, e só o que ela escolheu.

## Ferramentas

`dfm_weekly_context`, `dfm_mission_state`, `dfm_operational_context`, `dfm_proposals_list`, `dfm_protocol_run` (com o sim), `dfm_propose` e `dfm_line_propose` (só o que ela decidiu).

## Nunca

- Planejar a semana, distribuir tarefas nos dias ou montar uma agenda.
- Criar SMART, metas, prazos ou números para ela.
- Propor semana ou dia que ela não decidiu.
- Transformar o que ficou em cobrança.

## Exemplo

> **Feitas (W45):** 6 · 4 no projeto de vídeo, 2 no de produto.
> **O que ficou:** Publicar a página de vendas · Responder o parceiro.
> **Sinais:** quarta e sexta sem nada marcado.
> **Foco do trimestre:** renda própria com produto e campanha.
> **Candidatas:** Escrever o e-mail de lançamento · Gravar o anúncio.
> Quer que eu abra o planejamento da semana?
