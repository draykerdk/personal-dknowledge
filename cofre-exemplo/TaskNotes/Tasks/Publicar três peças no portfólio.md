---
tags:
  - task
  - tarefa-smart
type: tarefa_smart
status: in-progress
priority: high
impacto: 8
week: 2026-W10
due: 2026-03-06
timeEstimate: 180
projects:
  - "[[Portfólio novo]]"
contexts:
  - 💻 Computador
entrega_observavel: "Três peças publicadas na página do portfólio, cada uma com uma legenda de duas linhas."
criterio_suficiente: "Três peças no ar, mesmo com a página ainda simples."
valor_contribuicao: "Quem procura uma ilustradora vê trabalho recente, e não o de três anos atrás."
limite_escopo: "Sem redesenhar a página; sem peça nova."
dateCreated: 2026-03-02
archived: false
exemplo: true
---

# Publicar três peças no portfólio

> [!summary] Entrega observável
> Três peças publicadas na página do portfólio, cada uma com uma legenda de duas linhas.

> [!success] Suficiente nesta semana
> Três peças no ar, mesmo com a página ainda simples.

## Próximas ações

```dataview
TABLE status AS "Status", scheduled AS "Quando", timeEstimate AS "Minutos"
FROM "TaskNotes/Tasks"
WHERE type = "task" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT scheduled ASC
```

## Evidências e notas

- 2026-03-03: as três peças escolhidas (o cartaz da feira, a capa do livro infantil e o mapa do bairro).
