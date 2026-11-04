/**
 * Ponto de entrada do comando de contexto fractal e fachada retrocompatível.
 *
 * Reexporta os tipos e funções de planejamento (canvasFractalPlan), escrita de cabeçalho
 * (canvasFractalHeader), aplicação de nós (canvasFractalWriter) e splice (canvasSplice).
 */
import { Notice } from 'obsidian';
import { FRACTAL_CONTEXT_LIMIT } from '../canvasFractalContext';
import {
    CANVAS_FILE_NODE_HEIGHT,
    CANVAS_FILE_NODE_WIDTH,
    findMarkedBlockSpan,
} from './canvasSplice';
import type {
    CanvasFractalOutcome,
    CanvasFractalPorts,
    CanvasFractalReport,
    FractalCanvasFrame,
    FractalFramePlan,
} from './canvasFractalPlan';
import {
    findFractalHeaderSpan,
    planFractalContextForFrame,
} from './canvasFractalPlan';
import { applyFractalContext } from './canvasFractalWriter';

export type {
    FractalCanvasFrame,
    FractalFramePlan,
    CanvasFractalOutcome,
    CanvasFractalPorts,
    CanvasFractalReport,
};
import {
    cleanOrphanEdges,
    removeCanvasElement,
    spliceMarkedBlock,
} from './canvasBlockSplice';

export {
    planFractalContextForFrame,
    findFractalHeaderSpan,
    findMarkedBlockSpan,
    applyFractalContext,
    spliceMarkedBlock,
    removeCanvasElement,
    cleanOrphanEdges,
};


function defaultPorts(engine: any, canvasPath: string): CanvasFractalPorts {
    const app: any = engine?.plugin?.app ?? null;
    const file = app?.vault?.getAbstractFileByPath?.(canvasPath) ?? null;
    return {
        read: () => Promise.resolve(app.vault.read(file)),
        write: next => Promise.resolve(app.vault.modify(file, next)),
        notice: message => { new Notice(message, 8000); },
        exists: path => Boolean(app?.vault?.getAbstractFileByPath?.(path)),
    };
}

/**
 * O quadro já medido: escala, cabeçalho, plano e gravação, para uma view de
 * canvas viva.
 *
 * É esta função que o teste de ponta a ponta usa: com um `snapshot` de mentira e
 * portas em memória, o ciclo inteiro (ler → medir → propor → reler → gravar) roda
 * sem Obsidian. O cabeçalho é medido aqui, onde o snapshot existe, e viaja no
 * quadro — `applyFractalContext` continua com a assinatura de antes.
 */
export async function runFractalContextForFrame(
    frame: FractalCanvasFrame,
    snapshot: any,
    ports: CanvasFractalPorts,
    limit?: number,
): Promise<CanvasFractalReport> {
    const exists = ports.exists ?? (() => true);
    const { reading, plan, header } = planFractalContextForFrame(frame, snapshot, exists, limit);
    return applyFractalContext({ ...frame, header }, plan, reading, ports, limit ?? FRACTAL_CONTEXT_LIMIT);
}

/** O que a view precisa entregar para o comando: arquivo e centro visível. */
export interface FractalActiveCanvas {
    canvasPath: string;
    preferred: { x: number; y: number } | null;
}

/** O canvas ativo, quando ele é mesmo um canvas; `null` significa "não é". */
export function activeCanvasOf(engine: any, view: any): FractalActiveCanvas | null {
    const tipo = typeof view?.getViewType === 'function' ? view.getViewType() : '';
    const canvasPath = String(view?.file?.path ?? '').trim();
    if (tipo !== 'canvas' || !canvasPath) return null;

    let preferred: { x: number; y: number } | null = null;
    if (view?.canvas) {
        try {
            preferred = engine?.getCenterCoordinates?.(view.canvas, CANVAS_FILE_NODE_WIDTH, CANVAS_FILE_NODE_HEIGHT) ?? null;
        } catch (_) {
            // Sem medida, a inserção usa o centro dos nós: não é motivo para não gravar.
            preferred = null;
        }
    }
    return { canvasPath, preferred };
}

/**
 * O comando: gera o contexto fractal do canvas ativo.
 *
 * Devolve `null` quando não há canvas ativo (o `checkCallback` do comando já
 * esconde a opção nesse caso) e o relatório quando houve leitura — inclusive
 * quando o relatório diz que nada foi escrito, porque "nada a fazer" é resposta.
 */
export async function runFractalContextForActiveCanvas(
    engine: any,
    view: any,
    overrides: Partial<CanvasFractalPorts> = {},
): Promise<CanvasFractalReport | null> {
    const ativo = activeCanvasOf(engine, view);
    if (!ativo) {
        new Notice('🧭 Contexto fractal: abra um canvas primeiro.');
        return null;
    }

    const app: any = engine?.plugin?.app ?? null;
    let snapshot: any = null;
    try {
        const control = typeof engine?.plugin?.getMissionControl === 'function' ? engine.plugin.getMissionControl() : null;
        // `build` é assíncrono (`Promise<MissionSnapshot>`): sem o `await` o quadro
        // entrava como Promise, o índice saía vazio e TODO canvas lia como
        // `indefinida` — o comando nunca chegava a escrever. Defeito preexistente,
        // medido em 15/09 por sonda; a leitura da escala depende deste snapshot.
        snapshot = typeof control?.build === 'function' ? await control.build(false) : null;
    } catch (_) {
        snapshot = null;
    }

    let raw = '';
    try {
        raw = await app.vault.read(app.vault.getAbstractFileByPath(ativo.canvasPath));
    } catch (error) {
        const message = `🧭 Contexto fractal: não foi possível ler "${ativo.canvasPath}" — ${String(error)}`;
        new Notice(message);
        return null;
    }

    const ports: CanvasFractalPorts = {
        ...defaultPorts(engine, ativo.canvasPath),
        ...overrides,
    };

    return runFractalContextForFrame(
        { canvasPath: ativo.canvasPath, raw, preferred: ativo.preferred },
        snapshot,
        ports,
    ).catch(error => {
        // O comando é despachado do `checkCallback` sem `await`: uma rejeição
        // aqui seria invisível. Ela vira aviso, e o relatório vira `null`.
        new Notice(`🧭 Contexto fractal: falha inesperada — ${String(error)}`);
        return null;
    });
}

