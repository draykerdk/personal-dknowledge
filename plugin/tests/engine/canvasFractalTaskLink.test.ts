import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => {
    return {
        TFile: class {},
        Notice: class { constructor(public message?: string) {} },
    };
});

import {
    matchesTargetProject,
    parseTaskLink,
    resolveProjectTasks,
    tarefasDoProjeto,
    triageOrphanTasks,
} from '../../src/engine/canvasengine/canvasFractalTaskLink';
import { planFractalHeader } from '../../src/engine/canvasengine/canvasFractalHeaderPlan';

describe('canvasFractalTaskLink — resolução de vínculos e triagem (A2 / O2)', () => {
    const mockIndexAmbiguo: any = {
        entries: [
            { path: 'Areas/Fin/Projetos/Alpha/Alpha.canvas', project: 'Alpha', projectPath: 'Areas/Fin/Projetos/Alpha' },
            { path: 'Areas/Eng/Projetos/Alpha/Alpha.canvas', project: 'Alpha', projectPath: 'Areas/Eng/Projetos/Alpha' },
        ],
        byProjectPath: new Map([
            ['Areas/Fin/Projetos/Alpha', { path: 'Areas/Fin/Projetos/Alpha/Alpha.canvas', project: 'Alpha', projectPath: 'Areas/Fin/Projetos/Alpha' }],
            ['Areas/Eng/Projetos/Alpha', { path: 'Areas/Eng/Projetos/Alpha/Alpha.canvas', project: 'Alpha', projectPath: 'Areas/Eng/Projetos/Alpha' }],
        ]),
        byProject: new Map(), // homônimos removidos de byProject
        ambiguousProjectNames: ['Alpha'],
    };

    describe('parseTaskLink', () => {
        it('extrai caminho canônico e alias de wikilinks formatados', () => {
            const parsed = parseTaskLink('[[100 - AREAS/Projetos/ProjA/000 - INDEX/ProjA|ProjA]]');
            expect(parsed.cleanPath).toBe('100 - AREAS/Projetos/ProjA/000 - INDEX/ProjA');
            expect(parsed.cleanName).toBe('ProjA');
            expect(parsed.isPath).toBe(true);
        });

        it('trata links simples sem pipe e sem colchetes', () => {
            const parsed = parseTaskLink('ProjetoBeta');
            expect(parsed.cleanPath).toBe('ProjetoBeta');
            expect(parsed.cleanName).toBe('ProjetoBeta');
            expect(parsed.isPath).toBe(false);
        });
    });

    describe('matchesTargetProject — isolamento de homônimos e caminhos canônicos', () => {
        it('recusa casamento por nome simples quando o projeto é ambíguo no índice', () => {
            const parsed = parseTaskLink('[[Alpha]]');
            const target = { name: 'Alpha', projectPath: 'Areas/Fin/Projetos/Alpha' };
            const res = matchesTargetProject(parsed, target, mockIndexAmbiguo);
            expect(res.matched).toBe(false);
            expect(res.ambiguous).toBe(true);
            expect(res.reason).toContain('múltiplas áreas');
        });

        it('aceita casamento canônico por caminho mesmo para projetos homônimos', () => {
            const parsedFin = parseTaskLink('[[Areas/Fin/Projetos/Alpha/000 - INDEX/Alpha|Alpha]]');
            const targetFin = { name: 'Alpha', projectPath: 'Areas/Fin/Projetos/Alpha' };
            const targetEng = { name: 'Alpha', projectPath: 'Areas/Eng/Projetos/Alpha' };

            expect(matchesTargetProject(parsedFin, targetFin, mockIndexAmbiguo).matched).toBe(true);
            expect(matchesTargetProject(parsedFin, targetEng, mockIndexAmbiguo).matched).toBe(false);
        });
    });

    describe('resolveProjectTasks — cadeia SMART e compartilhamento', () => {
        it('tarefa de A aparece só em A e não em B', () => {
            const tasks = [
                { path: 'TaskNotes/Tarefas/t-a.md', projects: ['[[Proj A]]'] },
                { path: 'TaskNotes/Tarefas/t-b.md', projects: ['[[Proj B]]'] },
            ];
            const resA = resolveProjectTasks(tasks, 'Proj A', () => true);
            const resB = resolveProjectTasks(tasks, 'Proj B', () => true);

            expect(resA.candidates.map(c => c.path)).toEqual(['TaskNotes/Tarefas/t-a.md']);
            expect(resB.candidates.map(c => c.path)).toEqual(['TaskNotes/Tarefas/t-b.md']);
        });

        it('tarefa compartilhada A+B entra em ambos os projetos', () => {
            const tasks = [
                { path: 'TaskNotes/Tarefas/compartilhada.md', projects: ['[[Proj A]]', '[[Proj B]]'] },
            ];
            const resA = resolveProjectTasks(tasks, 'Proj A', () => true);
            const resB = resolveProjectTasks(tasks, 'Proj B', () => true);

            expect(resA.candidates.map(c => c.path)).toEqual(['TaskNotes/Tarefas/compartilhada.md']);
            expect(resB.candidates.map(c => c.path)).toEqual(['TaskNotes/Tarefas/compartilhada.md']);
        });

        it('filha de SMART vinculada chega ao dono do projeto', () => {
            const tasks = [
                {
                    path: 'TaskNotes/Tarefas/smart-1.md',
                    title: 'Entrega SMART 1',
                    type: 'tarefa_smart',
                    projects: ['[[Areas/Eng/Projetos/DFM/DFM|DFM]]'],
                },
                {
                    path: 'TaskNotes/Tarefas/acao-atomica.md',
                    title: 'Ação Atômica 1',
                    type: 'task',
                    projects: ['[[TaskNotes/Tarefas/smart-1.md]]'],
                    due: '2026-09-20',
                },
            ];
            const target = { name: 'DFM', projectPath: 'Areas/Eng/Projetos/DFM' };
            const res = resolveProjectTasks(tasks, target, () => true);

            expect(res.candidates.map(c => c.path)).toContain('TaskNotes/Tarefas/acao-atomica.md');
            expect(res.candidates.map(c => c.path)).toContain('TaskNotes/Tarefas/smart-1.md');
        });

        it('interrompe ciclos em referências transitivas sem falha', () => {
            const tasks = [
                { path: 'TaskNotes/Tarefas/c1.md', projects: ['[[TaskNotes/Tarefas/c2.md]]'] },
                { path: 'TaskNotes/Tarefas/c2.md', projects: ['[[TaskNotes/Tarefas/c1.md]]'] },
            ];
            const res = resolveProjectTasks(tasks, 'Proj A', () => true);
            expect(res.candidates).toHaveLength(0);
            expect(res.orphans.some(o => o.reason.includes('Ciclo'))).toBe(true);
        });
    });

    describe('triageOrphanTasks e integração com planFractalHeader', () => {
        it('triagem identifica tarefas sem projeto e ambíguas', () => {
            const tasks = [
                { path: 'TaskNotes/Tarefas/orfa.md' },
                { path: 'TaskNotes/Tarefas/ambigua.md', projects: ['Alpha'] },
            ];
            const target = { name: 'Alpha', projectPath: 'Areas/Fin/Projetos/Alpha' };
            const res = resolveProjectTasks(tasks, target, () => true, mockIndexAmbiguo);

            expect(res.orphans).toHaveLength(2);
            expect(res.orphans[0].reason).toContain('sem projeto');
            expect(res.orphans[1].reason).toContain('múltiplas áreas');
        });

        it('planFractalHeader inclui tarefas em triagem no skipped', () => {
            const mockReading: any = { scale: 'projeto', label: 'Projeto', trail: ['sistema', 'Área', 'Projeto'], reason: 'ok' };
            const bloco = planFractalHeader({
                canvasPath: 'Areas/Fin/Projetos/Alpha/Alpha.canvas',
                reading: mockReading,
                index: mockIndexAmbiguo,
                tasks: [
                    { path: 'TaskNotes/Tarefas/orfa.md' },
                    { path: 'TaskNotes/Tarefas/valida.md', projects: ['[[Areas/Fin/Projetos/Alpha]]'], due: '2026-09-18' },
                ],
                exists: () => true,
            });

            expect(bloco).not.toBeNull();
            const linkTarefa = bloco!.links.filter(l => l.role === 'tarefas');
            expect(linkTarefa).toHaveLength(1);
            expect(linkTarefa[0].filePath).toBe('TaskNotes/Tarefas/valida.md');
            expect(bloco!.skipped.some(s => s.path === 'TaskNotes/Tarefas/orfa.md' && s.reason.includes('triagem'))).toBe(true);
        });
    });
});
