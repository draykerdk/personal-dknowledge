/*
 * valor_semana.js
 * Os valores da semana (ACT) — o par sugerido (o seu, `valor_semana`, e o das relações,
 * `valor_relacao`) e a leitura da prática efetiva a partir dos registros que já existem.
 *
 * A sugestão vem do núcleo do plugin (`nucleo.parDaSemana`, 25/10/2026): um sorteio com
 * peso pela ordem do trimestre (`valores` e `valores_relacoes` da nota do trimestre),
 * sem repetir o valor da semana anterior, fixo para a semana. Sem o plugin, ou sem a
 * lista no trimestre, vale a rotação de seis (`((semana ISO − 1) mod 6) + 1`).
 *
 * A sugestão SUGERE; quem escolhe é o operador. Divergir dela não é erro e não é medido
 * como tal. Ausência de registro é ausência de dado — nunca falha, dívida ou streak
 * quebrado.
 *
 * Uso:
 *   dv.view("200 - FUNCTIONS/Scripts/valor_semana", { scope: "abertura" })
 *   dv.view("200 - FUNCTIONS/Scripts/valor_semana", { scope: "fechamento" })
 *   dv.view("200 - FUNCTIONS/Scripts/valor_semana", { scope: "indice" })
 */

const VALORES_FOLDER = "400 - MEMORY/Valores";
const DAYS_FOLDER = "300 - RUNTIME/302 - Daymiss/Day";
const TASKS_FOLDER = "TaskNotes";
const CICLO = 6; // seis valores fundamentais, seis semanas

