---
sticker: lucide//sprout
type: iniciativa
scope: {{scope_value}}
status: backlog
area: "[[100 - AREAS/{{area_responsavel}}/000 - INDEX/README.md|{{area_responsavel}}]]"
projects: []
palavra_chave: 
deadline: {{prazo}}
responsavel: 
created: {{date:YYYY-MM-DD}}
---

# 🚀 {{titulo}}

## 📋 Planejar

- **Objetivo principal:** {{objetivo}}
- **Escopo:** {{scope}}
- **Importância:** {{importancia}} (quem decide a importância do projeto é o foco do trimestre, no 🧭)
- **Prazo:** {{prazo}}
- **Primeira ação física:** {{acao_fisica}}

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

### 🔗 Projetos auxiliares

*Os projetos e departamentos cujo campo `projects` aponta para este. Num projeto que não é central, a lista fica vazia.*

```dataview
LIST
FROM "100 - AREAS"
WHERE (type = "iniciativa" OR type = "departamento") AND contains(projects, this.file.link)
```

## 🔄 Revisar

*Uma linha por revisão, com a data e a lição. É o registro do caminho do projeto.*

- 

## 📚 Documentos

*Os documentos numerados da pasta do projeto (`NN - Nome.md`).*

```dataview
LIST
FROM ""
WHERE file.folder = this.file.folder AND regexmatch("^\d\d - ", file.name)
SORT file.name ASC
```
