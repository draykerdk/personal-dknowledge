/**
 * O tempo da Missão: o lugar de cada TaskNote no tempo, a hora marcada, o que ficou de
 * antes, as linhas de cada escala e as contas de data.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.4) e o plano (3c.4 e 3d.3). A
 * feita cai na conclusão; a aberta, no agendado, depois no prazo, depois na semana; algum
 * dia e sem data ficam em prateleiras; a cancelada é neutra. A tarefa que veio só pela
 * semana fica de antes só quando a semana acabou (a fase 1 de 27/10, `81095a6d`, a
 * marcava pendente já na terça). As linhas não têm janela fixa: vão até onde há dado,
 * com um limite por escala.
 *
 * O estado de cada TaskNote (feita, algum dia, cancelada, aberta) vem da tabela de
 * estados da tarefa (`Config/dominios/tarefa.json`, Passo 0, 0b), passada pela borda.
 *
 * Módulo puro: sem Obsidian e sem DOM. As semanas e os trimestres são os de sempre
 * (`isoWeekOf`, `quarterOfWeek`: o trimestre da semana é o da quinta-feira dela).
 * Prova: tests/missao/tempo.test.ts.
 */
import type { DomainState } from '../engine/domainModel';
import type { TaskRecord } from '../tasks/taskRecord';
import { classeDaTarefa } from './estados';
import { DIA, ehSemana, partesDoTrimestre } from './formatos';
import { isoWeekOf, periodOfWeeks, quarterOfWeek, quarterWeeks, weekDates } from '../engine/calendario';

export type Escala = 'dia' | 'semana' | 'trimestre' | 'ano';
export const ESCALAS: readonly Escala[] = ['dia', 'semana', 'trimestre', 'ano'];

export type Prateleira = 'algum-dia' | 'sem-data';
export const PRATELEIRAS: readonly Prateleira[] = ['algum-dia', 'sem-data'];
export type ChaveEspecial = Prateleira | 'antes' | 'depois';

/** De onde veio o dia da tarefa na linha. */
export type FonteDoDia = 'conclusao' | 'agendado' | 'prazo' | 'semana';

/**
 * O lugar de uma TaskNote: numa linha do tempo, numa das prateleiras ou neutra (a
 * cancelada). Toda TaskNote tem um lugar só.
 */
export interface Colocacao {
    lugar: 'linha' | Prateleira | 'neutra';
    /** O dia em que cai (`AAAA-MM-DD`); `null` fora da linha. */
    dia: string | null;
    fonte: FonteDoDia | null;
    semana: string | null;
    trimestre: string | null;
    ano: string | null;
    /** `HH:MM` quando cai pelo agendado com hora; senão vazio. */
    hora: string;
    /** Veio só pela semana: no dia, fica na segunda, com a marca "da semana". */
    daSemana: boolean;
}


/** As linhas da tabela de estados da tarefa (por status). */
export type EstadosDaTarefa = readonly DomainState[];

export const estaFeita = (r: Pick<TaskRecord, 'status'>, estados: EstadosDaTarefa) => classeDaTarefa(r.status, estados) === 'feita';
export const estaCancelada = (r: Pick<TaskRecord, 'status'>, estados: EstadosDaTarefa) => classeDaTarefa(r.status, estados) === 'cancelada';
export const estaAlgumDia = (r: Pick<TaskRecord, 'status'>, estados: EstadosDaTarefa) => classeDaTarefa(r.status, estados) === 'algum-dia';
/** A marca do estado que pede a triagem (`tarefa.json`, a `entrada`, o `inbox`; D1, 02/11). */
export const MARCA_DA_TRIAGEM = 'triagem';

/** Aberta: nem feita, nem cancelada, nem algum dia (status vazio, ou fora da tabela, é aberta). */
export const estaAberta = (r: Pick<TaskRecord, 'status'>, estados: EstadosDaTarefa) => classeDaTarefa(r.status, estados) === 'aberta';

/* ------------------------------------------------------------------ datas */

