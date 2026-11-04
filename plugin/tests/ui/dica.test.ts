/**
 * Prova da dica (`src/ui/dica.ts`): o nome vira `aria-label` e a dica do Obsidian; ela
 * aparece no foco do teclado e no toque longo de 450 ms, que não dispara o clique; o
 * toque que anda é rolagem.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas = vi.hoisted(() => ({ set: [] as Array<[unknown, string]>, mostrar: [] as Array<[unknown, string]> }));
vi.mock('obsidian', () => ({
    setTooltip: (el: unknown, t: string) => { chamadas.set.push([el, t]); },
    displayTooltip: (el: unknown, t: string) => { chamadas.mostrar.push([el, t]); },
}));

import { dica, ligarDicas, marcarDica, textoDaDica, TOQUE_LONGO_MS } from '../../src/ui/dica';
import { documentoFalso, evento } from '../fixtures/domFalso';

beforeEach(() => { chamadas.set.length = 0; chamadas.mostrar.length = 0; vi.useRealTimers(); });

describe('a dica', () => {
    it('o texto leva a tecla quando há', () => {
        expect(textoDaDica('Hoje: volta ao período de hoje', 'H')).toBe('Hoje: volta ao período de hoje · H');
        expect(textoDaDica('Buscar')).toBe('Buscar');
    });

    it('marca o nome e a dica do Obsidian, com o mesmo texto', () => {
        const doc = documentoFalso();
        const b = doc.createElement('button') as any;
        marcarDica(b, 'Reler', { tecla: 'R' });
        expect(b.getAttribute('aria-label')).toBe('Reler · R');
        expect(b.hasAttribute('data-dica')).toBe(true);
        expect(chamadas.set).toEqual([[b, 'Reler · R']]);
    });

    it('aparece no foco do teclado', () => {
        const doc = documentoFalso();
        const raiz = doc.body.appendChild(doc.createElement('div')) as any;
        const b = raiz.appendChild(doc.createElement('button'));
        marcarDica(b, 'Hoje');
        ligarDicas(raiz);
        b.focus();
        expect(chamadas.mostrar.map(c => c[1])).toEqual(['Hoje']);
    });

    it('o toque longo mostra a dica e engole o clique; o toque curto clica', () => {
        vi.useFakeTimers();
        const doc = documentoFalso();
        doc.defaultView.setTimeout = setTimeout;
        doc.defaultView.clearTimeout = clearTimeout;
        const raiz = doc.body.appendChild(doc.createElement('div')) as any;
        const b = raiz.appendChild(doc.createElement('button'));
        let cliques = 0;
        b.addEventListener('click', () => { cliques++; });
        dica(b as any, 'Abrir tudo', { tecla: 'E' });
        void raiz;
        b.dispatchEvent(evento('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 }));
        vi.advanceTimersByTime(TOQUE_LONGO_MS + 10);
        b.dispatchEvent(evento('pointerup', { pointerType: 'touch' }));
        b.dispatchEvent(evento('click'));
        expect(chamadas.mostrar.map(c => c[1])).toEqual(['Abrir tudo · E']);
        expect(cliques).toBe(0);

        b.dispatchEvent(evento('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 }));
        vi.advanceTimersByTime(100);
        b.dispatchEvent(evento('pointerup', { pointerType: 'touch' }));
        b.dispatchEvent(evento('click'));
        expect(cliques).toBe(1);
        expect(chamadas.mostrar).toHaveLength(1);
    });

    it('o dedo que anda é rolagem: nenhuma dica', () => {
        vi.useFakeTimers();
        const doc = documentoFalso();
        doc.defaultView.setTimeout = setTimeout;
        doc.defaultView.clearTimeout = clearTimeout;
        const raiz = doc.body.appendChild(doc.createElement('div')) as any;
        const b = raiz.appendChild(doc.createElement('button'));
        marcarDica(b, 'Painel Centro');
        ligarDicas(raiz);
        b.dispatchEvent(evento('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 }));
        b.dispatchEvent(evento('pointermove', { pointerType: 'touch', clientX: 40, clientY: 10 }));
        vi.advanceTimersByTime(TOQUE_LONGO_MS + 10);
        expect(chamadas.mostrar).toHaveLength(0);
    });

    it('nenhum ouvinte vai para window nem para document (guarda de fonte)', async () => {
        const { readFileSync } = await import('node:fs');
        const src = readFileSync(new URL('../../src/ui/dica.ts', import.meta.url), 'utf8');
        expect(src).not.toMatch(/(window|document)\.addEventListener/);
    });
});
