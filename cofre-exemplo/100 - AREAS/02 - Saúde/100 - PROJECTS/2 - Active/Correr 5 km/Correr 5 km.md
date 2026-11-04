---
sticker: lucide//sprout
type: iniciativa
scope: small
status: active
area: "[[100 - AREAS/02 - Saúde/000 - INDEX/README.md|02 - Saúde]]"
projects: []
deadline: 2026-03-31
responsavel: Irene Paiva
created: 2026-01-05
exemplo: true
---

# 🚀 Correr 5 km

## 📋 Planejar

- **Objetivo principal:** Correr 5 km sem parar até o fim do trimestre.
- **Escopo:** Três treinos curtos por semana, no parque perto de casa.
- **Prazo:** 2026-03-31
- **Primeira ação física:** Calçar o tênis e caminhar 20 minutos.

## ✅ Executar

### 🎯 SMART

```dataview
TABLE status AS "Status", week AS "Semana", due AS "Prazo"
FROM "TaskNotes/Tasks"
WHERE type = "tarefa_smart" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT week DESC
```

### ⚡ Ações ligadas direto ao projeto

```dataview
TABLE status AS "Status", week AS "Semana", scheduled AS "Quando"
FROM "TaskNotes/Tasks"
WHERE type = "task" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT scheduled ASC
```

## 🔄 Revisar

- 2026-02-27: já são 2 km sem parar; a próxima marca é 3 km.
