/*
 * quarter_act_adler.js
 * Consolida os fatos ACT/Adler já registrados nos dias e as interpretações
 * gravadas nas notas semanais. O trimestre lê; não pede contagens novamente.
 */

const QUARTER_ACT_RESPONSES = {
    acted: "✅ Agi com a experiência presente",
    returned: "🔁 Evitei e retornei",
    pendingReturn: "🧱 Evitei e ainda não retornei",
    noBarrier: "➖ Nenhuma barreira relevante apareceu"
};

function quarterArray(value) {
    return Array.isArray(value) ? value : Array.from(value || []);
}

function quarterDate(record) {
    if (!record) return null;
    const values = [record.date, record.day, record.file && record.file.day, record.file && record.file.name];
    for (const value of values) {
        if (!value) continue;
        if (typeof value.toFormat === "function") return value.toFormat("yyyy-MM-dd");
        const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
        if (match) return match[0];
    }
    return null;
}

function summarizeQuarterActAdler(input) {
    const days = quarterArray(input.days).filter(day => {
        const date = quarterDate(day);
        return date && date >= input.startISO && date <= input.endISO;
    });
    const weeks = quarterArray(input.weeks).filter(week => String(week.quarter || "") === input.quarter);
    const responses = days.map(day => String(day.act_resposta || ""));

    return {
        daysObserved: days.length,
        act: Object.fromEntries(Object.entries(QUARTER_ACT_RESPONSES).map(([key, label]) => [
            key,
            responses.filter(value => value === label).length
        ])),
        adlerGestures: days.filter(day => {
            const gesture = String(day.adler_gesto || "").trim();
            return gesture !== "" && !gesture.startsWith("➖");
        }).length,
        weeksObserved: weeks.length,
        weeksClosed: weeks.filter(week => week.status === "closed").length,
        readings: weeks
            .filter(week => week.fato_semana || week.padrao_act_adler || week.ajuste_minimo)
            .map(week => ({
                link: week.file && week.file.link,
                name: week.file && week.file.name,
                fact: week.fato_semana || "—",
                pattern: week.padrao_act_adler || "—",
                adjustment: week.ajuste_minimo || "—"
            }))
    };
}

if (typeof dv !== "undefined") {
    const current = dv.current();
    const quarter = String(current.quarter || ((String(current.file.name).match(/\d{4}-Q[1-4]/) || [])[0] || ""));
    const match = quarter.match(/(\d{4})-Q([1-4])/);
    if (!match || typeof moment === "undefined") {
        dv.paragraph("> [!warning] Não foi possível identificar o trimestre desta nota.");
    } else {
        const startMonth = (Number(match[2]) - 1) * 3;
        const start = moment(`${match[1]}-${String(startMonth + 1).padStart(2, "0")}-01`, "YYYY-MM-DD");
        const end = start.clone().add(3, "months").subtract(1, "day");
        const summary = summarizeQuarterActAdler({
            quarter,
            startISO: start.format("YYYY-MM-DD"),
            endISO: end.format("YYYY-MM-DD"),
            days: dv.pages('"300 - RUNTIME/302 - Daymiss/Day"'),
            weeks: dv.pages('"300 - RUNTIME/302 - Daymiss/Week"')
        });

        dv.paragraph(
            `**🎈 ACT:** agi com a experiência ${summary.act.acted} · evitei e retornei ${summary.act.returned} · ` +
            `registros com retorno ainda aberto ${summary.act.pendingReturn} · sem barreira relevante ${summary.act.noBarrier}`
        );
        dv.paragraph(
            `**🤝 Adler:** ${summary.adlerGestures} gesto(s) de participação/contribuição · ` +
            `**Semanas interpretadas:** ${summary.weeksClosed}/${summary.weeksObserved}`
        );
        if (summary.readings.length) {
            dv.table(["Semana", "Fato", "Padrão ACT/Adler", "Ajuste mínimo"], summary.readings.map(row => [
                row.link || row.name || "—", row.fact, row.pattern, row.adjustment
            ]));
        } else {
            dv.paragraph("*Ainda não há reviews semanais interpretados neste trimestre.*");
        }
        dv.paragraph("*Ausência de registro não é falha. O painel informa padrões; não cria dívida, streak ou obrigação de compensar.*");
    }
}
