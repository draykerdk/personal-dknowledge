import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        TFile: class {},
        Notice: class { constructor(public message?: string) {} },
    };
});

import {
    fractalNavigationDirection,
    planSystemAreaLinks,
    planTaskProjectReturn,
} from '../../src/engine/canvasengine/canvasFractalHeaderPlan';

describe('canvasFractalHeaderPlan — gramática fractal expandida e navegação mínima (A4, P2)', () => {
    const mockIndex = {
        entries: [
            { path: 'Areas/Engenharia/Engenharia.canvas', area: 'engenharia', mtime: 1000 },
            { path: 'Projetos/DFM/DFM.canvas', project: 'DFM', area: 'engenharia', mtime: 2000 },
            { path: 'TaskNotes/Tarefas/tarefa-1.md', project: 'DFM' },
        ],
        byAreaCockpit: new Map([
            ['engenharia', { path: 'Areas/Engenharia/Engenharia.canvas', mtime: 1000 }],
            ['saude', { path: 'Areas/Saude/Saude.canvas', mtime: 1200 }],
        ]),
    } as any;

    describe('fractalNavigationDirection', () => {
        it('identifica direção lateral para projetos irmãos', () => {
            const link: any = { role: 'projeto-irmao', direction: 'descer' };
            expect(fractalNavigationDirection(link)).toBe('lateral');
        });

        it('identifica direção subir para ligações ascendentes', () => {
            const link: any = { role: 'area-cockpit', direction: 'subir' };
            expect(fractalNavigationDirection(link)).toBe('subir');
        });

        it('identifica direção descer para tarefas ou projetos da área', () => {
            const linkTarefa: any = { role: 'tarefas', direction: 'descer' };
            expect(fractalNavigationDirection(linkTarefa)).toBe('descer');

            const linkArea: any = { role: 'projeto-da-area', direction: 'descer' };
            expect(fractalNavigationDirection(linkArea)).toBe('descer');
        });
    });

    describe('planSystemAreaLinks (Sistema -> Áreas)', () => {
        it('gera ligações de descida do sistema para os cockpits de áreas registradas', () => {
            const links = planSystemAreaLinks(mockIndex);
            expect(links).toHaveLength(2);
            expect(links[0].direction).toBe('descer');
            expect(links[0].filePath).toBe('Areas/Engenharia/Engenharia.canvas');
            expect(links[0].label).toBe('Área engenharia');
            expect(links[0].role).toBe('area-cockpit');

            expect(links[1].direction).toBe('descer');
            expect(links[1].filePath).toBe('Areas/Saude/Saude.canvas');
        });

        it('retorna array vazio quando não há áreas ou índice nulo', () => {
            expect(planSystemAreaLinks(null)).toEqual([]);
            expect(planSystemAreaLinks({ byAreaCockpit: new Map() } as any)).toEqual([]);
        });
    });

    describe('planTaskProjectReturn (Tarefa -> Projeto)', () => {
        it('localiza o canvas do projeto pai para retorno a partir de uma tarefa', () => {
            const link = planTaskProjectReturn(mockIndex, 'TaskNotes/Tarefas/tarefa-1.canvas', 'DFM');
            expect(link).not.toBeNull();
            expect(link?.direction).toBe('retorno');
            expect(link?.filePath).toBe('Projetos/DFM/DFM.canvas');
            expect(link?.label).toBe('Retornar ao Projeto DFM');
        });

        it('retorna null se a tarefa não declarar projeto pai ou não houver canvas correspondente', () => {
            expect(planTaskProjectReturn(mockIndex, 'TaskNotes/tarefa.canvas', '')).toBeNull();
            expect(planTaskProjectReturn(mockIndex, 'TaskNotes/tarefa.canvas', 'ProjetoInexistente')).toBeNull();
        });
    });
});
