/**
 * Planejamento puro de nós de arquivo de contexto fractal.
 *
 * Determina quais canvas de projeto, cockpits de área ou cockpit do sistema
 * faltam no canvas atual para contextualização visual completa da árvore.
 */

import { COCKPIT_PATH } from '../canvasTree';
import type { CanvasIndexEntry, MissionCanvasIndex } from '../missionCanvasIndex';
import { areaCockpitOf, canvasesOfArea } from '../missionCanvasIndex';
import type { FractalScale } from '../missionFractal';
import { railNodeIdFor } from './canvasSplice';
import type {
    FractalContextNode,
    FractalContextPlan,
    FractalContextRequest,
    FractalContextRole,
    FractalContextSkip,
} from './canvasFractalModel';
import {
    FRACTAL_CONTEXT_CRITERION,
    FRACTAL_CONTEXT_LIMIT,
    FRACTAL_HEADER_SKIP,
} from './canvasFractalModel';

export function vazio(scale: FractalScale, reason: string): FractalContextPlan {
    return {
        kind: 'skip',
        scale,
        nodes: [],
        already: [],
        skipped: [],
        truncated: 0,
        criterion: FRACTAL_CONTEXT_CRITERION,
        reason,
    };
}

export function findEntry(index: MissionCanvasIndex | null | undefined, canvasPath: string): CanvasIndexEntry | null {
    return (index?.entries ?? []).find(entry => entry?.path === canvasPath) ?? null;
}

export function areaOfCanvas(index: MissionCanvasIndex | null | undefined, canvasPath: string, entry: CanvasIndexEntry | null): string {
    if (entry?.area) return entry.area;
    for (const [areaId, cockpit] of index?.byAreaCockpit ?? []) {
        if (cockpit?.path === canvasPath) return areaId;
    }
    return '';
}

function frescor(entry: CanvasIndexEntry): number {
    return typeof entry?.mtime === 'number' && Number.isFinite(entry.mtime) ? entry.mtime : -1;
}

export function normalizeLimit(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return FRACTAL_CONTEXT_LIMIT;
    return Math.max(0, Math.floor(parsed));
}

export function projetosDaArea(
    index: MissionCanvasIndex | null | undefined,
    areaId: string,
    fora: ReadonlyArray<string>,
): CanvasIndexEntry[] {
    if (!areaId) return [];
    const excluidos = new Set(fora.filter(Boolean));
    return canvasesOfArea(index as MissionCanvasIndex, areaId)
        .filter(entry => Boolean(entry?.project) && Boolean(entry?.path) && !excluidos.has(entry.path))
        .sort((a, b) => {
            const porFrescor = frescor(b) - frescor(a);
            if (porFrescor !== 0) return porFrescor;
            return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
        });
}

interface Candidato {
    role: FractalContextRole;
    filePath: string;
    label: string;
    reason: string;
}

export function planFractalContext(request: FractalContextRequest): FractalContextPlan {
    const canvasPath = String(request?.canvasPath ?? '').trim();
    const scale = request?.scale ?? 'indefinida';
    const index = request?.index ?? null;
    const limit = normalizeLimit(request?.limit);
    const exists = typeof request?.exists === 'function' ? request!.exists! : () => true;

    if (scale === 'sistema' || scale === 'tarefas' || scale === 'indefinida') {
        return vazio(scale, FRACTAL_HEADER_SKIP[scale]);
    }

    const entry = findEntry(index, canvasPath);
    const areaId = areaOfCanvas(index, canvasPath, entry);
    const cockpit = areaId ? areaCockpitOf(index as MissionCanvasIndex, areaId) : null;
    const candidatos: Candidato[] = [];

    candidatos.push({
        role: 'sistema',
        filePath: COCKPIT_PATH,
        label: 'Cockpit do sistema',
        reason: `Toda a árvore converge para ${COCKPIT_PATH}: é o nó acima de qualquer área.`,
    });

    if (scale === 'projeto' && cockpit) {
        candidatos.push({
            role: 'area-cockpit',
            filePath: cockpit.path,
            label: `Cockpit da área ${areaId}`,
            reason: `O projeto mora na área "${areaId}"; byAreaCockpit aponta ${cockpit.path} como o canvas do topo dela.`,
        });
    }

    const excluidos = scale === 'projeto'
        ? [canvasPath, cockpit?.path ?? '']
        : [canvasPath];
    const projetos = projetosDaArea(index, areaId, excluidos);
    const escolhidos = projetos.slice(0, limit);
    const truncated = Math.max(0, projetos.length - escolhidos.length);

    for (const projeto of escolhidos) {
        const nome = projeto.project ?? projeto.name;
        candidatos.push({
            role: scale === 'projeto' ? 'projeto-irmao' : 'projeto-da-area',
            filePath: projeto.path,
            label: `Projeto ${nome}`,
            reason: scale === 'projeto'
                ? `Projeto irmão de "${entry?.project ?? nome}" na área "${areaId}": ${projeto.path}.`
                : `Projeto da área "${areaId}": ${projeto.path}.`,
        });
    }

    const jaNoDesenho = new Set((request?.drawing?.files ?? []).map(file => String(file ?? '').trim()));
    const vistos = new Set<string>();
    const tomados = (request?.drawing?.ids ?? []).map(id => String(id ?? '').trim()).filter(Boolean);
    const nodes: FractalContextNode[] = [];
    const already: string[] = [];
    const skipped: FractalContextSkip[] = [];

    for (const candidato of candidatos) {
        const filePath = String(candidato.filePath ?? '').trim();
        if (!filePath) {
            skipped.push({ path: '', reason: 'o alvo não declara caminho de arquivo; nada a inserir.' });
            continue;
        }
        if (filePath === canvasPath) {
            skipped.push({ path: filePath, reason: 'é o próprio canvas aberto: um nó para si mesmo não conecta nada.' });
            continue;
        }
        if (jaNoDesenho.has(filePath)) {
            already.push(filePath);
            continue;
        }
        if (vistos.has(filePath)) {
            skipped.push({ path: filePath, reason: 'já proposto por outro papel nesta mesma geração; um arquivo, um nó.' });
            continue;
        }
        if (!exists(filePath)) {
            skipped.push({ path: filePath, reason: 'o arquivo não existe no vault; um nó apontando para ele nasceria órfão.' });
            continue;
        }

        vistos.add(filePath);
        const nodeId = railNodeIdFor(filePath, tomados);
        tomados.push(nodeId);
        nodes.push({
            role: candidato.role,
            filePath,
            label: candidato.label,
            nodeId,
            reason: candidato.reason,
        });
    }

    const partes: string[] = [];
    partes.push(nodes.length
        ? `${nodes.length} nó(s) de contexto a escrever`
        : 'nenhum nó de contexto a escrever');
    if (already.length) partes.push(`${already.length} já presente(s) no desenho`);
    if (skipped.length) partes.push(`${skipped.length} descartado(s)`);
    if (truncated) partes.push(`${truncated} projeto(s) fora do teto de ${limit}`);

    const semArea = areaId ? '' : ' O canvas não está na árvore de nenhuma área, então não há cockpit nem irmãos a puxar.';

    return {
        kind: 'plan',
        scale,
        nodes,
        already,
        skipped,
        truncated,
        criterion: FRACTAL_CONTEXT_CRITERION,
        reason: `Escala ${scale}: ${partes.join('; ')}.${semArea}`,
    };
}