/** O que faz: soma dias a uma data `AAAA-MM-DD` (UTC). */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** O que faz: a semana `n` semanas depois (antes, se negativo). */
export function addWeeks(week: string, n: number): string {
    const monday = weekDates(week)[0];
    return monday ? isoWeekOf(addDays(monday, 7 * n)) : week;
}

/** O que faz: o trimestre `n` trimestres depois (antes, se negativo). */
export function addQuarters(quarter: string, n: number): string {
    const p = partesDoTrimestre(quarter);
    if (!p) return quarter;
    const k = p.ano * 4 + p.trimestre - 1 + n;
    return `${Math.floor(k / 4)}-Q${(((k % 4) + 4) % 4) + 1}`;
}

/** O que faz: o ano `n` anos depois (antes, se negativo). */
export function addYears(year: string, n: number): string {
    return /^\d{4}$/.test(String(year)) ? String(Number(year) + n) : year;
}

/** O que faz: anda `n` períodos numa escala a partir de uma chave. */
export function andar(escala: Escala, chave: string, n: number): string {
    if (escala === 'dia') return addDays(chave, n);
    if (escala === 'semana') return addWeeks(chave, n);
    if (escala === 'trimestre') return addQuarters(chave, n);
    return addYears(chave, n);
}

/** O que faz: o trimestre de um dia pela regra da quinta-feira (o da semana dele). */
export function trimestreDoDia(date: string): string | null {
    return quarterOfWeek(isoWeekOf(date));
}

/** O que faz: a chave do período de hoje numa escala. */
export function chaveDeHoje(escala: Escala, hoje: string): string {
    if (escala === 'dia') return hoje;
    const week = isoWeekOf(hoje);
    if (escala === 'semana') return week;
    const quarter = quarterOfWeek(week) ?? '';
    return escala === 'trimestre' ? quarter : quarter.slice(0, 4);
}

/** O que faz: as datas de um período (o dia; os 7 da semana; as semanas do trimestre e do ano). */
export function diasDoPeriodo(escala: Escala, chave: string): string[] {
    if (escala === 'dia') return DIA.test(chave) ? [chave] : [];
    if (escala === 'semana') return weekDates(chave);
    if (escala === 'trimestre') return periodOfWeeks(quarterWeeks(chave)).dates as string[];
    if (!/^\d{4}$/.test(chave)) return [];
    return periodOfWeeks(semanasDoAno(chave)).dates as string[];
}

/** O que faz: as semanas de um ano (as dos quatro trimestres dele). */
export function semanasDoAno(year: string): string[] {
    return [1, 2, 3, 4].flatMap(q => quarterWeeks(`${year}-Q${q}`));
}

/* ----------------------------------------------------- o lugar no tempo */

const shelf = (lugar: Colocacao['lugar']): Colocacao => ({
    lugar, dia: null, fonte: null, semana: null, trimestre: null, ano: null, hora: '', daSemana: false,
});

/**
 * O que faz: o lugar de uma TaskNote no tempo (3c.4). A cancelada é neutra; a de algum
 * dia vai para a prateleira "Algum dia"; a feita cai na conclusão (sem ela, no agendado,
 * no prazo ou na semana); a aberta cai no agendado, depois no prazo, depois na semana
 * (na segunda dela, com a marca "da semana"); sem nada, a prateleira "Sem data".
 * Por quê: "a feita cai na data de conclusão; a aberta, no agendado, depois no prazo,
 * depois na semana" (27/10); a hora é o próprio `scheduled` (3d.3).
 * Entra → sai: a TaskNote e a tabela de estados da tarefa → `Colocacao` (sempre uma, nunca nula).
 * Erro e ataque: `week` e datas malformadas são ignoradas; status em maiúsculas vale;
 * status fora da tabela fica no tempo, como a aberta.
 * Prova: tests/missao/tempo.test.ts ("o lugar de cada coisa no tempo").
 */
