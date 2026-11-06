/**
 * A base simplificada da reputação contextual (proposta e respostas dele de 29/10/2026;
 * pesquisa, §3; mapa dos tipos de função, §3).
 *
 * Cada fato com data do cofre cai numa célula da grade ciclo × ECH (012, §3, "Os dois
 * eixos") e é creditado a uma função de um tipo. A reputação da função começa no peso
 * inicial do tipo e cresce a cada passagem pela grade, contada uma vez por célula por
 * rodada, com o multiplicador da célula e o esquecimento pela meia-vida:
 *
 *   R = P₀ + Σ células multiplicador × Σ passagens 0,5^(idade em dias / meia-vida)
 *
 * O esquecimento desconta só as passagens: R nunca fica abaixo do P₀. A evidência fica à
 * parte (n, as rodadas com passagem, com o mesmo esquecimento) e dá o nível. O módulo vale
 * o nível da função mais fraca de que depende. A interrompida e o aberto aparecem e nunca
 * descontam. O sinal de aprendizado (o que a passagem produziu andou, está ligado a um
 * valor, fez um projeto avançar pela prioridade) é calculado e mostrado, e nunca muda
 * nenhum número.
 *
 * Tudo o que é valor mora em `200 - FUNCTIONS/Config/reputacao.json`, lido a cada uso. Este
 * módulo é puro: sem Obsidian e sem relógio (o dia de referência chega pronto). Quem lê o
 * cofre é `nucleoService.ts` (`nucleo.reputacao`). A gêmea da forma do arquivo é
 * `reputacao_problems` em `200 - FUNCTIONS/Scripts/audit_architecture.py`, com os mesmos
 * casos (tests/fixtures/reputacao/casos.json). Nada aqui ordena nem grava.
 * Prova: tests/engine/reputacao.test.ts.
 */
import { fieldText } from './choose';
import { dayOf } from './decisionWeights';
import { chaveDaFonte, lerCondicao, SEM_MOMENTO, vale, type Condicao, type EspecieDoFato, type FatoEch, type MomentoDoFato, type NotaDoCofre } from './ech';
import { parseHabit } from './habits';
import type { BlockRecord } from './blockLog';
import type { DayRead } from './protocolRank';
import { protocoloDaMarca } from './protocolGroups';
import { DIA } from './dia';

/** Onde mora o arquivo que declara a reputação. */
export const REPUTACAO_CONFIG_PATH = '200 - FUNCTIONS/Config/reputacao.json';

// ---------------------------------------------------------------------------
// A forma do arquivo lido
// ---------------------------------------------------------------------------
export interface Rotulado { id: string; rotulo: string; porque: string }
export interface Celula { momento: string; fator: string; multiplicador: number; porque: string }
/** Uma regra de reconhecer protocolo: todas as chaves presentes valem juntas; `{}` vale para todos. */
export interface RegraProtocolo {
    id?: string[];
    fase?: string[];
    pasta?: string[];
    tipo_de_nota?: string[];
    saida_no_frontmatter?: boolean;
}
export interface TipoDeFuncao extends Rotulado {
    p0: number;
    fatorDaRodada: string | null;
    /** O fator da rodada vem da `fase` do protocolo (`fase_fator`); o `fatorDaRodada` fica para a `fase` que a tabela não tem. */
    fatorPelaFase: boolean;
    protocolos: RegraProtocolo[];
    referencia: string;
}
export interface OrigemEch { fonte: string; funcao: string; rotulo: string; tipo: string; momento: string; pelaRodada: boolean; porque: string }
export interface OrigemTarefas {
    funcao: string; rotulo: string; tipo: string; momento: string; pastas: string[]; data: string;
    campoEstado: string; feitos: string[]; doPlano: Condicao; fatorDoPlano: string; fatorForaDoPlano: string; porque: string;
}
export interface OrigemHabitos { tipo: string; momento: string; fator: string; pasta: string; type: string; porque: string }
export interface OrigemBlocos { funcao: string; rotulo: string; tipo: string; momento: string; fator: string; pasta: string; porque: string }
export interface MeiaVida { escala: string; dias: number; pastas: string[] | null; porque: string }
export type QuandoNivel = { sem_passagem: true } | { sem_passagem_na_meia_vida: true } | { n_abaixo_de: number } | { n_de_pelo_menos: number };
export interface Nivel extends Rotulado { grau: number; quando: QuandoNivel }
export interface Modulo extends Rotulado { funcoes: string[] }
export interface Objetivo extends Rotulado {
    peso: number;
    campos?: string[];
    campoImpacto?: string;
    impactoMaximo?: number;
    impactoPadrao?: number;
    foco?: { pasta: string; campos: string[]; multiplicador: number };
}
export interface RegraAndou { id: string; types: string[]; pasta: string; campo: string; feitos: string[]; neutros: string[]; data: string; porque: string }

export interface ReputacaoConfig {
    momentos: Rotulado[];
    semMomento: { rotulo: string; porque: string };
    fatores: Rotulado[];
    celulas: Celula[];
    faseMomento: Array<{ fase: string; momento: string; porque: string }>;
    faseFator: Array<{ fase: string; fator: string; porque: string }>;
    /** As espécies do ECH que são passagem e as abertas (aparecem e não descontam). */
    especies: { passam: string[]; abertas: string[]; porque: string };
    tipos: TipoDeFuncao[];
    origens: { ech: OrigemEch[]; tarefas: OrigemTarefas | null; habitos: OrigemHabitos | null; blocos: OrigemBlocos | null };
    meiasVidas: MeiaVida[];
    niveis: Nivel[];
    modulos: Modulo[];
    objetivos: { janelaDias: number; lista: Objetivo[]; andou: RegraAndou[]; porque: string };
    aprendizado: { ativo: false; minimo: number; maximo: number; sinaisMinimos: number; porque: string };
}

const SNAKE = /^[a-z][a-z0-9_]*$/;
const CHAVE_ECH = /^(?:(?:expansao|complexidade|contradicoes|atritos)\.[a-z][a-z0-9_]*|dias)$/;
const OBJETIVOS = ['execucao', 'valores', 'projetos'];
const REGRA_CHAVES = ['id', 'fase', 'pasta', 'tipo_de_nota', 'saida_no_frontmatter'];
/** As espécies que o ECH produz (`EspecieDoFato`, ech.ts): o vocabulário do motor, não um valor; o juiz tem a mesma lista. */
const ESPECIES_DO_ECH: readonly EspecieDoFato[] = ['entrou', 'organizado', 'solto', 'resolvida', 'aberta', 'resolvida_sem_data', 'atrito', 'dia_fluido'];

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []);
const ehObjeto = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Lista de textos sem vazios e sem outra coisa; senão `null`. */
function listaDeTextos(v: unknown): string[] | null {
    return Array.isArray(v) && v.length && v.every(x => typeof x === 'string' && x.trim()) ? v.map(x => x.trim().replace(/\/+$/, '')) : null;
}

/** Lê uma lista de {id, rotulo, porque} (os momentos e os fatores). */
function lerRotulados(raw: unknown, onde: string, nome: string, problemas: string[]): Rotulado[] {
    const out: Rotulado[] = [];
    if (!Array.isArray(raw)) { problemas.push(`${onde}: precisa ser uma lista`); return out; }
    raw.forEach((x: any, i: number) => {
        const id = texto(x?.id), rotulo = texto(x?.rotulo), porque = texto(x?.porque);
        if (!SNAKE.test(id) || !rotulo || !porque) { problemas.push(`${onde}[${i}]: precisa de id em snake_case, rotulo e porque`); return; }
        if (out.some(o => o.id === id)) { problemas.push(`${onde}[${i}]: o ${nome} ${id} se repete`); return; }
        out.push({ id, rotulo, porque });
    });
    return out;
}

/** O que faz: uma regra de reconhecer protocolo, ou `null` (com o problema). */
function lerRegra(raw: unknown, onde: string, problemas: string[]): RegraProtocolo | null {
    const ok = ehObjeto(raw) && Object.keys(raw).every(k => REGRA_CHAVES.includes(k))
        && ['id', 'fase', 'pasta', 'tipo_de_nota'].every(k => !(k in raw) || listaDeTextos(raw[k]))
        && (!('saida_no_frontmatter' in raw) || typeof raw.saida_no_frontmatter === 'boolean');
    if (!ok) { problemas.push(`${onde}: regra desconhecida`); return null; }
    const r = raw as Record<string, any>;
    const regra: RegraProtocolo = {};
    for (const k of ['id', 'fase', 'pasta', 'tipo_de_nota'] as const) if (k in r) regra[k] = listaDeTextos(r[k])!;
    if ('saida_no_frontmatter' in r) regra.saida_no_frontmatter = r.saida_no_frontmatter;
    return regra;
}

/** O tipo, o momento e o fator citados existem? Diz o primeiro que falta. */
function citados(onde: string, o: { tipo?: string; momento?: string; fatores?: string[] }, c: { tipos: Set<string>; momentos: Set<string>; fatores: Set<string> }, problemas: string[]): boolean {
    if (o.tipo !== undefined && !c.tipos.has(o.tipo)) { problemas.push(`${onde}: o tipo '${o.tipo}' não está em tipos`); return false; }
    if (o.momento !== undefined && !c.momentos.has(o.momento)) { problemas.push(`${onde}: o momento '${o.momento}' não está em momentos`); return false; }
    for (const f of o.fatores ?? []) if (!c.fatores.has(f)) { problemas.push(`${onde}: o fator '${f}' não está em fatores`); return false; }
    return true;
}

/**
 * O que faz: lê o `reputacao.json` e diz os problemas da forma, com as mesmas mensagens e
 * na mesma ordem de `reputacao_problems` (o juiz da bancada).
 * Por quê: os pesos iniciais, os multiplicadores, as meias-vidas, os níveis e os objetivos
 * são dele e se ajustam no arquivo, sem código (29/10/2026); a forma errada é dita, e a
 * entrada com problema fica de fora em vez de contar errado.
 * Entra → sai: o JSON cru → { config (ou `null` sem tipo ou sem nível válido), problemas }.
 * Erro e ataque: não objeto, listas que não são listas, id repetido ou fora do snake_case,
 * célula faltando ou repetida, multiplicador zero ou negativo, regra com chave inventada,
 * tipo, momento ou fator citado que não existe, condição desconhecida, aprendizado ligado,
 * `fase` sem fator (ou fator de uma `fase` que não existe), espécie que o ECH não produz ou
 * que está entre as que passam e as abertas ao mesmo tempo.
 * Prova: tests/engine/reputacao.test.ts ("os casos do juiz") e test_architecture_reputacao_cases.
 */
