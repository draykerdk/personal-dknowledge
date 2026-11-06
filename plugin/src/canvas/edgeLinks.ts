/**
 * A seta desenhada num canvas como dado da tarefa (Fase 2 do plano do
 * canvas de 13/10/2026; decisão 1, aprovada em 14/10/2026).
 *
 * Os pares que gravam (a direção só importa entre tarefas do mesmo nível):
 *
 * | Seta                       | Campo                                              |
 * |----------------------------|----------------------------------------------------|
 * | semana ↔ SMART ou ação     | `week` da tarefa                                   |
 * | dia ↔ ação                 | `scheduled` (a hora fica) e a `week` do dia        |
 * | SMART ↔ ação               | SMART mãe: acrescenta, herda `week`/`impacto` vazios |
 * | projeto ↔ SMART ou ação    | acrescenta o projeto em `projects`                 |
 * | tarefa → tarefa (mesmo nível) | `blockedBy` na de destino                       |
 *
 * Dia ↔ SMART não grava: a SMART é da semana; o dia vai na ação. Qualquer
 * outro par cujas duas pontas o DFM reconhece fica só como desenho.
 *
 * As pontas são o cabeçalho do canvas de projeto (`dfm-pc-proj`) e os nós de
 * arquivo (tarefa, nota da semana, nota do dia, índice ou `.canvas` de projeto).
 * A célula da semana (`dfm-qw-*`), o bloco do dia e o "📥 sem dia" (`dfm-q?-*`)
 * dos canvas do trimestre e da semana saíram em 06/11/2026: os canvas se
 * aposentaram em 02/11 e estão no Arquivo, onde abrem sem setas que gravam.
 *
 * `week` e `scheduled`: o último gesto vence. Mãe e projeto: a seta acrescenta
 * o vínculo e não apaga os outros (a regra do "Ligar a uma SMART…", que usa a
 * mesma `patchFor`).
 *
 * **Seta apagada desfaz (Fase 3, decisão 4a).** A relação que estava na linha de
 * base e sumiu, com as duas pontas ainda presentes e iguais, é gesto: `unpatchFor`
 * tira o campo (`week`/`scheduled` só se ainda têm aquele valor; a mãe sai e,
 * sem nenhuma outra mãe, a ação volta ao projeto da SMART; o projeto sai;
 * `blockedBy` filtra). Nó apagado, ou que saiu da zona porque a tarefa mudou,
 * não desfaz nada. Soltar a ponta de uma seta no vazio apaga a seta: é remoção.
 * Mover a ponta de uma seta (gerida ou não) desliga a ponta velha e liga a nova.
 *
 * **Ctrl+Z (L5).** Uma diferença que vem do histórico (`applyHistory`) e só toca
 * setas `dfm-*` é a sincronização sendo desfeita, não gesto: nem liga nem
 * desliga. Desfazer uma seta que você desenhou continua desligando o vínculo.
 *
 * Erro e ataque: uma seta `dfm-*` nova é do plano, nunca gesto; seta cuja ponta
 * o DFM não reconhece (nota do operador) é anotação, não grava nada e fica no
 * canvas (`annotationEdge`); seta que já estava na linha de base não grava de
 * novo. Prova: `tests/canvas/edgeLinks.test.ts`.
 *
 * Módulo puro: sem Obsidian.
 */
import { fold, linkTarget } from '../project/projectCanvasModel';
import { listOf } from '../tasks/taskRecord';
import { isManagedId } from './managedIds';
import type { KeepEdge } from './managedIds';
import { dayLabel, isoWeekOf, shortWeek } from '../engine/calendario';

/* ---------------------------------------------------------------- tipos */

/** A tarefa de uma ponta, com o que o patch precisa (`week`/`impacto` crus do frontmatter). */
export interface LinkTask {
    path: string;
    basename: string;
    type: string;
    /** Destinos de `projects`, sem `[[ ]]`. */
    projects: string[];
    week?: unknown;
    impacto?: unknown;
}

export interface ProjectRef {
    name: string;
    /** Nomes pelos quais as tarefas apontam o projeto (o nome e a nota-índice). */
    keys: string[];
}

/** O que um nó de arquivo é, quando não é tarefa. */
export type NoteRef =
    | { kind: 'week'; week: string }
    | { kind: 'day'; date: string }
    | { kind: 'project'; project: ProjectRef };

export type End =
    | { kind: 'week'; week: string }
    | { kind: 'day'; date: string; week: string }
    | { kind: 'smart'; task: LinkTask }
    | { kind: 'action'; task: LinkTask }
    | { kind: 'project'; project: ProjectRef };

