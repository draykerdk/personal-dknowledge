---
type: area
sticker: lucide//layers
aliases: []
exemplo: true
---

# 🎯 Trabalho

## 🧭 Propósito

- As encomendas de ilustração e o que traz cliente novo.

## 🌱 O que ela mantém

- as entregas dos clientes no prazo combinado
- as contas do mês em dia

## 🚀 Projetos

```dataview
TABLE WITHOUT ID file.link AS "Projeto", status AS "Status", scope AS "Escopo"
FROM "100 - AREAS"
WHERE type = "iniciativa" AND startswith(file.folder, replace(this.file.folder, "/000 - INDEX", "") + "/")
SORT status ASC, file.name ASC
```

## 🔄 Revisar

- 2026-01-05: o portfólio novo virou o foco do trimestre.
