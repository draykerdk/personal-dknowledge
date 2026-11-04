/**
 * Resolução de vínculos de tarefas e triagem contextual no Canvas Fractal (A2 / O2).
 *
 * Princípios de Engenharia DFM:
 * - Pureza funcional: sem mutação de entrada, determinismo absoluto.
 * - Resolução da cadeia: Ação -> SMART -> Projeto pelo campo `projects`.
 * - Casamento canônico por caminho: elimina colisão de homônimos entre áreas.
 * - Proteção de ciclos: rastreamento de referências com Set defensivo.
 * - Triagem explícita: tarefas sem projeto ou ambíguas são declaradas com motivo.
 */

import type { MissionCanvasIndex } from '../missionCanvasIndex';
import { railDay } from './canvasRailPlan';

export interface TaskCandidate {
    path: string;
    title?: string;
    project?: string | null;
    projects?: ReadonlyArray<string> | null;
    due?: string | null;
    type?: string | null;
}

export interface ProjectTarget {
    name: string;
    projectPath?: string | null;
    canvasPath?: string | null;
}

export interface TaskProjectLink {
    path: string;
    due: string;
    title?: string;
    type?: string;
}

export interface TaskTriageItem {
    path: string;
    title?: string;
    reason: string;
}

export interface ResolvedTaskProjectResult {
    candidates: TaskProjectLink[];
    orphans: TaskTriageItem[];
}

export interface ParsedLink {
    raw: string;
    cleanPath: string;
    cleanName: string;
    isPath: boolean;
}

export function parseTaskLink(raw: unknown): ParsedLink {
    const str = String(raw ?? '').trim();
    if (!str) return { raw: '', cleanPath: '', cleanName: '', isPath: false };
    const unbracketed = str.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    const parts = unbracketed.split('|');
    const cleanPath = parts[0].trim().replace(/\.md$/, '').replace(/\.canvas$/, '').trim();
    const isPath = cleanPath.includes('/');
    const cleanName = parts[1]?.trim() || (isPath ? (cleanPath.split('/').pop() ?? cleanPath) : cleanPath);
    return { raw: str, cleanPath, cleanName, isPath };
}

function taskRawLinks(t: TaskCandidate): string[] {
    const links: string[] = [];
    if (Array.isArray(t?.projects)) for (const p of t.projects) if (p) links.push(String(p));
    if (t?.project) links.push(String(t.project));
    return links;
}

export function matchesTargetProject(
    link: ParsedLink,
    target: ProjectTarget,
    index?: MissionCanvasIndex | null,
): { matched: boolean; ambiguous: boolean; reason?: string } {
    if (!link.cleanPath && !link.cleanName) {
        return { matched: false, ambiguous: false, reason: 'link vazio' };
    }
    const targetPath = target.projectPath ? target.projectPath.replace(/\.md$/, '').replace(/\.canvas$/, '').trim() : null;
    const targetName = target.name.trim();

    // 1. Casamento autoritativo por caminho
    if (link.isPath) {
        if (targetPath && (link.cleanPath === targetPath || link.cleanPath.startsWith(targetPath + '/'))) {
            return { matched: true, ambiguous: false };
        }
        if (target.canvasPath && link.cleanPath === target.canvasPath.replace(/\.canvas$/, '').trim()) {
            return { matched: true, ambiguous: false };
        }
        return { matched: false, ambiguous: false, reason: 'caminho aponta para outro local' };
    }

    // 2. Casamento por nome simples com blindagem contra homônimos
    const nameMatches = Boolean(targetName && (
        link.cleanName.toLowerCase() === targetName.toLowerCase() ||
        link.cleanPath.toLowerCase() === targetName.toLowerCase()
    ));
    if (!nameMatches) return { matched: false, ambiguous: false, reason: 'nome não confere' };

    if (index?.ambiguousProjectNames?.includes(targetName)) {
        return { matched: false, ambiguous: true, reason: `Vínculo ambíguo: nome de projeto "${targetName}" existe em múltiplas áreas` };
    }
    if (index?.byProject && targetPath) {
        const mapped = index.byProject.get(targetName);
        if (mapped?.projectPath && mapped.projectPath !== targetPath) {
            return { matched: false, ambiguous: true, reason: `Vínculo direcionado a outro projeto homônimo (${mapped.projectPath})` };
        }
    }
    return { matched: true, ambiguous: false };
}

interface TaskLookupMaps {
    byPath: Map<string, TaskCandidate>;
    byName: Map<string, TaskCandidate>;
    ambiguousNames: Set<string>;
}