/** O que os gerentes de canvas sabem dos próprios ids geridos. */
export interface ManagedScope {
    /** Projeto de cada nota-índice ou `.canvas` de projeto, pelo caminho. */
    projectsByFile?: Record<string, ProjectRef>;
    /** Projeto de um nó gerido pelo id exato (o cabeçalho `dfm-pc-proj` do canvas do projeto). */
    projectNodes?: Record<string, ProjectRef>;
}

export interface EdgeContext extends ManagedScope {
    /** A tarefa do nó de arquivo, ou `null`. */
    taskAt(path: string): LinkTask | null;
    /** Nota de semana, de dia ou de projeto do nó de arquivo, ou `null`. */
    noteAt(path: string): NoteRef | null;
    /** Há uma SMART com este nome? Decide se a ação ainda tem mãe depois de desligar uma. */
    isSmartName?(name: string): boolean;
}

export type LinkKind = 'week' | 'scheduled' | 'mother' | 'project' | 'blockedBy';

export interface Link {
    kind: LinkKind;
    /** Caminho da tarefa que muda. */
    task: string;
    /** Nome da tarefa que muda (para o aviso). */
    name: string;
    taskKind: 'smart' | 'action';
    /** Semana, data, SMART mãe, projeto ou tarefa que bloqueia. */
    value: string | null;
    /** `scheduled`: a semana do dia. */
    week?: string;
    /** `mother`: a SMART mãe. */
    smart?: LinkTask;
    /** `project`: os nomes do projeto (já em `fold`). */
    keys?: string[];
}

export type Patch = Record<string, unknown>;

interface NodeLike { id?: unknown; type?: unknown; file?: unknown }
interface EdgeLike { id?: unknown; fromNode?: unknown; toNode?: unknown }
export interface CanvasLike { nodes?: NodeLike[]; edges?: EdgeLike[] }

/* --------------------------------------------------------------- pontas */

/** Classifica a ponta de uma seta. `null` = o DFM não sabe o que é (anotação). */
export function endOf(node: NodeLike | null | undefined, ctx: EdgeContext): End | null {
    if (!node) return null;
    const id = String(node.id ?? '');

    const head = ctx.projectNodes?.[id];
    if (head) return { kind: 'project', project: head };

    if (node.type !== 'file' || typeof node.file !== 'string') return null;
    const path = node.file;
    const task = ctx.taskAt(path);
    if (task) return { kind: task.type === 'tarefa_smart' ? 'smart' : 'action', task };
    const byFile = ctx.projectsByFile?.[path];
    if (byFile) return { kind: 'project', project: byFile };
    const note = ctx.noteAt(path);
    if (!note) return null;
    if (note.kind === 'day') return { kind: 'day', date: note.date, week: isoWeekOf(note.date) };
    return note;
}

/* ---------------------------------------------------------------- pares */

const isTask = (e: End): e is Extract<End, { task: LinkTask }> => e.kind === 'smart' || e.kind === 'action';

/** A SMART mãe de uma ação: o mesmo vínculo para a seta e para o menu "Ligar a uma SMART…". */
export function motherLink(task: Pick<LinkTask, 'path' | 'basename'>, smart: LinkTask): Link {
    return { kind: 'mother', task: task.path, name: task.basename, taskKind: 'action', value: smart.basename, smart };
}

/** A tabela da decisão 1. Par sem sentido → `null`. */
export function linkFor(a: End, b: End): Link | null {
    // Tarefa → tarefa do mesmo nível: a de origem bloqueia a de destino.
    if (isTask(a) && isTask(b) && a.kind === b.kind) {
        if (a.task.path === b.task.path) return null;
        return { kind: 'blockedBy', task: b.task.path, name: b.task.basename, taskKind: b.kind, value: a.task.basename };
    }
    const pair = <X extends End['kind'], Y extends End['kind']>(x: X, y: Y): [Extract<End, { kind: X }>, Extract<End, { kind: Y }>] | null => {
        if (a.kind === x && b.kind === y) return [a as any, b as any];
        if (a.kind === y && b.kind === x) return [b as any, a as any];
        return null;
    };

    const week = pair('week', 'smart') ?? pair('week', 'action');
    if (week) {
        const [w, t] = week;
        return { kind: 'week', task: t.task.path, name: t.task.basename, taskKind: t.kind, value: w.week };
    }
    const day = pair('day', 'action');
    if (day) {
        const [d, t] = day;
        return { kind: 'scheduled', task: t.task.path, name: t.task.basename, taskKind: 'action', value: d.date, week: d.week };
    }
    const mother = pair('smart', 'action');
    if (mother) return motherLink(mother[1].task, mother[0].task);
    const project = pair('project', 'smart') ?? pair('project', 'action');
    if (project) {
        const [p, t] = project;
        return { kind: 'project', task: t.task.path, name: t.task.basename, taskKind: t.kind, value: p.project.name, keys: p.project.keys.map(fold) };
    }
    return null;
}

