/**
 * A decisão por pesos categóricos (arquitetura universal de 19/10, 3.7 e 4.2).
 *
 * "cada tipo de função categorica da algum peso ali, é o padrão para as tomadas de
 * decisão": toda escolha do sistema é uma soma de pesos, e cada categoria da unidade
 * (status, urgência, prazo, horizonte, importância, projeto, vínculos e aprendizado)
 * contribui com o seu. A tabela é uma só, num lugar só
 * (`200 - FUNCTIONS/Config/pesos_decisao.json`): ajustar ali vale no gesto, na pauta e
 * em quem mais pontuar. Este módulo só calcula; quem lê o arquivo e as tarefas é o
 * serviço da árvore do agora (`nowTreeService.ts`).
 *
 * O peso propõe a ordem, com o porquê; a escolha é sua: cada pontuação devolve os motivos que contaram, em
 * texto curto, para a sugestão dizer numa linha por que está ali.
 */
import { parseImpactScore, parseMinutes } from './taskSemantics';
import { taskContextsFrom } from './taskContexts';
import { diaNoTexto, partesDoDia } from './dia';
import { learnedFit, type BlockRecord } from './blockLog';
import { semanaOuVazio } from './periodo';

/** O arquivo da tabela de pesos: a fonte única, lida pelo plugin e pelos scripts. */
export const DECISION_WEIGHTS_PATH = '200 - FUNCTIONS/Config/pesos_decisao.json';

export interface WeightTable {
    /** Urgência declarada (`priority` do TaskNotes): high, normal, low, none. */
    urgencia: Record<string, number>;
    /** Urgência pelo prazo (`due`). */
    prazo: { vencida: number; hoje: number; semana: number };
    /** Estado (`status`): in-progress, next-action… */
    status: Record<string, number>;
    /** `scheduled` de hoje. */
    agendada_hoje: number;
    /** `week` da semana em foco, ou a tarefa é da SMART da vez. */
    semana_ou_smart: number;
    /** Cada tarefa aberta que tem esta em `blockedBy`, até `maximo`. */
    trava_outras: { cada: number; maximo: number };
    /** 🔥 aberta sem o seu 📤, ou 📤 pendente. */
    par_ignicao_soltar: number;
    /** `impacto` (1 a 10) dividido por este número. */
    impacto_divisor: number;
    /** A tarefa é de um projeto da Temporada. */
    temporada: number;
    /** O mesmo tipo de tarefa já rendeu neste lugar e neste tamanho de bloco. */
    aprendizado: number;
    /**
     * O hábito em treino como candidato na escolha da hora (2.29, plano de 22/10):
     * `hoje` para o que espera a marca de hoje, `meta_semana` para o que ainda não
     * chegou à `meta_semanal`. É categoria da árvore do agora, não bloco de domínio.
     */
    habito: { hoje: number; meta_semana: number };
}

export interface WeightTableParse {
    table: WeightTable;
    /** O que o arquivo não trouxe ou trouxe errado (vale 0 até ser corrigido). */
    problemas: string[];
}

/**
 * O que faz: transforma o JSON do arquivo de pesos numa tabela completa e válida.
 * Por quê: a tabela é editada à mão pelo operador; um número faltando ou escrito
 * errado não pode derrubar o gesto nem virar um peso inventado aqui.
 * Entra → sai: qualquer valor → { table, problemas }; campo ausente ou não numérico
 * vale 0 e entra na lista dos problemas.
 * Erro e ataque: texto, `null`, número negativo (aceito: é escolha de quem edita), divisor 0
 * (o impacto deixa de contar, sem dividir por zero).
 * Prova: tests/engine/decisionWeights.test.ts ("tabela").
 */
