/**
 * As três contagens do ECH (012, §3, "Os dois eixos"; Carta 003, com as definições de
 * 29/10/2026): a expansão (o que entrou), a complexidade (quanto disso foi organizado e
 * ligado, e o que está solto) e a harmonia (as contradições resolvidas e abertas, os
 * atritos registrados e os dias que captaram e executaram).
 *
 * São contagens de fatos de um período, nunca nota da pessoa, e um fator não se
 * multiplica pelo outro (decisões de 16/10 e 29/10). O que conta em cada fator mora em
 * `200 - FUNCTIONS/Config/ech.json`, com o porquê de cada fonte: este módulo só lê o que
 * o arquivo declara, e o relógio não entra (o período chega pronto).
 *
 * Módulo puro: sem Obsidian. Quem lê o cofre é `nucleoService.ts` (`nucleo.ech`); a linha
 * sai da função única de mostrar (`echText`, `showGrammar.ts`). A gêmea da forma do
 * arquivo é `ech_problems` em `200 - FUNCTIONS/Scripts/audit_architecture.py`, com os
 * mesmos casos (tests/fixtures/ech/casos.json).
 * Prova: tests/engine/ech.test.ts.
 */
import { fieldText } from './choose';
import { dayOf } from './decisionWeights';
import { sectionOwnLines } from './diaryReader';
import { isRecordPathCounted, matchesRecord } from './records';
import { isTriageCapture, normalizeTags } from './inboxRules';
import { DIA } from './dia';

/** Onde mora o arquivo que declara o que conta. */
export const ECH_CONFIG_PATH = '200 - FUNCTIONS/Config/ech.json';

/** O período da conta, `AAAA-MM-DD`, os dois inclusivos. */
export interface Periodo {
    desde: string;
    ate: string;
}

/** Uma nota do cofre como a conta a lê. */
export interface NotaDoCofre {
    path: string;
    frontmatter?: Record<string, any> | null;
    /** O texto, só das notas que a conta pede (`precisaDeTexto`). */
    texto?: string;
    /** Quantas notas do cofre ela aponta (links do texto e do frontmatter). */
    ligacoes?: number;
    /** A data de criação do arquivo, `AAAA-MM-DD`. */
    criadaEm?: string;
}

export type Condicao =
    | { campo: string; preenchido: boolean }
    | { campo: string; em: string[] }
    | { ligada: boolean }
    | { todas: Condicao[] }
    | { alguma: Condicao[] }
    | { nao: Condicao }
    /** A nota tem a etiqueta em `tags` (lista ou texto com vírgulas, com ou sem `#`). */
    | { etiqueta: string };

interface Base { id: string; rotulo: string; porque: string }
export interface FonteNotas extends Base {
    tipo: 'notas';
    pastas: string[];
    types: string[];
    data: string[];
    soCapturas: boolean;
    foraDasPastas: string[];
    ignorar: Condicao | null;
}
export interface FonteSecoes extends Base { tipo: 'secoes'; pastas: string[]; secoes: Array<{ de: string; ate: string[] }> }
export interface FonteRegistros extends Base { tipo: 'registros'; registro: string }
export interface FontePrimeiraVez extends Base { tipo: 'primeira_vez'; pastas: string[]; campo: string }
export type FonteExpansao = FonteNotas | FonteSecoes | FonteRegistros | FontePrimeiraVez;

export interface RegraComplexidade { fonte: string; organizado: Condicao | null; porque: string }
export interface FonteEstado extends Base {
    tipo: 'notas_com_estado';
    pastas: string[];
    data: string[];
    campoEstado: string;
    abertos: string[];
    resolvidos: string[];
    resolvidoEm: string;
    /** Só as notas que passam por esta condição (a etiqueta da contradição). */
    filtro: Condicao | null;
}
export interface FonteTabela extends Base { tipo: 'linhas_de_tabela'; nota: string; secao: string; data: string[] }
export interface RegraDias {
    rotulo: string;
    diario: string;
    tarefas: { pastas: string[]; data: string; campoEstado: string; feitos: string[] };
    porque: string;
}

export interface EchConfig {
    expansao: FonteExpansao[];
    complexidade: RegraComplexidade[];
    contradicoes: Array<FonteEstado | FonteTabela>;
    atritos: FonteNotas[];
    dias: RegraDias | null;
    fora: Array<{ oQue: string; porque: string }>;
}