/** Chave semântica: a mesma relação desenhada duas vezes é uma só. */
export function linkKey(link: Link): string {
    return `${link.kind}|${link.task}|${link.value ?? ''}`;
}

const edgeSig = (e: EdgeLike) => `${String(e.id)}|${String(e.fromNode)}|${String(e.toNode)}`;

function nodeMap(data: CanvasLike): Map<string, NodeLike> {
    return new Map((data.nodes ?? []).map(n => [String(n?.id), n]));
}

/** A relação que uma seta desenha neste canvas, ou `null` (anotação ou par sem sentido). */
function linkOfEdge(edge: EdgeLike, nodes: Map<string, NodeLike>, ctx: EdgeContext): Link | null {
    const a = endOf(nodes.get(String(edge.fromNode)), ctx);
    const b = endOf(nodes.get(String(edge.toNode)), ctx);
    return a && b ? linkFor(a, b) : null;
}

/** Cada relação desenhada e as setas que a desenham. */
function carriersOf(data: CanvasLike, ctx: EdgeContext): Map<string, { link: Link; edges: EdgeLike[] }> {
    const nodes = nodeMap(data);
    const out = new Map<string, { link: Link; edges: EdgeLike[] }>();
    for (const edge of data.edges ?? []) {
        const link = linkOfEdge(edge, nodes, ctx);
        if (!link) continue;
        const key = linkKey(link);
        const was = out.get(key);
        if (was) was.edges.push(edge);
        else out.set(key, { link, edges: [edge] });
    }
    return out;
}

/** As relações que as setas de um canvas desenham, por chave semântica. */
export function linksOf(data: CanvasLike, ctx: EdgeContext): Map<string, Link> {
    return new Map([...carriersOf(data, ctx)].map(([key, c]) => [key, c.link]));
}

/** De onde veio a mudança da vista: gesto (`requestSave`) ou histórico (Ctrl+Z, Ctrl+Shift+Z). */
export interface DiffOptions { fromHistory?: boolean }

/**
 * Setas novas em relação à linha de base: id ou pontas que a base não tinha
 * (mover a ponta de uma seta mantém o id e muda a ponta). Seta `dfm-*` nova é do
 * plano e nunca conta; seta `dfm-*` que já existia e mudou de ponta foi movida
 * pelo operador, salvo quando a mudança vem do histórico (L5). Sem contexto:
 * serve de filtro barato antes de ler o vault.
 */
export function freshEdges(base: CanvasLike, cur: CanvasLike, opts: DiffOptions = {}): EdgeLike[] {
    const known = new Set((base.edges ?? []).map(edgeSig));
    const ids = new Set((base.edges ?? []).map(e => String(e?.id)));
    return (cur.edges ?? []).filter(e => !known.has(edgeSig(e))
        && (!isManagedId(e?.id) || (!opts.fromHistory && ids.has(String(e?.id)))));
}

/** Setas da linha de base que não estão mais (apagadas ou com a ponta movida). Filtro barato. */
export function goneEdges(base: CanvasLike, cur: CanvasLike): EdgeLike[] {
    const now = new Set((cur.edges ?? []).map(edgeSig));
    return (base.edges ?? []).filter(e => !now.has(edgeSig(e)));
}

export interface Meaningless { edge: EdgeLike; from: End; to: End }
export interface LinkDiff {
    /** Relações novas, na ordem em que as setas aparecem; para `week` e `scheduled`, a última de cada tarefa. */
    added: Link[];
    /** Relações desligadas: a seta sumiu e as duas pontas continuam lá. */
    removed: Link[];
    /** Setas novas entre pontas que o DFM reconhece, mas que não mudam campo. */
    meaningless: Meaningless[];
}

const SINGLE: ReadonlySet<LinkKind> = new Set(['week', 'scheduled']);

