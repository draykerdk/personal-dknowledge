/**
 * As exposições da semana (o plano de uma área, 22/10/2026, seção 3).
 *
 * A meta: 3 exposições por semana, de qualquer trilha, com pelo menos 1 de ideias
 * enquanto uma obra estiver em divulgação (decisão de 21/10). A Week mostra a linha
 * "🎭 Exposições" na forma de mostrar, com as feitas por trilha:
 *   "2 feitas (🤝 1 · 💡 1) · 2/3 do plano · faltam 1"
 * A contagem é a do núcleo (`contarRegistros`, tipo `exposicao`); a linha sai da função
 * única da forma de mostrar (`grammarText`, em `showGrammar.ts`), a mesma do cartão da
 * SMART e dos canvas.
 */
import { grammarText } from './showGrammar';

/** O tipo do registro de exposição (o protocolo de exposição e o 📤 de uma peça publicada). */
export const EXPOSICAO_TIPO = 'exposicao';

/** As trilhas, na ordem da árvore, com o ícone de cada uma. */
export const TRILHAS_EXPOSICAO: ReadonlyArray<{ chave: string; icone: string }> = [
    { chave: 'social', icone: '🤝' },
    { chave: 'ideias', icone: '💡' },
    { chave: 'mundo', icone: '🌍' },
];

export interface ExposicoesSemana {
    /** Todas as exposições da semana (com ou sem trilha). */
    feitas: number;
    porTrilha: Record<string, number>;
    meta: number;
    metaIdeias: number;
    /** Quantas das feitas cumprem a meta (a de ideias reserva o seu lugar). */
    planoFeitas: number;
    faltam: number;
    /** Quantas de ideias ainda faltam para a meta de ideias. */
    faltamIdeias: number;
    linha: string;
}

function inteiro(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * O que faz: a conta e a linha das exposições de uma semana.
 * Regra: das feitas, as de ideias contam primeiro; as outras preenchem só os lugares
 * que não são da meta de ideias. Ex.: meta 3 com 1 de ideias e 3 sociais → 2/3 do plano,
 * faltam 1 (1 de 💡). O que está zerado não aparece (a gramática de mostrar).
 * Entra → sai: o total da semana, a contagem por trilha, a meta e a meta de ideias →
 * os números e a linha.
 * Erro e ataque: número negativo, texto ou ausente vale 0; meta de ideias maior que a meta
 * fica na meta.
 * Prova: tests/engine/exposicoes.test.ts.
 */
export function exposicoesSemana(feitas: number, porTrilha: Record<string, number>, meta: number, metaIdeias = 0): ExposicoesSemana {
    const total = inteiro(feitas);
    const plano = inteiro(meta);
    const reservaIdeias = Math.min(inteiro(metaIdeias), plano);
    const contagem: Record<string, number> = {};
    for (const { chave } of TRILHAS_EXPOSICAO) contagem[chave] = inteiro(porTrilha?.[chave]);
    const ideias = Math.min(contagem.ideias, total);
    const outras = total - ideias;
    const planoFeitas = Math.min(plano, Math.min(ideias, plano) + Math.min(outras, plano - reservaIdeias));
    const faltam = plano - planoFeitas;
    const faltamIdeias = Math.max(0, reservaIdeias - ideias);

    const partes = grammarText({ feitas: total, planoFeitas, plano, faltam, fora: 0, algumDia: 0 }).split(' · ');
    const detalhe = TRILHAS_EXPOSICAO.filter(t => contagem[t.chave]).map(t => `${t.icone} ${contagem[t.chave]}`).join(' · ');
    if (total && detalhe) partes[0] = `${partes[0]} (${detalhe})`;
    if (faltamIdeias) {
        const at = partes.findIndex(parte => parte.startsWith('faltam'));
        if (at >= 0) partes[at] = `${partes[at]} (${faltamIdeias} de 💡)`;
    }
    const linha = total === 0 && plano === 0 ? '' : partes.join(' · ');
    return { feitas: total, porTrilha: contagem, meta: plano, metaIdeias: reservaIdeias, planoFeitas, faltam, faltamIdeias, linha };
}
