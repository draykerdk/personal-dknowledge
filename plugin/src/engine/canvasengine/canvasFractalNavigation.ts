import { COCKPIT_PATH } from '../canvasTree';
import type { MissionSnapshot } from '../missionSnapshot';
import { canvasIndexOf, areaCockpitOf } from '../missionCanvasIndex';

/**
 * Navegação fractal, histórico operacional de visitas e foco de nó (A8, B2).
 *
 * Garante o critério da Fase P2:
 * "Caminho completo sem busca manual de arquivos e sem perder posição ao voltar".
 */

export interface FractalViewport {
    x: number;
    y: number;
    zoom: number;
}

export interface FractalHistoryEntry {
    canvasPath: string;
    viewport?: FractalViewport | null;
    nodeId?: string | null;
    timestamp: number;
}

const MAX_HISTORY_LENGTH = 50;
const historyStack: FractalHistoryEntry[] = [];

export function pushFractalHistory(entry: FractalHistoryEntry): void {
    if (!entry || !entry.canvasPath) return;
    historyStack.push({
        canvasPath: entry.canvasPath,
        viewport: entry.viewport ?? null,
        nodeId: entry.nodeId ?? null,
        timestamp: entry.timestamp || Date.now(),
    });
    if (historyStack.length > MAX_HISTORY_LENGTH) {
        historyStack.shift();
    }
}

export function popFractalHistory(): FractalHistoryEntry | null {
    return historyStack.pop() ?? null;
}

export function peekFractalHistory(): FractalHistoryEntry | null {
    return historyStack.length > 0 ? historyStack[historyStack.length - 1] : null;
}

export function canGoBack(): boolean {
    return historyStack.length > 0;
}

export function clearFractalHistory(): void {
    historyStack.length = 0;
}

export function getFractalHistory(): ReadonlyArray<FractalHistoryEntry> {
    return [...historyStack];
}

export function currentCanvasViewport(canvas: any): FractalViewport | null {
    if (!canvas || typeof canvas !== 'object') return null;
    const x = typeof canvas.x === 'number' ? canvas.x : 0;
    const y = typeof canvas.y === 'number' ? canvas.y : 0;
    const zoom = typeof canvas.zoom === 'number' ? canvas.zoom : 1;
    return { x, y, zoom };
}

export function restoreCanvasViewport(canvas: any, vp: FractalViewport): boolean {
    if (!canvas || !vp) return false;
    try {
        if (typeof canvas.panTo === 'function') {
            canvas.panTo(vp.x, vp.y);
            if (typeof canvas.zoomTo === 'function' && Number.isFinite(vp.zoom)) {
                canvas.zoomTo(vp.zoom);
            }
            return true;
        }
        if (Number.isFinite(vp.x)) canvas.x = vp.x;
        if (Number.isFinite(vp.y)) canvas.y = vp.y;
        if (Number.isFinite(vp.zoom)) canvas.zoom = vp.zoom;
        if (typeof canvas.requestFrame === 'function') canvas.requestFrame();
        return true;
    } catch (_) {
        return false;
    }
}

export function focusCanvasNode(
    canvas: any,
    target: { x: number; y: number; width?: number; height?: number } | string,
): boolean {
    if (!canvas) return false;
    try {
        let bbox: { x: number; y: number; width: number; height: number } | null = null;
        if (typeof target === 'string') {
            const node = typeof canvas.nodes?.get === 'function' ? canvas.nodes.get(target) : null;
            if (node) {
                bbox = {
                    x: Number(node.x ?? 0),
                    y: Number(node.y ?? 0),
                    width: Number(node.width ?? 200),
                    height: Number(node.height ?? 100),
                };
            }
        } else if (target && typeof target === 'object') {
            bbox = {
                x: Number(target.x ?? 0),
                y: Number(target.y ?? 0),
                width: Number(target.width ?? 200),
                height: Number(target.height ?? 100),
            };
        }
        if (!bbox) return false;

        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        if (typeof canvas.panTo === 'function') {
            canvas.panTo(centerX, centerY);
            return true;
        }
        const W = canvas.containerEl?.clientWidth || 800;
        const H = canvas.containerEl?.clientHeight || 600;
        const zoom = canvas.zoom || 1;
        canvas.x = W / 2 - centerX * zoom;
        canvas.y = H / 2 - centerY * zoom;
        if (typeof canvas.requestFrame === 'function') canvas.requestFrame();
        return true;
    } catch (_) {
        return false;
    }
}

export async function navigateFractalTo(
    app: any,
    targetPath: string,
    currentView?: any,
    targetNodeId?: string,
): Promise<boolean> {
    if (!app?.workspace || !targetPath) return false;

    if (currentView?.file?.path) {
        const vp = currentCanvasViewport(currentView.canvas);
        pushFractalHistory({
            canvasPath: currentView.file.path,
            viewport: vp,
            timestamp: Date.now(),
        });
    }

    try {
        await app.workspace.openLinkText(targetPath, '', false);
        if (targetNodeId) {
            setTimeout(() => {
                const nextView: any = app.workspace.activeLeaf?.view;
                if (nextView?.canvas) {
                    focusCanvasNode(nextView.canvas, targetNodeId);
                }
            }, 100);
        }
        return true;
    } catch (_) {
        return false;
    }
}

export async function navigateFractalBack(app: any): Promise<boolean> {
    const entry = popFractalHistory();
    if (!entry || !app?.workspace) return false;

    try {
        await app.workspace.openLinkText(entry.canvasPath, '', false);
        if (entry.viewport) {
            setTimeout(() => {
                const activeView: any = app.workspace.activeLeaf?.view;
                if (activeView?.canvas) {
                    restoreCanvasViewport(activeView.canvas, entry.viewport!);
                }
            }, 100);
        }
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * O pai fractal de um canvas: o cockpit da área dele, e o da área sobe ao do sistema. O ramo da semana (do
 * canvas da semana ao do trimestre da quinta-feira dela) saiu com os canvas da semana e do trimestre
 * (aposentadoria, fase 2, 02/11/2026): na Missão, a pinça sobe da semana ao trimestre.
 */
export function findFractalParentCanvas(
    currentCanvasPath: string,
    snapshot: MissionSnapshot | null,
): string | null {
    if (!currentCanvasPath || currentCanvasPath === COCKPIT_PATH) return null;
    if (!snapshot) return COCKPIT_PATH;

    const index = canvasIndexOf(snapshot);
    const entry = index.entries.find(e => e.path === currentCanvasPath);
    if (!entry) return COCKPIT_PATH;

    if (entry.areaCockpit) {
        return COCKPIT_PATH;
    }

    if (entry.area) {
        const areaCockpit = areaCockpitOf(index, entry.area);
        if (areaCockpit && areaCockpit.path !== currentCanvasPath) {
            return areaCockpit.path;
        }
    }

    return COCKPIT_PATH;
}

export async function navigateFractalUp(
    app: any,
    currentView: any,
    snapshot: MissionSnapshot | null,
): Promise<boolean> {
    const currentPath = currentView?.file?.path;
    if (!currentPath) return false;
    const parentPath = findFractalParentCanvas(currentPath, snapshot);
    if (!parentPath) return false;
    return navigateFractalTo(app, parentPath, currentView);
}
