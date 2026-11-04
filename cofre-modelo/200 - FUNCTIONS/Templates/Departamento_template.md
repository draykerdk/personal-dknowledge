---
type: departamento
area: "[[100 - AREAS/{{area}}/000 - INDEX/README.md|{{area}}]]"
missao: "{{missao}}"
projects: []
responsavel: "{{responsavel}}"
status: active
created: "{{date:YYYY-MM-DD}}"
sticker: lucide//building-2
---

# 🏢 {{titulo}}

*Um departamento cuida de algo que continua: não tem fim marcado, como um projeto tem. O `type: departamento` é o que faz o sistema reconhecê-lo; o campo `projects` diz a que central ele serve, quando serve a uma.*

> **Área:** [[100 - AREAS/{{area}}/000 - INDEX/README.md|{{area}}]] · **Responsável:** {{responsavel}}

## 📋 Planejar

- **O que ele mantém funcionando:** {{missao}}
- **O que se repete:**
  - 

## ✅ Executar

### 🎯 SMART

```dataview
TABLE status AS "Status", week AS "Semana", due AS "Prazo"
FROM "TaskNotes/Tasks"
WHERE type = "tarefa_smart" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT week DESC
```

### ⚡ Ações ligadas direto ao departamento

```dataview
TABLE status AS "Status", week AS "Semana", scheduled AS "Quando"
FROM "TaskNotes/Tasks"
WHERE type = "task" AND (contains(projects, this.file.name) OR contains(projects, this.file.link))
SORT scheduled ASC
```

### 🚀 Projetos da mesma área

```dataview
TABLE status AS "Status", deadline AS "Prazo"
FROM "100 - AREAS"
WHERE type = "iniciativa" AND area = this.area
SORT created DESC
```

### 🔗 Projetos auxiliares

*Os projetos e departamentos cujo campo `projects` aponta para este. Num departamento que não é central, a lista fica vazia.*

```dataview
LIST
FROM "100 - AREAS"
WHERE (type = "iniciativa" OR type = "departamento") AND contains(projects, this.file.link)
```

## 🔄 Revisar

*Uma linha por revisão, com a data e a lição.*

- 

## 📚 Documentos

*Os documentos numerados da pasta do departamento (`NN - Nome.md`).*

```dataview
LIST
FROM ""
WHERE file.folder = this.file.folder AND regexmatch("^\d\d - ", file.name)
SORT file.name ASC
```
