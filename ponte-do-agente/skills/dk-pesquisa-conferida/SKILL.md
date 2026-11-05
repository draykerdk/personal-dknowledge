---
name: dk-pesquisa-conferida
description: Faz uma pesquisa para a pessoa e a entrega conferida - cada afirmação com a fonte, a data e o que falta conferir, separado entre o que o agente confere, o que a pessoa confere e o que os dois conferem. Use em qualquer pesquisa (preço, regra, lugar, ferramenta, notícia) antes de ela virar recomendação ou tarefa.
---

# A pesquisa conferida

Regras: as da skill `dk-pessoal` (carregue-a antes, se ainda não carregou; no modo Dk pessoal, elas já vêm na conversa).

Pesquisa de agente erra: inventa, mistura datas, toma ausência por fato. Esta skill entrega a pesquisa com a conferência junto.

## Gatilho

"Pesquisa …", "quanto custa …", "qual a regra de …", "tem … em …", "vale a pena …" (a parte da pesquisa), ou qualquer resposta sua que dependa de fato de fora do cofre.

## Passos

1. Escreva a pergunta numa linha e o que conta como resposta (o número, a regra, o sim ou não).
2. Procure se o cofre tem uma função de conferir pesquisa (a camada pessoal diz o nome). Se tiver, siga a lista dela no passo 5.
3. Pesquise. Para cada afirmação, guarde a fonte (o endereço ou a nota) e a data da fonte.
4. Classifique cada afirmação:
   - **confirmada:** duas fontes independentes e recentes dizem o mesmo;
   - **uma fonte:** só uma diz;
   - **a conferir:** sem fonte, fonte velha, ou fontes que discordam.
5. Monte a conferência em três grupos:
   - 🤖 **o agente confere:** abrir a fonte de novo, a data, a conta, o link;
   - 👤 **a pessoa confere:** o que só ela vê (no lugar, no aplicativo, na conta dela, com quem conhece);
   - 🤝 **os dois conferem:** o que pede a fonte e o olho dela juntos (um mapa, uma foto recente, uma regra miúda).
6. Faça agora os itens 🤖 que der. Atualize a classificação.
7. Entregue: a resposta curta, a tabela das afirmações (afirmação · fonte · data · estado) e os itens 👤 e 🤝 que faltam.
8. Se a pessoa quiser guardar um item 👤 ou 🤝 como tarefa, proponha pela skill `dk-capturar-tarefas`.

## Ferramentas

As de busca e leitura da sessão. Do cofre: a leitura de notas; `dfm_task_create` só pelo passo 8.

## Nunca

- Dar como fato o que está "a conferir".
- Dizer "não existe" ou "não tem" sem fonte forte e recente. Escreva "não achei", com onde procurou.
- Juntar fontes de anos diferentes sem dizer as datas.
- Recomendar com base numa afirmação "a conferir" sem dizer isso na mesma frase.

## Exemplo

> **Resposta:** o visto sai online em cerca de 3 dias úteis (uma fonte).
> | Afirmação | Fonte | Data | Estado |
> |---|---|---|---|
> | prazo de 3 dias úteis | portal oficial | 2026-09 | uma fonte |
> | aceita pagamento com cartão estrangeiro | fórum | 2025-03 | a conferir |
> 👤 conferir no portal, na hora de pagar, se o cartão passa.
> 🤝 conferir juntos o posto de fronteira no mapa.