/** O que os gestos desde a linha de base pedem: ligar e desligar. */
export function diffLinks(base: CanvasLike, cur: CanvasLike, ctx: EdgeContext, opts: DiffOptions = {}): LinkDiff {
    const nodes = nodeMap(cur);
    const before = carriersOf(base, ctx);
    const after = linksOf(cur, ctx);
    const added = new Map<string, Link>();
    const meaningless: Meaningless[] = [];
    for (const edge of freshEdges(base, cur, opts)) {
        const from = endOf(nodes.get(String(edge.fromNode)), ctx);
        const to = endOf(nodes.get(String(edge.toNode)), ctx);
        if (!from || !to) continue;
        const link = linkFor(from, to);
        if (!link) { meaningless.push({ edge, from, to }); continue; }
        if (before.has(linkKey(link))) continue;
        // `week` e `scheduled` têm um valor só: na mesma leva, vence a última seta.
        const slot = SINGLE.has(link.kind) ? `${link.kind}|${link.task}` : linkKey(link);
        added.delete(slot);
        added.set(slot, link);
    }

    const removed: Link[] = [];
    for (const [key, { link, edges }] of before) {
        if (after.has(key)) continue;
        // A seta sumiu com as duas pontas presentes e iguais (o mesmo nó, a mesma
        // tarefa ou nota): é gesto. Nó apagado, ou que saiu da zona, não desfaz.
        const gone = edges.filter(e => {
            const again = linkOfEdge(e, nodes, ctx);
            return again !== null && linkKey(again) === key;
        });
        if (!gone.length) continue;
        // L5: o histórico que só tira setas do plano é a sincronização sendo desfeita.
        if (opts.fromHistory && gone.every(e => isManagedId(e?.id))) continue;
        removed.push(link);
    }
    return { added: [...added.values()], removed, meaningless };
}

/**
 * A seta é anotação (fica no canvas quando a zona é refeita)? Sim quando uma
 * das pontas o DFM não reconhece, ou quando o par não muda campo. A seta com
 * sentido de dado não fica: a zona desenha a seta gerida da mesma relação.
 */
export function annotationEdge(ctx: EdgeContext): KeepEdge<EdgeLike, NodeLike> {
    return (_edge, from, to) => {
        const a = endOf(from, ctx);
        const b = endOf(to, ctx);
        return !(a && b && linkFor(a, b));
    };
}

/* ---------------------------------------------------------------- patch */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** `2026-10-14T09:30` → `T09:30`; sem hora → `''`. */
function timeOf(raw: unknown): string {
    // Forma própria (não é a `DIA`): daqui se quer a hora que vem depois do dia (`T…`, com o fuso), não o dia.
    return String(listOf(raw)[0] ?? '').match(/^\d{4}-\d{2}-\d{2}(T.+)$/)?.[1] ?? '';
}

/** Alvo de um item de `blockedBy`: `[[x]]` ou `{uid: "[[x]]", reltype}`. */
function blockerOf(item: unknown): string {
    return linkTarget(item && typeof item === 'object' ? (item as any).uid : item);
}

/**
 * O patch que a relação pede ao frontmatter atual (`null` apaga o campo).
 * Nada a mudar → `null`, e nada é gravado.
 */
export function patchFor(fm: Record<string, any>, link: Link): Patch | null {
    const patch: Patch = {};
    switch (link.kind) {
        case 'week':
            if (!same(fm.week, link.value)) patch.week = link.value;
            break;
        case 'scheduled': {
            const next = `${link.value}${timeOf(fm.scheduled)}`;
            if (!same(fm.scheduled, next)) patch.scheduled = next;
            if (link.week && !same(fm.week, link.week)) patch.week = link.week;
            break;
        }
        case 'mother': {
            // Regra do Kernel (a mesma do "Ligar a uma SMART…"): sai o vínculo
            // direto com o projeto da SMART, ficam as outras mães, entra a SMART.
            const smart = link.smart!;
            const smartProjects = new Set(smart.projects.map(fold));
            const current = listOf(fm.projects);
            const kept = current.filter(l => !smartProjects.has(fold(linkTarget(l))));
            const has = kept.some(l => fold(linkTarget(l)) === fold(smart.basename));
            const projects = has ? kept : [...kept, `[[${smart.basename}]]`];
            if (!same(current, projects)) patch.projects = projects;
            if (!fm.week && smart.week) patch.week = smart.week;
            if (fm.impacto === undefined && smart.impacto !== undefined) patch.impacto = smart.impacto;
            break;
        }
        case 'project': {
            const keys = new Set(link.keys ?? [fold(String(link.value))]);
            const current = listOf(fm.projects);
            if (!current.some(l => keys.has(fold(linkTarget(l))))) patch.projects = [...current, `[[${link.value}]]`];
            break;
        }
        case 'blockedBy': {
            const current = listOf(fm.blockedBy);
            const target = fold(String(link.value));
            if (!current.some(item => fold(blockerOf(item)) === target)) patch.blockedBy = [...current, `[[${link.value}]]`];
            break;
        }
    }
    return Object.keys(patch).length ? patch : null;
}

