/*
 * cycle_dashboard.js
 * Script único e parametrizado para os dashboards de Semana / Trimestre / Ano.
 * Substitui as ~6 cópias de lógica de datas do Week modelo e os dashboards
 * inline do Trimestral/Long-Term (Plano de Melhoria — Bases Temporais v2, §4.6).
 *
 * Uso (dentro de um bloco ```dataviewjs``` numa nota de ciclo):
 *   dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "week" })
 *   dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "quarter" })
 *   dv.view("200 - FUNCTIONS/Scripts/cycle_dashboard", { scope: "year", target: "2026" })
 *
 * Se "target" não for passado, é inferido do frontmatter/nome da nota atual
 * (campo "week" ou "quarter", ou o próprio file.name).
 *
 * Princípio de arquitetura: painéis leem, nunca pedem. Se faltar dado, mostra
 * "—", nunca erro nem tabela vazia sem explicação.
 */
try {
    const cur = dv.current();
    const inp = (typeof input !== 'undefined' && input) ? input : {};
    let scope = inp.scope;
    let target = inp.target;

    // --- Inferir escopo/alvo a partir da nota atual, se não vier explícito ---
    if (!scope) {
        if (/^\d{4}-W\d{2}$/.test(cur.file.name)) scope = "week";
        else if (/^\d{4}-Q\d$/.test(cur.file.name)) scope = "quarter";
        else if (cur.type === "longterm_note" || /LongTerm/i.test(cur.file.name)) scope = "year";
    }
    if (!target) {
        target = cur.week || cur.quarter || cur.file.name;
    }

    const hasLuxon = typeof luxon !== 'undefined';
    const hasMoment = typeof moment !== 'undefined';

    function toMillis(dt) {
        if (dt === undefined || dt === null) return null;
        if (typeof dt.toMillis === 'function') return dt.toMillis();
        if (typeof dt.valueOf === 'function') return dt.valueOf();
        const parsed = Date.parse(String(dt));
        return isNaN(parsed) ? null : parsed;
    }

    function parseVal(v) {
        if (v === undefined || v === null || v === "") return 0;
        if (Array.isArray(v)) return v.reduce((s, x) => s + parseVal(x), 0);
        if (typeof v === 'number') return v;
        const m = v.toString().match(/(\d+)/);
        return m ? parseInt(m[0]) : 0;
    }

    // --- Resolver janela de datas 1x (sem parse por arquivo) ---
    let start, end, label;

    if (scope === "week") {
        const m = String(target).match(/(\d{4})-W(\d{2})/);
        if (!m) { dv.paragraph("⚠️ *cycle_dashboard*: não há semana válida para exibir ainda (crie/abra uma nota `YYYY-Www`)."); return; }
        const year = parseInt(m[1]), week = parseInt(m[2]);
        if (hasLuxon) {
            start = luxon.DateTime.fromObject({ weekYear: year, weekNumber: week }).startOf('week');
            end = start.endOf('week');
        } else if (hasMoment) {
            start = moment().year(year).isoWeek(week).startOf('isoWeek');
            end = moment(start).endOf('isoWeek');
        } else { dv.paragraph("—"); return; }
        label = `Semana ${m[1]}-W${m[2]}`;
    } else if (scope === "quarter") {
        const m = String(target).match(/(\d{4})-Q(\d)/);
        if (!m) { dv.paragraph("⚠️ *cycle_dashboard*: não há trimestre válido para exibir ainda (crie/abra uma nota `YYYY-Qn`)."); return; }
        const year = parseInt(m[1]), q = parseInt(m[2]);
        const startMonth = (q - 1) * 3 + 1;
        if (hasLuxon) {
            start = luxon.DateTime.local(year, startMonth, 1).startOf('day');
            end = start.plus({ months: 3 }).minus({ days: 1 }).endOf('day');
        } else if (hasMoment) {
            start = moment(`${year}-${String(startMonth).padStart(2, '0')}-01`, "YYYY-MM-DD").startOf('day');
            end = moment(start).add(3, 'months').subtract(1, 'days').endOf('day');
        } else { dv.paragraph("—"); return; }
        label = `Trimestre ${m[1]}-Q${m[2]}`;
    } else if (scope === "year") {
        const m = String(target).match(/(\d{4})/);
        const year = m ? parseInt(m[1]) : (hasMoment ? moment().year() : new Date().getFullYear());
        if (hasLuxon) {
            start = luxon.DateTime.local(year, 1, 1).startOf('day');
            end = luxon.DateTime.local(year, 12, 31).endOf('day');
        } else if (hasMoment) {
            start = moment(`${year}-01-01`, "YYYY-MM-DD").startOf('day');
            end = moment(`${year}-12-31`, "YYYY-MM-DD").endOf('day');
        } else { dv.paragraph("—"); return; }
        label = `Ano ${year}`;
    } else {
        dv.paragraph("⚠️ *cycle_dashboard*: escopo inválido. Use `{scope: 'week'|'quarter'|'year'}`.");
        return;
    }

    const startMs = toMillis(start);
    const endMs = toMillis(end);
    const nowMs = Date.now();

    // --- Coletar dias do período (match exato de frontmatter, com fallback por data) ---
    const dayPages = dv.pages('"300 - RUNTIME/302 - Daymiss/Day"')
        .where(p => {
            if (scope === "week" && p.week) return p.week === target;
            if (scope === "quarter" && p.quarter) return p.quarter === target;
            const d = p.file.day;
            if (!d) return false;
            const ms = toMillis(d);
            return ms !== null && ms >= startMs && ms <= endMs;
        })
        .sort(p => p.file.name, "asc");

    // ECH: a média é só sobre os dias com registro daquela dimensão. Dia sem `ech_*`
    // é ausência de dado, não leitura de energia (a mesma regra do ech_telemetry.js):
    // sem nenhum registro, o painel mostra "—", nunca 0.0.
    const registrado = v => v !== undefined && v !== null && String(v).trim() !== "";
    let echE = 0, echC = 0, echH = 0, echEDays = 0, echCDays = 0, echHDays = 0, ratingSum = 0, ratingCount = 0, dayCount = 0;
    const colheita = [];
    for (const p of dayPages) {
        dayCount++;
        if (registrado(p.ech_expansion)) { echE += parseVal(p.ech_expansion); echEDays++; }
        if (registrado(p.ech_complexity)) { echC += parseVal(p.ech_complexity); echCDays++; }
        if (registrado(p.ech_harmony)) { echH += parseVal(p.ech_harmony); echHDays++; }
        // `rating` mudou de significado em 2026-07-22: era nota pessoal 0-10 ("dei o
        // meu melhor?"), virou CONTAGEM dos três gestos do núcleo (0-3). Misturar as
        // duas escalas produziria uma média sem sentido, então a média usa só os
        // valores da escala nova; dias antigos continuam visíveis na Colheita.
        if (p.rating !== undefined && p.rating !== null && p.rating !== "") {
            const valor = parseVal(p.rating);
            if (valor <= 3) {
                ratingSum += valor;
                ratingCount++;
            }
        }
        colheita.push([
            p.file.link,
            p.conquistas && p.conquistas !== "" ? p.conquistas : "—",
            p.aprendizados && p.aprendizados !== "" ? p.aprendizados : "—",
            (p.rating !== undefined && p.rating !== null && p.rating !== "") ? p.rating : "—"
        ]);
    }

    const avgE = echEDays ? (echE / echEDays).toFixed(1) : "—";
    const avgC = echCDays ? (echC / echCDays).toFixed(1) : "—";
    const avgH = echHDays ? (echH / echHDays).toFixed(1) : "—";
    const echNota = n => (n ? `${n} dia(s) com registro` : "sem registro");
    const avgRating = ratingCount ? (ratingSum / ratingCount).toFixed(1) : "—";

    const cappedEndMs = Math.min(endMs, nowMs);
    const totalDays = Math.max(1, Math.round((cappedEndMs - startMs) / 86400000) + 1);

    // --- Estado factual da execução semanal: entrega SMART e ações são níveis distintos ---
    let temp = null;
    if (scope === "week") {
        // TaskNotes inteiro: a SMART concluída vai para TaskNotes/Archive (às vezes com
        // `archived: true`) e precisa continuar contando como entregue na semana dela.
        const tasks = dv.pages('"TaskNotes"')
            .where(t => t.week === target || t.semana_target === target);
        // Cancelada sai do denominador: desistir conscientemente é decisão, não atraso.
        const smart = tasks.where(t => String(t.type || '') === 'tarefa_smart' && t.status !== "cancelled");
        const atomic = tasks.where(t => String(t.type || 'task') !== 'tarefa_smart');
        temp = {
            smartTotal: smart.length,
            smartDone: smart.where(t => t.status === "done").length,
            atomicOpen: atomic.where(t => !["done", "cancelled"].includes(String(t.status || ''))).length,
            atomicDone: atomic.where(t => t.status === "done").length
        };
    }

    // Modo "numeros": a forma de mostrar da semana e a linha de SMART entregues, para o
    // topo da nota da semana. A forma de mostrar vem da função única do dfm-system
    // (`nucleo.formaDaSemana`, a mesma do canvas e do painel); este script não conta.
    // O painel completo continua mais abaixo na mesma nota.
    if (inp.mode === "numeros") {
        if (scope === "week") {
            const nucleo = (typeof app !== 'undefined') ? app.plugins?.plugins?.['dfm-system']?.nucleo : null;
            const forma = nucleo?.formaDaSemana?.(String(target).match(/\d{4}-W\d{2}/)?.[0] ?? '');
            dv.paragraph(forma ? `📊 **A semana:** ${forma.text}` : "📊 **A semana:** sem leitura (o dfm-system não está carregado ou a semana não tem o formato AAAA-Www).");
        }
        // Com os 2 números escolhidos no trimestre (`metricas_chave`, o 🧭), quem os mostra
        // é o `week_act_adler` (modo "numeros"); aqui fica só a linha da semana. Sem
        // escolha, a leitura padrão continua com as SMART entregues.
        const semanaId = String(target).match(/\d{4}-W\d{2}/)?.[0];
        const trimestreDaSemana = (semanaId && hasMoment) ? moment(semanaId, "GGGG-[W]WW", true).isoWeekday(4).format("YYYY-[Q]Q") : null;
        const notaTrimestre = trimestreDaSemana ? dv.page(`300 - RUNTIME/302 - Daymiss/Quarterly/${trimestreDaSemana}.md`) : null;
        const metricas = notaTrimestre ? notaTrimestre.metricas_chave : null;
        const escolheu = Array.isArray(metricas) || (metricas && typeof metricas !== "string" && typeof metricas[Symbol.iterator] === "function")
            ? Array.from(metricas).some(item => String(item || "").trim() !== "")
            : String(metricas || "").trim() !== "";
        if (scope === "week" && escolheu) return;
        if (temp) {
            dv.paragraph(`🎯 **SMART entregues:** ${temp.smartDone}/${temp.smartTotal} *(teto: 3)*`);
        } else {
            dv.paragraph("🎯 **SMART entregues:** —");
        }
        return;
    }

    // ---------------- RENDER ----------------

    let html = `
<div style="margin-bottom:14px; font-size:0.78em; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">📊 ${label}</div>

<div style="display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
  <div style="flex:1; min-width:90px; background:rgba(156,39,176,0.05); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(156,39,176,0.15);">
    <div style="font-size:1.4em; font-weight:bold; color:#9c27b0;">${avgE}</div>
    <div style="font-size:0.68em; text-transform:uppercase; color:var(--text-muted);">🚀 Expansão</div>
    <div style="font-size:0.62em; color:var(--text-faint);">${echNota(echEDays)}</div>
  </div>
  <div style="flex:1; min-width:90px; background:rgba(0,150,136,0.05); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(0,150,136,0.15);">
    <div style="font-size:1.4em; font-weight:bold; color:#009688;">${avgC}</div>
    <div style="font-size:0.68em; text-transform:uppercase; color:var(--text-muted);">🧠 Complexidade</div>
    <div style="font-size:0.62em; color:var(--text-faint);">${echNota(echCDays)}</div>
  </div>
  <div style="flex:1; min-width:90px; background:rgba(76,175,80,0.05); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(76,175,80,0.15);">
    <div style="font-size:1.4em; font-weight:bold; color:#4caf50;">${avgH}</div>
    <div style="font-size:0.68em; text-transform:uppercase; color:var(--text-muted);">⚖️ Harmonia</div>
    <div style="font-size:0.62em; color:var(--text-faint);">${echNota(echHDays)}</div>
  </div>
  <div style="flex:1; min-width:90px; background:rgba(33,150,243,0.05); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(33,150,243,0.15);">
    <div style="font-size:1.4em; font-weight:bold; color:#2196f3;">${avgRating}</div>
    <div style="font-size:0.68em; text-transform:uppercase; color:var(--text-muted);">🔁 Núcleo médio (de 3)</div>
  </div>
  <div style="flex:1; min-width:90px; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; text-align:center; border:1px solid rgba(255,255,255,0.08);">
    <div style="font-size:1.4em; font-weight:bold; color:var(--text-normal);">${dayCount}/${totalDays}</div>
    <div style="font-size:0.68em; text-transform:uppercase; color:var(--text-muted);">📅 Dias rastreados</div>
  </div>
</div>
`;

    if (temp) {
        html += `
<div style="background:rgba(15,15,15,0.4); border:1px solid rgba(255,106,0,0.15); border-radius:8px; padding:14px; margin-bottom:16px;">
  <div style="font-size:0.8em; font-weight:bold; text-transform:uppercase; color:#ffa366; margin-bottom:8px;">Execução da semana</div>
  <div style="font-size:0.82em; color:#ddd;">🎯 Entregas SMART: <strong>${temp.smartDone}/${temp.smartTotal}</strong> concluídas · ⚡ Ações: <strong>${temp.atomicDone}</strong> concluídas e <strong>${temp.atomicOpen}</strong> abertas</div>
  <div style="font-size:0.72em; color:#bbb; margin-top:6px;">A conclusão de uma entrega é decidida pelo critério suficiente na revisão semanal, não por uma porcentagem automática.</div>
</div>
`;
    }

    dv.paragraph(html);

    if (colheita.length > 0) {
        dv.header(4, "🌾 Colheita (direto do frontmatter dos dias)");
        dv.table(["Dia", "🏆 Conquistas", "💡 Aprendizados", "🔁 Núcleo (0-3)"], colheita);
    } else {
        dv.paragraph("*Nenhum dia com telemetria registrada neste período ainda — os painéis aparecem assim que a Revisão Diária for rodada nos dias correspondentes.*");
    }
} catch (e) {
    dv.paragraph("⚠️ cycle_dashboard: painel indisponível no momento (" + e.message + "). Nenhuma ação necessária — tente reabrir a nota.");
}
