/**
 * O sistema inteiro no tempo e o período da visão: os dois níveis mais largos da expansão da pinça
 * antes do grafo do Obsidian.
 *
 * Por quê: a escada da expansão (30/10/2026): depois da visão do ano vem a visão geral do período da
 * visão de longo prazo, depois uma visão do sistema todo, do começo até agora, e depois o grafo do
 * Obsidian. A versão mínima e honesta: o sistema é a
 * linha dos anos e dos trimestres desde a primeira nota de período do cofre (a Day, a Week ou a nota
 * do trimestre mais antiga) até hoje, cada trimestre com o que já se conta sem dado novo (as notas de
 * período e as tarefas feitas e abertas dele); a linha do ECH de cada trimestre chega da borda
 * (`nucleo.ech`), só lida. O longo prazo é o período da visão vigente: os anos que o horizonte dela cobre.
 *
 * Módulo puro: sem DOM nem Obsidian; nada aqui lê o cofre. Prova: tests/missao/sistema.test.ts.
 */
import { ehDia, ehTrimestre } from './formatos';
import { addQuarters, chaveDeHoje, trimestreDoDia } from './tempo';
import { quarterOfWeek } from '../engine/calendario';
import type { LinhaDoSistema, TrimestreDoSistema, VisaoVigente } from './tipos';
import { ehSemana } from './formatos';

/** Quantos trimestres a linha do sistema traz, no máximo (os mais novos; o resto conta em `antes`). */
export const TRIMESTRES_DO_SISTEMA = 40;

/** O que a linha do sistema lê: as chaves das notas de período e o trimestre de cada tarefa (com se está feita ou aberta). */
export interface FontesDoSistema {
    dias: readonly string[];
    semanas: readonly string[];
    trimestres: readonly string[];
    tarefas: ReadonlyArray<{ trimestre: string | null; feita: boolean; aberta: boolean }>;
}


/**
 * O que faz: a linha do sistema do começo até hoje: os trimestres desde o da nota de período mais
 * antiga até o de hoje, agrupados por ano, cada um com as notas de período e as tarefas dele.
 * Por quê: o nível Sistema da escada (30/10), do começo até agora, sem dado novo.
 * Entra → sai: as fontes e hoje → `LinhaDoSistema` (os anos do mais novo ao mais antigo).
 * Erro e ataque: chave malformada não conta; nota de período no futuro não muda o começo nem o fim
 * (a linha vai até hoje); sem nota nenhuma, `desde` é `null` e a linha tem só o trimestre de hoje;
 * a linha tem no máximo `TRIMESTRES_DO_SISTEMA` trimestres (os mais novos), o resto conta em `antes`.
 * Prova: tests/missao/sistema.test.ts.
 */
export function linhaDoSistema(f: FontesDoSistema, hoje: string): LinhaDoSistema {
    const agora = chaveDeHoje('trimestre', hoje);
    const porTrimestre = new Map<string, TrimestreDoSistema>();
    const de = (q: string | null) => {
        if (!q || !ehTrimestre(q) || q > agora) return null;
        let t = porTrimestre.get(q);
        if (!t) { t = { chave: q, notas: 0, feitas: 0, abertas: 0, temNota: false, atual: q === agora }; porTrimestre.set(q, t); }
        return t;
    };
    for (const d of f.dias) { const t = de(ehDia(d) ? trimestreDoDia(d) : null); if (t) t.notas++; }
    for (const w of f.semanas) { const t = de(ehSemana(w) ? quarterOfWeek(w) : null); if (t) t.notas++; }
    for (const q of f.trimestres) { const t = de(q); if (t) { t.notas++; t.temNota = true; } }
    const comNota = [...porTrimestre.values()].filter(t => t.notas > 0).map(t => t.chave).sort();
    const desde = comNota[0] ?? null;
    for (const x of f.tarefas) { const t = de(x.trimestre); if (t) { if (x.feita) t.feitas++; else if (x.aberta) t.abertas++; } }
    // Do trimestre de hoje para trás, até o começo (ou até o teto).
    const chaves: string[] = [];
    for (let q = agora, i = 0; i < 400 && (!desde || q >= desde); q = addQuarters(q, -1), i++) { chaves.push(q); if (!desde) break; }
    const mostrados = chaves.slice(0, TRIMESTRES_DO_SISTEMA);
    const anos: LinhaDoSistema['anos'] = [];
    for (const q of mostrados) {
        const t = porTrimestre.get(q) ?? { chave: q, notas: 0, feitas: 0, abertas: 0, temNota: false, atual: q === agora };
        const ano = q.slice(0, 4);
        const a = anos[anos.length - 1];
        if (a && a.ano === ano) a.trimestres.unshift(t); else anos.push({ ano, trimestres: [t] });
    }
    return { desde, anos, antes: chaves.length - mostrados.length };
}

/**
 * O que faz: o período da visão de longo prazo: os anos que o horizonte dela cobre, a partir do ano da
 * versão vigente (sem data, o de hoje); sem número no horizonte, três anos (o 🔭 oferece três).
 * Por quê: o nível Longo prazo da escada (30/10) é a visão geral do período da visão de longo prazo.
 * Entra → sai: a visão vigente e hoje → `{ anos, de, ate }`.
 * Erro e ataque: horizonte absurdo (zero, negativo, mais de 30) cai nos três anos.
 * Prova: tests/missao/sistema.test.ts ("o período da visão").
 */
export function periodoDaVisao(visao: Pick<VisaoVigente, 'horizonte' | 'data'>, hoje: string): { anos: string[]; de: string; ate: string } {
    const n = Number(String(visao.horizonte ?? '').match(/\d+/)?.[0] ?? NaN);
    const total = Number.isInteger(n) && n >= 1 && n <= 30 ? n : 3;
    const inicio = Number((visao.data && /^\d{4}/.test(visao.data) ? visao.data : hoje).slice(0, 4));
    const anos = Array.from({ length: total }, (_, i) => String(inicio + i));
    return { anos, de: anos[0], ate: anos[anos.length - 1] };
}