export interface EchContagem {
    expansao: { porTipo: Record<string, number>; total: number };
    complexidade: {
        organizado: number;
        solto: number;
        porTipo: Record<string, { organizado: number; solto: number }>;
        /** Os caminhos do que entrou e está solto, na ordem do caminho. */
        soltos: string[];
    };
    harmonia: {
        resolvidas: number;
        abertas: number;
        atritos: number;
        diasFluidos: number;
        porTipo: Record<string, { resolvidas: number; abertas: number }>;
    };
    porque: string[];
}

const SNAKE = /^[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------------------
// A leitura do arquivo (gêmea de `ech_problems`, audit_architecture.py)
// ---------------------------------------------------------------------------
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []);
/** A pasta: texto ('' é o cofre inteiro) ou lista de textos; outra coisa → null. */
function pastasDe(v: unknown): string[] | null {
    if (typeof v === 'string') return [v.trim().replace(/\/+$/, '')];
    if (Array.isArray(v) && v.length && v.every(x => typeof x === 'string' && x.trim())) return v.map(x => x.trim().replace(/\/+$/, ''));
    return null;
}

/**
 * O que faz: confere uma condição do arquivo e a devolve lida (ou `null`, com o problema).
 * Entra → sai: o valor cru, onde está e a lista de problemas (acrescida) → a condição.
 */
export function lerCondicao(raw: any, onde: string, problemas: string[]): Condicao | null {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if (Array.isArray(raw.todas) || Array.isArray(raw.alguma)) {
            const chave = Array.isArray(raw.todas) ? 'todas' : 'alguma';
            const partes = (raw[chave] as any[]).map((c, i) => lerCondicao(c, `${onde}.${chave}[${i}]`, problemas));
            if (!partes.length || partes.some(p => !p)) {
                if (!partes.length) problemas.push(`${onde}: \`${chave}\` precisa de condições`);
                return null;
            }
            return chave === 'todas' ? { todas: partes as Condicao[] } : { alguma: partes as Condicao[] };
        }
        if ('nao' in raw) {
            const dentro = lerCondicao(raw.nao, `${onde}.nao`, problemas);
            return dentro ? { nao: dentro } : null;
        }
        if (typeof raw.ligada === 'boolean') return { ligada: raw.ligada };
        if (texto(raw.etiqueta).replace(/^#/, '')) return { etiqueta: texto(raw.etiqueta).replace(/^#/, '') };
        if (texto(raw.campo) && typeof raw.preenchido === 'boolean') return { campo: texto(raw.campo), preenchido: raw.preenchido };
        if (texto(raw.campo) && Array.isArray(raw.em) && lista(raw.em).length) return { campo: texto(raw.campo), em: lista(raw.em) };
    }
    problemas.push(`${onde}: condição desconhecida`);
    return null;
}

const TIPOS_EXPANSAO = ['notas', 'secoes', 'registros', 'primeira_vez'];

/** A fonte de notas (a da expansão e a dos atritos), ou `null` com o problema. */
function lerFonteNotas(raw: any, onde: string, id: string, rotulo: string, porque: string, problemas: string[]): FonteNotas | null {
    const pastas = pastasDe(raw.pasta);
    const data = lista(raw.data);
    if (!pastas || !data.length) {
        problemas.push(`${onde}: a fonte ${id} precisa de pasta e data`);
        return null;
    }
    const ignorar = raw.ignorar === undefined ? null : lerCondicao(raw.ignorar, `${onde}.ignorar`, problemas);
    // A fonte com a condição errada fica de fora: ignorar nada contaria a mais.
    if (raw.ignorar !== undefined && !ignorar) return null;
    return {
        id, rotulo, porque, tipo: 'notas', pastas, data,
        types: lista(raw.type), soCapturas: raw.so_capturas === true, foraDasPastas: lista(raw.fora_das_pastas).map(p => p.replace(/\/+$/, '')), ignorar,
    };
}

/** O id, o rótulo e o porquê comuns a toda fonte; `null` (com o problema) se falta algum. */
function lerBase(raw: any, onde: string, ids: Set<string>, problemas: string[]): Base | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        problemas.push(`${onde}: a fonte precisa ser um objeto`);
        return null;
    }
    const id = texto(raw.id);
    if (!SNAKE.test(id)) {
        problemas.push(`${onde}: a fonte precisa de id em snake_case`);
        return null;
    }
    if (ids.has(id)) {
        problemas.push(`${onde}: a fonte ${id} se repete`);
        return null;
    }
    const rotulo = texto(raw.rotulo);
    const porque = texto(raw.porque);
    if (!rotulo || !porque) {
        problemas.push(`${onde}: a fonte ${id} precisa de rotulo e porque`);
        return null;
    }
    ids.add(id);
    return { id, rotulo, porque };
}