export function lugarNoTempo(record: Pick<TaskRecord, 'status' | 'scheduled' | 'due' | 'week' | 'completedDate'> & { scheduledTime?: string }, estados: EstadosDaTarefa): Colocacao {
    const classe = classeDaTarefa(record.status, estados);
    if (classe === 'cancelada') return shelf('neutra');
    if (classe === 'algum-dia') return shelf('algum-dia');
    const week = ehSemana(String(record.week ?? '').trim()) ? String(record.week).trim() : '';
    const date = (v: unknown) => (DIA.test(String(v ?? '').slice(0, 10)) ? String(v).slice(0, 10) : '');
    const scheduled = date(record.scheduled);
    const due = date(record.due);
    const completed = date(record.completedDate);
    let dia = '';
    let fonte: FonteDoDia | null = null;
    if (classe === 'feita' && completed) { dia = completed; fonte = 'conclusao'; }
    else if (scheduled) { dia = scheduled; fonte = 'agendado'; }
    else if (due) { dia = due; fonte = 'prazo'; }
    else if (week && weekDates(week)[0]) { dia = weekDates(week)[0]; fonte = 'semana'; }
    if (!dia || !fonte) return shelf('sem-data');
    const semana = fonte === 'semana' ? week : isoWeekOf(dia);
    const trimestre = quarterOfWeek(semana);
    const hora = fonte === 'agendado' ? String(record.scheduledTime ?? '') : '';
    return { lugar: 'linha', dia, fonte, semana, trimestre, ano: trimestre ? trimestre.slice(0, 4) : null, hora, daSemana: fonte === 'semana' };
}

/**
 * O que faz: diz se uma TaskNote ficou de antes: aberta, na linha, com o dia já passado.
 * A que veio só pela semana fica de antes só quando a semana acabou (o domingo dela
 * passou), não na terça.
 * Por quê: a correção da semana (arquitetura 8.4): o dia da tarefa só da semana é a
 * segunda por desenho, não por prazo.
 * Entra → sai: a TaskNote, o lugar dela, hoje e a tabela de estados → sim/não.
 * Prova: tests/missao/tempo.test.ts ("ficou de antes").
 */
export function ficouDeAntes(record: Pick<TaskRecord, 'status'>, c: Colocacao, hoje: string, estados: EstadosDaTarefa): boolean {
    if (!estaAberta(record, estados) || c.lugar !== 'linha' || !c.dia) return false;
    if (c.daSemana) {
        const domingo = weekDates(c.semana ?? '')[6];
        return !!domingo && domingo < hoje;
    }
    return c.dia < hoje;
}

/** O que faz: a chave de um lugar numa escala (o dia, a semana, o trimestre, o ano); fora da linha, `null`. */
export function chaveNaEscala(c: Colocacao, escala: Escala): string | null {
    if (c.lugar !== 'linha') return null;
    return escala === 'dia' ? c.dia : escala === 'semana' ? c.semana : escala === 'trimestre' ? c.trimestre : c.ano;
}

/* ------------------------------------------------------------------ linhas */

/**
 * Quantos períodos de cada lado de hoje as linhas têm no mínimo (as 24 que a página
 * desenha em volta do foco, arquitetura 9.2) e no máximo (o que passa vai para "antes"
 * e "depois"). Dentro disso, as linhas vão até a tarefa mais antiga e a mais distante.
 */
export const MARGEM: Record<Escala, number> = { dia: 24, semana: 24, trimestre: 8, ano: 3 };
export const LIMITE: Record<Escala, number> = { dia: 400, semana: 120, trimestre: 24, ano: 10 };

/** As linhas de uma escala: do `fim` (o futuro, em cima) ao `inicio` (o passado, embaixo). */
export interface Janela { escala: Escala; inicio: string; fim: string }

/** Um recorte de datas (`de` a `ate`, inclusivos), o `periodo` dos filtros. */
export interface Recorte { de: string; ate: string }

/** O que faz: a chave de um dia numa escala. */
export function chaveDoDia(escala: Escala, date: string): string {
    return chaveDeHoje(escala, date);
}

