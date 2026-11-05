---
name: dk-capturar-tarefas
description: Captura o que a pessoa diz que tem de fazer e propõe as tarefas pela triagem da Missão, no grupo Propostas, cada uma com o pai e o porquê. Use quando ela disser "anota isso", "tenho que…", "lembra de…" ou despejar uma lista solta. Nunca cria a tarefa direto.
---

# Capturar e propor tarefas

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou).

## Gatilho

"Anota isso", "tenho que …", "lembra de …", "preciso …", uma lista solta de coisas a fazer.

## Passos

1. Separe o que a pessoa disse em ações, uma por linha. Cada título começa com um verbo e cabe em 140 caracteres.
2. Para cada ação, chame `dfm_tasks_query` com `text` (uma palavra forte do título). Se já existir, diga "já existe: …" e não proponha.
3. Ache o pai de cada ação (a SMART ou o projeto):
   - se a pessoa disse, use o que ela disse;
   - senão, olhe os projetos em `dfm_operational_context` e escolha o que o título nomeia;
   - se ficar em dúvida entre dois, pergunte, com os dois nomes.
4. Mostre a lista no chat: título · pai. Pergunte "Proponho estas?".
5. Com o sim, para cada uma, chame `dfm_task_create` com `title`, `pai` e `porque` (uma linha: de onde veio o pedido). Passe `week` só se a pessoa disse a semana.
6. Diga quantas propôs e onde esperam: "3 propostas na triagem, em Propostas."
7. Se a ponte recusar uma, leia o motivo, corrija e tente uma vez.

## Ferramentas

`dfm_tasks_query`, `dfm_operational_context`, `dfm_task_create` (ou `dfm_propose` com `acao: criar_tarefa`).

## Nunca

- Escrever a tarefa como arquivo.
- Criar a SMART: se a ação pede uma meta nova, diga "isso parece uma meta; quer abrir o protocolo da SMART?".
- Pôr dia ou prazo que a pessoa não disse.
- Propor duas vezes a mesma ação.

## Exemplo

> Pessoa: "tenho que mandar a nota fiscal e gravar o anúncio do curso"
> Dk: Proponho estas?
> 1. Mandar a nota fiscal · Financeiro
> 2. Gravar o anúncio do curso · Lançamento do curso
> Pessoa: "sim"
> Dk: 2 propostas na triagem, em Propostas.
