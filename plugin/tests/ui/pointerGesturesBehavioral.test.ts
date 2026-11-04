import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({
    setIcon: vi.fn(),
    Notice: vi.fn(),
    TFile: class TFile {},
    TFolder: class TFolder {},
    App: class App {},
    Modal: class Modal {
        app: any;
        constructor(app: any) { this.app = app; }
        open() {}
        close() {}
    },
}));

// Os gestos de ponteiro do mapa de canvas (A6: arrastar o nó, o limiar, o cancelar) saíram em 03/11/2026
// com o mapa do painel antigo (código aposentado); fica a prova do laço do motor de canvas.
import { CanvasEngine } from '../../src/engine/canvasengine/canvasEngine';

describe('o laço periódico do motor de canvas (A7; os widgets por marcador saíram em 02/11/2026)', () => {
    it('clearPeriodicInterval descarta timer periódico de 5s no CanvasEngine', () => {
        const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
        const engine: any = {
            periodicFormatTimer: 42,
            clearPeriodicInterval: CanvasEngine.prototype.clearPeriodicInterval,
        };

        engine.clearPeriodicInterval();
        expect(clearIntervalSpy).toHaveBeenCalledWith(42);
        expect(engine.periodicFormatTimer).toBeNull();
        clearIntervalSpy.mockRestore();
    });
});