/**
 * O que faz: a janela de uma escala: de hoje menos a margem até hoje mais a margem,
 * alargada até a primeira e a última chave com tarefa, sem passar do limite. Com
 * recorte (o `periodo` dos filtros), só as chaves dele.
 * Por quê: "a janela não é fixa em 28 dias antes e 35 depois" (arquitetura 11); o que
 * passa do limite fica em "antes" e "depois", e nada some.
 * Entra → sai: escala, hoje, as chaves com tarefa nessa escala e o recorte → `Janela`.
 * Erro e ataque: recorte invertido é desvirado; chaves vazias dão só a margem.
 * Prova: tests/missao/tempo.test.ts ("as linhas").
 */
export function janelaDe(escala: Escala, hoje: string, chaves: Iterable<string>, recorte: Recorte | null = null): Janela {
    if (recorte && DIA.test(recorte.de) && DIA.test(recorte.ate)) {
        const [de, ate] = recorte.de <= recorte.ate ? [recorte.de, recorte.ate] : [recorte.ate, recorte.de];
        return { escala, inicio: chaveDoDia(escala, de), fim: chaveDoDia(escala, ate) };
    }
    const agora = chaveDeHoje(escala, hoje);
    const menor = andar(escala, agora, -LIMITE[escala]);
    const maior = andar(escala, agora, LIMITE[escala]);
    let inicio = andar(escala, agora, -MARGEM[escala]);
    let fim = andar(escala, agora, MARGEM[escala]);
    for (const k of chaves) {
        if (!k) continue;
        if (k < inicio) inicio = k < menor ? menor : k;
        if (k > fim) fim = k > maior ? maior : k;
    }
    return { escala, inicio, fim };
}

/** O que faz: as chaves da janela, do futuro ao passado. */
export function chavesDaJanela(janela: Janela): string[] {
    const out: string[] = [];
    for (let k = janela.fim, guard = 0; k >= janela.inicio && guard < 5000; k = andar(janela.escala, k, -1), guard++) out.push(k);
    return out;
}

/** O que faz: a linha em que um lugar cai (a prateleira, o período, "antes" ou "depois"); a neutra, `null`. */
export function linhaDe(c: Colocacao, janela: Janela): string | null {
    if (c.lugar === 'neutra') return null;
    if (c.lugar !== 'linha') return c.lugar;
    const k = chaveNaEscala(c, janela.escala);
    if (!k) return 'sem-data';
    if (k > janela.fim) return 'depois';
    if (k < janela.inicio) return 'antes';
    return k;
}

export const isChaveEspecial = (k: string): k is ChaveEspecial => k === 'algum-dia' || k === 'sem-data' || k === 'antes' || k === 'depois';

/** O que faz: o id do nó central de uma linha (`d:`, `w:`, `q:`, `y:` ou `x:<escala>:<chave>`). */
export function idDoPeriodo(escala: Escala, chave: string): string {
    if (isChaveEspecial(chave)) return `x:${escala}:${chave}`;
    return `${escala === 'dia' ? 'd' : escala === 'semana' ? 'w' : escala === 'trimestre' ? 'q' : 'y'}:${chave}`;
}

/** O que faz: a escala e a chave de um id de período; outro id, `null`. */
export function periodoDoId(id: string): { escala: Escala; chave: string } | null {
    const k = String(id ?? '');
    if (k.startsWith('x:')) {
        const [, e, chave] = k.split(':');
        return ESCALAS.includes(e as Escala) && chave ? { escala: e as Escala, chave } : null;
    }
    const map: Record<string, Escala> = { 'd:': 'dia', 'w:': 'semana', 'q:': 'trimestre', 'y:': 'ano' };
    const escala = map[k.slice(0, 2)];
    return escala ? { escala, chave: k.slice(2) } : null;
}

export const ehHoje = (escala: Escala, chave: string, hoje: string) => chave === chaveDeHoje(escala, hoje);

/** O que `pendentesDe` lê de uma tarefa (a forma da `MissaoTarefa`, sem depender dela). */
export interface TarefaNoTempo { colocacao: Colocacao; deAntes: boolean; aberta: boolean }

