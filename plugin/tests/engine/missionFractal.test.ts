/**
 * A leitura da escala fractal, com índice **sintético** montado à mão.
 *
 * Nada aqui lê o vault: o teste cobra a decisão, não a medição. Um índice de verdade
 * muda a cada arquivo salvo e não serve de gabarito.
 *
 * Puro: sem DOM, sem jsdom, sem `obsidian`.
 */
import { describe, expect, it } from 'vitest';
import { readFractalScale } from '../../src/engine/missionFractal';
import type { CanvasIndexEntry, MissionCanvasIndex } from '../../src/engine/missionCanvasIndex';

const AREA_PATH = '100 - AREAS/1 - Casa';
const PROJECT_PATH = `${AREA_PATH}/Projetos/Reforma`;

function entry(over: Partial<CanvasIndexEntry> & { path: string }): CanvasIndexEntry {
    const name = over.path.split('/').pop() ?? over.path;
    return {
        path: over.path,
        name: over.name ?? name.replace(/\.canvas$/, ''),
        folder: over.folder ?? over.path.split('/').slice(0, -1).join('/'),
        nodes: over.nodes ?? 0,
        edges: over.edges ?? 0,
        mtime: over.mtime ?? null,
        project: over.project ?? null,
        projectPath: over.projectPath ?? null,
        area: over.area ?? null,
        areaCockpit: over.areaCockpit ?? false,
        system: over.system ?? false,
    };
}

/**
 * Monta o índice como `buildCanvasIndex` montaria: os mapas derivam dos entries.
 * Se um dia a derivação real mudar, este gabarito muda junto — e é por isso que ele
 * repete a regra em vez de receber os mapas prontos.
 */
function makeIndex(entries: CanvasIndexEntry[]): MissionCanvasIndex {
    const byProjectPath = new Map<string, CanvasIndexEntry>();
    const byProject = new Map<string, CanvasIndexEntry>();
    const byArea = new Map<string, CanvasIndexEntry[]>();
    const byAreaCockpit = new Map<string, CanvasIndexEntry>();

    for (const item of entries) {
        if (item.projectPath) byProjectPath.set(item.projectPath, item);
        if (item.project) byProject.set(item.project, item);
        if (item.area) byArea.set(item.area, [...(byArea.get(item.area) ?? []), item]);
        if (item.area && item.areaCockpit) byAreaCockpit.set(item.area, item);
    }

    return {
        entries,
        byProjectPath,
        byProject,
        ambiguousProjectNames: [],
        byArea,
        byAreaCockpit,
        totals: {
            canvases: entries.length,
            withProject: entries.filter(item => item.project).length,
            withArea: entries.filter(item => item.area).length,
            loose: entries.filter(item => !item.project && !item.area).length,
            system: entries.filter(item => item.system).length,
        },
    };
}

const EMPTY_CONTENTS = { tasks: 0, projects: [] as string[] };

