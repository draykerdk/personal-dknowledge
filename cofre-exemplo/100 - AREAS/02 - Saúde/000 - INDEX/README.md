---
type: area
sticker: lucide//layers
aliases: []
exemplo: true
---

# 🎯 Saúde

## 🧭 Propósito

- O corpo que aguenta as horas na mesa de desenho.

## 🌱 O que ela mantém

- dormir antes da meia-noite
- mexer o corpo três vezes por semana

## 🚀 Projetos

```dataview
TABLE WITHOUT ID file.link AS "Projeto", status AS "Status", scope AS "Escopo"
FROM "100 - AREAS"
WHERE type = "iniciativa" AND startswith(file.folder, replace(this.file.folder, "/000 - INDEX", "") + "/")
SORT status ASC, file.name ASC
```

## 🔄 Revisar

- 2026-01-05: a corrida entrou como projeto, com um fim marcado.
