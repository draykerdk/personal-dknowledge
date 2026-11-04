import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    TFile: class {
        constructor(public path: string = '', public extension: string = '') {}
    },
    TFolder: class {},
    Notice: class { constructor(public message?: string) {} },
}));

import { gravarCabecalho } from '../../src/engine/canvasengine/canvasFractalHeader';
import { runCanvasMenuForFrame } from '../../src/engine/canvasengine/canvasMenuApply';
import { buildCanvasMenuTree } from '../../src/engine/canvasengine/canvasMenu';
import type { CanvasFractalPorts } from '../../src/engine/canvasengine/canvasFractalPlan';
import type { FractalHeaderBlock } from '../../src/engine/canvasengine/canvasFractalModel';
import type { CanvasMenuPorts } from '../../src/engine/canvasengine/canvasMenuPlan';
import { FRACTAL_HEADER_MARKER } from '../../src/engine/canvasFractalContext';
import { COCKPIT_PATH } from '../../src/engine/canvasTree';

const AREA_PATH = '100 - AREAS/110 - Funções';
const COCKPIT_AREA = `${AREA_PATH}/Funções.canvas`;
const PROJ_A = `${AREA_PATH}/Proj A/Proj A.canvas`;

const CANVAS = JSON.stringify({
    nodes: [
        { id: 'n1', type: 'text', text: 'Proj A — desenho do operador', x: 0, y: 0, width: 400, height: 200 },
    ],
    edges: [],
}, null, 2);

function fakeSnapshot() {
    return {
        areas: [{ id: 'a1', name: 'Funções', path: AREA_PATH, canvas: COCKPIT_AREA }],
        canvases: [
            { path: COCKPIT_PATH, name: 'Commander', folder: '000', nodes: 5, edges: 1, mtime: 1, system: true },
            { path: COCKPIT_AREA, name: 'Funções', folder: AREA_PATH, nodes: 3, edges: 1, mtime: 20, system: false },
            { path: PROJ_A, name: 'Proj A', folder: `${AREA_PATH}/Proj A`, nodes: 3, edges: 1, mtime: 100, system: false },
        ],
        portfolio: { columns: [{ projects: [{ name: 'Proj A', path: `${AREA_PATH}/Proj A` }] }] },
        board: { buckets: [] },
    };
}