/** De que linha se perguntam as que ficaram de antes: só a de hoje, ou também a seguinte (a que se planeja). */
export type AteDasPendentes = 'hoje' | 'seguinte';

/**
 * O que faz: as que ficaram de antes e uma linha mostra ao lado (as de um período anterior ao dela). A linha
 * de hoje mostra as que ficaram (`deAntes`); com `'seguinte'`, a linha do período seguinte ao de hoje (a
 * semana que se planeja no domingo) mostra também as que ainda estão abertas no período de hoje, que é o
 * que vai ficar quando ele acabar.
 * Por quê: a linha de hoje sempre mostrou o que ficou (8.4 da arquitetura); e no domingo, segundo o
 * levantamento de 02/11 (item 8), a semana que se planeja é a seguinte, e ela não mostrava o que ficou.
 * Entra → sai: as tarefas, a escala, a chave da linha, hoje e até onde → as que ficaram, na ordem da entrada.
 * Erro e ataque: outra linha (nem a de hoje, nem a seguinte pedida) não mostra nada; a prateleira e a tarefa
 * fora da linha não ficam de antes; a feita e a de algum dia não contam (só as abertas).
 * Prova: tests/missao/borboleta.test.ts e tests/missao/ramoDaSemana.test.ts ("o que ficou").
 */
export function pendentesDe<T extends TarefaNoTempo>(visiveis: readonly T[], escala: Escala, chave: string, hoje: string, ate: AteDasPendentes = 'hoje'): T[] {
    const deHoje = chaveDeHoje(escala, hoje);
    const seguinte = ate === 'seguinte' && !isChaveEspecial(chave) && chave === andar(escala, deHoje, 1);
    if (chave !== deHoje && !seguinte) return [];
    return visiveis.filter(t => {
        const own = chaveNaEscala(t.colocacao, escala);
        if (!own || own >= chave) return false;
        return t.deAntes || (seguinte && t.aberta && own === deHoje);
    });
}

/**
 * O que faz: leva o foco de uma escala a outra: o dia vai à semana, ao trimestre e ao
 * ano dele; o período de hoje volta a hoje; outro período, ao primeiro dia dele.
 * Prateleira fica prateleira.
 * Prova: tests/missao/estadoTela.test.ts ("troca de escala").
 */
export function levarFoco(de: Escala, chave: string, para: Escala, hoje: string): string {
    if (de === para || isChaveEspecial(chave)) return chave;
    let dia = chave;
    if (de !== 'dia') dia = chave === chaveDeHoje(de, hoje) ? hoje : diasDoPeriodo(de, chave)[0] ?? hoje;
    return chaveDoDia(para, dia);
}

/* ------------------------------------------------------------------ rótulos */

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** O que faz: `2026-10-27` → `27/10`. */
export function diaMes(date: string): string {
    const [, m, d] = String(date).split('-');
    return d && m ? `${d.slice(0, 2)}/${m}` : date;
}

/**
 * O que faz: `2026-10-27` → `ter 27/10/2026`: o dia com o ano, como o ramo, o painel, os campos e as
 * coleções o escrevem (eram seis cópias da mesma conta até 30/10).
 */
export const diaComAno = (date: string) => `${diaDaSemana(date)} ${diaMes(date)}/${String(date).slice(0, 4)}`;

/** O que faz: `2026-10-27` → `ter`. */
export function diaDaSemana(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(d.getTime()) ? WEEKDAY[d.getUTCDay()] : '';
}

/** O que faz: `2026-W44` → `W44`. */
export const semanaCurta = (week: string) => `W${String(week).slice(-2)}`;

/* ------------------------------------------------------------------ a escada da pinça (o terceiro eixo) */

/**
 * Um nível do panorama: as quatro escalas; o longo prazo (o período da visão de longo prazo); o
 * sistema (o sistema inteiro, do começo até hoje); e, por último, o grafo do cofre, que é a vista
 * de grafo do próprio Obsidian (fora da Missão).
 */