/** Lista que ficou vazia sai do frontmatter. */
const listOrNull = (list: unknown[]): unknown[] | null => (list.length ? list : null);

/**
 * O patch que desliga a relação (seta apagada). Só desfaz o que ainda está lá:
 * `week`/`scheduled` com outro valor (um gesto mais novo, ou a tarefa mudada
 * por fora) ficam. Nada a mudar → `null`.
 *
 * Mãe: sai `[[SMART]]`; se a ação fica sem nenhuma SMART mãe, volta
 * `[[Projeto da SMART]]` (a ação vira solta no projeto). Quem é SMART diz
 * `ctx.isSmartName`; sem ele, o que sobra conta como projeto, não como mãe.
 */
export function unpatchFor(fm: Record<string, any>, link: Link, ctx: Pick<EdgeContext, 'isSmartName'> = {}): Patch | null {
    const patch: Patch = {};
    switch (link.kind) {
        case 'week':
            if (link.value && same(fm.week, link.value)) patch.week = null;
            break;
        case 'scheduled':
            if (link.value && String(listOf(fm.scheduled)[0] ?? '').slice(0, 10) === link.value) patch.scheduled = null;
            break;
        case 'mother': {
            const smart = fold(String(link.value));
            const current = listOf(fm.projects);
            const kept = current.filter(l => fold(linkTarget(l)) !== smart);
            if (kept.length === current.length) break;
            const hasMother = kept.some(l => ctx.isSmartName?.(linkTarget(l)) === true);
            const next = [...kept];
            if (!hasMother) {
                for (const project of link.smart?.projects ?? []) {
                    if (!next.some(l => fold(linkTarget(l)) === fold(project))) next.push(`[[${project}]]`);
                }
            }
            patch.projects = listOrNull(next);
            break;
        }
        case 'project': {
            const keys = new Set(link.keys ?? [fold(String(link.value))]);
            const current = listOf(fm.projects);
            const kept = current.filter(l => !keys.has(fold(linkTarget(l))));
            if (kept.length !== current.length) patch.projects = listOrNull(kept);
            break;
        }
        case 'blockedBy': {
            const current = listOf(fm.blockedBy);
            const target = fold(String(link.value));
            const kept = current.filter(item => fold(blockerOf(item)) !== target);
            if (kept.length !== current.length) patch.blockedBy = listOrNull(kept);
            break;
        }
    }
    return Object.keys(patch).length ? patch : null;
}

/* ---------------------------------------------------------------- textos */

const who = (kind: 'smart' | 'action') => (kind === 'smart' ? 'SMART' : 'Ação');

/** O aviso do gesto: "Ação X → W43". */
export function linkLabel(link: Link): string {
    switch (link.kind) {
        case 'week': return `${who(link.taskKind)} ${link.name} → ${shortWeek(String(link.value))}`;
        case 'scheduled': return `Ação ${link.name} → ${dayLabel(String(link.value))} (${shortWeek(String(link.week))})`;
        case 'mother': return `Ação ${link.name} → SMART ${link.value}`;
        case 'project': return `${who(link.taskKind)} ${link.name} → projeto ${link.value}`;
        case 'blockedBy': return `${link.value} bloqueia ${link.name}`;
    }
}

/** O aviso da seta apagada: "Desligado: Ação X ↛ W43". */
export function unlinkLabel(link: Link): string {
    const target = (() => {
        switch (link.kind) {
            case 'week': return `${who(link.taskKind)} ${link.name} ↛ ${shortWeek(String(link.value))}`;
            case 'scheduled': return `Ação ${link.name} ↛ ${dayLabel(String(link.value))}`;
            case 'mother': return `Ação ${link.name} ↛ SMART ${link.value}`;
            case 'project': return `${who(link.taskKind)} ${link.name} ↛ projeto ${link.value}`;
            case 'blockedBy': return `${link.value} ↛ ${link.name} (não bloqueia mais)`;
        }
    })();
    return `Desligado: ${target}`;
}

function endName(end: End): string {
    switch (end.kind) {
        case 'week': return shortWeek(end.week);
        case 'day': return dayLabel(end.date);
        case 'smart': return `SMART ${end.task.basename}`;
        case 'action': return end.task.basename;
        case 'project': return end.project.name;
    }
}

/** O aviso da seta que não muda campo. */
export function meaninglessLabel(from: End, to: End): string {
    const kinds = new Set([from.kind, to.kind]);
    const why = kinds.has('day') && kinds.has('smart')
        ? 'a SMART é da semana; o dia vai na ação'
        : 'esse par não muda campo';
    return `Seta ${endName(from)} → ${endName(to)} fica só como desenho: ${why}.`;
}
