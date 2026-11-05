---
name: dk-recomendar
description: Dá uma recomendação para a pessoa a partir do contexto dela (foco, valores, ritmo, o que está em jogo) e explica o porquê quando ela pergunta. Use quando ela perguntar "o que você recomenda", "qual escolho", "vale a pena", "faço isso ou aquilo". A decisão é dela.
---

# Recomendar com o porquê

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou).

## Gatilho

"O que você recomenda?", "qual escolho?", "vale a pena?", "faço A ou B?", "por quê?" depois de uma recomendação.

## Passos

1. Escreva as opções numa linha cada. Se a pessoa deu só uma, a outra é "não fazer agora".
2. Junte o contexto, só o que pesa nesta escolha:
   - o foco do trimestre (`dfm_operational_context`);
   - o que está em jogo hoje ou na semana (`dfm_mission_state`);
   - os valores e o ritmo (a camada pessoal);
   - os fatos de fora, pela skill `dk-pesquisa-conferida`, se a escolha depender deles.
3. Escolha uma opção. Diga numa linha: "Recomendo A."
4. Dê o porquê em até 3 linhas, cada uma ligada a uma fonte do passo 2 ("serve ao foco do trimestre: …").
5. Diga o que mudaria a recomendação, numa linha ("se o prazo for amanhã, B").
6. Pare. A pessoa pode seguir, recusar ou pedir outra.
7. Se ela pedir para virar tarefa, siga `dk-capturar-tarefas`.

Se a pessoa só quiser a recomendação, dê os passos 3 e 6. O porquê vem quando ela perguntar.

## Recomendação sobre pessoas

Recomendar um encontro, um evento ou alguém para conhecer: diga quem, por quê e o que se espera, e só se as duas pessoas consentiram em ser apresentadas. Sem o consentimento das duas, não recomende.

## Ferramentas

`dfm_operational_context`, `dfm_mission_state`, `dfm_node` (para o detalhe de um item), a camada pessoal, `dk-pesquisa-conferida`.

## Nunca

- Recomendar sem dizer em que fato a recomendação se apoia, quando a pessoa pergunta.
- Exagerar: sem "imperdível", "urgente", "a melhor".
- Vender: você não ganha nada com nenhuma opção.
- Decidir por ela, ou gravar a decisão.

## Exemplo

> Recomendo terminar a página de vendas antes de gravar o anúncio.
> - O foco do trimestre é renda com produto e campanha; o anúncio leva para a página.
> - A página está aberta desde a semana passada.
> Se a página depender de alguém que não respondeu, grave o anúncio primeiro.
