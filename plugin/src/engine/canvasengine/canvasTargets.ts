/**
 * As vistas de canvas abertas e o alvo de uma soltura: o que os planos do menu e os widgets
 * leem do workspace pelo motor, como referências (sem DOM do documento, sem cofre).
 *
 * Por quê: o passo `rail` da divisão do motor (tests/engine/modeloMotor.test.ts). Moravam no
 * widgetPaletteTarget (os widgets, camada 7), e o modelo do menu (compoe.canvas, camada 6) os
 * importava de lá em execução: o import para cima e o ciclo de módulos compoe.canvas,
 * liga.widgets que o dfm check acusava. Aqui, nas funções do canvas, os dois os leem de baixo. Os
 * widgets saíram em 02/11/2026; fica o modelo do menu.
 */
import type { CanvasEngine } from './canvasEngineTypes';

export interface CanvasDropTarget {
    canvasPath: string;
    file: unknown;
    nodeId: string;
    nodeEl: HTMLElement | null;
}

export interface CanvasViewRef {
    path: string;
    file: unknown;
    canvas: { nodes?: unknown };
    containerEl?: unknown;
}

/**
 * O que faz: as vistas de canvas abertas no workspace, cada uma com o caminho, o arquivo, o
 * canvas e o contêiner.
 * Entra → sai: o motor (pela interface) → as vistas; sem workspace, ou sem folha de canvas, [].
 */
export function canvasViewsOf(engine: CanvasEngine): CanvasViewRef[] {
    const workspace = (engine?.plugin as any)?.app?.workspace;
    if (!workspace?.getLeavesOfType) return [];
    const leaves = workspace.getLeavesOfType('canvas');
    const result: CanvasViewRef[] = [];
    for (const leaf of leaves) {
        const view = leaf?.view;
        const file = view?.file;
        const canvas = view?.canvas;
        const path = typeof file?.path === 'string' ? file.path : '';
        if (path && canvas) {
            result.push({ path, file, canvas, containerEl: view?.containerEl });
        }
    }
    return result;
}
