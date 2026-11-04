# 🎯 {{titulo}}

*As propriedades desta SMART (a semana, o projeto, o impacto e os quatro textos abaixo) são gravadas por quem a cria. O corpo é o lugar das ações e das evidências.*

> [!summary] Entrega observável
> {{entrega_observavel}}

> [!success] Suficiente nesta semana
> {{criterio_suficiente}}

> [!compass] Valor e contribuição
> {{valor_contribuicao}}

> [!stop] Limite do escopo
> {{limite_escopo}}

## Próximas ações

*De uma a três ações, cada uma um gesto físico que dá para ver feito. A ação aponta para esta SMART no campo `projects` e leva a mesma `week`; a ação sem `week` fica fora da semana. Agende a ação, não a SMART: o prazo da SMART é o `due`.*

```dataview
TABLE status AS "Status", scheduled AS "Quando", timeEstimate AS "Minutos"
FROM "TaskNotes/Tasks"
WHERE type = "task" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT scheduled ASC
```

## Evidências e notas

- 

---
*SMART criada em {{date:YYYY-MM-DD}} para a semana {{targetweek:GGGG-[W]WW}}.*
