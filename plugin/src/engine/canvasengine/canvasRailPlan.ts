/**
 * Planejamento puro de inserção de nó de arquivo em canvas JSON, e o dia de uma tarefa como o
 * catálogo lateral e os planos do fractal o leem (`railDay`).
 */
import {
    CANVAS_FILE_NODE_HEIGHT,
    CANVAS_FILE_NODE_WIDTH,
    centerOfCanvasNodes,
    findFreeCanvasPosition,
    insertCanvasNodeText,
    railNodeIdFor,
} from './canvasSplice';
import { diaNoInicio } from '../dia';

export interface CanvasFileNodeRequest {
    filePath: string;
    width?: number;
    height?: number;
    preferred?: { x: number; y: number } | null;
}

export type CanvasFileNodePlan =
    | { kind: 'insert'; nodeId: string; position: { x: number; y: number }; next: string }
    | { kind: 'already'; nodeId: string }
    | { kind: 'refused'; reason: string };

function asNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

export function planCanvasFileNodeInsertion(raw: string, request: CanvasFileNodeRequest): CanvasFileNodePlan {
    const filePath = String(request?.filePath ?? '').trim();
    if (!filePath) return { kind: 'refused', reason: 'a tarefa não declara caminho de nota; nada foi inserido.' };
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { kind: 'refused', reason: 'o arquivo do canvas está vazio; nada foi inserido.' };
    }

    let parsed: any = null;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return { kind: 'refused', reason: `o arquivo do canvas não é JSON legível (${String((error as Error)?.message ?? error)}); nada foi inserido.` };
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.nodes)) {
        return { kind: 'refused', reason: 'o arquivo do canvas não tem a lista "nodes"; nada foi inserido.' };
    }

    const nodes: any[] = parsed.nodes;
    const existente = nodes.find(node => node?.type === 'file' && String(node?.file ?? '') === filePath);
    if (existente) return { kind: 'already', nodeId: String(existente.id ?? '') };

    const width = Math.max(asNumber(request?.width, CANVAS_FILE_NODE_WIDTH), 1);
    const height = Math.max(asNumber(request?.height, CANVAS_FILE_NODE_HEIGHT), 1);
    const preferred = request?.preferred ?? centerOfCanvasNodes(nodes) ?? { x: 0, y: 0 };
    const position = findFreeCanvasPosition(nodes, preferred, { width, height });
    const nodeId = railNodeIdFor(filePath, nodes.map(node => String(node?.id ?? '')));

    const nodeJson = JSON.stringify({
        id: nodeId,
        type: 'file',
        file: filePath,
        x: position.x,
        y: position.y,
        width,
        height,
    });

    const next = insertCanvasNodeText(raw, nodeJson);
    if (next === null) {
        return { kind: 'refused', reason: 'não foi possível localizar a lista "nodes" no arquivo do canvas; nada foi inserido.' };
    }
    return { kind: 'insert', nodeId, position, next };
}

/**
 * O que faz: o dia de um valor cru de data: `2026-09-14T09:15:50+07:00` → `2026-09-14`; sem data
 * legível no começo, ''.
 * Por quê: o catálogo lateral (a seção das tarefas) e o vínculo das tarefas do fractal mostram o
 * prazo pelo mesmo corte. Vinha do canvasRailBuilders (os widgets), de onde os planos do fractal
 * o importavam para cima (o passo `rail` da divisão do motor, tests/engine/modeloMotor.test.ts).
 * Entra → sai: qualquer valor → `AAAA-MM-DD` ou ''.
 * Erro e ataque: `undefined` e `null` dão ''; confere a forma do começo, não o calendário.
 * Prova: tests/engine/canvasRail.test.ts.
 */
export function railDay(value: unknown): string {
    return diaNoInicio(String(value ?? ''));
}
