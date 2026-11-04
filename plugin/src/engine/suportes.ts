/**
 * A seção `Suportes e decisões` de uma nota de período (02/11): a seção da Week e a da nota do trimestre, lidas
 * do texto, sem cópia.
 *
 * Por quê: decidido em 02/11/2026 (LACUNAS_Ramos_Semana_Trimestre_vs_Canvas, resposta 3): reunir tudo
 * faz sentido, com uma seção em cada semana e o trimestre reunindo todas. Cada
 * Week tem a seção dela; a do trimestre tem a sua e reúne as das semanas dele, lendo cada uma. O ramo da
 * semana e o do trimestre na Missão mostram a seção; a nota do trimestre mostra a reunião pelo núcleo
 * (`nucleo.suportesDoTrimestre`). Uma leitura só, aqui, para os dois.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/suportes.test.ts.
 */

/** O título da seção nas notas (o emoji e o nível do título não contam). */
export const SECAO_DOS_SUPORTES = 'Suportes e decisões';

/**
 * Um item da seção: o texto da linha (os links pelo nome que mostram), a linha como está escrita (com os
 * links, sem a marca da lista), os links dela (o alvo de cada `[[…]]`, sem o alias) e a linha na nota.
 */
export interface ItemDeSuporte { texto: string; bruto: string; links: string[]; linha: number }

const TITULO = /^(#{1,6})\s+(.*)$/;
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * O que faz: as linhas do corpo de uma seção da nota: da linha depois do título que contém `titulo` até o
 * próximo título do mesmo nível ou acima, sem os blocos de código (as consultas) e sem os comentários.
 * Entra → sai: o texto da nota e o título → as linhas, com o número de cada uma (0 = a primeira da nota);
 * vazio sem a seção.
 * Erro e ataque: texto que não é texto dá vazio; o título que só aparece dentro de um bloco de código não
 * conta; o título se acha sem acento, sem caixa e com qualquer emoji antes.
 */
export function linhasDaSecao(texto: unknown, titulo: string): Array<{ texto: string; linha: number }> {
    if (typeof texto !== 'string' || !titulo) return [];
    const linhas = texto.split(/\r?\n/);
    const alvo = dobrar(titulo);
    let nivel = 0;
    let dentro = false;
    let cerca = false;
    const out: Array<{ texto: string; linha: number }> = [];
    for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (/^\s*(```|~~~)/.test(l)) { cerca = !cerca; continue; }
        if (cerca) continue;
        const t = l.match(TITULO);
        if (t) {
            if (dentro && t[1].length <= nivel) break;
            if (!dentro && dobrar(t[2]).includes(alvo)) { dentro = true; nivel = t[1].length; continue; }
        }
        if (dentro && !/^\s*<!--.*-->\s*$/.test(l)) out.push({ texto: l, linha: i });
    }
    return out;
}

/**
 * O que faz: os itens dos "Suportes e decisões" de uma nota: cada linha com conteúdo da seção (o item da
 * lista, ou a linha solta com um link), sem a marca da lista, com os links dela.
 * Entra → sai: o texto da nota → os itens, na ordem da nota.
 * Erro e ataque: o item vazio ("- "), a linha em itálico só (a explicação do modelo), a citação, o
 * subtítulo e o separador não são itens; sem a seção, vazio.
 * Prova: tests/engine/suportes.test.ts.
 */
export function suportesDoTexto(texto: unknown): ItemDeSuporte[] {
    const out: ItemDeSuporte[] = [];
    for (const { texto: l, linha } of linhasDaSecao(texto, SECAO_DOS_SUPORTES)) {
        const cru = l.trim();
        if (!cru || TITULO.test(cru) || /^(>|---+$|\*\*\*+$)/.test(cru)) continue;
        const item = cru.replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '').trim();
        const ehItem = item !== cru || /^[-*+]$/.test(cru);
        if (!item || /^[-*+]$/.test(item)) continue;
        // A linha toda em itálico é a explicação do modelo, não um item (o item da lista em itálico conta).
        if (!ehItem && /^\*[^*].*\*$|^_[^_].*_$/.test(item)) continue;
        const links = [...item.matchAll(LINK)].map(m => m[1].trim()).filter(Boolean);
        out.push({ texto: item.replace(LINK, (_m, alvo: string, alias?: string) => (alias ?? alvo).trim()), bruto: item, links, linha });
    }
    return out;
}