describe('Ordem O4 — Integridade Autoral e Persistência de Blocos (A3)', () => {
    describe('gravarCabecalho — unicidade, recusa com arestas e confirmação de persistência', () => {
        it('recusa sem gravar quando id de nó filho colide com nó existente do canvas', async () => {
            const raw = JSON.stringify({
                nodes: [
                    { id: 'h-link-1', type: 'text', text: 'Nota existente colidente' },
                ],
                edges: [],
            });

            const estado = { texto: raw, escritas: [] as string[] };
            const ports: CanvasFractalPorts = {
                read: async () => estado.texto,
                write: async (next) => { estado.escritas.push(next); estado.texto = next; },
                fail: vi.fn(),
                notice: vi.fn(),
            };

            const header: FractalHeaderBlock = {
                headerId: 'h-group-1',
                scale: 'projeto',
                label: 'Projeto',
                trail: ['Sistema', 'Funções', 'Proj A'],
                title: 'Projeto Teste',
                links: [{ nodeId: 'h-link-1', label: 'Área', filePath: COCKPIT_AREA, direction: 'subir', role: 'area-cockpit', reason: 'teste' }], // Colide com nó existente!
                skipped: [],
                reason: 'teste colisão',
            };

            const frame = { canvasPath: PROJ_A, raw, preferred: { x: 0, y: 0 } };
            const step = await gravarCabecalho(frame, header, raw, ports);

            expect(step.outcome).toBe('refused');
            expect(step.detail).toContain('já pertence a outro nó');
            expect(estado.escritas).toHaveLength(0);
        });

        it('recusa sem gravar na atualização se nó a remover possuir aresta autoral (A3)', async () => {
            const raw = JSON.stringify({
                nodes: [
                    { id: 'h-0', type: 'group', mode: FRACTAL_HEADER_MARKER, x: 0, y: 0, width: 400, height: 200 },
                    { id: 'h-old', type: 'text', mode: FRACTAL_HEADER_MARKER, x: 10, y: 10, width: 200, height: 40 },
                    { id: 'u-1', type: 'text', text: 'Nota autoral', x: 500, y: 0, width: 200, height: 100 },
                ],
                edges: [
                    { id: 'e-autoral-1', fromNode: 'h-old', toNode: 'u-1' },
                ],
            });

            const estado = { texto: raw, escritas: [] as string[] };
            const ports: CanvasFractalPorts = {
                read: async () => estado.texto,
                write: async (next) => { estado.escritas.push(next); estado.texto = next; },
                fail: vi.fn(),
                notice: vi.fn(),
            };

            // Novo cabeçalho não tem mais 'h-old'
            const header: FractalHeaderBlock = {
                headerId: 'h-0',
                scale: 'projeto',
                label: 'Projeto',
                trail: ['Sistema', 'Funções', 'Proj A'],
                title: 'Projeto Teste',
                links: [{ nodeId: 'h-link-novo', label: 'Área', filePath: COCKPIT_AREA, direction: 'subir', role: 'area-cockpit', reason: 'teste' }],
                skipped: [],
                reason: 'teste remoção',
            };

            const frame = { canvasPath: PROJ_A, raw, preferred: { x: 0, y: 0 } };
            const step = await gravarCabecalho(frame, header, raw, ports);

            expect(step.outcome).toBe('refused');
            expect(step.detail).toContain('impactaria aresta(s)');
            expect(estado.escritas).toHaveLength(0);
            expect(estado.texto).toBe(raw);
        });

        it('detecta falha quando a persistência diverge do conteúdo gravado', async () => {
            const raw = JSON.stringify({ nodes: [], edges: [] });
            let writtenContent = '';
            const ports: CanvasFractalPorts = {
                read: vi.fn()
                    .mockResolvedValueOnce(raw) // Leitura inicial
                    .mockResolvedValueOnce('divergência inesperada no disco'), // Releitura de confirmação pós-gravação
                write: vi.fn(async (next) => { writtenContent = next; }),
                fail: vi.fn(),
                notice: vi.fn(),
            };

            const header: FractalHeaderBlock = {
                headerId: 'h-0',
                scale: 'projeto',
                label: 'Projeto',
                trail: ['Sistema', 'Funções', 'Proj A'],
                title: 'Projeto Teste',
                links: [],
                skipped: [],
                reason: 'teste persistência',
            };

            const frame = { canvasPath: PROJ_A, raw, preferred: { x: 0, y: 0 } };
            const step = await gravarCabecalho(frame, header, raw, ports);

            expect(step.outcome).toBe('failed');
            expect(step.detail).toContain('persistência divergiu');
            expect(ports.write).toHaveBeenCalledTimes(1);
        });
    });

    describe('canvasMenuApply — proteção autoral e persistência', () => {
        it('recusa sem gravar quando remoção de nó do menu violaria aresta autoral', async () => {
            const estado = { texto: CANVAS, escritas: [] as string[] };
            const ports: CanvasMenuPorts = {
                read: async () => estado.texto,
                write: async (next) => { estado.escritas.push(next); estado.texto = next; },
                fail: vi.fn(),
                notice: vi.fn(),
                exists: () => true,
            };

            // 1. Gera o menu inicial com 2 itens
            const tree1 = buildCanvasMenuTree([
                { id: 'r1', label: 'Router 1', kind: 'protocol', group: 'Roteadores' },
                { id: 'r2', label: 'Router 2', kind: 'protocol', group: 'Roteadores' },
            ]);
            const frame1 = { canvasPath: PROJ_A, raw: CANVAS, preferred: { x: 0, y: 0 }, tree: tree1 };
            const prim = await runCanvasMenuForFrame(frame1, fakeSnapshot(), ports);
            expect(prim.outcome).toBe('written');
            expect(prim.added.length).toBeGreaterThan(0);

            // 2. Conecta aresta autoral ao primeiro nó gerado que será removido
            const parsed = JSON.parse(estado.texto);
            const menuNodes = parsed.nodes.filter(n => n.mode === 'dfm-canvas-menu'); const router1Node = parsed.nodes.find(n => n.text && n.text.includes('Router 1')); const menuNodeId = router1Node.id;
            parsed.edges.push({ id: 'e-menu-user', fromNode: menuNodeId, toNode: 'n1' });
            estado.texto = JSON.stringify(parsed, null, 2);

            // 3. Tenta regerar o menu com acervo que remove r1
            const tree2 = buildCanvasMenuTree([
                { id: 'r2', label: 'Router 2', kind: 'protocol', group: 'Roteadores' },
            ]);
            const frame2 = { canvasPath: PROJ_A, raw: estado.texto, preferred: { x: 0, y: 0 }, tree: tree2 };
            const seg = await runCanvasMenuForFrame(frame2, fakeSnapshot(), ports);

            expect(seg.outcome).toBe('refused');
            expect(seg.message).toContain('impactaria aresta(s)');
            // Não gravou nova versão
            expect(estado.texto).toContain('e-menu-user');
        });

        it('detecta falha na confirmação de persistência pós-gravação do menu', async () => {
            const raw = JSON.stringify({ nodes: [], edges: [] });
            const ports: CanvasMenuPorts = {
                read: vi.fn()
                    .mockResolvedValueOnce(raw) // 1. Leitura no runCanvasMenuForFrame
                    .mockResolvedValueOnce(raw) // 2. Leitura no gravarComGuarda
                    .mockResolvedValueOnce('conteúdo corrompido pós-escrita'), // 3. Confirmação
                write: vi.fn(async () => undefined),
                fail: vi.fn(),
                notice: vi.fn(),
                exists: () => true,
            };

            const tree = buildCanvasMenuTree([
                { id: 'r1', label: 'Router 1', kind: 'protocol', group: 'Roteadores' },
            ]);
            const frame = { canvasPath: PROJ_A, raw, preferred: { x: 0, y: 0 }, tree };
            const report = await runCanvasMenuForFrame(frame, fakeSnapshot(), ports);

            expect(report.outcome).toBe('failed');
            expect(ports.write).toHaveBeenCalledTimes(1);
        });
    });
});