export function parseWeightTable(raw: unknown): WeightTableParse {
    const problemas: string[] = [];
    const source: any = raw && typeof raw === 'object' && (raw as any).pesos && typeof (raw as any).pesos === 'object'
        ? (raw as any).pesos
        : (raw && typeof raw === 'object' ? raw : {});
    const number = (value: unknown, label: string): number => {
        const n = typeof value === 'number' ? value : Number.NaN;
        if (Number.isFinite(n)) return n;
        problemas.push(label);
        return 0;
    };
    const map = (value: unknown, label: string): Record<string, number> => {
        const out: Record<string, number> = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            problemas.push(label);
            return out;
        }
        for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
            if (typeof n === 'number' && Number.isFinite(n)) out[key] = n;
            else problemas.push(`${label}.${key}`);
        }
        return out;
    };
    const prazo = source.prazo && typeof source.prazo === 'object' ? source.prazo : {};
    if (!source.prazo) problemas.push('prazo');
    const trava = source.trava_outras && typeof source.trava_outras === 'object' ? source.trava_outras : {};
    if (!source.trava_outras) problemas.push('trava_outras');
    const habito = source.habito && typeof source.habito === 'object' && !Array.isArray(source.habito) ? source.habito : {};
    if (!source.habito) problemas.push('habito');
    return {
        table: {
            urgencia: map(source.urgencia, 'urgencia'),
            prazo: {
                vencida: number(prazo.vencida, 'prazo.vencida'),
                hoje: number(prazo.hoje, 'prazo.hoje'),
                semana: number(prazo.semana, 'prazo.semana'),
            },
            status: map(source.status, 'status'),
            agendada_hoje: number(source.agendada_hoje, 'agendada_hoje'),
            semana_ou_smart: number(source.semana_ou_smart, 'semana_ou_smart'),
            trava_outras: {
                cada: number(trava.cada, 'trava_outras.cada'),
                maximo: number(trava.maximo, 'trava_outras.maximo'),
            },
            par_ignicao_soltar: number(source.par_ignicao_soltar, 'par_ignicao_soltar'),
            impacto_divisor: number(source.impacto_divisor, 'impacto_divisor'),
            temporada: number(source.temporada, 'temporada'),
            aprendizado: number(source.aprendizado, 'aprendizado'),
            habito: {
                hoje: number(habito.hoje, 'habito.hoje'),
                meta_semana: number(habito.meta_semana, 'habito.meta_semana'),
            },
        },
        problemas: [...new Set(problemas)],
    };
}

/** A unidade (arquitetura 3.1) com só o que a decisão lê, já normalizada. */
export interface TaskUnit {
    path: string;
    name: string;
    type: string;
    status: string;
    priority: string;
    due: string;
    scheduled: string;
    week: string;
    contexts: string[];
    minutes: number | null;
    impacto: number | null;
    /** Nomes das notas em `projects` (o pai: SMART, projeto ou departamento). */
    projects: string[];
    blockedBy: string[];
    tags: string[];
    peca: string;
    recurring: boolean;
    /** A regra de recorrência (`recurrence`, RRULE do TaskNotes); vazio se não é recorrente. */
    recurrence?: string;
    /** As instâncias já concluídas e puladas da recorrente (`complete_instances`, `skipped_instances`). */
    completeInstances?: string[];
    skippedInstances?: string[];
    archived: boolean;
    /** `completedDate`, `AAAA-MM-DD` (vazio se não concluída). */
    completed: string;
    /** A natureza da SMART (`manutencao`, 02/11); sem o campo na nota, a chave não existe. */
    natureza?: string;
}

/**
 * O que faz: o nome da nota apontada por um valor de link.
 * Aceita `"[[Nota|rótulo]]"`, `"[[pasta/Nota.md]]"`, um Link do Dataview (`{ path }`),
 * a dependência do TaskNotes (`{ uid }`) e texto puro.
 */
export function linkName(value: unknown): string {
    const raw: any = value && typeof value === 'object'
        ? ((value as any).uid ?? (value as any).path ?? '')
        : value;
    return String(raw ?? '')
        .replace(/^\s*\[\[|\]\]\s*$/g, '')
        .split('|')[0]
        .split('#')[0]
        .split('/')
        .pop()!
        .replace(/\.md$/, '')
        .trim();
}

/**
 * O que faz: lista um valor que pode ser item solto, lista, lista do Dataview ou vazio.
 * Por quê: os pesos, a temporada e o valor da semana leem campos que o frontmatter e o Dataview
 * entregam de formas diferentes; um lugar só para a regra (a cópia vigiada `copia:listOf`).
 * Entra → sai: qualquer valor → lista (a lista recebida volta a mesma, sem cópia).
 * Erro e ataque: `undefined`, `null` e '' dão []; um objeto iterável vira lista; o resto vira um item.
 */
export function listOf(value: unknown): unknown[] {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value;
    if (typeof (value as any)?.[Symbol.iterator] === 'function') return Array.from(value as any);
    return [value];
}

/** O que faz: `AAAA-MM-DD` de um texto ISO ou de uma data do Dataview (`toFormat`); senão `''`. */
export function dayOf(value: unknown): string {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && typeof (first as any).toFormat === 'function') return String((first as any).toFormat('yyyy-MM-dd'));
    return diaNoTexto(String(first ?? ''));
}

