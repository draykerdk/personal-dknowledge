/**
 * A busca da Missão (`/`): projetos, SMART e tarefas pelo título, e datas digitadas.
 *
 * Por quê: a busca do protótipo aprovado (template, 1646) e da fase 1 (`81095a6d`,
 * `searchMissao`): cada achado diz a escala e a linha onde mora, para a página levar o
 * foco até lá. Todas as palavras precisam aparecer (sem acento nem caixa).
 *
 * Módulo puro. Prova: tests/missao/busca.test.ts.
 */
import { fold } from '../project/projectCanvasModel';
import { weekDates } from '../engine/calendario';
import type { Achado, MissaoIndice } from './tipos';
import { DIA } from './formatos';
import { addDays, chaveDeHoje, diaDaSemana, diaMes, linhaDe, semanaCurta, type Escala, type Janela } from './tempo';

const validDate = (s: string) => DIA.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * O que faz: os achados de uma consulta: datas (`hoje`, `amanhã`, `29/10`,
 * `2026-10-29`), semanas (`W45`, `2026-W45`), trimestres (`Q4`, `2026-Q4`), anos
 * (`2026`) e, pelo título, projetos, SMART e ações (as abertas antes das feitas).
 * Entra → sai: índice, consulta, a escala à vista e a janela dela → até `limite` achados.
 * Erro e ataque: consulta vazia não acha nada; `31/02` não vira data; a ação cancelada
 * não aparece (é neutra).
 * Prova: tests/missao/busca.test.ts.
 */
export function buscar(indice: MissaoIndice, consulta: string, escala: Escala, janela: Janela, limite = 20): Achado[] {
    const q = fold(String(consulta ?? ''));
    if (!q) return [];
    const hoje = indice.hoje;
    const year = hoje.slice(0, 4);
    const hits: Achado[] = [];
    const dia = (d: string) => hits.push({ id: `d:${d}`, tipo: 'dia', titulo: `${diaDaSemana(d)} ${diaMes(d)}`, escala: 'dia', chave: d });

    if (q === 'hoje') dia(hoje);
    if (q === 'amanha') dia(addDays(hoje, 1));
    if (q === 'ontem') dia(addDays(hoje, -1));
    const dm = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    const date = dm ? `${dm[3] ?? year}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : DIA.test(q) ? q : null;
    if (date && validDate(date)) dia(date);
    const wm = q.match(/^(?:(\d{4})-)?w(\d{1,2})$/);
    if (wm) {
        const w = `${wm[1] ?? year}-W${wm[2].padStart(2, '0')}`;
        if (weekDates(w).length && Number(wm[2]) >= 1 && Number(wm[2]) <= 53) hits.push({ id: `w:${w}`, tipo: 'semana', titulo: semanaCurta(w), escala: 'semana', chave: w });
    }
    const qm = q.match(/^(?:(\d{4})-)?q([1-4])$/);
    if (qm) { const k = `${qm[1] ?? year}-Q${qm[2]}`; hits.push({ id: `q:${k}`, tipo: 'trimestre', titulo: k, escala: 'trimestre', chave: k }); }
    if (/^\d{4}$/.test(q)) hits.push({ id: `y:${q}`, tipo: 'ano', titulo: q, escala: 'ano', chave: q });

    const words = q.split(/\s+/).filter(Boolean);
    const match = (s: string) => { const f = fold(s); return words.every(w => f.includes(w)); };
    for (const p of indice.projetos.values()) {
        if (hits.length >= limite) break;
        if (match(p.nome)) hits.push({ id: p.id, tipo: p.tipo, titulo: p.nome, escala: 'trimestre', chave: chaveDeHoje('trimestre', hoje) });
    }
    const tasks = indice.vivas.filter(t => match(t.titulo))
        .sort((a, b) => (a.feita === b.feita ? 0 : a.feita ? 1 : -1) || (a.tipo === b.tipo ? 0 : a.tipo === 'smart' ? -1 : 1));
    for (const t of tasks) {
        if (hits.length >= limite) break;
        hits.push({ id: t.id, tipo: t.tipo === 'smart' ? 'SMART' : 'ação', titulo: t.titulo, escala, chave: linhaDe(t.colocacao, janela) ?? 'sem-data' });
    }
    return hits.slice(0, limite);
}
