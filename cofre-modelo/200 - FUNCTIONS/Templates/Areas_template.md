---
type: area
sticker: lucide//layers
aliases: []
---

# 🎯 {{nome}}

*Esta nota mora em `100 - AREAS/<NN - Área>/000 - INDEX/README.md`; o 🌱 a cria para cada área que você responde, com o nome no título. O `type: area` é o que faz o sistema reconhecer a área.*

## 🧭 Propósito

*Por que esta área existe e o que ela cuida na sua vida, em poucas linhas.*

- 

## 🌱 O que ela mantém

*O que precisa continuar de pé nesta área, mesmo sem projeto ativo.*

- 

## 🚀 Projetos

```dataview
TABLE WITHOUT ID file.link AS "Projeto", status AS "Status", scope AS "Escopo"
FROM "100 - AREAS"
WHERE type = "iniciativa" AND startswith(file.folder, replace(this.file.folder, "/000 - INDEX", "") + "/")
SORT status ASC, file.name ASC
```

## 🏢 Departamentos

```dataview
TABLE WITHOUT ID file.link AS "Departamento", status AS "Status"
FROM "100 - AREAS"
WHERE type = "departamento" AND startswith(file.folder, replace(this.file.folder, "/000 - INDEX", "") + "/")
SORT file.name ASC
```

## 🔄 Revisar

*Uma linha por revisão da área, com a data e o que mudou.*

- 

## 📚 Referências

*As notas e os materiais que apoiam esta área.*

- 
