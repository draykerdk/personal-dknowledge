/**
 * O par de valores da semana (regra de 25/10/2026): um valor de cada grupo como
 * prioridade para cada semana, com a hierarquia de importância entre eles mudando a cada
 * trimestre; a escolha sai sorteada ou por uma regra, e depois quem usa pode editar e
 * escolher outro.
 *
 * Cada semana tem `valor_semana` (um dos `valores` da nota do trimestre, os da pessoa) e
 * `valor_relacao` (um dos `valores_relacoes`, os das relações). A sugestão de cada grupo
 * é um sorteio com peso pela ordem do trimestre (os pesos vêm da tabela única,
 * `pesos.valor_da_semana`: o primeiro, o segundo e o terceiro), sem repetir o valor da
 * semana anterior no mesmo grupo, e fixo para a semana: a semente é a semana ISO, então
 * reabrir a nota não troca a sugestão. Ele troca no 🌳 quando quiser.
 *
 * Sem a lista `valores` no trimestre, o valor da semana volta à rotação de seis
 * (`((semana ISO − 1) mod 6) + 1`, a ordem das notas de valor); sem `valores_relacoes`,
 * não há sugestão para as relações.
 *
 * Módulo puro: quem lê as notas é o chamador (`nucleoService.ts`). Prova:
 * tests/engine/valorSemana.test.ts.
 */
import { linkName, listOf } from './decisionWeights';
import { partesDaSemana } from './periodo';

export type GrupoValor = 'valor' | 'relacao';

/** Um valor fundamental com a ordem da rotação de seis (`ordem` da nota em 400 - MEMORY/Valores). */
export interface ValorFundamental {
    nome: string;
    ordem: number;
}

/** De onde veio a sugestão de um grupo. */
export type RegraValor = 'sorteio' | 'unico' | 'rotacao' | 'nenhum';

export interface SugestaoGrupo {
    nome: string | null;
    regra: RegraValor;
}

export interface ParValores {
    valor: string | null;
    relacao: string | null;
}

export interface ParSemana extends ParValores {
    regras: { valor: RegraValor; relacao: RegraValor };
}

export interface EntradaPar {
    /** `AAAA-Www`. */
    semana: string;
    /** `valores` da nota do trimestre, na ordem dela (links ou nomes). */
    valores: unknown;
    /** `valores_relacoes` da nota do trimestre, na ordem dela. */
    relacoes: unknown;
    /** O par da semana anterior (o da nota dela; sem ele, a sugestão dela). */
    anterior?: Partial<ParValores> | null;
    /** O peso de cada posição da ordem (o primeiro, o segundo, o terceiro…); a posição além da lista leva o último. */
    pesos: readonly number[];
    /** Os seis valores fundamentais, para a rotação de quando a lista está vazia. */
    seis: readonly ValorFundamental[];
}