describe('readFractalScale — as cinco escalas', () => {
    it('sistema: o índice marca o caminho como canvas do sistema', () => {
        const path = '000 - KERNEL/Dashboard.canvas';
        const index = makeIndex([entry({ path, system: true })]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('sistema');
        expect(reading.label).toBe('Sistema');
        expect(reading.trail).toEqual(['Sistema']);
        expect(reading.reason).toContain(path);
    });

    it('area: o caminho é o cockpit declarado em byAreaCockpit', () => {
        const path = `${AREA_PATH}/Casa.canvas`;
        const index = makeIndex([
            entry({ path, area: 'casa', areaCockpit: true }),
            entry({ path: `${AREA_PATH}/outro.canvas`, area: 'casa' }),
        ]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('area');
        expect(reading.label).toBe('Área');
        expect(reading.trail).toEqual(['Área']);
        expect(reading.reason).toContain(path);
        expect(reading.reason).toContain('casa');
    });

    it('projeto: o caminho segue a convenção <pasta do projeto>/<nome>.canvas', () => {
        const path = `${PROJECT_PATH}/Reforma.canvas`;
        const index = makeIndex([
            entry({ path, project: 'Reforma', projectPath: PROJECT_PATH, area: 'casa' }),
        ]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('projeto');
        expect(reading.label).toBe('Projeto');
        expect(reading.trail).toEqual(['Área', 'Projeto']);
        expect(reading.reason).toContain('Reforma');
    });

    it('tarefas: canvas solto cujo desenho tem nós de tarefa', () => {
        const path = '300 - RUNTIME/avulso.canvas';
        const index = makeIndex([entry({ path })]);
        const reading = readFractalScale({
            canvasPath: path,
            contents: { tasks: 2, projects: [] },
            index,
        });

        expect(reading.scale).toBe('tarefas');
        expect(reading.label).toBe('Tarefas');
        expect(reading.trail).toEqual(['Projeto', 'Tarefas']);
        expect(reading.reason).toContain('2');
    });

    it('indefinida: solto, sem tarefa, sem marca nenhuma no índice', () => {
        const path = '300 - RUNTIME/avulso.canvas';
        const index = makeIndex([entry({ path })]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('indefinida');
        expect(reading.trail).toEqual([]);
        // Diz em palavras que não deu: sem rótulo de nível inventado.
        expect(reading.label.toLowerCase()).toContain('indefinida');
        expect(reading.reason.toLowerCase()).toContain('não foi possível determinar');
    });

    it('índice vazio devolve indefinida, sem trilha e com motivo', () => {
        const index = makeIndex([]);
        const reading = readFractalScale({
            canvasPath: 'qualquer/canvas.canvas',
            contents: EMPTY_CONTENTS,
            index,
        });

        expect(reading.scale).toBe('indefinida');
        expect(reading.trail).toEqual([]);
        expect(reading.label).toBe('Escala indefinida');
        expect(reading.reason.length).toBeGreaterThan(0);
    });
});

describe('readFractalScale — a ordem de precedência decide', () => {
    it('projeto dentro de uma área é projeto, não área', () => {
        const path = `${PROJECT_PATH}/Reforma.canvas`;
        const cockpit = `${AREA_PATH}/Casa.canvas`;
        const index = makeIndex([
            entry({ path: cockpit, area: 'casa', areaCockpit: true }),
            entry({ path, project: 'Reforma', projectPath: PROJECT_PATH, area: 'casa' }),
        ]);

        // O canvas de projeto está na árvore da área (byArea o lista), mas não é o
        // cockpit: quem decide é o mapa do topo, não o pertencimento.
        expect((index.byArea.get('casa') ?? []).map(item => item.path)).toContain(path);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });
        expect(reading.scale).toBe('projeto');
        expect(index.byAreaCockpit.get('casa')?.path).toBe(cockpit);
    });

    it('tarefas não rebaixam um projeto: declaração vence conteúdo', () => {
        const path = `${PROJECT_PATH}/Reforma.canvas`;
        const index = makeIndex([
            entry({ path, project: 'Reforma', projectPath: PROJECT_PATH, area: 'casa' }),
        ]);
        const reading = readFractalScale({
            canvasPath: path,
            contents: { tasks: 7, projects: ['Reforma'] },
            index,
        });

        expect(reading.scale).toBe('projeto');
    });

    it('sistema vence projeto, mesmo com o caminho na convenção', () => {
        const path = `${PROJECT_PATH}/Reforma.canvas`;
        const index = makeIndex([
            entry({ path, system: true, project: 'Reforma', projectPath: PROJECT_PATH, area: 'casa' }),
        ]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('sistema');
    });

    it('cockpit vence projeto: o topo da área não desce para projeto', () => {
        const path = `${AREA_PATH}/Casa.canvas`;
        const index = makeIndex([
            entry({ path, area: 'casa', areaCockpit: true, project: 'Casa', projectPath: AREA_PATH }),
        ]);
        const reading = readFractalScale({
            canvasPath: path,
            contents: { tasks: 5, projects: ['Casa'] },
            index,
        });

        expect(reading.scale).toBe('area');
        expect(reading.trail).toEqual(['Área']);
    });

    it('o caminho é a identidade: homônimo em outra pasta não é este canvas', () => {
        const path = `${PROJECT_PATH}/Reforma.canvas`;
        const index = makeIndex([
            entry({
                path: '100 - AREAS/2 - Trabalho/Projetos/Reforma/Reforma.canvas',
                project: 'Reforma',
                projectPath: '100 - AREAS/2 - Trabalho/Projetos/Reforma',
                area: 'trabalho',
            }),
        ]);
        const reading = readFractalScale({ canvasPath: path, contents: EMPTY_CONTENTS, index });

        expect(reading.scale).toBe('indefinida');
    });
});

describe('readFractalScale — o motivo nunca é vazio e cita a evidência', () => {
    const cases: Array<{ name: string; path: string; index: MissionCanvasIndex; tasks: number }> = [
        {
            name: 'sistema',
            path: '000 - KERNEL/Dashboard.canvas',
            index: makeIndex([entry({ path: '000 - KERNEL/Dashboard.canvas', system: true })]),
            tasks: 0,
        },
        {
            name: 'area',
            path: `${AREA_PATH}/Casa.canvas`,
            index: makeIndex([entry({ path: `${AREA_PATH}/Casa.canvas`, area: 'casa', areaCockpit: true })]),
            tasks: 0,
        },
        {
            name: 'projeto',
            path: `${PROJECT_PATH}/Reforma.canvas`,
            index: makeIndex([
                entry({ path: `${PROJECT_PATH}/Reforma.canvas`, project: 'Reforma', projectPath: PROJECT_PATH }),
            ]),
            tasks: 0,
        },
        {
            name: 'tarefas',
            path: 'solto.canvas',
            index: makeIndex([entry({ path: 'solto.canvas' })]),
            tasks: 3,
        },
        {
            name: 'indefinida',
            path: 'solto.canvas',
            index: makeIndex([entry({ path: 'solto.canvas' })]),
            tasks: 0,
        },
    ];

    for (const item of cases) {
        it(`${item.name}: motivo preenchido`, () => {
            const reading = readFractalScale({
                canvasPath: item.path,
                contents: { tasks: item.tasks, projects: [] },
                index: item.index,
            });

            expect(reading.label.length).toBeGreaterThan(0);
            expect(reading.reason.trim().length).toBeGreaterThan(0);
            // Trilha vazia só em `indefinida`: em qualquer nível lido, a trilha existe.
            expect(reading.trail.length > 0).toBe(reading.scale !== 'indefinida');
        });
    }
});
