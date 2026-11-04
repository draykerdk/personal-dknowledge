---
type: area
sticker: lucide//layers
aliases: []
exemplo: true
---

# 🎯 Casa

## 🧭 Propósito

- O lugar onde se trabalha e se descansa, funcionando.

## 🌱 O que ela mantém

- as pequenas trocas e consertos
- as compras da semana

## 🚀 Projetos

```dataview
TABLE WITHOUT ID file.link AS "Projeto", status AS "Status", scope AS "Escopo"
FROM "100 - AREAS"
WHERE type = "iniciativa" AND startswith(file.folder, replace(this.file.folder, "/000 - INDEX", "") + "/")
SORT status ASC, file.name ASC
```

## 🔄 Revisar

- 2026-01-05: sem projeto neste trimestre; só manutenção.