function lerExpansao(raw: any, onde: string, ids: Set<string>, problemas: string[]): FonteExpansao | null {
    const base = lerBase(raw, onde, ids, problemas);
    if (!base) return null;
    const tipo = texto(raw.tipo);
    if (!TIPOS_EXPANSAO.includes(tipo)) {
        problemas.push(`${onde}: o tipo '${tipo}' não existe (${TIPOS_EXPANSAO.join(', ')})`);
        return null;
    }
    if (tipo === 'notas') return lerFonteNotas(raw, onde, base.id, base.rotulo, base.porque, problemas);
    if (tipo === 'registros') {
        const registro = texto(raw.registro);
        if (!SNAKE.test(registro)) {
            problemas.push(`${onde}: a fonte ${base.id} precisa de registro em snake_case`);
            return null;
        }
        return { ...base, tipo, registro };
    }
    const pastas = pastasDe(raw.pasta);
    if (tipo === 'secoes') {
        const secoes = (Array.isArray(raw.secoes) ? raw.secoes : [])
            .filter((s: any) => texto(s?.de))
            .map((s: any) => ({ de: texto(s.de), ate: lista(s.ate) }));
        if (!pastas || !secoes.length) {
            problemas.push(`${onde}: a fonte ${base.id} precisa de pasta e secoes (com de)`);
            return null;
        }
        return { ...base, tipo, pastas, secoes };
    }
    const campo = texto(raw.campo);
    if (!pastas || !campo) {
        problemas.push(`${onde}: a fonte ${base.id} precisa de pasta e campo`);
        return null;
    }
    return { ...base, tipo: 'primeira_vez', pastas, campo };
}

function lerContradicao(raw: any, onde: string, ids: Set<string>, problemas: string[]): FonteEstado | FonteTabela | null {
    const base = lerBase(raw, onde, ids, problemas);
    if (!base) return null;
    const tipo = texto(raw.tipo);
    const data = lista(raw.data);
    if (tipo === 'notas_com_estado') {
        const pastas = pastasDe(raw.pasta);
        const campoEstado = texto(raw.campo_estado);
        const resolvidoEm = texto(raw.resolvido_em);
        const abertos = lista(raw.abertos);
        const resolvidos = lista(raw.resolvidos);
        if (!pastas || !data.length || !campoEstado || !resolvidoEm || !abertos.length || !resolvidos.length) {
            problemas.push(`${onde}: a fonte ${base.id} precisa de pasta, data, campo_estado, abertos, resolvidos e resolvido_em`);
            return null;
        }
        const filtro = raw.filtro === undefined ? null : lerCondicao(raw.filtro, `${onde}.filtro`, problemas);
        // A fonte com o filtro errado fica de fora: sem ele, toda nota da pasta contaria.
        if (raw.filtro !== undefined && !filtro) return null;
        return { ...base, tipo, pastas, data, campoEstado, abertos, resolvidos, resolvidoEm, filtro };
    }
    if (tipo === 'linhas_de_tabela') {
        const nota = texto(raw.nota);
        const secao = texto(raw.secao);
        if (!nota || !secao || !data.length) {
            problemas.push(`${onde}: a fonte ${base.id} precisa de nota, secao e data`);
            return null;
        }
        return { ...base, tipo, nota, secao, data };
    }
    problemas.push(`${onde}: o tipo '${tipo}' não existe (notas_com_estado, linhas_de_tabela)`);
    return null;
}

/**
 * O que faz: lê o `ech.json` e diz os problemas da forma, com as mesmas mensagens e na
 * mesma ordem de `ech_problems` (o juiz da bancada).
 * Por quê: o que conta em cada fator se ajusta no arquivo, sem código (desde 29/10/2026:
 * ajustável, também por um usuário futuro); a forma errada é dita, e a fonte com problema
 * fica de fora da conta em vez de contar errado.
 * Entra → sai: o JSON cru → { config (ou `null` sem nenhuma fonte de expansão), problemas }.
 * Erro e ataque: não objeto, listas que não são listas, id repetido ou fora do snake_case,
 * tipo inventado, condição desconhecida, regra que aponta fonte que não existe.
 * Prova: tests/engine/ech.test.ts ("os casos do juiz") e test_architecture_ech_cases.
 */