/**
 * O que faz: normaliza o frontmatter de uma tarefa (ou uma página do Dataview) na
 * unidade que a decisão lê.
 * Por quê: a mesma pontuação serve ao gesto (frontmatter do metadataCache) e à pauta
 * (páginas do Dataview); sem isto cada leitor teria a própria leitura dos campos.
 * Entra → sai: objeto qualquer e o caminho → TaskUnit (nunca lança; campo estranho
 * vira vazio).
 */
export function taskUnitFrom(raw: Record<string, any> | null | undefined, path: string): TaskUnit {
    const fm: Record<string, any> = raw && typeof raw === 'object' ? raw : {};
    const name = String(path ?? '').split('/').pop()!.replace(/\.md$/, '');
    const week = semanaOuVazio(fm.week);
    const tags = listOf(fm.tags)
        .map(tag => String(tag ?? '').trim().replace(/^#/, ''))
        .filter(tag => tag && tag !== 'task');
    return {
        path: String(path ?? ''),
        name,
        type: String(fm.type ?? 'task'),
        status: String(fm.status ?? '').trim().toLowerCase(),
        priority: String(fm.priority ?? '').trim().toLowerCase(),
        due: dayOf(fm.due),
        scheduled: dayOf(fm.scheduled),
        week,
        contexts: taskContextsFrom(listOf(fm.contexts).map(c => String(c ?? ''))),
        minutes: parseMinutes(fm.timeEstimate),
        impacto: parseImpactScore(fm.impacto),
        projects: listOf(fm.projects).map(linkName).filter(Boolean),
        blockedBy: listOf(fm.blockedBy).map(linkName).filter(Boolean),
        tags,
        peca: String(fm.peca ?? ''),
        recurring: Boolean(fm.recurrence || fm.rrule || fm.recurrence_parent),
        recurrence: String(fm.recurrence ?? fm.rrule ?? '').trim(),
        completeInstances: listOf(fm.complete_instances).map(dayOf).filter(Boolean),
        skippedInstances: listOf(fm.skipped_instances).map(dayOf).filter(Boolean),
        archived: fm.archived === true || String(fm.archived) === 'true' || /(^|\/)Archive\//.test(String(path ?? '')),
        completed: dayOf(fm.completedDate),
        ...(String(listOf(fm.natureza)[0] ?? '').trim() ? { natureza: String(listOf(fm.natureza)[0]).trim() } : {}),
    };
}

const CLOSED = new Set(['done', 'cancelled', 'completed', 'canceled']);

/** O que faz: a tarefa saiu do fluxo aberto (concluída, cancelada ou arquivada). */
export function isClosedUnit(unit: TaskUnit): boolean {
    return CLOSED.has(unit.status) || unit.archived;
}

/** Os vínculos entre tarefas que pesam na decisão (calculados uma vez para a lista toda). */
export interface TaskRelations {
    /** Nome → quantas tarefas abertas a têm em `blockedBy`. */
    blocking: Map<string, number>;
    /** Nome → a tarefa está aberta (o bloqueio só vale enquanto quem bloqueia está aberto). */
    open: Map<string, boolean>;
    /** 🔥 abertas que ainda não têm o seu 📤. */
    ignitionWithoutRelease: Set<string>;
    /** 📤 liberados: a 🔥 de que dependem já saiu. */
    releasePending: Set<string>;
}

/**
 * O que faz: este 📤 é o par desta 🔥? Com `blockedBy`, só se ele aponta a 🔥; sem
 * `blockedBy` (o 📤 criado pela ⚡ com "Sem 🔥 par", ligado só pela SMART), se os dois
 * têm um `projects` em comum.
 * Por quê: é a regra da pauta (`soltarPendentes`, em `day_context.js`); com uma regra
 * só, o mesmo par vale no peso da decisão (a 🔥 "ainda sem o 📤") e no 📤 pendente.
 */
export function isReleaseOf(release: Pick<TaskUnit, 'blockedBy' | 'projects'>, ignition: Pick<TaskUnit, 'name' | 'projects'>): boolean {
    if (release.blockedBy.length > 0) return release.blockedBy.includes(ignition.name);
    return ignition.projects.some(project => release.projects.includes(project));
}

/**
 * O que faz: calcula, para a lista inteira, quem trava quem e os pares 🔥 → 📤.
 * Por quê: "o que está esperando terminar" pesa (tarefas bloqueadas por esta, 🔥 sem
 * o 📤 dela; decisão de 18/10). O 📤 pendente segue a regra do `soltarPendentes`
 * da pauta: com `blockedBy`, só quando todas as 🔥 que o bloqueiam saíram; sem, quando
 * uma 🔥 da mesma SMART saiu.
 * Entra → sai: TaskUnit[] → TaskRelations (a entrada não é mutada).
 */
export function buildTaskRelations(units: TaskUnit[]): TaskRelations {
    const list = Array.isArray(units) ? units : [];
    const open = new Map<string, boolean>();
    for (const unit of list) open.set(unit.name, !isClosedUnit(unit));
    const blocking = new Map<string, number>();
    for (const unit of list) {
        if (isClosedUnit(unit)) continue;
        for (const blocker of new Set(unit.blockedBy)) blocking.set(blocker, (blocking.get(blocker) ?? 0) + 1);
    }
    const ignitions = list.filter(unit => unit.peca === 'ignicao');
    const ignitionStatus = new Map(ignitions.map(unit => [unit.name, unit.status]));
    const releases = list.filter(unit => unit.peca === 'soltar' && unit.status !== 'cancelled' && unit.status !== 'canceled');
    const ignitionWithoutRelease = new Set<string>();
    for (const ignition of ignitions) {
        if (isClosedUnit(ignition)) continue;
        if (!releases.some(release => isReleaseOf(release, ignition))) ignitionWithoutRelease.add(ignition.name);
    }
    const releasePending = new Set<string>();
    const doneIgnitions = ignitions.filter(unit => unit.status === 'done');
    for (const release of releases) {
        if (isClosedUnit(release)) continue;
        const ignitionBlockers = release.blockedBy.filter(name => ignitionStatus.has(name));
        const released = release.blockedBy.length > 0
            ? ignitionBlockers.length > 0 && ignitionBlockers.every(name => ignitionStatus.get(name) === 'done')
            : doneIgnitions.some(ignition => isReleaseOf(release, ignition));
        if (released) releasePending.add(release.name);
    }
    return { blocking, open, ignitionWithoutRelease, releasePending };
}

/**
 * O que faz: todos os ancestrais de uma lista de pais, subindo por `parentsOf` até
 * `maxDepth` níveis (ação → SMART → projeto → departamento).
 * Por quê: a SMART da vez e a Temporada estão acima da ação; um campo de ligação só
 * (`projects`, arquitetura 3.2) é o caminho para chegar a elas.
 * Erro e ataque: ciclo de `projects` (A → B → A) para no nome já visto.
 */
export function lineageOf(parents: string[], parentsOf: (name: string) => string[], maxDepth = 4): string[] {
    const seen = new Set<string>();
    let level = (parents || []).filter(Boolean);
    for (let depth = 0; depth < maxDepth && level.length; depth++) {
        const next: string[] = [];
        for (const name of level) {
            if (seen.has(name)) continue;
            seen.add(name);
            for (const parent of parentsOf(name) || []) if (parent && !seen.has(parent)) next.push(parent);
        }
        level = next;
    }
    return [...seen];
}

/** O contexto de uma decisão: o dia, a semana e o que o plano pôs em foco. */
export interface DecisionContext {
    /** `AAAA-MM-DD`. */
    hoje: string;
    /** `AAAA-Www` (semana ISO de `hoje`). */
    semana: string;
    /** Nomes das SMART da vez (em andamento nesta semana). */
    smartsDaVez: string[];
    /** Nomes dos projetos/departamentos da Temporada. */
    temporada: string[];
    /** Onde estou (um dos contextos de `taskContexts.ts`); vazio = qualquer lugar. */
    lugar?: string;
    /** Tamanho do bloco escolhido, em minutos (o "tempo que tenho"). */
    blocoMin?: number | null;
    /** Os blocos registrados (a reputação contextual); sem dado, o aprendizado vale 0. */
    reputacao?: BlockRecord[];
    /** Nome da tarefa → todos os ancestrais pelo `projects` (inclui os pais diretos). */
    linhagem?: Map<string, string[]>;
}

export interface WeightReason {
    chave: string;
    pontos: number;
    texto: string;
}

export interface TaskScore {
    pontos: number;
    motivos: WeightReason[];
}

/** O que faz: a semana ISO (`AAAA-Www`) de um dia `AAAA-MM-DD`; texto inválido → `''`. */
export function isoWeekOf(day: string): string {
    const partes = partesDoDia(String(day ?? ''));
    if (!partes) return '';
    const date = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia));
    if (Number.isNaN(date.getTime())) return '';
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const PRIORITY_LABEL: Record<string, string> = { high: 'alta', normal: 'normal', low: 'baixa', none: 'nenhuma' };
const STATUS_LABEL: Record<string, string> = { 'in-progress': '▶️ em andamento', 'next-action': 'próxima ação' };

/** Uma casa decimal, sem ",0": 2,7 · 3. */
export function formatPoints(points: number): string {
    const rounded = Math.round(points * 10) / 10;
    return String(rounded).replace('.', ',');
}

/**
 * O que faz: soma os pesos de uma tarefa no contexto e diz quais contaram.
 * Por quê: a tabela 4.2 da arquitetura (aprovada em 19/10, com urgência e status): o
 * planejado pesa mais, a escolha é sempre dele.
 * Entra → sai: unidade, contexto, tabela e vínculos → { pontos, motivos } com só os
 * pesos que deram ponto, do maior para o menor. Não muta nada.
 * Erro e ataque: data inválida não conta; `impacto` fora de 1–10 é limitado por
 * `parseImpactScore`; divisor 0 não divide.
 * Prova: tests/engine/decisionWeights.test.ts (um caso por categoria).
 */
export function scoreTask(unit: TaskUnit, ctx: DecisionContext, table: WeightTable, relations?: TaskRelations): TaskScore {
    const motivos: WeightReason[] = [];
    const add = (chave: string, pontos: number, texto: string) => {
        if (Number.isFinite(pontos) && pontos !== 0) motivos.push({ chave, pontos, texto });
    };

    const priority = unit.priority || 'none';
    add('urgencia', table.urgencia[priority] ?? 0, `❗ urgência ${PRIORITY_LABEL[priority] ?? priority}`);

    if (unit.due && ctx.hoje) {
        if (unit.due < ctx.hoje) add('prazo', table.prazo.vencida, '⚠️ prazo passou');
        else if (unit.due === ctx.hoje) add('prazo', table.prazo.hoje, '⏰ vence hoje');
        else if (ctx.semana && isoWeekOf(unit.due) === ctx.semana) add('prazo', table.prazo.semana, '📅 vence nesta semana');
    }

    add('status', table.status[unit.status] ?? 0, STATUS_LABEL[unit.status] ?? unit.status);

    if (unit.scheduled && unit.scheduled === ctx.hoje) add('agendada_hoje', table.agendada_hoje, '🗓️ planejada para hoje');

    const linhagem = new Set([...unit.projects, ...(ctx.linhagem?.get(unit.name) ?? [])]);
    const daSmart = (ctx.smartsDaVez || []).some(name => linhagem.has(name));
    if (daSmart) add('semana_ou_smart', table.semana_ou_smart, '🎯 da SMART da vez');
    else if (unit.week && unit.week === ctx.semana) add('semana_ou_smart', table.semana_ou_smart, '🗓️ na semana em foco');

    const travadas = Math.min(relations?.blocking.get(unit.name) ?? 0, Math.max(0, table.trava_outras.maximo));
    if (travadas > 0) add('trava_outras', travadas * table.trava_outras.cada, `⛓️ trava ${travadas} ${travadas === 1 ? 'tarefa' : 'tarefas'}`);

    if (relations?.ignitionWithoutRelease.has(unit.name)) add('par_ignicao_soltar', table.par_ignicao_soltar, '🔥 ainda sem o 📤');
    else if (relations?.releasePending.has(unit.name)) add('par_ignicao_soltar', table.par_ignicao_soltar, '📤 pronto para sair');

    if (unit.impacto !== null && table.impacto_divisor > 0) {
        add('impacto', unit.impacto / table.impacto_divisor, `⭐ importância ${unit.impacto}`);
    }

    if ((ctx.temporada || []).some(name => linhagem.has(name))) add('temporada', table.temporada, '🌟 da Temporada');

    if (ctx.lugar && ctx.reputacao?.length && learnedFit(ctx.reputacao, {
        projeto: unit.projects[0] ?? '',
        tags: unit.tags,
        lugar: ctx.lugar,
        bloco_min: ctx.blocoMin ?? null,
    })) add('aprendizado', table.aprendizado, '🧠 já rendeu aqui neste tamanho de bloco');

    const ordered = motivos
        .map((motivo, index) => ({ motivo, index }))
        .sort((a, b) => b.motivo.pontos - a.motivo.pontos || a.index - b.index)
        .map(entry => entry.motivo);
    const pontos = ordered.reduce((total, motivo) => total + motivo.pontos, 0);
    return { pontos, motivos: ordered };
}
