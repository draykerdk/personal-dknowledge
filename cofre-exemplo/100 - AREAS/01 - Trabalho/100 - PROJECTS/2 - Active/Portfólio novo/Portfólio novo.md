---
sticker: lucide//sprout
type: iniciativa
scope: medium
status: active
area: "[[100 - AREAS/01 - Trabalho/000 - INDEX/README.md|01 - Trabalho]]"
projects: []
deadline: 2026-03-27
responsavel: Irene Paiva
created: 2026-01-05
exemplo: true
---

# 🚀 Portfólio novo

## 📋 Planejar

- **Objetivo principal:** Um portfólio no ar com seis peças recentes e um jeito simples de pedir orçamento.
- **Escopo:** Seis peças, uma página, um formulário de contato. Sem loja.
- **Prazo:** 2026-03-27
- **Primeira ação física:** Separar as vinte peças do último ano numa pasta.

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

- 2026-02-27: as seis peças estão escolhidas; falta escrever e publicar.
