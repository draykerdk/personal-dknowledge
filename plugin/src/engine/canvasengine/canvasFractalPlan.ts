/**
 * Planejamento puro do cabeçalho e contexto fractal para um quadro de canvas.
 *
 * Responsável pelo cálculo determinístico e sem I/O da escala, nós de contexto
 * e âncora do cabeçalho no desenho do canvas.
 */
import type { MissionCanvasIndex } from '../missionCanvasIndex';
import { canvasContents, canvasIndexOf } from '../missionCanvasIndex';
import { parseCanvasGraph } from '../canvasMap';
import type { FractalReading, FractalScale } from '../missionFractal';
import { readFractalScale } from '../missionFractal';
import { CANVAS_MENU_MARKER } from '../canvasMenuCanvas';
import type {
    FractalContextDrawing,
    FractalContextPlan,
    FractalContextSkip,
    FractalHeaderBlock,
} from '../canvasFractalContext';
import {
    FRACTAL_CONTEXT_LIMIT,
    FRACTAL_HEADER_GAP,
    FRACTAL_HEADER_MARKER,
    FRACTAL_HEADER_NODE_HEIGHT,
    FRACTAL_HEADER_SKIP,
    canvasDrawingOf,
    planFractalContext,
    planFractalHeader,
} from '../canvasFractalContext';
import {
    centerOfCanvasNodes,
    elementosDoCanvas,
    findMarkedBlockSpan,
} from './canvasSplice';

export interface FractalCanvasFrame {
    canvasPath: string;
    /** O texto do  no instante da leitura — a base do guarda. */
    raw: string;
    /** Centro visível medido pela view; ausente, a inserção usa o centro dos nós. */
    preferred?: { x: number; y: number } | null;
    /**
     * O cabeçalho proposto para este quadro, medido do snapshot.
     *
     * Viaja no quadro, e não num parâmetro novo, porque a assinatura de
     *  é a mesma de antes: quem mede o índice e as tarefas é
     * , que tem o snapshot; quem grava só precisa da
     * decisão pronta. Ausente, não há cabeçalho a escrever nesta execução.
     */
    header?: FractalHeaderBlock | null;
}

export interface CanvasFractalPorts {
    /** Lê o arquivo **agora** — é esta leitura que o guarda compara. */
    read: () => Promise<string>;
    write: (next: string) => Promise<void>;
    notice: (message: string) => void;
    /** Diagnóstico; ausente, o aviso ao operador continua sendo dado. */
    fail?: (message: string) => void;
    /** O arquivo existe no vault? */
    exists?: (path: string) => boolean;
}

export type CanvasFractalOutcome = 'written' | 'nothing' | 'aborted' | 'refused' | 'failed';

export interface CanvasFractalReport {
    outcome: CanvasFractalOutcome;
    scale: FractalScale;
    /** Rótulo da escala, para a tela. */
    label: string;
    /** A evidência que decidiu a escala. */
    readingReason: string;
    /** O resumo do plano. */
    planReason: string;
    /** Caminhos que ganharam nó nesta execução, na ordem em que foram gravados. */
    added: string[];
    /** Caminhos que o desenho já tinha. */
    already: string[];
    /** Alvos descartados, com o motivo. */
    skipped: FractalContextSkip[];
    /** Projetos fora do teto. */
    truncated: number;
    /** O cabeçalho foi **substituído** nesta execução (diferente de gravado pela 1ª vez). */
    updated: boolean;
    /** Ids dos nós do cabeçalho reescritos quando . */
    updatedNodeIds: string[];
    /** Id do grupo do cabeçalho;  quando a escala não escreve cabeçalho. */
    headerId: string | null;
    /** A frase que foi (ou seria) mostrada ao operador. */
    message: string;
}

/** O desenho do arquivo, tolerante a JSON ilegível (o plano dirá isso depois). */
function drawingFromRaw(raw: string): FractalContextDrawing {
    try {
        return canvasDrawingOf(JSON.parse(raw));
    } catch (_) {
        return { files: [], ids: [] };
    }
}