export function lerReputacao(raw: unknown): { config: ReputacaoConfig | null; problemas: string[] } {
    const problemas: string[] = [];
    if (!ehObjeto(raw)) return { config: null, problemas: ['o reputacao.json não é um objeto JSON'] };
    const r = raw;

    const momentos = lerRotulados(r.momentos, 'momentos', 'momento', problemas);
    const semMomento = { rotulo: texto(r.sem_momento?.rotulo), porque: texto(r.sem_momento?.porque) };
    if (!semMomento.rotulo || !semMomento.porque) problemas.push('sem_momento: precisa de rotulo e porque');
    const fatores = lerRotulados(r.fatores, 'fatores', 'fator', problemas);
    const ids = { momentos: new Set(momentos.map(m => m.id)), fatores: new Set(fatores.map(f => f.id)), tipos: new Set<string>() };

    const celulas: Celula[] = [];
    if (!Array.isArray(r.celulas)) problemas.push('celulas: precisa ser uma lista');
    else {
        r.celulas.forEach((c: any, i: number) => {
            const onde = `celulas[${i}]`;
            const momento = texto(c?.momento), fator = texto(c?.fator), multiplicador = numero(c?.multiplicador), porque = texto(c?.porque);
            if (!citados(onde, { momento, fatores: [fator] }, ids, problemas)) return;
            if (multiplicador === null || multiplicador <= 0) { problemas.push(`${onde}: o multiplicador precisa ser um número maior que zero`); return; }
            if (!porque) { problemas.push(`${onde}: precisa de porque`); return; }
            if (celulas.some(x => x.momento === momento && x.fator === fator)) { problemas.push(`${onde}: a célula ${momento} × ${fator} se repete`); return; }
            celulas.push({ momento, fator, multiplicador, porque });
        });
        for (const m of momentos) for (const f of fatores) {
            if (!celulas.some(x => x.momento === m.id && x.fator === f.id)) problemas.push(`celulas: falta a célula ${m.id} × ${f.id}`);
        }
    }

    const faseMomento: ReputacaoConfig['faseMomento'] = [];
    if (!Array.isArray(r.fase_momento)) problemas.push('fase_momento: precisa ser uma lista');
    else r.fase_momento.forEach((x: any, i: number) => {
        const onde = `fase_momento[${i}]`;
        const fase = texto(x?.fase), momento = texto(x?.momento), porque = texto(x?.porque);
        if (!SNAKE.test(fase) || !porque) { problemas.push(`${onde}: precisa de fase em snake_case, momento e porque`); return; }
        if (!citados(onde, { momento }, ids, problemas)) return;
        if (faseMomento.some(f => f.fase === fase)) { problemas.push(`${onde}: a fase ${fase} se repete`); return; }
        faseMomento.push({ fase, momento, porque });
    });

    const faseFator: ReputacaoConfig['faseFator'] = [];
    if (!Array.isArray(r.fase_fator)) problemas.push('fase_fator: precisa ser uma lista');
    else {
        r.fase_fator.forEach((x: any, i: number) => {
            const onde = `fase_fator[${i}]`;
            const fase = texto(x?.fase), fator = texto(x?.fator), porque = texto(x?.porque);
            if (!SNAKE.test(fase) || !fator || !porque) { problemas.push(`${onde}: precisa de fase em snake_case, fator e porque`); return; }
            if (!faseMomento.some(f => f.fase === fase)) { problemas.push(`${onde}: a fase ${fase} não está em fase_momento`); return; }
            if (!citados(onde, { fatores: [fator] }, ids, problemas)) return;
            if (faseFator.some(f => f.fase === fase)) { problemas.push(`${onde}: a fase ${fase} se repete`); return; }
            faseFator.push({ fase, fator, porque });
        });
        for (const f of faseMomento) if (!faseFator.some(x => x.fase === f.fase)) problemas.push(`fase_fator: falta a fase ${f.fase}`);
    }

    if (!texto(r.passagem?.porque)) problemas.push('passagem: precisa de porque');

    const especies: ReputacaoConfig['especies'] = { passam: [], abertas: [], porque: '' };
    const es = r.especies;
    if (!ehObjeto(es) || !listaDeTextos(es.passam) || !(Array.isArray(es.abertas) && es.abertas.every((x: unknown) => typeof x === 'string' && x.trim())) || !texto(es.porque)) {
        problemas.push('especies: precisa de passam (não vazia), abertas e porque');
    } else {
        const passam = listaDeTextos(es.passam)!, abertas = (es.abertas as string[]).map(x => x.trim());
        const desconhecidas = [...passam, ...abertas].filter(x => !(ESPECIES_DO_ECH as readonly string[]).includes(x));
        const nas_duas = passam.filter(x => abertas.includes(x));
        for (const x of desconhecidas) problemas.push(`especies: a espécie '${x}' não é uma espécie do ECH`);
        for (const x of nas_duas) problemas.push(`especies: a espécie ${x} está em passam e em abertas`);
        if (!desconhecidas.length && !nas_duas.length) Object.assign(especies, { passam, abertas, porque: texto(es.porque) });
    }

    const tipos: TipoDeFuncao[] = [];
    if (!Array.isArray(r.tipos)) problemas.push('tipos: precisa ser uma lista');
    else r.tipos.forEach((t: any, i: number) => {
        const onde = `tipos[${i}]`;
        const id = texto(t?.id), rotulo = texto(t?.rotulo), referencia = texto(t?.referencia), porque = texto(t?.porque);
        if (!SNAKE.test(id) || !rotulo || !referencia || !porque) { problemas.push(`${onde}: precisa de id em snake_case, rotulo, referencia e porque`); return; }
        if (tipos.some(x => x.id === id)) { problemas.push(`${onde}: o tipo ${id} se repete`); return; }
        const p0 = numero(t.p0);
        if (p0 === null || p0 < 0) { problemas.push(`${onde}: o p0 de ${id} precisa ser um número de zero para cima`); return; }
        if (!Array.isArray(t.protocolos)) { problemas.push(`${onde}: os protocolos de ${id} precisam ser uma lista`); return; }
        const regras = (t.protocolos as unknown[]).map((x, j) => lerRegra(x, `${onde}.protocolos[${j}]`, problemas));
        if (regras.some(x => !x)) return;
        const fator = texto(t.fator_da_rodada);
        if (regras.length && !ids.fatores.has(fator)) { problemas.push(`${onde}: o fator_da_rodada de ${id} não está em fatores`); return; }
        if (t.fator_pela_fase !== undefined && typeof t.fator_pela_fase !== 'boolean') { problemas.push(`${onde}: o fator_pela_fase de ${id} precisa ser true ou false`); return; }
        tipos.push({ id, rotulo, porque, referencia, p0, fatorDaRodada: regras.length ? fator : null, fatorPelaFase: t.fator_pela_fase === true, protocolos: regras as RegraProtocolo[] });
    });
    for (const t of tipos) ids.tipos.add(t.id);

    const origens: ReputacaoConfig['origens'] = { ech: [], tarefas: null, habitos: null, blocos: null };
    const o = r.origens;
    if (!ehObjeto(o)) problemas.push('origens: precisa ser um objeto');
    else {
        if (!Array.isArray(o.ech)) problemas.push('origens.ech: precisa ser uma lista');
        else o.ech.forEach((x: any, i: number) => {
            const onde = `origens.ech[${i}]`;
            const fonte = texto(x?.fonte);
            if (!CHAVE_ECH.test(fonte)) { problemas.push(`${onde}: a fonte '${fonte}' não é uma chave do ech.json (grupo.id, ou dias)`); return; }
            if (origens.ech.some(e => e.fonte === fonte)) { problemas.push(`${onde}: a fonte ${fonte} se repete`); return; }
            const funcao = texto(x.funcao), rotulo = texto(x.rotulo), porque = texto(x.porque);
            if (!SNAKE.test(funcao) || !rotulo || typeof x.pela_rodada !== 'boolean' || !porque) { problemas.push(`${onde}: a fonte ${fonte} precisa de funcao em snake_case, rotulo, pela_rodada e porque`); return; }
            const tipo = texto(x.tipo), momento = texto(x.momento);
            if (!citados(onde, { tipo, momento }, ids, problemas)) return;
            origens.ech.push({ fonte, funcao, rotulo, tipo, momento, pelaRodada: x.pela_rodada, porque });
        });
        if (o.tarefas_feitas !== undefined) {
            const t = o.tarefas_feitas;
            const onde = 'origens.tarefas_feitas';
            const pastas = listaDeTextos(typeof t?.pasta === 'string' ? [t.pasta] : t?.pasta);
            if (!SNAKE.test(texto(t?.funcao)) || !texto(t?.rotulo) || !pastas || !texto(t?.data) || !texto(t?.campo_estado)
                || !lista(t?.feitos).length || !ehObjeto(t?.do_plano) || !texto(t?.porque)) {
                problemas.push(`${onde}: precisa de funcao, rotulo, tipo, momento, pasta, data, campo_estado, feitos, do_plano, fator_do_plano, fator_fora_do_plano e porque`);
            } else if (citados(onde, { tipo: texto(t.tipo), momento: texto(t.momento), fatores: [texto(t.fator_do_plano), texto(t.fator_fora_do_plano)] }, ids, problemas)) {
                const doPlano = lerCondicao(t.do_plano, `${onde}.do_plano`, problemas);
                if (doPlano) origens.tarefas = {
                    funcao: texto(t.funcao), rotulo: texto(t.rotulo), tipo: texto(t.tipo), momento: texto(t.momento), pastas,
                    data: texto(t.data), campoEstado: texto(t.campo_estado), feitos: lista(t.feitos), doPlano,
                    fatorDoPlano: texto(t.fator_do_plano), fatorForaDoPlano: texto(t.fator_fora_do_plano), porque: texto(t.porque),
                };
            }
        }
        if (o.habitos !== undefined) {
            const h = o.habitos;
            const onde = 'origens.habitos';
            if (!texto(h?.pasta) || !texto(h?.type) || !texto(h?.porque)) problemas.push(`${onde}: precisa de tipo, momento, fator, pasta, type e porque`);
            else if (citados(onde, { tipo: texto(h.tipo), momento: texto(h.momento), fatores: [texto(h.fator)] }, ids, problemas)) {
                origens.habitos = { tipo: texto(h.tipo), momento: texto(h.momento), fator: texto(h.fator), pasta: texto(h.pasta).replace(/\/+$/, ''), type: texto(h.type), porque: texto(h.porque) };
            }
        }
        if (o.blocos !== undefined) {
            const b = o.blocos;
            const onde = 'origens.blocos';
            if (!SNAKE.test(texto(b?.funcao)) || !texto(b?.rotulo) || !texto(b?.pasta) || !texto(b?.porque)) problemas.push(`${onde}: precisa de funcao, rotulo, tipo, momento, fator, pasta e porque`);
            else if (citados(onde, { tipo: texto(b.tipo), momento: texto(b.momento), fatores: [texto(b.fator)] }, ids, problemas)) {
                origens.blocos = { funcao: texto(b.funcao), rotulo: texto(b.rotulo), tipo: texto(b.tipo), momento: texto(b.momento), fator: texto(b.fator), pasta: texto(b.pasta).replace(/\/+$/, ''), porque: texto(b.porque) };
            }
        }
    }

    const meiasVidas: MeiaVida[] = [];
    if (!Array.isArray(r.meias_vidas)) problemas.push('meias_vidas: precisa ser uma lista');
    else {
        r.meias_vidas.forEach((m: any, i: number) => {
            const onde = `meias_vidas[${i}]`;
            const escala = texto(m?.escala), dias = numero(m?.dias), porque = texto(m?.porque);
            if (!SNAKE.test(escala) || dias === null || dias <= 0 || !porque) { problemas.push(`${onde}: precisa de escala em snake_case, dias maior que zero e porque`); return; }
            if (meiasVidas.some(x => x.escala === escala)) { problemas.push(`${onde}: a escala ${escala} se repete`); return; }
            const pastas = m.pasta === undefined ? null : listaDeTextos(m.pasta);
            if (m.pasta !== undefined && !pastas) { problemas.push(`${onde}: a pasta precisa ser uma lista de textos`); return; }
            meiasVidas.push({ escala, dias, pastas, porque });
        });
        if (meiasVidas.filter(m => !m.pastas).length !== 1) problemas.push('meias_vidas: precisa de uma escala sem pasta (a padrão), e só uma');
    }

    const niveis: Nivel[] = [];
    if (!Array.isArray(r.niveis)) problemas.push('niveis: precisa ser uma lista');
    else r.niveis.forEach((n: any, i: number) => {
        const onde = `niveis[${i}]`;
        const id = texto(n?.id), rotulo = texto(n?.rotulo), porque = texto(n?.porque);
        if (!SNAKE.test(id) || !rotulo || !porque || !Number.isInteger(n?.grau) || n.grau < 0) { problemas.push(`${onde}: precisa de id em snake_case, rotulo, grau inteiro e porque`); return; }
        if (niveis.some(x => x.id === id)) { problemas.push(`${onde}: o nível ${id} se repete`); return; }
        if (niveis.some(x => x.grau === n.grau)) { problemas.push(`${onde}: o grau de ${id} se repete`); return; }
        const q = n.quando;
        const chaves = ehObjeto(q) ? Object.keys(q) : [];
        let quando: QuandoNivel | null = null;
        if (chaves.length === 1 && q.sem_passagem === true) quando = { sem_passagem: true };
        else if (chaves.length === 1 && q.sem_passagem_na_meia_vida === true) quando = { sem_passagem_na_meia_vida: true };
        else if (chaves.length === 1 && numero(q.n_abaixo_de) !== null && q.n_abaixo_de > 0) quando = { n_abaixo_de: q.n_abaixo_de };
        else if (chaves.length === 1 && numero(q.n_de_pelo_menos) !== null && q.n_de_pelo_menos >= 0) quando = { n_de_pelo_menos: q.n_de_pelo_menos };
        if (!quando) { problemas.push(`${onde}: a condição de ${id} é desconhecida`); return; }
        niveis.push({ id, rotulo, porque, grau: n.grau, quando });
    });

    const modulos: Modulo[] = [];
    if (r.modulos !== undefined && !Array.isArray(r.modulos)) problemas.push('modulos: precisa ser uma lista');
    else (r.modulos ?? []).forEach((m: any, i: number) => {
        const onde = `modulos[${i}]`;
        const id = texto(m?.id), rotulo = texto(m?.rotulo), porque = texto(m?.porque), funcoes = listaDeTextos(m?.funcoes);
        if (!SNAKE.test(id) || !rotulo || !porque || !funcoes) { problemas.push(`${onde}: precisa de id em snake_case, rotulo, funcoes e porque`); return; }
        if (modulos.some(x => x.id === id)) { problemas.push(`${onde}: o módulo ${id} se repete`); return; }
        modulos.push({ id, rotulo, porque, funcoes });
    });

    const objetivos: ReputacaoConfig['objetivos'] = { janelaDias: 0, lista: [], andou: [], porque: '' };
    const ob = r.objetivos;
    const janela = numero(ob?.janela_dias);
    if (!ehObjeto(ob) || janela === null || janela <= 0 || !Array.isArray(ob.lista) || !Array.isArray(ob.andou) || !texto(ob.porque)) {
        problemas.push('objetivos: precisa de janela_dias maior que zero, lista, andou e porque');
    } else {
        objetivos.janelaDias = janela;
        objetivos.porque = texto(ob.porque);
        ob.lista.forEach((x: any, i: number) => {
            const onde = `objetivos.lista[${i}]`;
            const id = texto(x?.id);
            if (!OBJETIVOS.includes(id)) { problemas.push(`${onde}: o objetivo '${id}' não existe (${OBJETIVOS.join(', ')})`); return; }
            if (objetivos.lista.some(y => y.id === id)) { problemas.push(`${onde}: o objetivo ${id} se repete`); return; }
            const peso = numero(x.peso);
            if (!texto(x.rotulo) || peso === null || peso < 0 || !texto(x.porque)) { problemas.push(`${onde}: o objetivo ${id} precisa de rotulo, peso de zero para cima e porque`); return; }
            const lido: Objetivo = { id, rotulo: texto(x.rotulo), porque: texto(x.porque), peso };
            if (id === 'valores') {
                if (!lista(x.campos).length) { problemas.push(`${onde}: valores precisa de campos`); return; }
                lido.campos = lista(x.campos);
            }
            if (id === 'projetos') {
                const max = numero(x.impacto_maximo), padrao = numero(x.impacto_padrao), mult = numero(x.foco?.multiplicador);
                if (!texto(x.campo_impacto) || max === null || max <= 0 || padrao === null || padrao < 0 || !texto(x.foco?.pasta) || !lista(x.foco?.campos).length || mult === null || mult <= 0) {
                    problemas.push(`${onde}: projetos precisa de campo_impacto, impacto_maximo, impacto_padrao e foco (pasta, campos, multiplicador)`);
                    return;
                }
                Object.assign(lido, { campoImpacto: texto(x.campo_impacto), impactoMaximo: max, impactoPadrao: padrao, foco: { pasta: texto(x.foco.pasta).replace(/\/+$/, ''), campos: lista(x.foco.campos), multiplicador: mult } });
            }
            objetivos.lista.push(lido);
        });
        ob.andou.forEach((x: any, i: number) => {
            const onde = `objetivos.andou[${i}]`;
            const id = texto(x?.id), campo = texto(x?.campo), porque = texto(x?.porque), types = lista(x?.type), pasta = texto(x?.pasta).replace(/\/+$/, '');
            if (!SNAKE.test(id) || !campo || !porque || (!types.length && !pasta)) { problemas.push(`${onde}: precisa de id em snake_case, campo, type ou pasta, e porque`); return; }
            if (objetivos.andou.some(y => y.id === id)) { problemas.push(`${onde}: a regra ${id} se repete`); return; }
            objetivos.andou.push({ id, types, pasta, campo, feitos: lista(x.feitos), neutros: lista(x.neutros), data: texto(x.data), porque });
        });
    }

    const a = r.aprendizado;
    const minimo = numero(a?.minimo), maximo = numero(a?.maximo);
    let aprendizado: ReputacaoConfig['aprendizado'] = { ativo: false, minimo: 0.5, maximo: 2, sinaisMinimos: 10, porque: '' };
    if (!ehObjeto(a) || typeof a.ativo !== 'boolean' || minimo === null || maximo === null || !Number.isInteger(a.sinais_minimos) || a.sinais_minimos < 1 || !texto(a.porque)) {
        problemas.push('aprendizado: precisa de ativo, minimo, maximo, sinais_minimos e porque');
    } else if (a.ativo !== false) {
        problemas.push('aprendizado: o aprendizado fica desligado nesta base (ativo: false)');
    } else if (!(minimo > 0 && minimo <= 1 && maximo >= 1)) {
        problemas.push('aprendizado: os limites precisam de 0 < minimo ≤ 1 ≤ maximo');
    } else {
        aprendizado = { ativo: false, minimo, maximo, sinaisMinimos: a.sinais_minimos, porque: texto(a.porque) };
    }

    if (!tipos.length) problemas.push('tipos: nenhum tipo válido');
    if (!niveis.length) problemas.push('niveis: nenhum nível válido');
    if (!tipos.length || !niveis.length) return { config: null, problemas };
    return {
        config: { momentos, semMomento, fatores, celulas, faseMomento, faseFator, especies, tipos, origens, meiasVidas, niveis, modulos, objetivos, aprendizado },
        problemas,
    };
}