function buildTaskLookup(tasks: ReadonlyArray<TaskCandidate>): TaskLookupMaps {
    const byPath = new Map<string, TaskCandidate>();
    const byName = new Map<string, TaskCandidate>();
    const ambiguousNames = new Set<string>();

    for (const t of tasks) {
        const path = String(t?.path ?? '').trim();
        if (!path) continue;
        byPath.set(path, t);
        byPath.set(path.replace(/\.md$/, ''), t);

        const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
        if (basename) {
            if (byName.has(basename) && byName.get(basename)?.path !== path) ambiguousNames.add(basename);
            else byName.set(basename, t);
        }
        const title = String(t?.title ?? '').trim();
        if (title) {
            if (byName.has(title) && byName.get(title)?.path !== path) ambiguousNames.add(title);
            else byName.set(title, t);
        }
    }
    return { byPath, byName, ambiguousNames };
}

function findReferencedTask(link: ParsedLink, lookup: TaskLookupMaps): TaskCandidate | null {
    if (lookup.byPath.has(link.cleanPath)) return lookup.byPath.get(link.cleanPath)!;
    if (lookup.byPath.has(link.cleanPath + '.md')) return lookup.byPath.get(link.cleanPath + '.md')!;
    if (!link.isPath && !lookup.ambiguousNames.has(link.cleanName) && lookup.byName.has(link.cleanName)) {
        return lookup.byName.get(link.cleanName)!;
    }
    return null;
}

function resolveTaskLinksChain(
    task: TaskCandidate,
    lookup: TaskLookupMaps,
    visited: Set<string> = new Set(),
): { allLinks: ParsedLink[]; hasCycle: boolean } {
    const taskPath = String(task?.path ?? '').trim();
    if (visited.has(taskPath)) return { allLinks: [], hasCycle: true };
    const currentVisited = new Set(visited);
    if (taskPath) currentVisited.add(taskPath);

    const allLinks: ParsedLink[] = [];
    let hasCycle = false;
    for (const raw of taskRawLinks(task)) {
        const parsed = parseTaskLink(raw);
        if (!parsed.cleanPath && !parsed.cleanName) continue;
        const parentTask = findReferencedTask(parsed, lookup);
        if (parentTask && parentTask.path !== taskPath) {
            const parent = resolveTaskLinksChain(parentTask, lookup, currentVisited);
            if (parent.hasCycle) hasCycle = true;
            allLinks.push(...parent.allLinks);
        } else {
            allLinks.push(parsed);
        }
    }
    return { allLinks, hasCycle };
}

export function resolveProjectTasks(
    tasks: ReadonlyArray<TaskCandidate> | null | undefined,
    project: string | ProjectTarget,
    exists: (path: string) => boolean,
    index?: MissionCanvasIndex | null,
): ResolvedTaskProjectResult {
    const target: ProjectTarget = typeof project === 'string' ? { name: project } : project;
    const candidates: TaskProjectLink[] = [];
    const orphans: TaskTriageItem[] = [];
    const taskList = tasks ?? [];
    const lookup = buildTaskLookup(taskList);
    const seenCandidates = new Set<string>();

    for (const tarefa of taskList) {
        const path = String(tarefa?.path ?? '').trim();
        if (!path) continue;
        const rawLinks = taskRawLinks(tarefa);
        if (rawLinks.length === 0) {
            orphans.push({ path, title: tarefa.title, reason: 'Tarefa sem projeto ou entrega SMART vinculada' });
            continue;
        }

        const { allLinks, hasCycle } = resolveTaskLinksChain(tarefa, lookup);
        if (hasCycle && allLinks.length === 0) {
            orphans.push({ path, title: tarefa.title, reason: 'Ciclo de dependências detectado sem resolução para projeto válido' });
            continue;
        }

        let matched = false;
        let ambiguousReason: string | undefined;
        for (const link of allLinks) {
            const result = matchesTargetProject(link, target, index);
            if (result.matched) { matched = true; break; }
            if (result.ambiguous) ambiguousReason = result.reason;
        }

        if (matched) {
            if (!seenCandidates.has(path) && exists(path)) {
                seenCandidates.add(path);
                candidates.push({ path, due: railDay(tarefa?.due), title: tarefa.title, type: tarefa.type ?? undefined });
            }
        } else if (ambiguousReason) {
            orphans.push({ path, title: tarefa.title, reason: ambiguousReason });
        }
    }

    candidates.sort((a, b) => {
        if (a.due !== b.due) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });

    return { candidates, orphans };
}

export function tarefasDoProjeto(
    tasks: ReadonlyArray<TaskCandidate> | null | undefined,
    projeto: string | ProjectTarget,
    exists: (path: string) => boolean,
    index?: MissionCanvasIndex | null,
): Array<{ path: string; due: string }> {
    const { candidates } = resolveProjectTasks(tasks, projeto, exists, index);
    return candidates.map(c => ({ path: c.path, due: c.due }));
}

export function triageOrphanTasks(
    tasks: ReadonlyArray<TaskCandidate> | null | undefined,
    index?: MissionCanvasIndex | null,
): TaskTriageItem[] {
    const dummyTarget: ProjectTarget = { name: '__NO_MATCH__' };
    const { orphans } = resolveProjectTasks(tasks, dummyTarget, () => true, index);
    return orphans;
}