export function lerEch(raw: unknown): { config: EchConfig | null; problemas: string[] } {
    const problemas: string[] = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { config: null, problemas: ['o ech.json não é um objeto JSON'] };
    const r = raw as Record<string, any>;
    const expansao: FonteExpansao[] = [];
    const idsE = new Set<string>();
    if (!Array.isArray(r.expansao)) problemas.push('expansao: precisa ser uma lista');
    else r.expansao.forEach((f: any, i: number) => { const lida = lerExpansao(f, `expansao[${i}]`, idsE, problemas); if (lida) expansao.push(lida); });

    const complexidade: RegraComplexidade[] = [];
    const vistas = new Set<string>();
    if (!Array.isArray(r.complexidade)) problemas.push('complexidade: precisa ser uma lista');
    else r.complexidade.forEach((c: any, i: number) => {
        const onde = `complexidade[${i}]`;
        const fonte = texto(c?.fonte);
        const porque = texto(c?.porque);
        const alvo = expansao.find(f => f.id === fonte);
        if (!alvo) { problemas.push(`${onde}: a fonte '${fonte}' não está na expansão`); return; }
        if (alvo.tipo !== 'notas') { problemas.push(`${onde}: a fonte '${fonte}' não é de notas`); return; }
        if (vistas.has(fonte)) { problemas.push(`${onde}: a fonte '${fonte}' se repete`); return; }
        if (!porque) { problemas.push(`${onde}: a regra de '${fonte}' precisa de porque`); return; }
        if (!c || !('organizado' in c)) { problemas.push(`${onde}: a regra de '${fonte}' precisa de organizado (uma condição, ou null: tudo solto)`); return; }
        const organizado = c.organizado === null ? null : lerCondicao(c.organizado, `${onde}.organizado`, problemas);
        if (c.organizado !== null && !organizado) return;
        vistas.add(fonte);
        complexidade.push({ fonte, organizado, porque });
    });

    const h = r.harmonia;
    const contradicoes: Array<FonteEstado | FonteTabela> = [];
    const atritos: FonteNotas[] = [];
    let dias: RegraDias | null = null;
    if (!h || typeof h !== 'object' || Array.isArray(h)) problemas.push('harmonia: precisa ser um objeto');
    else {
        const idsC = new Set<string>();
        if (!Array.isArray(h.contradicoes)) problemas.push('harmonia.contradicoes: precisa ser uma lista');
        else h.contradicoes.forEach((f: any, i: number) => { const lida = lerContradicao(f, `harmonia.contradicoes[${i}]`, idsC, problemas); if (lida) contradicoes.push(lida); });
        const idsA = new Set<string>();
        if (!Array.isArray(h.atritos)) problemas.push('harmonia.atritos: precisa ser uma lista');
        else h.atritos.forEach((f: any, i: number) => {
            const onde = `harmonia.atritos[${i}]`;
            const base = lerBase(f, onde, idsA, problemas);
            if (!base) return;
            if (texto(f.tipo) !== 'notas') { problemas.push(`${onde}: o tipo '${texto(f.tipo)}' não existe (notas)`); return; }
            const lida = lerFonteNotas(f, onde, base.id, base.rotulo, base.porque, problemas);
            if (lida) atritos.push(lida);
        });
        const d = h.dias;
        if (d !== undefined) {
            const t = d?.tarefas;
            const pastas = pastasDe(t?.pasta);
            const diario = texto(d?.diario);
            if (!texto(d?.rotulo) || !texto(d?.porque) || !pastas || !texto(t?.data) || !texto(t?.campo_estado) || !lista(t?.feitos).length) {
                problemas.push('harmonia.dias: precisa de rotulo, porque, diario e tarefas (pasta, data, campo_estado, feitos)');
            } else if (!expansao.some(f => f.id === diario && f.tipo === 'secoes')) {
                problemas.push(`harmonia.dias: o diario '${diario}' não é uma fonte de secoes da expansão`);
            } else {
                dias = { rotulo: texto(d.rotulo), diario, porque: texto(d.porque), tarefas: { pastas, data: texto(t.data), campoEstado: texto(t.campo_estado), feitos: lista(t.feitos) } };
            }
        }
    }

    const fora: Array<{ oQue: string; porque: string }> = [];
    if (r.fora !== undefined && !Array.isArray(r.fora)) problemas.push('fora: precisa ser uma lista');
    else (r.fora ?? []).forEach((f: any, i: number) => {
        if (!texto(f?.o_que) || !texto(f?.porque)) problemas.push(`fora[${i}]: precisa de o_que e porque`);
        else fora.push({ oQue: texto(f.o_que), porque: texto(f.porque) });
    });

    if (!expansao.length) {
        problemas.push('expansao: nenhuma fonte válida');
        return { config: null, problemas };
    }
    return { config: { expansao, complexidade, contradicoes, atritos, dias, fora }, problemas };
}

