---
type: valor
ordem: 
grupo: individual
sticker: lucide//triangle
---

# 🧭 {{nome}}

*Esta nota mora em `400 - MEMORY/Valores/`; o 🌱 cria uma por valor que você responde, com o nome, a ordem e o porquê. O `type: valor` é o que faz o sistema reconhecê-la; a `ordem` (um número) é a posição do valor na rotação da semana quando o trimestre não traz a lista dele; o `grupo` é `individual` (um valor seu) ou `relacional` (um valor das suas relações).*

> Um valor é uma direção, não uma meta: dá para voltar a ele a qualquer momento, inclusive depois de uma semana andando para o outro lado.

**Por quê:** {{porque}}

**A direção, num verbo:** 

**Como se pratica numa semana:** 

**O que costuma atrapalhar:** 

## Semanas com este valor

```dataview
TABLE WITHOUT ID file.link AS "Semana", valor_relacao AS "Valor da relação"
FROM "300 - RUNTIME/302 - Daymiss/Week"
WHERE contains(string(valor_semana), this.file.name) OR contains(string(valor_relacao), this.file.name)
SORT file.name DESC
```

## 🔄 Revisar

*Uma linha por revisão, com a data e o que mudou no jeito de viver este valor.*

- 