function fold(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * O que faz: os nomes de uma lista de links, na ordem, sem vazios nem repetidos. O texto
 * com vários links (`"[[A]], [[B]]"`, como o multiselect gravava) dá um nome por link.
 */
export function nomesDaLista(value: unknown): string[] {
    const out: string[] = [];
    for (const item of listOf(value)) {
        const links = typeof item === 'string' ? [...item.matchAll(/\[\[[^\[\]]+\]\]/g)].map(m => m[0]) : [];
        for (const one of links.length > 1 ? links : [item]) {
            const nome = linkName(one);
            if (nome && !out.some(n => fold(n) === fold(nome))) out.push(nome);
        }
    }
    return out;
}

/** O número da semana ISO de `AAAA-Www`; ilegível → `null`. */
function numeroDaSemana(semana: string): number | null {
    return partesDaSemana(String(semana ?? '').trim())?.semana ?? null;
}

/**
 * O que faz: o valor da rotação de seis: a semana ISO n pede o valor de ordem
 * `((n − 1) mod 6) + 1`.
 * Por quê: é a regra de antes (04/08/2026), e continua valendo quando o trimestre não
 * declara a lista de valores.
 * Entra → sai: semana e os seis → o nome, ou `null` (semana ilegível ou ordem ausente).
 */
export function rotacaoDeSeis(semana: string, seis: readonly ValorFundamental[]): string | null {
    const n = numeroDaSemana(semana);
    if (n === null) return null;
    const ordem = ((n - 1) % 6) + 1;
    return (seis || []).find(v => Number(v?.ordem) === ordem)?.nome ?? null;
}

/**
 * O que faz: um número em [0, 1) fixo para a semana e o grupo (FNV-1a de 32 bits como
 * semente, um passo do mulberry32).
 * Por quê: a sugestão é sorteio, mas não pode mudar quando a nota reabre.
 */
export function sorteioDaSemana(semana: string, grupo: GrupoValor): number {
    let h = 0x811c9dc5;
    for (const ch of `${semana}|${grupo}`) {
        h ^= ch.codePointAt(0)!;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    let t = (h + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** O peso da posição `i` (0 = a primeira); além da lista de pesos, o último; negativo ou ilegível vale 0. */
function pesoDa(i: number, pesos: readonly number[]): number {
    const lista = (pesos || []).filter(p => typeof p === 'number' && Number.isFinite(p));
    if (!lista.length) return 1;
    const p = lista[Math.min(i, lista.length - 1)];
    return p > 0 ? p : 0;
}

/**
 * O que faz: a sugestão de um grupo: sorteio com peso pela ordem da lista, sem o valor
 * da semana anterior.
 * Entra → sai: semana, grupo, lista, o anterior e os pesos → { nome, regra }.
 * Erro e ataque: lista vazia → `nenhum`; lista de 1 → ela mesma (`unico`), ainda que
 * repita a semana anterior (não há outra); todos os pesos zerados → pesos iguais.
 */
export function sugerirDoGrupo(semana: string, grupo: GrupoValor, lista: unknown, anterior: string | null | undefined, pesos: readonly number[]): SugestaoGrupo {
    const nomes = nomesDaLista(lista);
    if (!nomes.length) return { nome: null, regra: 'nenhum' };
    if (nomes.length === 1) return { nome: nomes[0], regra: 'unico' };
    const antes = fold(linkName(anterior ?? ''));
    let candidatos = nomes.map((nome, i) => ({ nome, peso: pesoDa(i, pesos) })).filter(c => !antes || fold(c.nome) !== antes);
    if (candidatos.every(c => c.peso === 0)) candidatos = candidatos.map(c => ({ ...c, peso: 1 }));
    const total = candidatos.reduce((s, c) => s + c.peso, 0);
    let alvo = sorteioDaSemana(semana, grupo) * total;
    for (const c of candidatos) {
        if (c.peso === 0) continue;
        if (alvo < c.peso) return { nome: c.nome, regra: 'sorteio' };
        alvo -= c.peso;
    }
    return { nome: candidatos.filter(c => c.peso > 0).pop()!.nome, regra: 'sorteio' };
}

/**
 * O que faz: o par sugerido de uma semana.
 * Por quê: a Week nasce com o par já escolhido, e ele edita no 🌳 (25/10/2026).
 * Entra → sai: a semana, as duas listas do trimestre, o par anterior, os pesos e os
 * seis → { valor, relacao, regras }. Sem `valores`, o valor vem da rotação de seis;
 * sem `valores_relacoes`, a relação fica `null`. Semana ilegível → par vazio.
 */
export function parDaSemana(entrada: EntradaPar): ParSemana {
    const semana = String(entrada?.semana ?? '').trim();
    if (numeroDaSemana(semana) === null) return { valor: null, relacao: null, regras: { valor: 'nenhum', relacao: 'nenhum' } };
    const anterior = entrada.anterior ?? null;
    let valor = sugerirDoGrupo(semana, 'valor', entrada.valores, anterior?.valor, entrada.pesos);
    if (valor.regra === 'nenhum') {
        const nome = rotacaoDeSeis(semana, entrada.seis);
        valor = { nome, regra: nome ? 'rotacao' : 'nenhum' };
    }
    const relacao = sugerirDoGrupo(semana, 'relacao', entrada.relacoes, anterior?.relacao, entrada.pesos);
    return { valor: valor.nome, relacao: relacao.nome, regras: { valor: valor.regra, relacao: relacao.regra } };
}

/**
 * O que faz: a sugestão de `alvo` em cadeia, a partir da primeira semana do trimestre:
 * o anterior de cada semana é o par da nota dela (o que a pessoa escolheu) e, sem nota ou
 * sem o campo, a sugestão dela.
 * Por quê: "sem repetir o valor da semana anterior" precisa do anterior mesmo quando a
 * Week anterior ainda não existe; a cadeia começa no trimestre, então é finita e fixa.
 * Entra → sai: as semanas do trimestre até `alvo` (em ordem; `alvo` fora delas → só ele),
 * o par da semana antes da primeira (ou `null`), o par de cada nota e o resto da
 * entrada → { sugestao, anterior }.
 */
export function parEmCadeia(
    alvo: string,
    semanas: readonly string[],
    antesDaPrimeira: Partial<ParValores> | null,
    daNota: (semana: string) => Partial<ParValores> | null,
    base: Omit<EntradaPar, 'semana' | 'anterior'>,
): { sugestao: ParSemana; anterior: ParValores | null } {
    const ate = semanas.indexOf(alvo);
    const caminho = ate >= 0 ? semanas.slice(0, ate + 1) : [alvo];
    let anterior: ParValores | null = antesDaPrimeira
        ? { valor: antesDaPrimeira.valor || null, relacao: antesDaPrimeira.relacao || null }
        : null;
    for (const semana of caminho) {
        const sugestao = parDaSemana({ ...base, semana, anterior });
        if (semana === alvo) return { sugestao, anterior };
        const nota = daNota(semana);
        anterior = { valor: nota?.valor || sugestao.valor, relacao: nota?.relacao || sugestao.relacao };
    }
    return { sugestao: parDaSemana({ ...base, semana: alvo, anterior }), anterior };
}

/** As posições da ordem do trimestre, como a tabela única as nomeia (`pesos.valor_da_semana`). */
export const POSICOES_DA_ORDEM = ['primeiro', 'segundo', 'terceiro'] as const;

/**
 * O que faz: os pesos do sorteio, lidos do bloco `pesos.valor_da_semana` da tabela única
 * (`{ primeiro, segundo, terceiro }`), na ordem das posições.
 * Por quê: "a tabela de pesos é uma só, num lugar só" (3.7); os números são dele.
 * Entra → sai: o JSON da tabela → { pesos, problemas }. Sem o bloco, ou com posição sem
 * número, `pesos` vazio (todos pesam igual) e o problema dito.
 */
export function pesosDaTabela(raw: unknown): { pesos: number[]; problemas: string[] } {
    const bloco = (raw as any)?.pesos?.valor_da_semana;
    if (!bloco || typeof bloco !== 'object' || Array.isArray(bloco)) {
        return { pesos: [], problemas: ['pesos.valor_da_semana não existe na tabela: os valores pesam igual'] };
    }
    const pesos: number[] = [];
    for (const posicao of POSICOES_DA_ORDEM) {
        const n = bloco[posicao];
        if (typeof n !== 'number' || !Number.isFinite(n)) {
            return { pesos: [], problemas: [`pesos.valor_da_semana.${posicao} não é número: os valores pesam igual`] };
        }
        pesos.push(n);
    }
    return { pesos, problemas: [] };
}