// ---------------------------------------------------------------------------
// A conta
// ---------------------------------------------------------------------------
const nomeDe = (path: string) => path.split('/').pop()!.replace(/\.md$/, '');
const naPasta = (path: string, pastas: readonly string[]) => pastas.some(p => p === '' || path.startsWith(`${p}/`));
const noPeriodo = (dia: string, p: Periodo) => !!dia && dia >= p.desde && dia <= p.ate;
const preenchido = (v: unknown) => (Array.isArray(v) ? v.some(x => fieldText(x) !== '') : fieldText(v) !== '');
/** Uma chave de comparação: sem link, sem caixa e sem espaço nas pontas. */
const chave = (v: unknown) => fieldText(v).toLowerCase();
const valoresDe = (v: unknown) => (Array.isArray(v) ? v : [v]).map(chave).filter(Boolean);

/** O que faz: a condição vale para a nota? (campo preenchido, valor numa lista, nota com link). */
export function vale(c: Condicao, nota: NotaDoCofre): boolean {
    const fm = nota.frontmatter ?? {};
    if ('todas' in c) return c.todas.every(x => vale(x, nota));
    if ('alguma' in c) return c.alguma.some(x => vale(x, nota));
    if ('nao' in c) return !vale(c.nao, nota);
    if ('ligada' in c) return ((nota.ligacoes ?? 0) > 0) === c.ligada;
    if ('etiqueta' in c) return normalizeTags(fm.tags).map(t => t.replace(/^#/, '').toLowerCase()).includes(c.etiqueta.toLowerCase());
    if ('preenchido' in c) return preenchido(fm[c.campo]) === c.preenchido;
    const aceitos = c.em.map(x => x.toLowerCase());
    return valoresDe(fm[c.campo]).some(v => aceitos.includes(v));
}

/** O que faz: a data de uma nota pelos campos declarados, na ordem ('nome', 'criada' ou um campo). */
function dataDaNota(nota: NotaDoCofre, campos: readonly string[]): string {
    for (const campo of campos) {
        const dia = campo === 'nome' ? dayOf(nomeDe(nota.path))
            : campo === 'criada' ? dayOf(nota.criadaEm)
                : dayOf(nota.frontmatter?.[campo]);
        if (dia) return dia;
    }
    return '';
}

/** As notas de uma fonte de notas, sem olhar o período. */
function notasDaFonte(f: FonteNotas, cofre: readonly NotaDoCofre[]): NotaDoCofre[] {
    return cofre.filter(n => n.path.endsWith('.md')
        && naPasta(n.path, f.pastas)
        && !f.foraDasPastas.some(p => n.path.startsWith(`${p}/`))
        && (!f.types.length || f.types.includes(fieldText(n.frontmatter?.type)))
        && (!f.soCapturas || isTriageCapture(nomeDe(n.path)))
        && !(f.ignorar && vale(f.ignorar, n)));
}

/** As Days (nome `AAAA-MM-DD`) das pastas. */
const daysDe = (pastas: readonly string[], cofre: readonly NotaDoCofre[]) =>
    cofre.filter(n => naPasta(n.path, pastas) && DIA.test(nomeDe(n.path)));

/** As Days do período com texto escrito numa das seções. */
function diasComTexto(f: FonteSecoes, cofre: readonly NotaDoCofre[], p: Periodo): NotaDoCofre[] {
    return daysDe(f.pastas, cofre).filter(n => noPeriodo(nomeDe(n.path), p)
        && f.secoes.some(s => sectionOwnLines(n.texto ?? '', s.de, s.ate).length > 0));
}

/** Uma coisa que entrou: a nota (na primeira vez, a Day da primeira vez), o dia e o valor. */
interface Entrada { nota: NotaDoCofre; dia: string; valor?: string }

/** O que faz: as coisas que entraram no período por uma fonte (as notas; na primeira vez, a Day de cada valor novo). */
function entraram(f: FonteExpansao, cofre: readonly NotaDoCofre[], p: Periodo): Entrada[] {
    if (f.tipo === 'notas') {
        return notasDaFonte(f, cofre).map(nota => ({ nota, dia: dataDaNota(nota, f.data) })).filter(e => noPeriodo(e.dia, p));
    }
    if (f.tipo === 'secoes') return diasComTexto(f, cofre, p).map(nota => ({ nota, dia: nomeDe(nota.path) }));
    if (f.tipo === 'registros') {
        return cofre.filter(n => isRecordPathCounted(n.path) && matchesRecord(n.frontmatter, { tipo: f.registro, desde: p.desde, ate: p.ate }))
            .map(nota => ({ nota, dia: dayOf(nota.frontmatter?.data) }));
    }
    const primeira = new Map<string, { dia: string; nota: NotaDoCofre }>();
    for (const day of daysDe(f.pastas, cofre)) {
        const dia = nomeDe(day.path);
        for (const v of valoresDe(day.frontmatter?.[f.campo])) {
            const antes = primeira.get(v);
            if (!antes || dia < antes.dia) primeira.set(v, { dia, nota: day });
        }
    }
    return [...primeira.entries()].filter(([, e]) => noPeriodo(e.dia, p)).map(([valor, e]) => ({ nota: e.nota, dia: e.dia, valor }));
}

/** As linhas numeradas da tabela de uma seção ("| 1 | … |"). */
function linhasDaTabela(textoDaNota: string, secao: string): number {
    const lines = String(textoDaNota ?? '').replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith(secao));
    if (start < 0) return 0;
    const level = Math.max(1, (secao.match(/^#+/)?.[0].length) ?? 2);
    let n = 0;
    for (const raw of lines.slice(start + 1)) {
        const l = raw.trim();
        const h = l.match(/^(#+)\s/);
        if (h && h[1].length <= level) break;
        if (/^\|\s*\d+\s*\|/.test(l)) n++;
    }
    return n;
}

/**
 * O que faz: as notas cujo texto a conta lê no período: as Days das fontes de seções
 * dentro dele e as notas das tabelas.
 * Por quê: o serviço lê o texto só do que a conta pede, e não do cofre inteiro.
 * Entra → sai: o arquivo lido, o período e um caminho → sim ou não.
 * Prova: tests/engine/ech.test.ts ("só o que o arquivo declara").
 */
export function precisaDeTexto(config: EchConfig, periodo: Periodo, path: string): boolean {
    if (config.contradicoes.some(f => f.tipo === 'linhas_de_tabela' && f.nota === path)) return true;
    const nome = nomeDe(path);
    if (!DIA.test(nome) || !noPeriodo(nome, periodo)) return false;
    return config.expansao.some(f => f.tipo === 'secoes' && naPasta(path, f.pastas));
}

/** O fator do ECH em que um fato cai (a coluna da grade 3×3; 012, §3). */
export type FatorEch = 'expansao' | 'complexidade' | 'harmonia';
/** O grupo do `ech.json` de onde o fato vem. */
export type GrupoEch = 'expansao' | 'complexidade' | 'contradicoes' | 'atritos' | 'dias';
/**
 * O que o fato diz: entrou; está organizado ou solto; a contradição resolvida no período,
 * aberta no fim dele ou resolvida sem data (fora da conta do período); o atrito registrado;
 * o dia com registro e tarefa feita.
 */
export type EspecieDoFato = 'entrou' | 'organizado' | 'solto' | 'resolvida' | 'aberta' | 'resolvida_sem_data' | 'atrito' | 'dia_fluido';
/** O momento do ciclo (a linha da grade): planejar, executar, revisar, ou sem momento. */
export const SEM_MOMENTO = 'sem_momento';

/** Um fato do ECH: o fator, de onde veio, o que diz, o dia, a nota e o momento do ciclo. */
export interface FatoEch {
    fator: FatorEch;
    grupo: GrupoEch;
    /** O id da fonte no `ech.json` (`dias` na regra dos dias). */
    fonte: string;
    especie: EspecieDoFato;
    /** `AAAA-MM-DD`; vazio só na resolvida sem data. */
    dia: string;
    /** A nota do fato (na primeira vez, a Day da primeira vez; na tabela, a nota do registro). */
    path: string;
    /** Na primeira vez, o valor novo (a cidade, a pessoa). */
    valor?: string;
    /** O momento do ciclo, de quem o pediu (`momentoDe`); sem ele, `sem_momento`. */
    momento: string;
}

/** Quem dá o momento de um fato (a reputação: a `fase` do protocolo que o produziu, ou o padrão da fonte). */
export type MomentoDoFato = (fato: Omit<FatoEch, 'momento'>) => string;

/** O que faz: a chave de uma fonte do `ech.json` para quem a cita de fora ("expansao.ideias", "contradicoes.backlog", "dias"). */
export function chaveDaFonte(fato: Pick<FatoEch, 'grupo' | 'fonte'>): string {
    return fato.grupo === 'dias' ? 'dias' : `${fato.grupo}.${fato.fonte}`;
}

/**
 * O que faz: lista os fatos do ECH de um período, um por coisa contada: o que entrou (por
 * fonte), o que disso está organizado ou solto, as contradições resolvidas, abertas e
 * resolvidas sem data, os atritos registrados e os dias com registro e tarefa feita; cada
 * um com o fator e o momento do ciclo, a célula da grade 3×3.
 * Por quê: a reputação contextual passa pela grade ciclo × ECH (012, §3; proposta de
 * 29/10/2026), e cada fato precisa da sua célula; a conta (`contarEch`) é a contagem desta
 * lista, e uma regra só serve às duas.
 * Entra → sai: o período (`desde` e `ate`, inclusivos), as notas do cofre, o arquivo lido e,
 * se houver, quem dá o momento → `FatoEch[]`, na ordem do arquivo (a entrada não é mutada).
 * Nenhum relógio: o período vem de fora.
 * Erro e ataque: nota sem frontmatter, data inválida e período invertido não quebram (o
 * que não cai no período fica de fora); só as fontes declaradas são lidas; quem dá o
 * momento e devolve algo que não é texto deixa o fato sem momento.
 * Prova: tests/engine/ech.test.ts ("os fatos").
 */
export function fatosEch(periodo: Periodo, cofre: readonly NotaDoCofre[], config: EchConfig, momentoDe?: MomentoDoFato): FatoEch[] {
    const p = { desde: String(periodo?.desde ?? ''), ate: String(periodo?.ate ?? '') };
    const notas = (cofre || []).filter(n => n && typeof n.path === 'string');
    const fatos: FatoEch[] = [];
    const add = (f: Omit<FatoEch, 'momento'>) => {
        const m = momentoDe ? momentoDe(f) : SEM_MOMENTO;
        fatos.push({ ...f, momento: typeof m === 'string' && m ? m : SEM_MOMENTO });
    };

    const entradas = new Map<string, Entrada[]>();
    for (const f of config.expansao) {
        const lidas = entraram(f, notas, p);
        entradas.set(f.id, lidas);
        for (const e of lidas) add({ fator: 'expansao', grupo: 'expansao', fonte: f.id, especie: 'entrou', dia: e.dia, path: e.nota.path, ...(e.valor ? { valor: e.valor } : {}) });
    }

    for (const regra of config.complexidade) {
        for (const e of entradas.get(regra.fonte) ?? []) {
            const especie = regra.organizado && vale(regra.organizado, e.nota) ? 'organizado' : 'solto';
            add({ fator: 'complexidade', grupo: 'complexidade', fonte: regra.fonte, especie, dia: e.dia, path: e.nota.path });
        }
    }

    for (const f of config.contradicoes) {
        if (f.tipo === 'notas_com_estado') {
            for (const n of notas.filter(x => x.path.endsWith('.md') && naPasta(x.path, f.pastas) && (!f.filtro || vale(f.filtro, x)))) {
                const estado = chave(n.frontmatter?.[f.campoEstado]);
                const resolvida = f.resolvidos.map(x => x.toLowerCase()).includes(estado);
                const aberta = f.abertos.map(x => x.toLowerCase()).includes(estado);
                const em = dayOf(n.frontmatter?.[f.resolvidoEm]);
                const registrada = dataDaNota(n, f.data);
                const base = { fator: 'harmonia' as const, grupo: 'contradicoes' as const, fonte: f.id, path: n.path };
                if (resolvida && !em) add({ ...base, especie: 'resolvida_sem_data', dia: '' });
                if (resolvida && noPeriodo(em, p)) add({ ...base, especie: 'resolvida', dia: em });
                if (registrada && registrada <= p.ate && (aberta || (resolvida && em > p.ate))) add({ ...base, especie: 'aberta', dia: registrada });
            }
        } else {
            const nota = notas.find(x => x.path === f.nota);
            const dia = nota ? dataDaNota(nota, f.data) : '';
            const linhas = nota && dia && dia <= p.ate ? linhasDaTabela(nota.texto ?? '', f.secao) : 0;
            for (let i = 0; i < linhas; i++) add({ fator: 'harmonia', grupo: 'contradicoes', fonte: f.id, especie: 'aberta', dia, path: nota!.path });
        }
    }

    for (const f of config.atritos) {
        for (const n of notasDaFonte(f, notas)) {
            const dia = dataDaNota(n, f.data);
            if (noPeriodo(dia, p)) add({ fator: 'harmonia', grupo: 'atritos', fonte: f.id, especie: 'atrito', dia, path: n.path });
        }
    }

    if (config.dias) {
        const d = config.dias;
        const diario = config.expansao.find(f => f.id === d.diario) as FonteSecoes;
        const feitos = d.tarefas.feitos.map(x => x.toLowerCase());
        const comFeita = new Set(notas
            .filter(n => naPasta(n.path, d.tarefas.pastas) && feitos.includes(chave(n.frontmatter?.[d.tarefas.campoEstado])))
            .map(n => dayOf(n.frontmatter?.[d.tarefas.data]))
            .filter(Boolean));
        for (const n of diasComTexto(diario, notas, p)) {
            if (comFeita.has(nomeDe(n.path))) add({ fator: 'harmonia', grupo: 'dias', fonte: 'dias', especie: 'dia_fluido', dia: nomeDe(n.path), path: n.path });
        }
    }
    return fatos;
}

/**
 * O que faz: conta o ECH de um período: o que entrou (por fonte e o total), quanto disso
 * está organizado e ligado e o que está solto (com a lista), as contradições resolvidas e
 * abertas, os atritos registrados e os dias que captaram e executaram, e o porquê de cada
 * número. É a contagem da lista dos fatos (`fatosEch`).
 * Por quê: as três contagens do 012, §3 ("o que entrou · quanto disso foi organizado e
 * ligado · o que está em harmonia e o que está aberto"), lidas no 📅 e no 🔄 por momento e
 * por escala; contagem de fatos, sem nota da pessoa e sem multiplicar (29/10/2026).
 * Entra → sai: o período (`desde` e `ate`, inclusivos), as notas do cofre e o arquivo lido
 * → `EchContagem` (a entrada não é mutada). Nenhum relógio: o período vem de fora.
 * Erro e ataque: nota sem frontmatter, data inválida e período invertido não quebram (o
 * que não cai no período fica de fora); só as fontes declaradas são lidas, e uma nota que
 * nenhuma fonte declara não muda nada.
 * Prova: tests/engine/ech.test.ts.
 */
export function contarEch(periodo: Periodo, cofre: readonly NotaDoCofre[], config: EchConfig): EchContagem {
    const fatos = fatosEch(periodo, cofre, config);
    const quantos = (grupo: GrupoEch, fonte: string, especie: EspecieDoFato) =>
        fatos.filter(f => f.grupo === grupo && f.fonte === fonte && f.especie === especie).length;
    const porque: string[] = [];

    const porTipo: Record<string, number> = {};
    for (const f of config.expansao) {
        porTipo[f.id] = quantos('expansao', f.id, 'entrou');
        porque.push(`${f.rotulo}: ${porTipo[f.id]}`);
    }
    const total = Object.values(porTipo).reduce((a, b) => a + b, 0);

    let organizado = 0, solto = 0;
    const porTipoC: Record<string, { organizado: number; solto: number }> = {};
    for (const regra of config.complexidade) {
        const fonte = config.expansao.find(f => f.id === regra.fonte)!;
        const o = quantos('complexidade', regra.fonte, 'organizado');
        const s = quantos('complexidade', regra.fonte, 'solto');
        porTipoC[regra.fonte] = { organizado: o, solto: s };
        organizado += o;
        solto += s;
        porque.push(`${fonte.rotulo}: no lugar ${o}, soltas ${s}`);
    }
    const soltos = fatos.filter(f => f.especie === 'solto').map(f => f.path).sort();

    let resolvidas = 0, abertas = 0;
    const porTipoH: Record<string, { resolvidas: number; abertas: number }> = {};
    for (const f of config.contradicoes) {
        const r = quantos('contradicoes', f.id, 'resolvida');
        const a = quantos('contradicoes', f.id, 'aberta');
        const semData = quantos('contradicoes', f.id, 'resolvida_sem_data');
        porTipoH[f.id] = { resolvidas: r, abertas: a };
        resolvidas += r;
        abertas += a;
        porque.push(`${f.rotulo}: resolvidas ${r}, abertas ${a}${semData ? `; resolvidas sem data de resolução, fora da conta do período: ${semData}` : ''}`);
    }

    let atritos = 0;
    for (const f of config.atritos) {
        const n = quantos('atritos', f.id, 'atrito');
        atritos += n;
        porque.push(`${f.rotulo}: ${n}`);
    }

    let diasFluidos = 0;
    if (config.dias) {
        diasFluidos = quantos('dias', 'dias', 'dia_fluido');
        porque.push(`${config.dias.rotulo}: ${diasFluidos}`);
    }

    for (const f of config.fora) porque.push(`fora da conta: ${f.oQue} (${f.porque})`);

    return {
        expansao: { porTipo, total },
        complexidade: { organizado, solto, porTipo: porTipoC, soltos },
        harmonia: { resolvidas, abertas, atritos, diasFluidos, porTipo: porTipoH },
        porque,
    };
}
