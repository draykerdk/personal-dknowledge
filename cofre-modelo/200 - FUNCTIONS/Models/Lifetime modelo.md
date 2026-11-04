---
sticker: lucide//milestone
type: longterm_note
period: ""
horizon: ""
status: open
tags: planning/long-term
---

# 🏁 Longo prazo: {{title}}

> **A direção, não a lista de tarefas.** Aqui se escolhe para onde vai um ciclo de anos; o trimestre, a semana e o dia executam. Esta nota se abre poucas vezes: no começo do ciclo, de vez em quando para ler, e no fim. Pouco e verdadeiro vale mais do que tudo preenchido.

*`period` é o nome do ciclo (por exemplo `ciclo-1`) e `horizon` é o ano em que ele termina.*

```dfm
button: 🧭 Planejar o trimestre | 🛰️ Abrir a Missão
id: planejamento_trimestral | command:dfm-system:dfm-abrir-missao
```

---

## 🧭 Parte I — Direção

### 1. Ponto de partida

- **Como as coisas estão agora** *(os recursos, os limites, o apoio e o que já está andando; uma descrição, não um diagnóstico)*:
  - 
- **O que deve existir no mundo no fim deste ciclo** *(uma contribuição que se vê)*:
  - 
- **O que provavelmente acontece se nada mudar** *(um fato previsível)*:
  - 

### 2. Poucas apostas grandes

*Duas bastam. Cada uma com um resultado que alguém de fora conseguiria conferir.*

- **🎯 Aposta 1:**
  - **Como ela acontece no mundo:**
  - **Como saber que aconteceu:**
- **🎯 Aposta 2:**
  - **Como ela acontece no mundo:**
  - **Como saber que aconteceu:**

### 3. Capacidades e comportamentos

- **O que é preciso aprender a fazer:**
  - 
- **O que precisa acontecer com frequência para as apostas andarem:**
  - 

### 4. Base e recursos

- **Onde estar, e para quê:**
  - 
- **Como o ciclo se sustenta:**
  - 

### 5. O que vai atrapalhar

- **Os obstáculos prováveis, de dentro e de fora:**
  - 
- **A resposta mínima já escolhida** *("se X aparecer, faço Y", o menor Y possível)*:
  - 

---

## 📊 Parte II — Leitura do ciclo

> *Os painéis saem dos registros. Sem registro, não há dado: a falta não vira dívida nem falha.*

### 🏆 O ano em números

```dataviewjs
dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "year" })
```

### 📡 Os trimestres do ano

> *O ano corrente. Para olhar outro ano do ciclo, declare `radar_ano: AAAA` nas propriedades desta nota.*

```dataviewjs
try {
    const ano = Number(String(dv.current().radar_ano ?? '').match(/\d{4}/)?.[0] ?? moment().year());
    const linhas = [];
    for (let q = 1; q <= 4; q++) {
        const nome = `${ano}-Q${q}`;
        const caminho = `300 - RUNTIME/302 - Daymiss/Quarterly/${nome}.md`;
        const pagina = dv.page(caminho);
        if (!pagina) {
            linhas.push([nome, "*não criado*", "—", "—", "—"]);
            continue;
        }
        // Os objetivos podem vir em lista, num texto só ou com posições vazias.
        const objetivos = (Array.isArray(pagina.objetivos) ? [...pagina.objetivos] : (pagina.objetivos ? [pagina.objetivos] : []))
            .map(o => String(o ?? "").trim())
            .filter(o => o !== "");
        linhas.push([
            `[[${caminho}|${nome}]]`,
            pagina.theme || "—",
            objetivos.length ? objetivos.join(" · ") : "—",
            pagina.rating ?? "—",
            pagina.status || "open"
        ]);
    }
    dv.table(["Trimestre", "Tema", "🎯 Objetivos", "Utilidade do arranjo", "Estado"], linhas);
} catch (e) { dv.paragraph("—"); }
```

### 🧭 O que cada trimestre aprendeu

*Lido das revisões dos trimestres, sem perguntar de novo o que já foi respondido.*

```dataviewjs
try {
    const ano = String(dv.current().radar_ano ?? '').match(/\d{4}/)?.[0] ?? String(moment().year());
    const reviews = dv.pages('"400 - MEMORY/400 - QUARTERLY"')
        .where(p => String(p.type ?? '') === 'quarterly_review' && String(p.quarter ?? '').startsWith(ano))
        .sort(p => String(p.quarter ?? ''), 'asc');
    if (!reviews.length) {
        dv.paragraph("*Nenhum trimestre revisado neste ano ainda.*");
    } else {
        dv.table(["Trimestre", "Aprendizado", "Ajuste mínimo", "Palavra"], reviews.map(r => [
            r.quarter ?? r.file.link,
            r.licao ?? "—",
            r.ajuste_minimo ?? "—",
            r.palavra_resumo ?? "—"
        ]));
    }
} catch (e) { dv.paragraph("—"); }
```

---

## ✍️ Parte III — Caderno do ciclo

*Escrito ao longo dos anos, sem data marcada.*

### 🔀 Mudanças de direção

*O que mudou, e o fato que levou à mudança.*

### 👀 O que só aparece de longe

*O que se repetiu por vários trimestres seguidos.*

---

## 🔄 Parte IV — Fechamento do ciclo

> *No fim do ciclo. É a leitura dos fatos e das escolhas: o que se avalia é o arranjo, não a pessoa.*

### 1. O que ficou no mundo

- **O que foi construído e permanece:**
  - 
- **O que não andou** *(o fato e a causa provável)*:
  - 
- **O tempo posto e o que ele trouxe:**
  - 

### 2. O que mudou no jeito de agir

- **Como você participa hoje do que importa, comparado ao começo:**
  - 
- **O que só este ciclo poderia ensinar:**
  - 
- **O que sai do plano daqui em diante** *(deixar de fazer também é uma decisão)*:
  - 

### 3. Encerramento

> Fechar aqui não é um veredito. É escolher a próxima direção com o que este ciclo mostrou e voltar ao menor passo dela.