/** As tarefas abertas do quadro, no formato que o plano do cabeçalho pede. */
function tarefasAbertasDoQuadro(snapshot: any): Array<{
    path: string;
    title?: string;
    project: string;
    projects: string[];
    due: string;
    type?: string;
}> {
    const buckets = Array.isArray(snapshot?.board?.buckets) ? snapshot.board.buckets : [];
    const tarefas: Array<{ path: string; title?: string; project: string; projects: string[]; due: string; type?: string }> = [];
    const vistas = new Set<string>();
    for (const bucket of buckets) {
        for (const tarefa of Array.isArray(bucket?.tasks) ? bucket.tasks : []) {
            const path = String(tarefa?.path ?? '').trim();
            if (!path || vistas.has(path)) continue;
            vistas.add(path);
            const raw = Array.isArray(tarefa?.projects)
                ? tarefa.projects
                : tarefa?.project
                ? [tarefa.project]
                : [];
            const cleanProjects = raw.map((p: any) => String(p ?? '').trim()).filter(Boolean);
            tarefas.push({
                path,
                title: String(tarefa?.title ?? '').trim(),
                project: cleanProjects[0] ?? '',
                projects: cleanProjects,
                due: String(tarefa?.due ?? ''),
                type: String(tarefa?.type ?? 'task').trim(),
            });
        }
    }
    return tarefas;
}

export interface FractalFramePlan {
    index: MissionCanvasIndex;
    drawing: FractalContextDrawing;
    reading: FractalReading;
    plan: FractalContextPlan;
    /** O cabeçalho da escala lida;  nas escalas que não escrevem nada. */
    header: FractalHeaderBlock | null;
}

/**
 * Mede a escala do quadro e monta a proposta — o cabeçalho e os nós que faltam.
 *
 * Puro no sentido que importa: não grava, não avisa, e o quadro entra pronto.
 * O  é o do motor (o mesmo que o resto do plugin usa) e o  é o
 * do vault — as duas únicas dependências de fora.
 */
export function planFractalContextForFrame(
    frame: FractalCanvasFrame,
    snapshot: any,
    exists: (path: string) => boolean = () => true,
    limit?: number,
): FractalFramePlan {
    const canvasPath = String(frame?.canvasPath ?? '').trim();
    const raw = typeof frame?.raw === 'string' ? frame.raw : '';
    const graph = parseCanvasGraph(canvasPath, raw, exists);
    const contents = canvasContents(graph, snapshot);
    const index = canvasIndexOf(snapshot);

    const reading = readFractalScale({
        canvasPath,
        contents: { tasks: contents.tasks.length, projects: contents.projects },
        index,
    });

    const drawing = drawingFromRaw(raw);
    const plan = planFractalContext({
        canvasPath,
        scale: reading.scale,
        index,
        drawing,
        limit,
        exists,
    });

    const header = planFractalHeader({
        canvasPath,
        reading,
        index,
        drawing,
        tasks: tarefasAbertasDoQuadro(snapshot),
        limit,
        exists,
    });

    return { index, drawing, reading, plan, header };
}

export function findFractalHeaderSpan(raw: string): { start: number; end: number; headerId: string; x: number; y: number } | null {
    const span = findMarkedBlockSpan(raw, FRACTAL_HEADER_MARKER);
    if (!span) return null;
    return { start: span.start, end: span.end, headerId: span.ids[0] ?? '', x: span.x, y: span.y };
}

export function idsDoTexto(raw: string): { ids: string[]; marcados: string[] } {
    const ids: string[] = [];
    const marcados: string[] = [];
    for (const elemento of elementosDoCanvas(raw) ?? []) {
        const id = String(elemento.node?.id ?? '').trim();
        if (!id) continue;
        ids.push(id);
        if (elemento.node?.mode === FRACTAL_HEADER_MARKER) marcados.push(id);
    }
    return { ids, marcados };
}

export function alturaDoBloco(nos: number): number {
    const total = Math.max(0, Math.floor(nos));
    if (total === 0) return 0;
    return total * FRACTAL_HEADER_NODE_HEIGHT + (total - 1) * FRACTAL_HEADER_GAP;
}

export function ancoraDoCabecalho(
    raw: string,
    preferred: { x: number; y: number } | null | undefined,
    nodes: ReadonlyArray<unknown>,
): { x: number; y: number } {
    const menu = findMarkedBlockSpan(raw, CANVAS_MENU_MARKER, 'text');
    if (menu && Number.isFinite(menu.y)) {
        let maxBottom = menu.y;
        let found = false;
        if (Array.isArray(nodes)) {
            for (const n of nodes as any[]) {
                if (n && n.mode === CANVAS_MENU_MARKER && Number.isFinite(n.y) && Number.isFinite(n.height)) {
                    maxBottom = Math.max(maxBottom, n.y + n.height);
                    found = true;
                }
            }
        }
        const y = found ? maxBottom : menu.y + alturaDoBloco(menu.ids.length);
        return { x: menu.x, y };
    }
    return preferred ?? centerOfCanvasNodes(nodes) ?? { x: 0, y: 0 };
}