export type NivelDoPanorama = Escala | 'longo-prazo' | 'sistema' | 'grafo';

/**
 * A escada da expansão, do detalhe ao panorama (30/10/2026): depois da visão do ano vem a visão geral
 * do período da visão de longo prazo, depois uma visão do sistema todo, do começo até agora, e depois
 * o grafo do Obsidian.
 */
export const ESCADA_DO_PANORAMA: readonly NivelDoPanorama[] = ['dia', 'semana', 'trimestre', 'ano', 'longo-prazo', 'sistema', 'grafo'];

/** Os níveis declarados que ainda não existem: a escada para antes deles, com o aviso (hoje, nenhum). */
export const NIVEIS_FUTUROS: readonly NivelDoPanorama[] = [];

/** Os níveis que abrem fora da Missão (o grafo do Obsidian): a escada não anda; quem chama abre a vista de lá. */
export const NIVEIS_DE_FORA: readonly NivelDoPanorama[] = ['grafo'];

/** Um passo de nível: `-1` aproxima (entra no ramo, vai ao detalhe), `1` afasta (a expansão), como no `zoomDaEscala`. */
export type PassoDeNivel = -1 | 1;
/** Aproximar: o zoom, para o detalhe e para dentro do ramo. */
export const APROXIMA: PassoDeNivel = -1;
/** Afastar: a expansão, para o panorama. */
export const AFASTA: PassoDeNivel = 1;

/** Quantos níveis o ramo de um nó desce, no máximo (cada zoom no mesmo nó entra mais um). */
export const PROFUNDIDADE_MAXIMA = 4;
/** Quantos zooms seguidos a pilha guarda, no máximo (o que passa disso não entra). */
export const PILHA_MAXIMA = 8;

/** Por que um passo do terceiro eixo não andou. */
export type PorQueNaoAnda = 'ponta' | 'ainda-nao-existe' | 'fora-da-missao' | 'pilha-cheia' | 'fundo-do-ramo';

/** O resultado de um degrau: o nível de chegada, ou o mesmo nível e por que não se anda. */
export interface DegrauDaEscada {
    nivel: NivelDoPanorama;
    mudou: boolean;
    porque?: PorQueNaoAnda;
    /** Com `ainda-nao-existe`: o nível futuro que se pediu. */
    alvo?: NivelDoPanorama;
}

/**
 * O que faz: o degrau seguinte da escada do panorama: a partir de um nível, um passo para o
 * detalhe (`APROXIMA`) ou para o panorama (`AFASTA`).
 * Por quê: a proposta da pinça (29/10): o gesto de expansão vai mostrando as escalas do panorama geral
 * a partir da escala padrão (Dia → Semana → Trimestre →
 * Ano → longo prazo; o grafo do cofre, numa fase seguinte).
 * Entra → sai: o nível e o passo → `{ nivel, mudou: true }`, ou o mesmo nível com `mudou: false`
 * e o porquê: `ponta` nas pontas da escada, `ainda-nao-existe` (com o `alvo`) diante de um nível futuro,
 * `fora-da-missao` (com o `alvo`) diante do grafo, que quem chama abre no Obsidian.
 * Erro e ataque: um nível desconhecido não anda (nunca vai a um nível inventado); um passo que
 * não é ±1 também não; um passo anda um degrau só.
 * Prova: tests/missao/pinca.test.ts ("a escada").
 */
export function degrauDaEscada(nivel: NivelDoPanorama, passo: PassoDeNivel): DegrauDaEscada {
    const i = ESCADA_DO_PANORAMA.indexOf(nivel);
    if (i < 0 || (passo !== APROXIMA && passo !== AFASTA)) return { nivel, mudou: false, porque: 'ponta' };
    const alvo = ESCADA_DO_PANORAMA[i + passo];
    if (!alvo) return { nivel, mudou: false, porque: 'ponta' };
    if (NIVEIS_FUTUROS.includes(alvo)) return { nivel, mudou: false, porque: 'ainda-nao-existe', alvo };
    if (NIVEIS_DE_FORA.includes(alvo)) return { nivel, mudou: false, porque: 'fora-da-missao', alvo };
    return { nivel: alvo, mudou: true };
}