// ---------------------------------------------------------------------------
// Os protocolos: tipo, momento, meia-vida e as rodadas nas Days
// ---------------------------------------------------------------------------
/** Uma definição de protocolo como a reputação a lê (o JSON do protocolo). */
export type DefProtocolo = Record<string, any>;

/** O protocolo de verdade: com id, sem `redirect` e fora de `router_` (MAPA, §1.1). */
const ehProtocoloDeVerdade = (def: DefProtocolo | null | undefined): boolean =>
    !!def && typeof def.id === 'string' && !!def.id && !(typeof def.redirect === 'string' && def.redirect) && !def.id.startsWith('router_');

/**
 * O que faz: o tipo de função de um protocolo, pela primeira regra que vale na ordem do
 * arquivo (cada regra: todas as chaves dela juntas; `{}` vale para todo protocolo).
 * Por quê: o fato conta uma vez só, pelo tipo mais específico (MAPA, §3): a revisão e o
 * planejamento de ciclo primeiro, depois o tipo da nota que a rodada cria, por último a
 * ferramenta.
 * Entra → sai: o JSON do protocolo e o arquivo lido → o tipo, ou `null` (alias, router ou
 * nenhuma regra).
 * Erro e ataque: definição ausente, `targetFolder` com barra no fim, `fase` que não é texto.
 * Prova: tests/engine/reputacao.test.ts ("o tipo de cada função").
 */