/** Extrai o basename de um valor que pode ser Link do Dataview, wikilink em texto ou texto puro. */
function baseName(value) {
    if (value === null || value === undefined) return "";
    const first = Array.isArray(value) ? value[0] : value;
    if (first && typeof first === "object" && first.path) {
        return String(first.path).split("/").pop().replace(/\.md$/, "");
    }
    const text = String(first).trim();
    const link = text.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
    const raw = link ? link[1] : text;
    return raw.replace(/^.*\//, "").replace(/\.md$/, "").replace(/^"|"$/g, "").trim();
}

function sameValue(a, b) {
    const x = baseName(a).toLocaleLowerCase();
    const y = baseName(b).toLocaleLowerCase();
    return x !== "" && x === y;
}

/** Número ISO da semana a partir de "GGGG-Www". Devolve null se não der para ler. */
function isoWeekNumber(week) {
    const match = String(week || "").match(/W(\d{2})/);
    return match ? Number(match[1]) : null;
}

/** Ordem da rotação: sequência fixa e determinística, ciclo de seis semanas. */
function ordemDaSemana(week) {
    const n = isoWeekNumber(week);
    if (n === null) return null;
    return ((n - 1) % CICLO) + 1;
}

function ordenarValores(valores) {
    return Array.from(valores || []).sort((a, b) => Number(a.ordem || 99) - Number(b.ordem || 99));
}

function valorDaRotacao(week, valores) {
    const ordem = ordemDaSemana(week);
    if (ordem === null) return null;
    return ordenarValores(valores).find(v => Number(v.ordem) === ordem) || null;
}

/** Dias da semana em que o Comando do Dia encarnou este valor. */
function diasComValor(days, valor, startISO, endISO) {
    return Array.from(days || []).filter(day => {
        const date = day.file && day.file.name ? String(day.file.name) : "";
        if (date < startISO || date > endISO) return false;
        return sameValue(day.valor, valor) || sameValue(day.valor_hyadhuad, valor);
    });
}

/**
 * Ações comprometidas com um valor: tarefas com a tag `valor`.
 *
 * Desde 2026-08-04 o `createTask` grava `week` — e no planejamento semanal ele resolve
 * a semana-ALVO, não a de hoje, então a ação nasce dentro do sprint que a gerou. Quando
 * há `week`, ela é o critério e ponto.
 *
 * Tarefas anteriores a essa mudança não têm `week`: para elas vale a regra das Promessas
 * — compromisso aberto continua visível até ser cumprido ou cancelado. Esse ramo pode
 * sair quando não houver mais tarefa de valor sem `week` no vault.
 */
function acoesComprometidas(tasks, semana, startISO, endISO) {
    return Array.from(tasks || []).filter(task => {
        const tags = String(task.tags || "");
        if (!tags.includes("valor")) return false;

        const week = String(task.week || "").trim();
        if (week) return week === semana;

        const status = String(task.status || "");
        if (status !== "done" && status !== "cancelled") return true;
        const encerrada = String(task.dateModified || task.file?.mday || task.file?.cday || "").slice(0, 10);
        return encerrada >= startISO && encerrada <= endISO;
    });
}

/** O par sugerido da semana pelo núcleo do plugin; sem o plugin (ou com erro), `null`. */
async function parDoNucleo(week) {
    try {
        const nucleo = (typeof app !== "undefined") ? app.plugins?.plugins?.["dfm-system"]?.nucleo : null;
        return nucleo?.parDaSemana ? await nucleo.parDaSemana(week) : null;
    } catch (e) {
        return null;
    }
}

if (typeof dv !== "undefined") (async () => {
    const scope = (typeof input !== "undefined" && input && input.scope) ? String(input.scope) : "abertura";
    const current = dv.current();
    const valores = dv.pages(`"${VALORES_FOLDER}"`).where(p => String(p.type || "") === "valor");

    if (!valores.length) {
        dv.paragraph(`> [!info] Nenhum valor fundamental cadastrado ainda em \`${VALORES_FOLDER}\`.`);
    } else if (scope === "indice") {
        const semanaAtual = typeof moment !== "undefined" ? moment().format("GGGG-[W]WW") : "";
        const par = await parDoNucleo(semanaAtual);
        const daVez = valorDaRotacao(semanaAtual, valores);
        if (par && par.sugestao && (par.sugestao.valor || par.sugestao.relacao)) {
            dv.paragraph(`> 🧭 **Par sugerido (${semanaAtual}):** o seu, ${par.sugestao.valor ? `[[${par.sugestao.valor}]]` : "—"}; o das relações, ${par.sugestao.relacao ? `[[${par.sugestao.relacao}]]` : "—"}`);
        } else if (daVez) {
            dv.paragraph(`> 🧭 **Valor da vez (${semanaAtual}):** ${daVez.file.link}`);
        }
        dv.table(
            ["Ordem", "Valor", "Grupo"],
            ordenarValores(valores).map(v => [v.ordem, v.file.link, v.grupo || "—"])
        );
        dv.paragraph("*A semana tem um valor de cada grupo, o seu e o das relações. A sugestão é um sorteio com peso pela ordem do trimestre (`valores` e `valores_relacoes`), sem repetir a semana anterior e fixo para a semana; sem a lista no trimestre, a rotação de seis (`((semana ISO − 1) mod 6) + 1`, pela ordem acima). É sugestão, não obrigação: o planejamento semanal sempre permite escolher outro.*");
    } else {
        const week = String(current.week || ((String(current.file.name).match(/\d{4}-W\d{2}/) || [])[0] || ""));
        if (!week || typeof moment === "undefined") {
            dv.paragraph("> [!warning] Abra este painel a partir de uma nota semanal (GGGG-Www).");
        } else {
            const start = moment(week, "GGGG-[W]WW", true).startOf("isoWeek");
            const startISO = start.format("YYYY-MM-DD");
            const endISO = start.clone().endOf("isoWeek").format("YYYY-MM-DD");

            const escolhido = current.valor_semana;
            const rotacao = valorDaRotacao(week, valores);
            const escolhidoPage = escolhido
                ? valores.find(v => sameValue(v.file.name, escolhido)) || null
                : null;
            const alvo = escolhidoPage || (escolhido ? null : rotacao);

            if (scope === "abertura") {
                const par = await parDoNucleo(week);
                // A sugestão do núcleo; sem o plugin, a rotação de seis.
                const sugValor = par?.sugestao?.valor || (rotacao ? rotacao.file.name : "");
                const sugRelacao = par?.sugestao?.relacao || "";
                const relacao = current.valor_relacao;
                const nome = v => v ? (valores.find(p => sameValue(p.file.name, v))?.file.link ?? baseName(v)) : "—";
                if (escolhido || baseName(relacao)) {
                    dv.paragraph(`> [!tip] 🧭 **Valores desta semana:** o seu, ${nome(escolhido)}; o das relações, ${nome(relacao)}`);
                    const outroValor = sugValor && escolhido && !sameValue(sugValor, escolhido);
                    const outraRelacao = sugRelacao && baseName(relacao) && !sameValue(sugRelacao, relacao);
                    if (outroValor || outraRelacao) {
                        dv.paragraph(`*A sugestão da semana era ${nome(sugValor)}${sugRelacao ? ` e ${nome(sugRelacao)}` : ""} — escolher outro é uso normal do sistema, não desvio.*`);
                    }
                } else {
                    dv.paragraph(`> [!note] Nenhum valor declarado nesta semana.` +
                        (sugValor ? ` A sugestão é **${nome(sugValor)}** (o seu)${sugRelacao ? ` e **${nome(sugRelacao)}** (o das relações)` : ""}.` : "") +
                        `\n> Rode **📅 Planejar Semana** para gravar \`valor_semana\` e \`valor_relacao\` — ou escreva as chaves à mão no frontmatter.`);
                }

                const acoes = acoesComprometidas(dv.pages(`"${TASKS_FOLDER}"`), week, startISO, endISO);
                if (acoes.length) {
                    dv.paragraph("**⚡ Ações comprometidas com o valor nesta semana:**");
                    dv.table(["Ação", "Status", "Agendada"], acoes.map(t => [
                        t.file.link,
                        t.status === "done" ? "✅ done" : (t.status === "cancelled" ? "⊘ cancelada" : `🔸 ${t.status || "todo"}`),
                        t.scheduled || t.due || "—"
                    ]));
                } else {
                    dv.paragraph("*Nenhuma ação comprometida registrada ainda — ela nasce no Planejamento Semanal (passo da ação comprometida) e vive no TaskNotes como qualquer outra.*");
                }
            } else { // fechamento
                if (!alvo && !escolhido) {
                    dv.paragraph("*Esta semana não declarou um valor. Sem valor declarado não há o que ler aqui — e isso é só ausência de dado.*");
                } else {
                    const referencia = alvo ? alvo.file.name : baseName(escolhido);
                    const dias = diasComValor(dv.pages(`"${DAYS_FOLDER}"`), referencia, startISO, endISO);
                    const acoes = acoesComprometidas(dv.pages(`"${TASKS_FOLDER}"`), week, startISO, endISO);
                    const feitas = acoes.filter(t => t.status === "done").length;
                    const canceladas = acoes.filter(t => t.status === "cancelled").length;
                    const base = acoes.length - canceladas;

                    dv.paragraph(`**🧭 ${alvo ? alvo.file.link : referencia}** — ` +
                        `${dias.length} dia(s) em que o Comando do Dia encarnou este valor · ` +
                        (acoes.length
                            ? `ação comprometida: ${feitas}/${base || 0} cumprida(s)${canceladas ? ` · ⊘ ${canceladas} cancelada(s), fora da conta` : ""}`
                            : "nenhuma ação comprometida foi registrada"));

                    if (dias.length) {
                        dv.table(["Dia", "Ação", "Entrega suficiente"], dias.map(d => [
                            d.file.link, d.acao_comando || "—", d.resultado_suficiente || "—"
                        ]));
                    }
                    dv.paragraph("*Isto mede contato com a direção escolhida, não valor pessoal. Um número baixo indica onde a evitação operou — é informação para a próxima semana, não veredito sobre a que passou.*");
                }
            }
        }
    }
})();
