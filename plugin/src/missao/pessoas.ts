/**
 * As pessoas do dia (P9, §8.9): quem está no `pessoas` de cada Day, o último dia em que uma
 * pessoa aparece e as pessoas de uma passagem.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §8.9) e o plano (3d.5): "um campo na
 * Day, a lista das pessoas, ligada às notas de pessoa"; "quando houver alguém, uma marca no nó
 * do dia, e também no da cidade". O "Último encontro" da nota da pessoa continua do 👤 (um dono
 * por campo): o painel da pessoa mostra o último dia em que ela aparece, calculado aqui, e nada
 * é gravado na nota dela.
 *
 * Módulo puro: sem Obsidian. Prova: tests/missao/pessoas.test.ts.
 */
import { fold } from '../project/projectCanvasModel';
import { linkNames } from '../engine/temporada';
import type { NotaComCampos, NotaDePeriodo } from './entrada';
import type { Passagem, PessoaDaMissao } from './tipos';
import { addDays, diaComAno } from './tempo';
import { REGISTRO } from './frases';
import { ehDia } from './formatos';

/** O prefixo do id do nó de uma pessoa (o painel dela). */
export const PREFIXO_DA_PESSOA = 'h:';

/** O que faz: o id do painel de uma pessoa, pelo caminho da nota dela. */
export const idDaPessoa = (caminho: string) => `${PREFIXO_DA_PESSOA}${caminho}`;

/** O que faz: as notas de pessoa como a Missão as mostra, em ordem de nome. */
export function pessoasDaMissao(notas: readonly NotaComCampos[]): PessoaDaMissao[] {
    return notas.map(n => ({ id: idDaPessoa(n.caminho), nome: n.nome, caminho: n.caminho }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * O que faz: as pessoas de um dia (os links do `pessoas` da Day), cada uma com a nota quando
 * ela existe; o nome que não é nota de pessoa fica, sem id.
 * Erro e ataque: campo ausente, texto solto, link com alias ou caminho, o mesmo nome duas vezes.
 */
export function pessoasDoDia(dias: Record<string, NotaDePeriodo>, dia: string, conhecidas: readonly PessoaDaMissao[]): PessoaDaMissao[] {
    const vistos = new Set<string>();
    const out: PessoaDaMissao[] = [];
    for (const nome of linkNames(dias?.[dia]?.campos?.pessoas)) {
        const k = fold(nome);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        out.push(conhecidas.find(p => fold(p.nome) === k) ?? { id: '', nome, caminho: null });
    }
    return out;
}

/**
 * O que faz: os dias em que uma pessoa aparece no `pessoas` das Days, do mais novo ao mais velho.
 * Por quê: o painel da pessoa mostra o último dia, calculado (o "Último encontro" é do 👤).
 */
export function diasDaPessoa(dias: Record<string, NotaDePeriodo>, nome: string): string[] {
    const k = fold(nome);
    if (!k) return [];
    return Object.keys(dias ?? {}).filter(d => linkNames(dias[d]?.campos?.pessoas).some(n => fold(n) === k)).sort().reverse();
}

/**
 * O que faz: as pessoas de uma passagem: as dos dias dela (da chegada ao último dia, ou até hoje
 * na aberta), sem repetir, na ordem em que apareceram.
 * Erro e ataque: passagem sem chegada válida dá nada; a aberta não passa de hoje.
 */
export function pessoasDaPassagem(dias: Record<string, NotaDePeriodo>, passagem: Passagem, hoje: string, conhecidas: readonly PessoaDaMissao[]): PessoaDaMissao[] {
    const fim = passagem.ate ?? hoje;
    const vistos = new Set<string>();
    const out: PessoaDaMissao[] = [];
    if (!ehDia(passagem.de)) return out;
    for (let d = passagem.de, guarda = 0; d <= fim && guarda < 400; d = addDays(d, 1), guarda++) {
        for (const p of pessoasDoDia(dias, d, conhecidas)) {
            const k = fold(p.nome);
            if (!vistos.has(k)) { vistos.add(k); out.push(p); }
        }
    }
    return out;
}

/** O que faz: o link de um item da lista (o objeto `{ uid, reltype }` do TaskNotes, pelo `uid`). */
const linkDoItem = (v: unknown) => String((v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).uid : v) ?? '').trim();

/**
 * O que faz: a lista do campo com mais uma nota (o "＋ Adicionar" de um campo de várias notas, e a
 * nota nova quando o protocolo dono termina): os links que já estão, como estão (o objeto do
 * TaskNotes também), e `[[nome]]` no fim; `null` quando ela já está (nada a gravar).
 * Erro e ataque: campo ausente, texto solto (vira um link da lista), alias, nome vazio, o objeto
 * `{ uid, reltype }` (fica como está, e o `uid` conta para "já está").
 * Prova: tests/missao/pessoas.test.ts ("a pessoa nova no dia").
 */
export function comNotaNoCampo(atual: unknown, nome: string): unknown[] | null {
    const limpo = String(nome ?? '').trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
    if (!limpo) return null;
    const itens = (Array.isArray(atual) ? atual : atual === undefined || atual === null || atual === '' ? [] : [atual]).filter(v => linkDoItem(v) !== '');
    if (linkNames(itens.map(linkDoItem)).some(n => fold(n) === fold(limpo))) return null;
    return [...itens.map(v => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : /^\[\[.*\]\]$/.test(linkDoItem(v)) ? linkDoItem(v) : `[[${linkDoItem(v)}]]`)), `[[${limpo}]]`];
}

/**
 * O que faz: a linha de uma pessoa: o último dia em que ela aparece no registro, ou que ela ainda
 * não está em nenhum dia; a mesma no painel dela e no cartão dela (30/10, uma conta só).
 * Entra → sai: os dias dela, o mais novo primeiro (`diasDaPessoa`) → o texto.
 */
export function linhaDaPessoa(dias: readonly string[]): string {
    return dias[0] ? `${REGISTRO.ultimoDia}: ${diaComAno(dias[0])}` : REGISTRO.emNenhumDia;
}