export function tipoDoProtocolo(def: DefProtocolo | null | undefined, config: ReputacaoConfig): TipoDeFuncao | null {
    if (!ehProtocoloDeVerdade(def)) return null;
    const d = def as DefProtocolo;
    const pasta = texto(d.targetFolder).replace(/\/+$/, '');
    const tipoDaNota = texto(d.properties?.type);
    const valeRegra = (r: RegraProtocolo) => (!r.id || r.id.includes(d.id))
        && (!r.fase || r.fase.includes(texto(d.fase)))
        && (!r.pasta || r.pasta.includes(pasta))
        && (!r.tipo_de_nota || r.tipo_de_nota.includes(tipoDaNota))
        && (r.saida_no_frontmatter === undefined || Boolean(d.frontmatterTarget) === r.saida_no_frontmatter);
    return config.tipos.find(t => t.protocolos.some(valeRegra)) ?? null;
}

/**
 * O que faz: o momento do ciclo de um protocolo, pela tabela `fase_momento`.
 * Por quê: o momento é a `fase` do protocolo (pesquisa, §3.1); sem `fase`, ou com uma fase
 * fora da tabela, o protocolo fica sem momento, à parte, e nunca é adivinhado.
 * Entra → sai: o JSON do protocolo e o arquivo lido → o id do momento ou `sem_momento`.
 * Prova: tests/engine/reputacao.test.ts ("a célula de cada fato").
 */
export function momentoDoProtocolo(def: DefProtocolo | null | undefined, config: ReputacaoConfig): string {
    const fase = texto(def?.fase);
    return config.faseMomento.find(f => f.fase === fase)?.momento ?? SEM_MOMENTO;
}

/**
 * O que faz: o fator da rodada de um protocolo: no tipo que o tira da `fase`
 * (`fator_pela_fase`), o da tabela `fase_fator`; senão, ou com uma `fase` fora da tabela, o
 * `fator_da_rodada` do tipo.
 * Por quê: a rodada da ferramenta caía toda na Expansão; a `fase` diz o fator mais provável
 * (MAPA, §1.3), e a tabela mora no arquivo, com o porquê de cada linha (30/10).
 * Entra → sai: o JSON do protocolo, o tipo dele e o arquivo lido → o id do fator, ou `null`
 * (tipo sem regra de protocolo).
 * Erro e ataque: definição ausente, `fase` que não é texto ou que a tabela não tem: vale o
 * `fator_da_rodada` do tipo, nunca um fator adivinhado.
 * Prova: tests/engine/reputacao.test.ts ("o fator da rodada pela fase").
 */
export function fatorDaRodadaDe(def: DefProtocolo | null | undefined, tipo: TipoDeFuncao, config: ReputacaoConfig): string | null {
    if (tipo.fatorPelaFase) {
        const fase = texto(def?.fase);
        const linha = config.faseFator.find(f => f.fase === fase);
        if (linha) return linha.fator;
    }
    return tipo.fatorDaRodada;
}

/**
 * O que faz: a meia-vida de uma função: a da escala cuja pasta tem a saída do protocolo,
 * senão a padrão (a escala sem pasta).
 * Por quê: 60 dias no dia e na semana, 365 no trimestre (definido em 29/10/2026).
 * Entra → sai: o JSON do protocolo (ou nada, para as funções que não são protocolo) e o
 * arquivo lido → { escala, dias }.
 * Prova: tests/engine/reputacao.test.ts ("o esquecimento").
 */
export function meiaVidaDe(def: DefProtocolo | null | undefined, config: ReputacaoConfig): { escala: string; dias: number } {
    const pasta = texto(def?.targetFolder).replace(/\/+$/, '');
    const achada = (pasta && config.meiasVidas.find(m => m.pastas?.includes(pasta))) || config.meiasVidas.find(m => !m.pastas);
    return achada ? { escala: achada.escala, dias: achada.dias } : { escala: 'dia', dias: 60 };
}

/** Uma rodada de protocolo lida na Day. */
export interface Rodada {
    protocolo: string;
    dia: string;
    hora: string;
    /** O nome da nota ligada na linha (`[[nota]]`), sem o caminho; vazio sem nota. */
    nota: string;
    interrompida: boolean;
    /** A identidade da rodada: protocolo, dia, hora e a ordem no dia. */
    chave: string;
}

const CHAVES_GENERICAS = ['type', 'status', 'date', 'day', 'week', 'quarter', 'tags'];
const preenchidoNaDay = (v: unknown): boolean => (Array.isArray(v) ? v.some(preenchidoNaDay) : v !== undefined && v !== null && String(v).trim() !== '');

/** As linhas de registro da Day (entre os marcadores do motor), sem as de botão: a mesma leitura de `protocolRank.ts`. */
function linhasDeRegistro(text: string): string[] {
    const all = String(text || '');
    const start = all.indexOf('<!-- DFM_LOGS_START -->');
    const end = all.indexOf('<!-- DFM_LOGS_END -->');
    const part = start !== -1 && end > start ? all.slice(start, end) : all;
    return part.split('\n').filter(line => !/^\s*(>\s*)?button:/.test(line));
}

/**
 * O que faz: as rodadas dos protocolos nas Days: cada linha "Protocolo <rótulo> executado"
 * (com a nota ligada), cada "interrompido (rascunho)", o título "**[HH:mm] <rótulo>**" do
 * `append` sem campo próprio e, no `append` com campo próprio, o campo preenchido na Day
 * (uma rodada por dia). O alias conta para o destino.
 * Por quê: a rodada é a unidade da passagem (uma por célula por rodada) e o rastro com data
 * de que a função rodou; é a mesma regra do uso recente (`usoDatas`, protocolRank.ts).
 * Entra → sai: as Days lidas e os JSON dos protocolos → `Rodada[]`, na ordem das Days.
 * Os nomes antigos (`rotulosAntigos`) valem como o de hoje, nas linhas sem a marca do id (o 🌳 Planejamento
 * Semanal levava o 📅 até 05/11).
 * Erro e ataque: rótulo que nenhum protocolo tem fica de fora; rótulo com caracteres de
 * regex; Day sem texto; alias em cadeia (até 3 saltos); linha de botão não é rodada.
 * Prova: tests/engine/reputacao.test.ts ("as rodadas"); tests/missao/reputacaoNoLugar.test.ts (o nome antigo).
 */
