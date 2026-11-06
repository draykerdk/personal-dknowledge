---
type: peca_logica
lingua: en
modulo: "[[Inglês]]"
grupo: estrutura
ordem: 1
nivel: N1
exemplo: true
---

# A ordem fixa

## A regra geradora

Quem age vem antes do verbo, e o que recebe a ação vem depois.

## O que é

O inglês dá o sentido pela posição: sujeito, verbo, complemento.

## Por que é assim

O verbo quase não muda de forma; sem a terminação para dizer quem age, a ordem é que diz.

## Como se liga

- **Depende de:** nada; é a primeira peça.
- **Destrava:** a pergunta pelo operador, os conectores.

## Os passos na trilha

### O sujeito antes do verbo

O primeiro cartão acende este passo: o sujeito nunca se esconde.

## O contraste com o português

Em português dá para tirar o sujeito ("Mando amanhã"); em inglês ele fica ("I'll send it tomorrow").

## A mesma estrutura em quatro contextos

- **Conhecer alguém:** I draw for a living.
- **Viagem:** We need a taxi.
- **Conversa:** She likes the second sketch.
- **Reflexão:** I work better in the morning.

## As frases que a usam

> Gerada pelos cartões que apontam para esta peça em `pecas` ou em `conectores`: nunca se escreve à mão.

```dataview
TABLE WITHOUT ID file.link AS "Frase", diga AS "Diga", nivel AS "Nível", estado AS "Estado"
WHERE type = "cartao" AND (contains(default(pecas, []), this.file.link) OR contains(default(conectores, []), this.file.link))
SORT nivel ASC, file.name ASC
```