/**
 * O que faz: a escala de tempo de um nível do panorama; o longo prazo e o grafo não são escala (`null`).
 * Por quê: a tela de hoje desenha as quatro escalas; o longo prazo é uma vista própria, que vem depois.
 * Entra → sai: o nível → a escala, ou `null`.
 * Erro e ataque: um texto qualquer dá `null`.
 * Prova: tests/missao/pinca.test.ts ("a escada").
 */
export function escalaDoNivel(nivel: NivelDoPanorama): Escala | null {
    return (ESCALAS as readonly string[]).includes(nivel) ? (nivel as Escala) : null;
}

/** Um zoom guardado na pilha: o nó em que se entrou e quantos níveis do ramo dele se veem. */
export interface ZoomNoRamo { id: string; profundidade: number }

/**
 * Onde se está no terceiro eixo: o nível do panorama, a pilha dos zooms (o último no fim) e a
 * escala de onde a expansão partiu (`partida`). Sem `partida`, o próprio nível é a partida: ela só
 * existe enquanto a expansão está acima dela, e sai quando a volta chega lá.
 */
export interface NivelDaNavegacao { nivel: NivelDoPanorama; pilha: readonly ZoomNoRamo[]; partida?: NivelDoPanorama }

/** O resultado de um passo no terceiro eixo: o estado seguinte e, quando não muda, por quê. */
export interface PassoDaNavegacao {
    estado: NivelDaNavegacao;
    mudou: boolean;
    porque?: PorQueNaoAnda;
    /** Com `ainda-nao-existe`: o nível futuro que se pediu. */
    alvo?: NivelDoPanorama;
}

/**
 * O que faz: o começo do terceiro eixo: o nível de partida (o Dia, sem outro) e a pilha vazia.
 * Por quê: o Dia é o padrão (a proposta da pinça, 29/10); a página pode abrir noutra escala.
 * Entra → sai: o nível de partida → `NivelDaNavegacao`.
 * Erro e ataque: um nível fora da escada, futuro, ou de fora (o grafo), vira o Dia.
 * Prova: tests/missao/pinca.test.ts ("a pilha").
 */
export function navegacaoInicial(nivel: NivelDoPanorama = 'dia'): NivelDaNavegacao {
    return { nivel: ESCADA_DO_PANORAMA.includes(nivel) && !NIVEIS_FUTUROS.includes(nivel) && !NIVEIS_DE_FORA.includes(nivel) ? nivel : 'dia', pilha: [] };
}

/**
 * O que faz: a escala de onde a expansão partiu: a `partida` guardada, ou o próprio nível sem ela
 * (ou com uma `partida` fora da escada, ou acima do nível).
 * Por quê: o zoom no panorama volta a expansão até a escala de onde ela partiu (30/10), e só lá
 * entra no ramo do nó; a regra precisa saber qual é essa escala.
 * Entra → sai: o estado → o nível de partida.
 * Erro e ataque: uma `partida` inventada, fora da escada, ou acima do nível (um estado montado à
 * mão) vale como nenhuma: o próprio nível; nunca leva a um nível que não existe.
 * Prova: tests/missao/pinca.test.ts ("a volta pelo zoom").
 */
export function partidaDaExpansao(estado: NivelDaNavegacao): NivelDoPanorama {
    const p = estado.partida;
    return p && ESCADA_DO_PANORAMA.includes(p) && ESCADA_DO_PANORAMA.indexOf(p) < ESCADA_DO_PANORAMA.indexOf(estado.nivel) ? p : estado.nivel;
}

