/**
 * Ponto de entrada do comando do menu no canvas e fachada retrocompatível.
 */
import { Notice } from 'obsidian';
import {
    CANVAS_FILE_NODE_HEIGHT,
    CANVAS_FILE_NODE_WIDTH,
} from './canvasSplice';
import {
    buildCanvasMenuTree,
    collectCanvasMenuInventory,
} from './canvasMenuModel';
import { CANVAS_MENU_LABEL } from '../canvasMenuCanvas';
import { activeCanvasOf } from './canvasFractal';
import type {
    CanvasMenuFrame,
    CanvasMenuPorts,
    CanvasMenuReport,
} from './canvasMenuPlan';
import { findCanvasMenuSpan } from './canvasMenuPlan';
import { runCanvasMenuForFrame } from './canvasMenuApply';

export type {
    CanvasMenuFrame,
    CanvasMenuPorts,
    CanvasMenuReport,
};
export {
    findCanvasMenuSpan,
    runCanvasMenuForFrame,
};

function defaultPorts(engine: any, canvasPath: string): CanvasMenuPorts {
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
 * O comando: gera o menu do acervo no canvas ativo.
 *
 * Devolve `null` quando não há canvas ativo (o `checkCallback` do comando já
 * esconde a opção nesse caso) e o relatório quando houve leitura — inclusive
 * quando o relatório diz que nada foi escrito, porque "nada a fazer" é resposta.
 */
export async function runCanvasMenuForActiveCanvas(
    engine: any,
    view: any,
    overrides: Partial<CanvasMenuPorts> = {},
): Promise<CanvasMenuReport | null> {
    const ativo = activeCanvasOf(engine, view);
    if (!ativo) {
        new Notice(`${CANVAS_MENU_LABEL}: abra um canvas primeiro.`);
        return null;
    }

    const app: any = engine?.plugin?.app ?? null;
    let snapshot: any = null;
    try {
        const control = typeof engine?.plugin?.getMissionControl === 'function' ? engine.plugin.getMissionControl() : null;
        // `build` é assíncrono (`Promise<MissionSnapshot>`): sem o `await` o
        // índice sairia vazio e TODO canvas leria `indefinida`.
        snapshot = typeof control?.build === 'function' ? await control.build(false) : null;
    } catch (_) {
        snapshot = null;
    }

    let raw = '';
    try {
        raw = await app.vault.read(app.vault.getAbstractFileByPath(ativo.canvasPath));
    } catch (error) {
        new Notice(`${CANVAS_MENU_LABEL}: não foi possível ler "${ativo.canvasPath}" — ${String(error)}`);
        return null;
    }

    // O acervo vivo, agrupado pela função que a rail e o menu de contexto usam.
    const tree = buildCanvasMenuTree(collectCanvasMenuInventory(engine));

    const ports: CanvasMenuPorts = {
        ...defaultPorts(engine, ativo.canvasPath),
        ...overrides,
    };

    return runCanvasMenuForFrame(
        { canvasPath: ativo.canvasPath, raw, preferred: ativo.preferred, tree },
        snapshot,
        ports,
    ).catch(error => {
        // O comando é despachado do `checkCallback` sem `await`: uma rejeição
        // aqui seria invisível. Ela vira aviso, e o relatório vira `null`.
        new Notice(`${CANVAS_MENU_LABEL}: falha inesperada — ${String(error)}`);
        return null;
    });
}

