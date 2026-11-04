import { COCKPIT_PATH } from '../../src/engine/canvasTree';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    canGoBack,
    clearFractalHistory,
    currentCanvasViewport,
    findFractalParentCanvas,
    focusCanvasNode,
    getFractalHistory,
    navigateFractalBack,
    navigateFractalTo,
    navigateFractalUp,
    peekFractalHistory,
    popFractalHistory,
    pushFractalHistory,
    restoreCanvasViewport,
} from '../../src/engine/canvasengine/canvasFractalNavigation';

describe('canvasFractalNavigation — histórico e foco de nó fractal (A8, B2)', () => {
    beforeEach(() => {
        clearFractalHistory();
        vi.useRealTimers();
    });

    describe('Pilha de Histórico Fractal', () => {
        it('empilha e desempilha visitas com viewport preservado', () => {
            expect(canGoBack()).toBe(false);
            expect(popFractalHistory()).toBeNull();

            pushFractalHistory({
                canvasPath: 'Canvases/Sistema.canvas',
                viewport: { x: 100, y: 200, zoom: 1.2 },
                timestamp: 1000,
            });

            expect(canGoBack()).toBe(true);
            expect(peekFractalHistory()?.canvasPath).toBe('Canvases/Sistema.canvas');

            pushFractalHistory({
                canvasPath: 'Canvases/Area.canvas',
                viewport: { x: 300, y: 400, zoom: 0.8 },
                timestamp: 2000,
            });

            expect(getFractalHistory()).toHaveLength(2);

            const popped = popFractalHistory();
            expect(popped?.canvasPath).toBe('Canvases/Area.canvas');
            expect(popped?.viewport).toEqual({ x: 300, y: 400, zoom: 0.8 });

            expect(canGoBack()).toBe(true);
            const first = popFractalHistory();
            expect(first?.canvasPath).toBe('Canvases/Sistema.canvas');
            expect(canGoBack()).toBe(false);
        });

        it('ignora entradas sem canvasPath', () => {
            pushFractalHistory({ canvasPath: '', timestamp: 1000 });
            expect(canGoBack()).toBe(false);
        });

        it('respeita o limite máximo de histórico', () => {
            for (let i = 0; i < 60; i++) {
                pushFractalHistory({ canvasPath: `Canvases/${i}.canvas`, timestamp: i });
            }
            expect(getFractalHistory().length).toBeLessThanOrEqual(50);
        });
    });

    describe('Manipulação e Restauração de Viewport', () => {
        it('extrai viewport atual do canvas com segurança', () => {
            expect(currentCanvasViewport(null)).toBeNull();
            const canvasMock = { x: 50, y: 75, zoom: 1.5 };
            expect(currentCanvasViewport(canvasMock)).toEqual({ x: 50, y: 75, zoom: 1.5 });
        });

        it('restaura viewport via panTo/zoomTo se disponíveis', () => {
            const panTo = vi.fn();
            const zoomTo = vi.fn();
            const canvas = { panTo, zoomTo };

            const ok = restoreCanvasViewport(canvas, { x: 100, y: 150, zoom: 2.0 });
            expect(ok).toBe(true);
            expect(panTo).toHaveBeenCalledWith(100, 150);
            expect(zoomTo).toHaveBeenCalledWith(2.0);
        });

        it('restaura viewport via propriedades diretas e requestFrame se panTo não existir', () => {
            const requestFrame = vi.fn();
            const canvas = { x: 0, y: 0, zoom: 1, requestFrame };

            const ok = restoreCanvasViewport(canvas, { x: 200, y: 300, zoom: 0.5 });
            expect(ok).toBe(true);
            expect(canvas.x).toBe(200);
            expect(canvas.y).toBe(300);
            expect(canvas.zoom).toBe(0.5);
            expect(requestFrame).toHaveBeenCalled();
        });
    });

    describe('focusCanvasNode (Zoom-to-node)', () => {
        it('centraliza usando panTo quando disponível', () => {
            const panTo = vi.fn();
            const canvas = { panTo };

            const ok = focusCanvasNode(canvas, { x: 100, y: 200, width: 300, height: 100 });
            expect(ok).toBe(true);
            // Centro: x = 100 + 150 = 250, y = 200 + 50 = 250
            expect(panTo).toHaveBeenCalledWith(250, 250);
        });

        it('localiza nó pelo id via canvas.nodes.get', () => {
            const panTo = vi.fn();
            const canvas = {
                panTo,
                nodes: {
                    get: (id: string) => id === 'node-1' ? { x: 400, y: 600, width: 200, height: 200 } : null,
                },
            };

            const ok = focusCanvasNode(canvas, 'node-1');
            expect(ok).toBe(true);
            // Centro: 400 + 100 = 500, 600 + 100 = 700
            expect(panTo).toHaveBeenCalledWith(500, 700);
        });

        it('retorna false para nós inexistentes ou argumentos inválidos', () => {
            expect(focusCanvasNode(null, 'node-1')).toBe(false);
            expect(focusCanvasNode({ nodes: { get: () => null } }, 'inexistente')).toBe(false);
        });
    });

    describe('Navegação Fractal Completa (navigateFractalTo e navigateFractalBack)', () => {
        it('navigateFractalTo grava posição anterior e abre link', async () => {
            const openLinkText = vi.fn().mockResolvedValue(undefined);
            const app = { workspace: { openLinkText } };
            const currentView = {
                file: { path: 'Canvases/Origem.canvas' },
                canvas: { x: 10, y: 20, zoom: 1.0 },
            };

            const ok = await navigateFractalTo(app, 'Canvases/Destino.canvas', currentView);
            expect(ok).toBe(true);
            expect(openLinkText).toHaveBeenCalledWith('Canvases/Destino.canvas', '', false);
            expect(canGoBack()).toBe(true);
            expect(peekFractalHistory()?.canvasPath).toBe('Canvases/Origem.canvas');
            expect(peekFractalHistory()?.viewport).toEqual({ x: 10, y: 20, zoom: 1.0 });
        });

        it('navigateFractalBack desempilha histórico e abre canvas anterior', async () => {
            const openLinkText = vi.fn().mockResolvedValue(undefined);
            const app = { workspace: { openLinkText } };

            pushFractalHistory({
                canvasPath: 'Canvases/Anterior.canvas',
                viewport: { x: 40, y: 60, zoom: 1.2 },
                timestamp: Date.now(),
            });

            const ok = await navigateFractalBack(app);
            expect(ok).toBe(true);
            expect(openLinkText).toHaveBeenCalledWith('Canvases/Anterior.canvas', '', false);
            expect(canGoBack()).toBe(false);
        });

        it('navigateFractalBack retorna false quando não há histórico', async () => {
            const app = { workspace: { openLinkText: vi.fn() } };
            expect(await navigateFractalBack(app)).toBe(false);
        });
    });

    describe('Navegação Fractal Ascendente (findFractalParentCanvas e navigateFractalUp)', () => {
        const mockSnapshot: any = {
            board: { buckets: [] },
            portfolio: { columns: [] },
            areas: [
                {
                    id: 'Area1',
                    name: 'Área 1',
                    path: '100 - AREAS/Area1',
                    canvas: '100 - AREAS/Area1/Area1.canvas',
                },
            ],
            canvases: [
                {
                    path: COCKPIT_PATH,
                    name: 'Sistema',
                    folder: '300 - RUNTIME/310 - Cockpits',
                    mtime: 1,
                    size: 1,
                },
                {
                    path: '100 - AREAS/Area1/Area1.canvas',
                    name: 'Area1',
                    folder: '100 - AREAS/Area1',
                    mtime: 1,
                    size: 1,
                },
                {
                    path: '100 - AREAS/Area1/Projeto Alfa/Projeto Alfa.canvas',
                    name: 'Projeto Alfa',
                    folder: '100 - AREAS/Area1/Projeto Alfa',
                    mtime: 1,
                    size: 1,
                },
            ],
        };

        it('identifica cockpit da área como pai de um projeto', () => {
            const parent = findFractalParentCanvas('100 - AREAS/Area1/Projeto Alfa/Projeto Alfa.canvas', mockSnapshot);
            expect(parent).toBe('100 - AREAS/Area1/Area1.canvas');
        });

        it('identifica cockpit do sistema como pai de uma área', () => {
            const parent = findFractalParentCanvas('100 - AREAS/Area1/Area1.canvas', mockSnapshot);
            expect(parent).toBe(COCKPIT_PATH);
        });

        it('o canvas da semana não tem mais ramo próprio (aposentado em 02/11/2026): sobe ao cockpit como qualquer canvas', () => {
            const week = '300 - RUNTIME/302 - Daymiss/Week/Canvases/2026-W42.canvas';
            expect(findFractalParentCanvas(week, mockSnapshot)).toBe(COCKPIT_PATH);
            expect(findFractalParentCanvas(week, null)).toBe(COCKPIT_PATH);
        });

        it('retorna null quando já está no topo (cockpit do sistema)', () => {
            const parent = findFractalParentCanvas(COCKPIT_PATH, mockSnapshot);
            expect(parent).toBeNull();
        });

        it('navigateFractalUp executa transição ascendente registrando histórico', async () => {
            const openLinkText = vi.fn().mockResolvedValue(undefined);
            const app = { workspace: { openLinkText } };
            const currentView = {
                file: { path: '100 - AREAS/Area1/Projeto Alfa/Projeto Alfa.canvas' },
                canvas: { x: 100, y: 100, zoom: 1.0 },
            };

            const ok = await navigateFractalUp(app, currentView, mockSnapshot);
            expect(ok).toBe(true);
            expect(openLinkText).toHaveBeenCalledWith('100 - AREAS/Area1/Area1.canvas', '', false);
            expect(canGoBack()).toBe(true);
            expect(peekFractalHistory()?.canvasPath).toBe('100 - AREAS/Area1/Projeto Alfa/Projeto Alfa.canvas');
        });
    });
});