export function rodadasDasDays(days: readonly DayRead[], defs: readonly DefProtocolo[]): Rodada[] {
    const porId = new Map<string, DefProtocolo>();
    for (const d of defs || []) if (d && typeof d.id === 'string' && d.id) porId.set(d.id, d);
    const destino = (d: DefProtocolo | undefined, saltos = 0): DefProtocolo | null => {
        if (!d) return null;
        if (typeof d.redirect === 'string' && d.redirect) return saltos < 3 ? destino(porId.get(d.redirect), saltos + 1) : null;
        return ehProtocoloDeVerdade(d) ? d : null;
    };
    const porRotulo = new Map<string, string>();
    const titulosAppend = new Map<string, string>();
    const camposProprios: Array<{ id: string; campos: string[] }> = [];
    for (const d of porId.values()) {
        const alvo = destino(d);
        if (!alvo) continue;
        const rotulo = String(d.dailyLedgerLabel || d.name || d.id || '').trim();
        if (rotulo && !porRotulo.has(rotulo)) porRotulo.set(rotulo, alvo.id);
        // Os nomes que o protocolo já teve (`rotulosAntigos`, 05/11): a linha antiga, sem a marca do id, conta para ele.
        for (const antigo of Array.isArray(d.rotulosAntigos) ? d.rotulosAntigos : []) {
            const r = typeof antigo === 'string' ? antigo.trim() : '';
            if (r && !porRotulo.has(r)) porRotulo.set(r, alvo.id);
        }
        if (d === alvo && d.logMode === 'append') {
            const props = d.properties && typeof d.properties === 'object' ? d.properties : {};
            const campos = Object.keys(props).filter(k => !CHAVES_GENERICAS.includes(k));
            if (campos.length) camposProprios.push({ id: d.id, campos });
            else if (rotulo) titulosAppend.set(rotulo, d.id);
        }
    }
    const out: Rodada[] = [];
    for (const day of [...(days || [])].filter(d => d && typeof d.date === 'string').sort((a, b) => a.date.localeCompare(b.date))) {
        const vistas = new Map<string, number>();
        const add = (protocolo: string, hora: string, nota: string, interrompida: boolean) => {
            const base = `${protocolo}@${day.date}T${hora}`;
            const k = (vistas.get(base) ?? 0) + 1;
            vistas.set(base, k);
            out.push({ protocolo, dia: day.date, hora, nota, interrompida, chave: k > 1 ? `${base}#${k}` : base });
        };
        for (const linha of linhasDeRegistro(day.text)) {
            // A marca do id (02/11) vale antes do rótulo: o nome trocado não apaga a rodada.
            const marcado = protocoloDaMarca(linha);
            const peloId = marcado ? destino(porId.get(marcado))?.id : undefined;
            const exec = linha.match(/\*\*\[(\d{1,2}:\d{2})\] Protocolo (.+?) executado:\*\*\s*(?:!?\[\[([^\]|#]+))?/);
            if (exec) {
                const id = marcado ? peloId : porRotulo.get(exec[2].trim());
                if (id) add(id, exec[1], (exec[3] ?? '').trim().split('/').pop()!.replace(/\.md$/, ''), false);
                continue;
            }
            const inter = linha.match(/\*\*\[(\d{1,2}:\d{2})\] Protocolo (.+?) interrompido/);
            if (inter) {
                const id = porRotulo.get(inter[2].trim());
                if (id) add(id, inter[1], '', true);
                continue;
            }
            const titulo = linha.match(/^\s*(?:-\s*)?\*\*\[(\d{1,2}:\d{2})\] (.+?)\*\*\s*(?:<!-- dfm-protocolo:[a-z0-9_]+ -->\s*)?$/);
            if (titulo && marcado) { if (peloId) add(peloId, titulo[1], '', false); continue; }
            if (titulo && titulosAppend.has(titulo[2].trim())) add(titulosAppend.get(titulo[2].trim())!, titulo[1], '', false);
        }
        for (const p of camposProprios) if (p.campos.some(c => preenchidoNaDay(day.campos?.[c]))) add(p.id, '', '', false);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Os fatos na grade e o crédito a cada função
// ---------------------------------------------------------------------------
/** Um fato na grade, creditado a uma função. */
export interface FatoDaGrade {
    funcao: string;
    rotulo: string;
    tipo: string;
    momento: string;
    fator: string;
    dia: string;
    rodada: string;
    /** Aberto (solto, contradição aberta, atrito): aparece e não conta. */
    aberto: boolean;
    /** De onde veio: a chave da fonte do ECH, `rodada`, `tarefas_feitas`, `habitos` ou `blocos`. */
    origem: string;
    /** A nota que o fato produziu (para o sinal), quando há. */
    nota: string;
    /** O protocolo da função, quando ela é um protocolo. */
    protocolo?: DefProtocolo;
}

/** O contexto do crédito: as rodadas (pela nota ligada), os protocolos e o arquivo. */
export interface ContextoDoCredito {
    config: ReputacaoConfig;
    porNota: Map<string, Rodada>;
    porId: Map<string, DefProtocolo>;
}

/**
 * O que faz: o contexto de crédito de uma leitura: a primeira rodada que ligou cada nota e
 * os protocolos por id.
 * Entra → sai: as rodadas, os protocolos e o arquivo → `ContextoDoCredito`.
 */
export function contextoDoCredito(rodadas: readonly Rodada[], defs: readonly DefProtocolo[], config: ReputacaoConfig): ContextoDoCredito {
    const porNota = new Map<string, Rodada>();
    for (const r of rodadas || []) if (r.nota && !r.interrompida && !porNota.has(r.nota)) porNota.set(r.nota, r);
    const porId = new Map<string, DefProtocolo>();
    for (const d of defs || []) if (d && typeof d.id === 'string') porId.set(d.id, d);
    return { config, porNota, porId };
}

const nomeDe = (path: string) => String(path ?? '').split('/').pop()!.replace(/\.md$/, '');

/**
 * O que faz: a quem vai um fato do ECH: à rodada do protocolo que ligou a nota (quando a
 * fonte declara `pela_rodada` e o protocolo tem tipo), senão à função da fonte; com o tipo,
 * o momento e a rodada da passagem.
 * Por quê: o crédito vai à função que gerou o fato (pesquisa, §3.1); o momento é a `fase`
 * do protocolo que o produziu ou, sem protocolo, o padrão da fonte; o protocolo sem `fase`
 * fica sem momento e nunca é adivinhado.
 * Entra → sai: o fato e o contexto → { funcao, rotulo, tipo, momento, rodada, protocolo? },
 * ou `null` quando a fonte não está declarada (o fato não muda nada).
 * Erro e ataque: fonte que o arquivo não declara; nota ligada por um router ou alias;
 * fato sem nota.
 * Prova: tests/engine/reputacao.test.ts ("a célula de cada fato" e "só o declarado").
 */
export function creditoDoFatoEch(fato: Omit<FatoEch, 'momento'>, ctx: ContextoDoCredito): {
    funcao: string; rotulo: string; tipo: string; momento: string; rodada: string; protocolo?: DefProtocolo;
} | null {
    const origem = ctx.config.origens.ech.find(o => o.fonte === chaveDaFonte(fato));
    if (!origem) return null;
    if (origem.pelaRodada) {
        const rodada = ctx.porNota.get(nomeDe(fato.path));
        const def = rodada ? ctx.porId.get(rodada.protocolo) : undefined;
        const tipo = tipoDoProtocolo(def, ctx.config);
        if (rodada && def && tipo) {
            return {
                funcao: def.id, rotulo: String(def.dailyLedgerLabel || def.name || def.id), tipo: tipo.id,
                momento: momentoDoProtocolo(def, ctx.config), rodada: rodada.chave, protocolo: def,
            };
        }
    }
    return { funcao: origem.funcao, rotulo: origem.rotulo, tipo: origem.tipo, momento: origem.momento, rodada: `${origem.funcao}@${fato.dia}` };
}

/**
 * O que faz: quem dá o momento a cada fato do ECH (`fatosEch`), pelo crédito.
 * Entra → sai: o contexto → `MomentoDoFato` (fonte não declarada → sem momento).
 */
export function momentoDoFatoEch(ctx: ContextoDoCredito): MomentoDoFato {
    return fato => creditoDoFatoEch(fato, ctx)?.momento ?? SEM_MOMENTO;
}

/**
 * O que faz: a função de uma nota do cofre, quando a própria nota é uma função com reputação: hoje,
 * o tracker de hábito (a origem `habitos` do arquivo, pela pasta e pelo `type`), `habito:<nome>`.
 * Por quê: o painel do nó mostra a reputação só de quem a tem (30/10, o acabamento); a regra de
 * qual nota é função mora num lugar só, a mesma da conta (`fatosDaGrade`).
 * Entra → sai: o caminho, o frontmatter e o arquivo → o id da função, ou `null` (as outras notas:
 * a tarefa, o projeto, o dia; a nota fora da pasta ou de outro `type`; o arquivo sem a origem).
 * Prova: tests/engine/reputacao.test.ts ("a linha do painel").
 */
export function funcaoDaNota(caminho: string | null | undefined, frontmatter: Record<string, any> | null | undefined, config: ReputacaoConfig): string | null {
    const h = config.origens.habitos;
    const path = String(caminho ?? '');
    if (!h || !path.endsWith('.md') || !path.startsWith(`${h.pasta}/`) || fieldText(frontmatter?.type) !== h.type) return null;
    return `habito:${nomeDe(path)}`;
}

/** O que a reputação lê do cofre, já pronto: nada é lido aqui. */
export interface EntradaDaReputacao {
    /** Os fatos do ECH (`fatosEch`, com o momento de `momentoDoFatoEch`). */
    fatos: readonly FatoEch[];
    rodadas: readonly Rodada[];
    defs: readonly DefProtocolo[];
    /** As notas do cofre (as tarefas feitas, os hábitos e o que o sinal consulta). */
    cofre: readonly NotaDoCofre[];
    blocos: readonly BlockRecord[];
    /** O trimestre do dia de referência, `AAAA-Qn` (o foco do sinal). */
    trimestre?: string;
}

/**
 * O que faz: todos os fatos na grade até o dia de referência, cada um com a função, o tipo,
 * a célula e a rodada: os do ECH, as rodadas dos protocolos, as tarefas feitas, os dias dos
 * hábitos e os blocos fechados. Só entra o que vem de uma origem declarada no arquivo.
 * Por quê: a passagem é a rodada que deixa fato numa célula (pesquisa, §3.2); a rodada do
 * protocolo é ela mesma um fato da função (o registro com data de que rodou), na célula do
 * momento da `fase` e do fator do tipo.
 * Entra → sai: a entrada, o arquivo e o dia de referência → `FatoDaGrade[]` (o fato depois
 * do dia de referência fica de fora; a entrada não é mutada).
 * Erro e ataque: fonte não declarada, protocolo sem tipo, tarefa sem data, bloco aberto,
 * nota de hábito fora da pasta: nada disso entra.
 * Prova: tests/engine/reputacao.test.ts.
 */
export function fatosDaGrade(entrada: EntradaDaReputacao, config: ReputacaoConfig, hoje: string): FatoDaGrade[] {
    const ctx = contextoDoCredito(entrada.rodadas, entrada.defs, config);
    const out: FatoDaGrade[] = [];
    const ate = (dia: string) => DIA.test(dia) && dia <= hoje;
    // As espécies que passam e as abertas vêm do arquivo (`especies`); a que não está em nenhuma não entra.
    const passam = new Set(config.especies.passam);
    const abertas = new Set(config.especies.abertas);

    for (const f of entrada.fatos || []) {
        if (!ate(f.dia) || (!passam.has(f.especie) && !abertas.has(f.especie))) continue;
        const c = creditoDoFatoEch(f, ctx);
        if (!c) continue;
        out.push({ funcao: c.funcao, rotulo: c.rotulo, tipo: c.tipo, momento: c.momento, fator: f.fator, dia: f.dia, rodada: c.rodada,
            aberto: abertas.has(f.especie), origem: chaveDaFonte(f), nota: f.path, ...(c.protocolo ? { protocolo: c.protocolo } : {}) });
    }

    const notaPorNome = new Map<string, string>();
    for (const n of entrada.cofre || []) if (n && typeof n.path === 'string' && !notaPorNome.has(nomeDe(n.path))) notaPorNome.set(nomeDe(n.path), n.path);
    for (const r of entrada.rodadas || []) {
        if (r.interrompida || !ate(r.dia)) continue;
        const def = ctx.porId.get(r.protocolo);
        const tipo = tipoDoProtocolo(def, config);
        const fator = tipo ? fatorDaRodadaDe(def, tipo, config) : null;
        if (!def || !tipo || !fator) continue;
        out.push({ funcao: def.id, rotulo: String(def.dailyLedgerLabel || def.name || def.id), tipo: tipo.id, momento: momentoDoProtocolo(def, config),
            fator, dia: r.dia, rodada: r.chave, aberto: false, origem: 'rodada', nota: notaPorNome.get(r.nota) ?? '', protocolo: def });
    }

    const t = config.origens.tarefas;
    if (t) {
        const feitos = t.feitos.map(x => x.toLowerCase());
        for (const n of entrada.cofre || []) {
            if (!n?.path?.endsWith('.md') || !t.pastas.some(p => n.path.startsWith(`${p}/`))) continue;
            if (!feitos.includes(fieldText(n.frontmatter?.[t.campoEstado]).toLowerCase())) continue;
            const dia = dayOf(n.frontmatter?.[t.data]);
            if (!ate(dia)) continue;
            out.push({ funcao: t.funcao, rotulo: t.rotulo, tipo: t.tipo, momento: t.momento, fator: vale(t.doPlano, n) ? t.fatorDoPlano : t.fatorForaDoPlano,
                dia, rodada: `${t.funcao}@${dia}`, aberto: false, origem: 'tarefas_feitas', nota: n.path });
        }
    }

    const h = config.origens.habitos;
    if (h) {
        for (const n of entrada.cofre || []) {
            const funcao = funcaoDaNota(n?.path, n?.frontmatter, config);
            if (!funcao) continue;
            const habito = parseHabit(n.path, n.frontmatter);
            for (const dia of habito.entries) {
                if (!ate(dia)) continue;
                out.push({ funcao, rotulo: habito.title, tipo: h.tipo, momento: h.momento, fator: h.fator, dia, rodada: `${funcao}@${dia}`, aberto: false, origem: 'habitos', nota: '' });
            }
        }
    }

    const b = config.origens.blocos;
    if (b) {
        for (const bloco of entrada.blocos || []) {
            const dia = dayOf(bloco?.data);
            if (!bloco?.fim || !bloco?.saiu || !ate(dia)) continue;
            out.push({ funcao: b.funcao, rotulo: b.rotulo, tipo: b.tipo, momento: b.momento, fator: b.fator, dia, rodada: `${b.funcao}@${dia}`, aberto: false, origem: 'blocos', nota: String(bloco.caminho ?? '') });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// A conta de uma função
// ---------------------------------------------------------------------------
/** Os dias entre dois `AAAA-MM-DD` (b − a), em UTC. */
function diasEntre(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
const desconto = (idade: number, meiaVida: number) => Math.pow(0.5, Math.max(0, idade) / meiaVida);
const arred = (v: number) => Math.round(v * 100) / 100;

export interface CelulaDaFuncao {
    momento: string;
    fator: string;
    multiplicador: number;
    /** As passagens (rodadas distintas com fato nesta célula). */
    passagens: number;
    /** As passagens com o esquecimento. */
    descontadas: number;
    /** Os fatos abertos nesta célula (aparecem e não contam). */
    abertos: number;
}

export interface ContaDaFuncao {
    r: number;
    n: number;
    /** As rodadas distintas com passagem, sem o esquecimento. */
    rodadas: number;
    celulas: CelulaDaFuncao[];
    /** As rodadas sem momento, por fator (à parte, fora de R e de n). */
    semMomento: Record<string, number>;
    /** O dia da última passagem; vazio sem passagem. */
    ultima: string;
}

/**
 * O que faz: a reputação de uma função: R (o peso inicial mais as passagens de cada célula
 * vezes o multiplicador, com o esquecimento), n (as rodadas com passagem, com o mesmo
 * esquecimento), as células com as passagens e os abertos, o que ficou sem momento e a
 * última passagem.
 * Por quê: quanto mais uma função passa por essa grade, mais reputação ela tem, com um
 * multiplicador para cada quadrante (29/10/2026); a passagem conta uma vez por célula
 * por rodada, e o esquecimento desconta só as passagens, então R nunca cai abaixo do P₀.
 * Entra → sai: os fatos da função, o P₀, a meia-vida em dias, o dia de referência e o
 * arquivo → `ContaDaFuncao`.
 * Erro e ataque: fato depois do dia de referência não conta; fato aberto não soma; célula
 * fora da grade (sem momento) fica à parte; muitos fatos da mesma rodada na mesma célula
 * contam uma vez.
 * Prova: tests/engine/reputacao.test.ts ("uma vez por célula", "o esquecimento", "o piso").
 */
export function contaDaFuncao(fatos: readonly FatoDaGrade[], p0: number, meiaVida: number, hoje: string, config: ReputacaoConfig): ContaDaFuncao {
    const celulas: CelulaDaFuncao[] = config.celulas.map(c => ({ momento: c.momento, fator: c.fator, multiplicador: c.multiplicador, passagens: 0, descontadas: 0, abertos: 0 }));
    const semMomento: Record<string, number> = {};
    const porCelula = new Map<string, Map<string, string>>();
    const semMomentoRodadas = new Map<string, Set<string>>();
    const rodadasComPassagem = new Map<string, string>();
    for (const f of fatos) {
        if (!f.dia || f.dia > hoje) continue;
        const celula = celulas.find(c => c.momento === f.momento && c.fator === f.fator);
        if (!celula) {
            if (!f.aberto) {
                const s = semMomentoRodadas.get(f.fator) ?? new Set<string>();
                s.add(f.rodada);
                semMomentoRodadas.set(f.fator, s);
            }
            continue;
        }
        if (f.aberto) { celula.abertos++; continue; }
        const chave = `${celula.momento}×${celula.fator}`;
        const m = porCelula.get(chave) ?? new Map<string, string>();
        if (!m.has(f.rodada)) m.set(f.rodada, f.dia);
        porCelula.set(chave, m);
        if (!rodadasComPassagem.has(f.rodada)) rodadasComPassagem.set(f.rodada, f.dia);
    }
    let r = p0;
    for (const c of celulas) {
        const m = porCelula.get(`${c.momento}×${c.fator}`);
        if (!m) continue;
        c.passagens = m.size;
        c.descontadas = arred([...m.values()].reduce((s, dia) => s + desconto(diasEntre(dia, hoje), meiaVida), 0));
        r += c.multiplicador * [...m.values()].reduce((s, dia) => s + desconto(diasEntre(dia, hoje), meiaVida), 0);
    }
    for (const [fator, s] of semMomentoRodadas) semMomento[fator] = s.size;
    const dias = [...rodadasComPassagem.values()];
    const n = dias.reduce((s, dia) => s + desconto(diasEntre(dia, hoje), meiaVida), 0);
    return { r: arred(r), n: arred(n), rodadas: dias.length, celulas, semMomento, ultima: dias.sort().pop() ?? '' };
}

/**
 * O que faz: o nível de uma função pela evidência: o primeiro nível do arquivo cuja
 * condição vale (nenhuma passagem, sem passagem na última meia-vida, n abaixo de um limite,
 * n de pelo menos).
 * Por quê: a evidência fica à parte do valor: "nova neste uso", "em formação", "com base",
 * "em repouso" (pesquisa, §3.2). "Em repouso" só vale para quem já passou. "Nova" conta as
 * rodadas com passagem sem o esquecimento (30/10): com `n < 1`, a passagem de ontem
 * (n ≈ 0,98) ainda lia "nova neste uso" depois de usada.
 * Entra → sai: n, as rodadas com passagem (sem o esquecimento), a última passagem, a
 * meia-vida, o dia de referência e o arquivo → o nível (`null` se nenhum vale).
 * Prova: tests/engine/reputacao.test.ts ("os níveis").
 */
export function nivelDe(n: number, rodadas: number, ultima: string, meiaVida: number, hoje: string, config: ReputacaoConfig): Nivel | null {
    for (const nivel of config.niveis) {
        const q = nivel.quando;
        if ('sem_passagem' in q) { if (rodadas === 0) return nivel; continue; }
        if ('sem_passagem_na_meia_vida' in q) { if (ultima && diasEntre(ultima, hoje) > meiaVida) return nivel; continue; }
        if ('n_abaixo_de' in q) { if (n < q.n_abaixo_de) return nivel; continue; }
        if (n >= q.n_de_pelo_menos) return nivel;
    }
    return null;
}

// ---------------------------------------------------------------------------
// O sinal de aprendizado (calculado, nunca aplicado)
// ---------------------------------------------------------------------------
export interface SinalDaFuncao {
    andou: number;
    naoAndou: number;
    pendentes: number;
    neutros: number;
    /** O que a função produziu e está ligado a um valor ou domínio. */
    valores: number;
    /** Os projetos que avançaram, ponderados pela prioridade. */
    projetos: number;
    /** A soma dos objetivos pelos pesos declarados. */
    contribuicao: number;
    /** Sempre `false`: o sinal é registrado e não muda nenhum peso (aprendizado desligado). */
    aplicado: false;
    porque: string;
}

/**
 * O que faz: o foco do trimestre: os nomes dos projetos e departamentos dos campos do foco.
 * Entra → sai: o frontmatter da nota do trimestre e o arquivo → nomes, sem caixa.
 */
export function focoDoTrimestre(frontmatter: Record<string, any> | null | undefined, config: ReputacaoConfig): string[] {
    const campos = config.objetivos.lista.find(o => o.id === 'projetos')?.foco?.campos ?? [];
    const out = new Set<string>();
    for (const c of campos) for (const v of (Array.isArray(frontmatter?.[c]) ? frontmatter![c] : [frontmatter?.[c]])) {
        const nome = fieldText(v).toLowerCase();
        if (nome) out.add(nome);
    }
    return [...out];
}

const fmt = (v: number) => String(arred(v)).replace('.', ',');

/**
 * O que faz: o sinal de aprendizado de uma função: do que as passagens produziram, quanto
 * andou em 4 semanas (e quanto não andou, espera ou é neutro), quanto está ligado a um
 * valor ou domínio e quanto fez um projeto avançar, pelo impacto e pelo foco do trimestre;
 * e a contribuição, a soma pelos pesos dos objetivos.
 * Por quê: os pesos vão em direção do que traz mais do resultado desejado, e aplicá-los já
 * ficou em aberto (29/10/2026): o sinal é calculado e mostrado, e nunca
 * muda nenhum número; não se grava nada, porque se deriva a qualquer hora dos fatos com data.
 * Entra → sai: os fatos da função, as notas do cofre, o foco do trimestre, o dia de
 * referência e o arquivo → `SinalDaFuncao` (`aplicado: false`).
 * Erro e ataque: nota que nenhuma regra de "andou" cobre fica fora do sinal; impacto fora
 * da escala é limitado a ela; a cancelada é neutra; o pai que não existe não muda o foco.
 * Prova: tests/engine/reputacao.test.ts ("o sinal não é aplicado").
 */
export function sinalDaFuncao(fatos: readonly FatoDaGrade[], cofre: readonly NotaDoCofre[], foco: readonly string[], hoje: string, config: ReputacaoConfig): SinalDaFuncao {
    const ob = config.objetivos;
    const porPath = new Map<string, NotaDoCofre>();
    const porNome = new Map<string, NotaDoCofre>();
    for (const n of cofre || []) if (n && typeof n.path === 'string') { porPath.set(n.path, n); if (!porNome.has(nomeDe(n.path).toLowerCase())) porNome.set(nomeDe(n.path).toLowerCase(), n); }
    const primeira = new Map<string, string>();
    for (const f of fatos) if (!f.aberto && f.nota && f.dia <= hoje && (!primeira.has(f.nota) || f.dia < primeira.get(f.nota)!)) primeira.set(f.nota, f.dia);

    const valoresObj = ob.lista.find(o => o.id === 'valores');
    const projetosObj = ob.lista.find(o => o.id === 'projetos');
    const focoSet = new Set(foco.map(x => x.toLowerCase()));
    const nomesDe = (v: unknown) => (Array.isArray(v) ? v : [v]).map(x => fieldText(x).toLowerCase()).filter(Boolean);
    let andou = 0, naoAndou = 0, pendentes = 0, neutros = 0, valores = 0, projetos = 0;
    for (const [path, diaDaPassagem] of [...primeira.entries()].sort()) {
        const nota = porPath.get(path);
        if (!nota) continue;
        const fm = nota.frontmatter ?? {};
        if (valoresObj?.campos?.some(c => (Array.isArray(fm[c]) ? fm[c].some((x: unknown) => fieldText(x)) : fieldText(fm[c])))) valores++;
        const regra = ob.andou.find(r => (r.types.length ? r.types.includes(fieldText(fm.type)) : false) || (r.pasta ? path.startsWith(`${r.pasta}/`) : false));
        if (!regra) continue;
        const limite = new Date(Date.parse(`${diaDaPassagem}T00:00:00Z`) + ob.janelaDias * 86_400_000).toISOString().slice(0, 10);
        const estado = fieldText(fm[regra.campo]).toLowerCase();
        let anda: 'andou' | 'nao' | 'espera' | 'neutro';
        if (regra.feitos.length) {
            const dia = regra.data ? dayOf(fm[regra.data]) : '';
            if (regra.neutros.map(x => x.toLowerCase()).includes(estado)) anda = 'neutro';
            else if (regra.feitos.map(x => x.toLowerCase()).includes(estado) && (!regra.data || (dia && dia <= limite))) anda = 'andou';
            else anda = hoje <= limite ? 'espera' : 'nao';
        } else {
            anda = estado ? 'andou' : hoje <= limite ? 'espera' : 'nao';
        }
        if (anda === 'neutro') { neutros++; continue; }
        if (anda === 'espera') { pendentes++; continue; }
        if (anda === 'nao') { naoAndou++; continue; }
        andou++;
        if (projetosObj && nomesDe(fm.projects).length) {
            const max = projetosObj.impactoMaximo!;
            const bruto = Number(fm[projetosObj.campoImpacto!]);
            const impacto = Number.isFinite(bruto) && fieldText(fm[projetosObj.campoImpacto!]) !== '' ? Math.min(max, Math.max(0, bruto)) : projetosObj.impactoPadrao!;
            const pais = nomesDe(fm.projects);
            const avos = pais.flatMap(p => nomesDe(porNome.get(p)?.frontmatter?.projects));
            const noFoco = [...pais, ...avos].some(p => focoSet.has(p));
            projetos += (impacto / max) * (noFoco ? projetosObj.foco!.multiplicador : 1);
        }
    }
    const pesoDe = (id: string) => ob.lista.find(o => o.id === id)?.peso ?? 0;
    const contribuicao = arred(pesoDe('execucao') * andou + pesoDe('valores') * valores + pesoDe('projetos') * projetos);
    const partes = [`andou ${andou}`, `não andou ${naoAndou}`];
    if (pendentes) partes.push(`à espera ${pendentes}`);
    if (neutros) partes.push(`neutras ${neutros}`);
    partes.push(`ligadas a um valor ${valores}`, `projetos ${fmt(projetos)}`);
    return { andou, naoAndou, pendentes, neutros, valores, projetos: arred(projetos), contribuicao, aplicado: false,
        porque: `sinal registrado, não aplicado: ${partes.join(', ')}` };
}

// ---------------------------------------------------------------------------
// A leitura inteira: as funções e os módulos
// ---------------------------------------------------------------------------
export interface ReputacaoDaFuncao {
    id: string;
    rotulo: string;
    tipo: { id: string; rotulo: string; p0: number };
    meiaVida: { escala: string; dias: number };
    r: number;
    n: number;
    /** As rodadas distintas com passagem, sem o esquecimento. */
    rodadas: number;
    nivel: { id: string; rotulo: string; grau: number } | null;
    celulas: CelulaDaFuncao[];
    semMomento: Record<string, number>;
    interrompidas: number;
    ultima: string;
    porque: string;
    sinal: SinalDaFuncao;
}

export interface ReputacaoDoModulo {
    id: string;
    rotulo: string;
    nivel: { id: string; rotulo: string; grau: number } | null;
    limitadoPor: string[];
    porque: string;
}

export interface ReputacaoLida {
    hoje: string;
    funcoes: ReputacaoDaFuncao[];
    modulos: ReputacaoDoModulo[];
}

/** O filtro da leitura: as funções com fato no período, uma função pelo id, ou várias pelos ids (a ordem do 🧭). */
export type FiltroDaReputacao = { periodo: { desde: string; ate: string } } | { id: string } | { ids: readonly string[] };

const rotuloDe = (lista: Rotulado[], id: string) => lista.find(x => x.id === id)?.rotulo ?? id;

/**
 * O que faz: o porquê de uma função em palavras simples: o peso inicial do tipo, as
 * passagens por célula, o nível e o que ficou à parte (sem momento, abertos, interrompidas).
 * Por quê: "R não é placar" (pesquisa, §3.4): o que se vê são os fatos por célula e o nível
 * com o porquê; nada mede a pessoa.
 * Entra → sai: a função lida (sem o porquê) e o arquivo → uma frase.
 * Prova: tests/engine/reputacao.test.ts ("o porquê", com o vocabulário vetado).
 */
export function porqueDaFuncao(f: Omit<ReputacaoDaFuncao, 'porque' | 'sinal'>, hoje: string, config: ReputacaoConfig): string {
    const partes = [`começa em ${fmt(f.tipo.p0)} (${f.tipo.rotulo})`];
    const usadas = f.celulas.filter(c => c.passagens > 0);
    if (!usadas.length) partes.push(AINDA_NAO_PASSOU);
    else partes.push(`passou ${vezesEmPalavras(f.rodadas)}, em ${celulasEmPalavras(usadas, config)}`);
    if (f.nivel) {
        const extra = f.nivel.id === 'em_repouso' && f.ultima ? `: sem passagem há ${diasEntre(f.ultima, hoje)} dias` : '';
        partes.push(`${f.nivel.rotulo}${extra}`);
    }
    const aParte = aParteEmPalavras(f, config);
    if (aParte) partes.push(aParte);
    return partes.join('; ');
}

/** A frase de quem ainda não passou pela grade (o porquê da função e a linha do painel). */
const AINDA_NAO_PASSOU = 'ainda não passou pela grade aqui';

/** O que faz: as vezes em palavras ("1 vez", "9 vezes"). */
const vezesEmPalavras = (n: number) => (n === 1 ? '1 vez' : `${n} vezes`);

/** O que faz: as células usadas em palavras: "1 célula (Revisar × Complexidade 9)". */
function celulasEmPalavras(usadas: readonly CelulaDaFuncao[], config: ReputacaoConfig): string {
    const celulas = usadas.map(c => `${rotuloDe(config.momentos, c.momento)} × ${rotuloDe(config.fatores, c.fator)} ${c.passagens}`).join(', ');
    return `${usadas.length === 1 ? '1 célula' : `${usadas.length} células`} (${celulas})`;
}

/** O que faz: o que ficou à parte em palavras (sem momento, abertos, interrompidas); vazio sem nada à parte. */
function aParteEmPalavras(f: Pick<ReputacaoDaFuncao, 'semMomento' | 'celulas' | 'interrompidas'>, config: ReputacaoConfig): string {
    const aParte: string[] = [];
    const sem = Object.entries(f.semMomento).filter(([, v]) => v > 0);
    if (sem.length) aParte.push(`${sem.reduce((s, [, v]) => s + v, 0)} sem momento (${config.semMomento.rotulo}: o protocolo não tem fase)`);
    const abertos = f.celulas.filter(c => c.abertos > 0);
    if (abertos.length) aParte.push(`abertos ${abertos.map(c => `${rotuloDe(config.momentos, c.momento)} × ${rotuloDe(config.fatores, c.fator)} ${c.abertos}`).join(', ')}`);
    if (f.interrompidas) aParte.push(f.interrompidas === 1 ? '1 interrompida' : `${f.interrompidas} interrompidas`);
    return aParte.length ? `à parte: ${aParte.join('; ')}` : '';
}

/** O que faz: o dia curto do porquê (`28/10`; de outro ano, `30/12/2025`). */
function diaCurto(dia: string, hoje: string): string {
    if (!DIA.test(dia)) return dia;
    const [a, m, d] = dia.split('-');
    return a === String(hoje).slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/** A linha "Reputação" de um nó: a função, o nível e o porquê, em palavras. */
export interface LinhaDaReputacao {
    funcao: string;
    nivel: string;
    porque: string;
}

/**
 * O que faz: a linha "Reputação" do painel do nó: o nível (o rótulo do arquivo) e o porquê pelos
 * fatos que o produziram: as passagens, a última, as células e o que ficou à parte.
 * Por quê: a proposta (29/10) põe uma linha Reputação no painel do nó, com o nível e o porquê; de uma
 * função se mostra o nível e o porquê, e R não é placar (pesquisa, §3.4): a linha não diz R,
 * o peso inicial nem conta nenhuma, só o nível e os fatos.
 * Entra → sai: o id da função, a função lida (ou `null`, quando ela ainda não tem fato), o dia de
 * referência e o arquivo → a linha; `null` quando nenhum nível do arquivo vale.
 * Prova: tests/engine/reputacao.test.ts ("a linha do painel").
 */
export function linhaDaReputacao(funcao: string, f: ReputacaoDaFuncao | null, hoje: string, config: ReputacaoConfig): LinhaDaReputacao | null {
    if (!f || !f.rodadas) {
        const nivel = f?.nivel ?? nivelDe(0, 0, '', 1, hoje, config);
        if (!nivel) return null;
        const aParte = f ? aParteEmPalavras(f, config) : '';
        return { funcao, nivel: nivel.rotulo, porque: [AINDA_NAO_PASSOU, aParte].filter(Boolean).join('; ') };
    }
    if (!f.nivel) return null;
    const usadas = f.celulas.filter(c => c.passagens > 0);
    const partes = [`passou ${vezesEmPalavras(f.rodadas)}, a última em ${diaCurto(f.ultima, hoje)}${usadas.length ? `, em ${celulasEmPalavras(usadas, config)}` : ''}`];
    if (f.nivel.id === 'em_repouso' && f.ultima) partes.push(`sem passagem há ${diasEntre(f.ultima, hoje)} dias`);
    const aParte = aParteEmPalavras(f, config);
    if (aParte) partes.push(aParte);
    return { funcao, nivel: f.nivel.rotulo, porque: partes.join('; ') };
}

/**
 * O que faz: o nível de cada protocolo pedido (o rótulo e o grau de `reputacao.json`): o alias vale pelo
 * destino (até 3 saltos), e o que não tem tipo (o router, o id que não existe) fica de fora.
 * Entra → sai: a entrada pronta, o arquivo, o dia de referência e os ids → id → o rótulo e o grau.
 */
function niveisLidos(entrada: EntradaDaReputacao, config: ReputacaoConfig, hoje: string, ids: readonly string[]): Map<string, { rotulo: string; grau: number }> {
    const porId = new Map<string, DefProtocolo>();
    for (const d of entrada.defs || []) if (d && typeof d.id === 'string') porId.set(d.id, d);
    const destino = (id: string) => {
        let d = id;
        for (let i = 0; i < 3; i++) { const r = porId.get(d)?.redirect; if (typeof r === 'string' && r) d = r; else break; }
        return d;
    };
    const pedidos = [...new Set((ids || []).map(x => String(x ?? '')).filter(Boolean))];
    const lida = lerReputacaoDoCofre(entrada, config, hoje, { ids: [...new Set(pedidos.map(destino))] });
    const nivel = new Map(lida.funcoes.filter(f => f.nivel?.rotulo).map(f => [f.id, { rotulo: f.nivel!.rotulo, grau: f.nivel!.grau }]));
    const out = new Map<string, { rotulo: string; grau: number }>();
    for (const id of pedidos) { const n = nivel.get(destino(id)); if (n) out.set(id, n); }
    return out;
}

/**
 * O que faz: o nível de cada protocolo pedido, para a ordem que o peso propõe citar (`niveisLidos`).
 * Por quê: a ordem que o peso propõe passa a citar o nível (proposta, 29/10).
 * Entra → sai: a entrada pronta, o arquivo, o dia de referência e os ids → id → o rótulo do nível.
 * Prova: tests/engine/reputacao.test.ts ("o nível na ordem").
 */
export function niveisDasFuncoes(entrada: EntradaDaReputacao, config: ReputacaoConfig, hoje: string, ids: readonly string[]): Record<string, string> {
    return Object.fromEntries([...niveisLidos(entrada, config, hoje, ids)].map(([id, n]) => [id, n.rotulo]));
}

/**
 * O que faz: o grau do nível de cada protocolo pedido (o `grau` de `reputacao.json`, maior = mais
 * reputação), para o desempate da ordem (`rankOptions`), pela mesma leitura do nível citado.
 * Por quê: sem esses status, a regra geral é que mais reputação dá mais prioridade (02/11/2026):
 * no mesmo peso, o grau mais alto primeiro; o peso declarado decide antes.
 * Entra → sai: a entrada pronta, o arquivo, o dia de referência e os ids → id → o grau.
 * Prova: tests/engine/reputacao.test.ts ("o grau na ordem").
 */
export function grausDasFuncoes(entrada: EntradaDaReputacao, config: ReputacaoConfig, hoje: string, ids: readonly string[]): Record<string, number> {
    return Object.fromEntries([...niveisLidos(entrada, config, hoje, ids)].map(([id, n]) => [id, n.grau]));
}

/**
 * O que faz: a leitura inteira da reputação: as funções (todas as que têm fato no período,
 * ou a do id pedido), cada uma com R, nível, n, as células com as passagens, o porquê e o
 * sinal (não aplicado); e os módulos declarados, cada um com o nível da função mais fraca.
 * É o módulo que compõe as funções acima.
 * Por quê: "a reputação de um módulo vem das funções dele, pelo elo mais fraco" (proposta,
 * 29/10); "limitado por X", sem rebaixar o nível das funções (pesquisa, §3.2).
 * Entra → sai: a entrada pronta, o arquivo lido, o dia de referência e o filtro →
 * `ReputacaoLida`, na ordem de R (o maior primeiro) e depois do rótulo. Nenhum relógio.
 * Erro e ataque: dia de referência ilegível → nenhuma função; id que não existe → a função
 * sem fato (nova, se for protocolo de tipo conhecido) ou lista vazia; módulo com função sem
 * fato fica limitado por ela.
 * Prova: tests/engine/reputacao.test.ts.
 */
export function lerReputacaoDoCofre(entrada: EntradaDaReputacao, config: ReputacaoConfig, hoje: string, filtro: FiltroDaReputacao): ReputacaoLida {
    if (!DIA.test(String(hoje ?? ''))) return { hoje: String(hoje ?? ''), funcoes: [], modulos: [] };
    const fatos = fatosDaGrade(entrada, config, hoje);
    const porId = new Map<string, DefProtocolo>();
    for (const d of entrada.defs || []) if (d && typeof d.id === 'string') porId.set(d.id, d);
    const projetosObj = config.objetivos.lista.find(o => o.id === 'projetos');
    const notaDoTrimestre = projetosObj?.foco && entrada.trimestre
        ? (entrada.cofre || []).find(n => n?.path === `${projetosObj.foco!.pasta}/${entrada.trimestre}.md`) : undefined;
    const foco = focoDoTrimestre(notaDoTrimestre?.frontmatter, config);
    const interrompidas = new Map<string, Array<string>>();
    for (const r of entrada.rodadas || []) if (r.interrompida && r.dia <= hoje) interrompidas.set(r.protocolo, [...(interrompidas.get(r.protocolo) ?? []), r.dia]);

    const grupos = new Map<string, FatoDaGrade[]>();
    for (const f of fatos) grupos.set(f.funcao, [...(grupos.get(f.funcao) ?? []), f]);
    for (const id of interrompidas.keys()) if (!grupos.has(id) && tipoDoProtocolo(porId.get(id), config)) grupos.set(id, []);

    const umaFuncao = (id: string, lista: FatoDaGrade[]): ReputacaoDaFuncao | null => {
        const def = lista.find(f => f.protocolo)?.protocolo ?? porId.get(id);
        const tipo = config.tipos.find(t => t.id === lista[0]?.tipo) ?? tipoDoProtocolo(def, config);
        if (!tipo) return null;
        const meiaVida = meiaVidaDe(lista.some(f => f.protocolo) || !lista.length ? def : null, config);
        const conta = contaDaFuncao(lista, tipo.p0, meiaVida.dias, hoje, config);
        const nivel = nivelDe(conta.n, conta.rodadas, conta.ultima, meiaVida.dias, hoje, config);
        const base = {
            id, rotulo: lista[0]?.rotulo ?? String(def?.dailyLedgerLabel || def?.name || id),
            tipo: { id: tipo.id, rotulo: tipo.rotulo, p0: tipo.p0 }, meiaVida, r: conta.r, n: conta.n, rodadas: conta.rodadas,
            nivel: nivel ? { id: nivel.id, rotulo: nivel.rotulo, grau: nivel.grau } : null,
            celulas: conta.celulas, semMomento: conta.semMomento, interrompidas: (interrompidas.get(id) ?? []).length, ultima: conta.ultima,
        };
        return { ...base, porque: porqueDaFuncao(base, hoje, config), sinal: sinalDaFuncao(lista, entrada.cofre, foco, hoje, config) };
    };

    let ids: string[];
    if ('id' in filtro) ids = [String(filtro.id ?? '')];
    else if ('ids' in filtro) ids = [...new Set((filtro.ids || []).map(x => String(x ?? '')).filter(Boolean))];
    else {
        const { desde, ate } = filtro.periodo;
        const noPeriodo = (dia: string) => dia >= desde && dia <= ate;
        ids = [...grupos.keys()].filter(id => (grupos.get(id) ?? []).some(f => noPeriodo(f.dia)) || (interrompidas.get(id) ?? []).some(noPeriodo));
    }
    const funcoes = ids.map(id => umaFuncao(id, grupos.get(id) ?? [])).filter((f): f is ReputacaoDaFuncao => !!f)
        .sort((a, b) => b.r - a.r || a.rotulo.localeCompare(b.rotulo));

    const modulos: ReputacaoDoModulo[] = config.modulos.map(m => {
        const membros = m.funcoes.map(id => {
            const lida = umaFuncao(id, grupos.get(id) ?? []);
            const nivel = lida?.nivel ?? (() => { const n = nivelDe(0, 0, '', 1, hoje, config); return n ? { id: n.id, rotulo: n.rotulo, grau: n.grau } : null; })();
            return { id, rotulo: lida?.rotulo ?? id, nivel };
        });
        const graus = membros.map(x => x.nivel?.grau ?? -1);
        const menor = Math.min(...graus);
        const fracos = membros.filter(x => (x.nivel?.grau ?? -1) === menor);
        const nivel = fracos[0]?.nivel ?? null;
        return {
            id: m.id, rotulo: m.rotulo, nivel, limitadoPor: fracos.map(x => x.id),
            porque: `${nivel?.rotulo ?? 'sem nível'}, limitado por ${fracos.map(x => x.rotulo).join(' e ')}`,
        };
    });
    return { hoje, funcoes, modulos };
}
