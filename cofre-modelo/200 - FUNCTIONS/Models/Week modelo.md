---
sticker: lucide//flower-2
type: weekly_note
week: ""
quarter: ""
projetos_foco: []
foco: ""
valor_semana: ""
valor_relacao: ""
direcao: ""
estrategia_obj: ""
desafio_previsto: ""
acao_corajosa: ""
status: open
modo_semana: ""
frentes_dia: ""
gesto_fora_tela: ""
bloco_sagrado: ""
hora_desligar: ""
lista_nao: ""
relatorio: ""
tags:
  - weekly
---

# Semana {{targetweek:GGGG-[W]WW}}

## 📏 Os 2 números da semana
```dataviewjs
await dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "week", mode: "numeros" })
```
```dataviewjs
// O bloco só chama `week_act_adler.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/week_act_adler";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista, { mode: "numeros" });
```

---

# 🗓️ O plano — aceitar e escolher
*O 🌳 Planejar a semana grava nas propriedades desta nota. Rodar de novo atualiza as propriedades e deixa o texto como está.*

```dataviewjs
// O que entrou na semana anterior e ainda não tem lugar (a contagem de complexidade do
// ECH, `nucleo.ech`; o que conta é definido em Config/ech.json). Só leitura.
const nucleo = app.plugins.plugins['dfm-system']?.nucleo;
const semana = String(dv.current().week || dv.current().file.name);
const inicio = dv.luxon.DateTime.fromISO(`${semana}-1`);
const anterior = inicio.isValid ? inicio.minus({ weeks: 1 }).toFormat("kkkk-'W'WW") : '';
const r = anterior ? await nucleo?.ech?.(anterior) : null;
if (r) {
  const nomes = r.soltos.map(p => dv.fileLink(p, false, p.split('/').pop().replace(/\.md$/, '')));
  dv.paragraph(nomes.length
    ? `🧩 Sem lugar desde ${anterior}: ${nomes.slice(0, 8).join(' · ')}${nomes.length > 8 ? ` · +${nomes.length - 8}` : ''}`
    : `🧩 Sem lugar desde ${anterior}: nenhum.`);
}
```
```dfm
button: 🌳 Planejar a semana | 🛰️ Abrir na Missão
id: planejamento_semanal | command:dfm-system:dfm-abrir-missao-no-periodo
```

## 🌱 Reflexão Inicial & Descompressão
```dataviewjs
// O que a semana anterior passou para esta: o ajuste mínimo da revisão dela e o link
// da conversa da semana. Sem registro, a seção fica vazia.
const atual = dv.current();
const semana = String(atual.week || (String(atual.file.name).match(/\d{4}-W\d{2}/) || [])[0] || "");
const ref = semana && typeof moment !== "undefined" ? moment(semana, "GGGG-[W]WW", true) : null;
if (ref && ref.isValid()) {
  const anterior = ref.clone().subtract(1, "week").format("GGGG-[W]WW");
  const review = dv.page(`400 - MEMORY/200 - WEEKLY/${anterior} - Review`);
  const nota = dv.page(`300 - RUNTIME/302 - Daymiss/Week/${anterior}`);
  const ajuste = String((review && review.ajuste_minimo) || (nota && nota.ajuste_minimo) || "").trim();
  const linhas = [];
  if (ajuste) linhas.push(`👣 **Ajuste mínimo da ${anterior}:** ${ajuste}`);
  if (nota) linhas.push(`📨 [[${nota.file.path}#📨 Conversa da semana|Conversa da semana da ${anterior}]]`);
  if (linhas.length) dv.paragraph(linhas.join("  \n"));
}
```

## 🧭 Valores da semana e ação comprometida
> *A semana leva um valor de cada grupo das suas definições: um seu e um das relações. O 🌳 sugere o par; trocar é normal. O valor dá a direção da ação da semana, que fica no TaskNotes com as outras tarefas.*

> **Direção:** `= this.direcao`
> **Fio condutor:** `= this.foco`

```dataviewjs
await dv.view("200 - FUNCTIONS/Scripts/valor_semana", { scope: "abertura" })
```

## 🧭 Puxada do Trimestre (de onde esta semana nasce)
> *As tarefas SMART da semana saem dos projetos do trimestre. Para uma tarefa entrar nesta semana, ponha esta semana no campo `week` dela.*
```dataviewjs
try {
    const cur = dv.current();
    const quarter = cur.quarter || "";
    const week = cur.week || cur.file.name;
    const lista = v => (Array.isArray(v) ? [...v] : (v ? [v] : [])).filter(x => String(x ?? "").trim() !== "");
    if (!quarter) { dv.paragraph("*Preencha `quarter` nas propriedades desta nota.*"); }
    else {
        const qPage = dv.page(`300 - RUNTIME/302 - Daymiss/Quarterly/${quarter}.md`);
        if (qPage) {
            const bits = [];
            if (qPage.theme) bits.push(`🔑 **Tema:** ${qPage.theme}`);
            const objs = lista(qPage.objetivos).map(o => String(o).trim());
            if (objs.length) bits.push(`🎯 **Objetivos:** ${objs.join(" · ")}`);
            // As centrais do trimestre (a lista `temporada` da nota do trimestre).
            const temporada = lista(qPage.temporada);
            if (temporada.length) bits.push(`🌟 **Temporada:** ${temporada.map(String).join(" · ")}`);
            // O marco do bloco em que esta semana cai (1–4, 5–8 ou 9–12; a 13ª e a 14ª
            // ficam no último). A 1ª semana do trimestre é a primeira cuja quinta-feira
            // cai nele, a mesma conta do Radar da nota do trimestre.
            const mq = String(quarter).match(/(\d{4})-Q([1-4])/);
            const seg = typeof moment !== "undefined" ? moment(String(week), "GGGG-[W]WW", true) : null;
            if (mq && seg && seg.isValid()) {
                const mesInicial = (Number(mq[2]) - 1) * 3 + 1;
                const primeira = moment(`${mq[1]}-${String(mesInicial).padStart(2, "0")}-01`, "YYYY-MM-DD").startOf("isoWeek");
                if (moment(primeira).add(3, "days").month() + 1 !== mesInicial) primeira.add(1, "week");
                const posicao = moment(seg).startOf("isoWeek").diff(primeira, "weeks") + 1;
                const [campo, faixa] = posicao <= 4 ? ["marco_1_4", "1–4"] : (posicao <= 8 ? ["marco_5_8", "5–8"] : ["marco_9_12", "9–12"]);
                const marco = posicao >= 1 ? String(qPage[campo] ?? "").trim() : "";
                if (marco) bits.push(`🗺️ **Marco das semanas ${faixa}:** ${marco}`);
            }
            const numeros = lista(qPage.metricas_chave).map(n => String(n).trim());
            if (numeros.length) bits.push(`📏 **Os 2 números:** ${numeros.join(" · ")}`);
            if (bits.length) dv.paragraph(`> [[300 - RUNTIME/302 - Daymiss/Quarterly/${quarter}.md|${quarter}]] — ` + bits.join(" | "));
        } else {
            dv.paragraph(`⚠️ *O trimestre ${quarter} ainda não tem nota. Ela nasce pelo 🧭 Planejar o trimestre.*`);
        }
        // Os focos que o 🌳 gravou nesta semana (`projetos_foco`): projetos e
        // departamentos, pelo link ou pelo nome.
        const focusPaths = lista(cur.projetos_foco).flatMap(ref => {
            if (ref?.path) return [ref.path];
            const text = String(ref ?? "");
            const links = [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(match => match[1].trim());
            return links.length ? links : (text.trim() ? [text.trim()] : []);
        });
        // A nota-índice que se chama README é achada pelo nome da pasta dela.
        const nomeDe = p => p.file.name === "README" ? p.file.folder.split("/").pop() : p.file.name;
        const base = ref => String(ref ?? "").split("/").pop().replace(/\.md$/, "").trim();
        const candidatos = dv.pages('"100 - AREAS"')
            .where(p => ["iniciativa", "projeto", "departamento"].includes(String(p.type ?? "")));
        const resolver = ref => {
            const direta = dv.page(ref);
            if (direta && direta.file.name !== "README") return direta;
            return candidatos.where(p => nomeDe(p) === base(ref)).first() ?? null;
        };
        const projs = focusPaths
            .map(resolver)
            .filter((page, i, all) => page && page.status === "active" && all.findIndex(o => o && o.file.path === page.file.path) === i);
        // Uma SMART é do projeto quando um link do campo `projects` dela aponta para ele.
        const alvos = t => (Array.isArray(t.projects) ? t.projects : [t.projects])
            .filter(Boolean)
            .map(v => base(v?.path ?? String(v).replace(/[\[\]]/g, "").split("|")[0]));
        if (projs.length) {
            dv.header(5, "🔥 Projetos foco e tarefas SMART disponíveis");
            for (const proj of projs) {
                const chaves = new Set([nomeDe(proj), proj.file.name].filter(n => n && n !== "README"));
                const smart = dv.pages('"TaskNotes/Tasks"')
                    .where(t => t.archived !== true && t.type === "tarefa_smart" && !["done", "cancelled"].includes(t.status))
                    .where(t => alvos(t).some(a => chaves.has(a)));
                const pend = smart.where(t => !t.week);
                const mine = smart.where(t => t.week === week);
                dv.paragraph(`**${dv.fileLink(proj.file.path, false, nomeDe(proj))}** — ${mine.length} nesta semana · ${pend.length} sem semana` +
                    (pend.length ? ":" : ""));
                if (pend.length) dv.list(pend.map(t => `⬜ ${t.file.link} *(sem week)*`));
            }
        } else {
            dv.paragraph("*Nenhum projeto ou departamento está como foco desta semana.*");
        }
    }
} catch (e) { dv.paragraph("—"); }
```

## 🎯 Entregas SMART e próximas ações

> Até três entregas na semana. Cada uma com uma a três próximas ações físicas; o que se agenda é a ação, não a entrega.

```dataviewjs
await dv.view("200 - FUNCTIONS/Scripts/week_smart_flow")
```

## 🧰 Manutenção da semana

> As SMART de manutenção de rotina ficam aqui, fora das três entregas. A marcação é o campo Natureza da SMART, no painel da Missão.

```dataviewjs
await dv.view("200 - FUNCTIONS/Scripts/week_smart_flow", { manutencao: true })
```

## 🌿 Critério da semana
- **Limite ou arranjo:** `= this.estrategia_obj`
- **Barreira provável e resposta mínima:** `= this.desafio_previsto`
- **Contribuição escolhida:** `= this.acao_corajosa`
- **Projetos puxados:** `= this.projetos_foco`

```dataviewjs
try {
    const c = dv.current();
    const show = v => {
        if (v === undefined || v === null) return "—";
        if (Array.isArray(v)) {
            const itens = v.map(x => String(x ?? "").trim()).filter(Boolean);
            return itens.length ? itens.join(" · ") : "—";
        }
        const texto = String(v).trim();
        return texto && texto !== "[]" ? texto : "—";
    };
    const linhas = [
        ["Modo", c.modo_semana], ["Frente de cada dia", c.frentes_dia],
        ["Gesto fora da tela", c.gesto_fora_tela], ["Bloco Sagrado", c.bloco_sagrado],
        ["Hora de desligar", c.hora_desligar], ["Lista do não", c.lista_nao],
        ["📨", c.relatorio]
    ];
    dv.paragraph(linhas.map(([nome, valor]) => `**${nome}:** ${show(valor)}`).join("  \n"));
} catch (e) { dv.paragraph("—"); }
```
*Tudo isto mora nas propriedades da nota. `frentes_dia` se escreve como "seg … · ter … · qua …"; `relatorio` vale aguardando, respondido, aplicado ou ➖ sem 📨 nesta semana.*

## Suportes e decisões
*Um item por linha: o link de uma nota que sustenta a semana, ou uma decisão com as suas palavras. Esta lista é lida daqui pela nota do trimestre e pela Missão.*
-

---

# ⚡ Durante — fazer e registrar
*Leituras dos registros da semana. Nada aqui se preenche à mão.*

## 📊 Termômetro e Colheita da Semana
> *Os dias e a execução lidos das propriedades das notas, nunca do texto.*
```dataviewjs
dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "week" })
```

> [!NOTE]- 🌱 Hábitos da semana (contagem, sem sequência)
> ```dfm-habit-summary
> scope: week
> ```

## 🔁 Accountability de Protocolos (O Espelho da Semana)
> *Fatos registrados na semana. Servem para decidir; não medem a pessoa.*
```dataviewjs
try {
    // A semana ISO da nota (GGGG-[W]WW), de segunda a domingo.
    const wk = dv.current().week || dv.current().file.name;
    const inicio = moment(String(wk), "GGGG-[W]WW", true).startOf("isoWeek");
    if (!inicio.isValid()) { dv.paragraph("*A nota não tem uma semana no formato AAAA-Www.*"); }
    else {
        const fim = moment(inicio).endOf("isoWeek");
        const naSemana = d => d && moment(String(d)).isBetween(inicio, fim, "day", "[]");

        // 1. As tarefas que os protocolos criaram nesta semana, pela tag de origem (a ação
        // do valor da semana leva a tag `valor`). A pasta inteira do TaskNotes, porque a
        // tarefa concluída vai para o arquivo e continua sendo desta semana.
        const tagsDeOrigem = ["valor", "protocolo"];
        const tarefas = dv.pages('"TaskNotes"')
            .where(t => t.tags && tagsDeOrigem.some(tag => String(t.tags).includes(tag)))
            .where(t => naSemana(t.file.cday));
        if (tarefas.length > 0) {
            // A forma de mostrar vem da função única do plugin; a cancelada não conta.
            const forma = app.plugins.plugins["dfm-system"]?.nucleo?.formaDasTarefas?.(tarefas, undefined, "nada para contar");
            dv.paragraph(`**Ações criadas pelos protocolos nesta semana:** ${forma ? forma.text : "sem leitura (o dfm-system não está carregado)"}`);
            dv.table(["Ação", "Status", "Tag"], tarefas.map(t => [
                t.file.link,
                t.status === "done" ? "✅ concluída" : (t.status === "cancelled" ? "⊘ cancelada" : (t.status === "in-progress" ? "▶️ em curso" : "⬜ " + (t.status || "aberta"))),
                String(t.tags || "").replace(/[\[\]]/g, "")
            ]));
        } else {
            dv.paragraph("*Nenhuma ação criada por protocolo nesta semana. Ausência de registro não diz nada sobre a semana.*");
        }

        // 2. Os registros da semana, contados por tipo.
        const registros = dv.pages('"400 - MEMORY/100 - DAILY"')
            .where(p => p.type && naSemana(p.date));
        if (registros.length > 0) {
            const contagem = {};
            for (const r of registros) contagem[r.type] = (contagem[r.type] || 0) + 1;
            dv.paragraph("**📡 Registros da semana por tipo:** " +
                Object.entries(contagem).sort((a, b) => b[1] - a[1])
                    .map(([tipo, n]) => `${tipo}: **${n}x**`).join(" · "));
        }
    }
} catch (e) { dv.paragraph("—"); }
```

---

# 🌙 Fechar — revisar
> *No fechamento o sistema só é lido: uma ideia para mudar o sistema vira anotação, não edição nesta semana.*

## 📨 Conversa da semana
*No máximo 5 perguntas de resposta curta (um fato, uma quantidade, sim ou não). Cada resposta vai na linha `resposta::` logo abaixo da pergunta.*

<!-- IA_RELATORIO_START -->
<!-- IA_RELATORIO_END -->

## 🎈🤝 Leitura Factual da Semana
> Os números saem dos registros. Não é preciso redigitar contagens, e ausência não é falha.

```dataviewjs
// O bloco só chama `week_act_adler.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/week_act_adler";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista);
```

```dataviewjs
// As três contagens do ECH da semana, só leitura: o que entrou · organizado e sem lugar ·
// resolvido e aberto. O que conta é definido em Config/ech.json (`nucleo.ech`).
const nucleo = app.plugins.plugins['dfm-system']?.nucleo;
const semana = String(dv.current().week || dv.current().file.name);
const r = await nucleo?.ech?.(semana);
dv.paragraph(r ? `⚖️ **ECH:** ${r.texto}` : '⚖️ ECH: sem leitura (o dfm-system não está carregado ou a semana não tem o formato AAAA-Www).');
```

### 🧭 Contato com o valor da semana
```dataviewjs
await dv.view("200 - FUNCTIONS/Scripts/valor_semana", { scope: "fechamento" })
```

## 🔄 Fechamento & Revisão Semanal (Protocolo)
```dfm
button: 📅 Revisar a semana
id: review_semanal
```

> [!NOTE]- Revisões gravadas desta semana
> ```dataview
> TABLE WITHOUT ID file.link as "Revisão", fato_semana as "Fato", ajuste_minimo as "Ajuste mínimo"
> FROM "400 - MEMORY/200 - WEEKLY"
> WHERE contains(file.name, choice(this.week, this.week, this.file.name))
> ```

## 📝 Colheita Qualitativa do Ciclo (Escrita Livre)

### 🌾 O que funcionou
- 

### 🪨 O que travou
- 

### 🔮 O que muda na próxima semana
- 