/**
 * O que faz: um passo no terceiro eixo, com a pilha dos zooms. Afastar desfaz primeiro o último
 * zoom da pilha e, com ela vazia, sobe uma escala (e guarda de onde partiu). Aproximar, acima da
 * escala de onde a expansão partiu e sem zoom na pilha, desce uma escala, com nó sob o gesto ou
 * sem: a volta da expansão. Na escala de partida (ou abaixo dela), aproximar sobre um nó entra no
 * ramo dele (um nível mais fundo, se já se está nele); aproximar sem nó desce mais um nível no
 * ramo do topo da pilha ou, com ela vazia, desce uma escala.
 * Por quê: a proposta da pinça (29/10): o zoom da pinça vai ao ramo específico do objeto, cada zoom
 * seguinte entra mais fundo, e a expansão volta às escalas anteriores do zoom antes de abrir o
 * panorama, até a escala de onde se partiu. E a volta pelo zoom (30/10: na última tela não havia zoom
 * de volta): no Sistema, abrir os dedos sobre um trimestre
 * entrava no ramo dele em vez de voltar; o zoom no panorama é simétrico à expansão, degrau por
 * degrau, até a escala de partida, e só nela entra no ramo.
 * Entra → sai: o estado, o passo e o nó sob o gesto (`null` = nenhum) → `PassoDaNavegacao` (a
 * entrada não é mutada; o nível fica o mesmo enquanto há zoom na pilha; a `partida` vai junto
 * enquanto a expansão está acima dela, e sai ao chegar nela).
 * Erro e ataque: o ramo não passa de `PROFUNDIDADE_MAXIMA` (`fundo-do-ramo`) e a pilha não passa
 * de `PILHA_MAXIMA` (`pilha-cheia`); id vazio vale como nenhum nó; o nível futuro não abre
 * (`ainda-nao-existe`); nas pontas, nada muda (`ponta`); uma `partida` fora da escada ou acima do
 * nível vale como nenhuma.
 * Prova: tests/missao/pinca.test.ts ("a pilha", "a volta pelo zoom").
 */
export function passoDaNavegacao(estado: NivelDaNavegacao, passo: PassoDeNivel, alvo: string | null = null): PassoDaNavegacao {
    const pilha = [...estado.pilha];
    const topo = pilha[pilha.length - 1];
    const partida = partidaDaExpansao(estado);
    /** O estado com o nível e a pilha dados, com a partida só enquanto ela fica abaixo do nível. */
    const com = (nivel: NivelDoPanorama, p: readonly ZoomNoRamo[]): NivelDaNavegacao =>
        ESCADA_DO_PANORAMA.indexOf(partida) < ESCADA_DO_PANORAMA.indexOf(nivel) ? { nivel, pilha: p, partida } : { nivel, pilha: p };
    const fica = (porque: PorQueNaoAnda, futuro?: NivelDoPanorama): PassoDaNavegacao => ({ estado, mudou: false, porque, ...(futuro ? { alvo: futuro } : {}) });
    const empilha = (z: ZoomNoRamo): PassoDaNavegacao => {
        if (z.profundidade > PROFUNDIDADE_MAXIMA) return fica('fundo-do-ramo');
        if (pilha.length >= PILHA_MAXIMA) return fica('pilha-cheia');
        return { estado: com(estado.nivel, [...pilha, z]), mudou: true };
    };
    const escada = (p: PassoDeNivel): PassoDaNavegacao => {
        const d = degrauDaEscada(estado.nivel, p);
        return d.mudou ? { estado: com(d.nivel, []), mudou: true } : fica(d.porque ?? 'ponta', d.alvo);
    };
    if (passo === AFASTA) return pilha.length ? { estado: com(estado.nivel, pilha.slice(0, -1)), mudou: true } : escada(AFASTA);
    if (passo !== APROXIMA) return fica('ponta');
    // A volta da expansão: acima da escala de partida, o zoom desce um degrau, mesmo sobre um nó.
    if (!topo && partida !== estado.nivel) return escada(APROXIMA);
    const id = typeof alvo === 'string' && alvo.trim() ? alvo : null;
    if (id) return empilha({ id, profundidade: topo && topo.id === id ? topo.profundidade + 1 : 1 });
    if (topo) return empilha({ id: topo.id, profundidade: topo.profundidade + 1 });
    return escada(APROXIMA);
}
