---
type: peca_logica
lingua: ""
modulo: ""
grupo: ""
ordem: ""
nivel: ""
---

# {{titulo}}

## A regra geradora

## O que é

## Por que é assim

## Como se liga

- **Depende de:** 
- **Destrava:** 

## Os passos na trilha

### 

## O contraste com o português

## A mesma estrutura em quatro contextos

- **Conhecer alguém:** 
- **Viagem:** 
- **Conversa:** 
- **Reflexão:** 

## As frases que a usam

> Gerada pelos cartões que apontam para esta peça em `pecas` ou em `conectores`: nunca se escreve à mão.

```dataview
TABLE WITHOUT ID file.link AS "Frase", diga AS "Diga", nivel AS "Nível", estado AS "Estado"
WHERE type = "cartao" AND (contains(default(pecas, []), this.file.link) OR contains(default(conectores, []), this.file.link))
SORT nivel ASC, file.name ASC
```
