/**
 * Testes do motor da Matriz DFM de ação.
 *
 * O que este arquivo protege, em uma frase: **a triagem é uma só e a ausência de
 * dado tem lugar próprio**. Três coisas quebram sem fazer barulho, e cada uma
 * tem teste aqui:
 *
 * 1. classificar errado — tarefa urgente e importante caindo fora de "Fazer
 *    agora", ou a meta-mãe SMART virando item de matriz;
 * 2. transformar ausência em zero — `impacto` vazio virando "baixo impacto", ou
 *    `excluded` desconhecido virando `0`;
 * 3. inventar item — célula preenchida com algo que o operador não escreveu.
 *
 * O motor é puro: nenhum teste aqui precisa de vault, de Obsidian ou de DOM.
 */
import { describe, expect, it } from 'vitest';
import {
    MATRIX_VISIBLE_ITEMS,
    buildMatrixView,
    buildPriorityMatrix,
    hiddenMatrixCount,
    matrixCellTone,
    matrixCellWide,
    matrixView,
    visibleMatrixTasks,
} from '../../src/engine/missionMatrix';
import { buildPriorityMatrix as canonico } from '../../src/engine/missionPlan';
import type { MissionTask } from '../../src/engine/missionControl';

/* ==========================================================================
   Fixtures
   ========================================================================== */

/**
 * Tarefa mínima, na forma do tipo.
 *
 * O construtor é literal de propósito: só os campos que a matriz lê aparecem, e
 * o resto fica no padrão da casa. Montar uma `MissionTask` inteira aqui esconderia
 * qual parte do modelo o motor de fato toca.
 */
function tarefa(overrides: Partial<MissionTask> & { title: string }): MissionTask {
    return {
        path: `TaskNotes/Tasks/${overrides.title}.md`,
        title: overrides.title,
        status: 'next-action',
        priority: 'normal',
        projects: ['Projeto X'],
        week: '2026-W38',
        due: '',
        impact: null,
        overdue: false,
        dueToday: false,
        highImpact: false,
        scheduled: '',
        scheduledDate: '',
        scheduledTime: '',
        scheduledPast: false,
        estimate: null,
        contexts: [],
        type: 'task',
        archived: false,
        blockedBy: [],
        ...overrides,
    } as MissionTask;
}

/** A célula pelo id — ler pelo id é o que o painel e o widget fazem. */
function celula(cells: ReturnType<typeof buildPriorityMatrix>, id: string) {
    const found = cells.find(cell => cell.id === id);
    if (!found) throw new Error(`célula ausente: ${id}`);
    return found;
}

/* ==========================================================================
   A regra é a canônica — não uma segunda cópia
   ========================================================================== */

describe('motor da matriz — a regra vem do construtor canônico', () => {
    it('reexporta `buildPriorityMatrix` de missionPlan sem reimplementar a triagem', () => {
        // Identidade de função, não igualdade de comportamento: se alguém copiar a
        // regra para cá, este teste cai e a duplicação aparece na revisão.
        expect(buildPriorityMatrix).toBe(canonico);
    });

    it('publica as cinco células na ordem canônica, com rótulo e dica', () => {
        // A lista canônica vem do construtor: `matrixView` lê células já montadas,
        // e uma lista vazia ali significa "nenhuma célula", não "células vazias".
        const view = buildMatrixView([]);
        expect(view.cells.map(cell => cell.id)).toEqual(['agora', 'agendar', 'rapido', 'soltar', 'sem-impacto']);
        for (const cell of view.cells) {
            expect(cell.label).toBeTruthy();
            expect(cell.hint).toBeTruthy();
        }
    });
});

/* ==========================================================================
   Classificação
   ========================================================================== */

describe('motor da matriz — urgência (priority) × importância (impacto)', () => {
    it('cada combinação cai na célula certa', () => {
        const view = buildMatrixView([
            tarefa({ title: 'urgente e importante', priority: 'high', impact: 9 }),
            tarefa({ title: 'importante e calmo', priority: 'normal', impact: 8 }),
            tarefa({ title: 'urgente e pequeno', priority: 'high', impact: 3 }),
            tarefa({ title: 'nem um nem outro', priority: 'low', impact: 2 }),
        ]);
        expect(celula(view.cells, 'agora').tasks.map(t => t.title)).toEqual(['urgente e importante']);
        expect(celula(view.cells, 'agendar').tasks.map(t => t.title)).toEqual(['importante e calmo']);
        expect(celula(view.cells, 'rapido').tasks.map(t => t.title)).toEqual(['urgente e pequeno']);
        expect(celula(view.cells, 'soltar').tasks.map(t => t.title)).toEqual(['nem um nem outro']);
    });

    it('o corte de alto impacto é `impacto >= 7`, como na view canônica', () => {
        const view = buildMatrixView([
            tarefa({ title: 'sete', priority: 'high', impact: 7 }),
            tarefa({ title: 'seis', priority: 'high', impact: 6 }),
        ]);
        expect(celula(view.cells, 'agora').tasks.map(t => t.title)).toEqual(['sete']);
        expect(celula(view.cells, 'rapido').tasks.map(t => t.title)).toEqual(['seis']);
    });

    it('`urgent` é alias tolerado de `high`; prioridade vazia não é urgência', () => {
        const view = buildMatrixView([
            tarefa({ title: 'alias', priority: 'urgent', impact: 9 }),
            tarefa({ title: 'sem prioridade', priority: '', impact: 9 }),
        ]);
        expect(celula(view.cells, 'agora').tasks.map(t => t.title)).toEqual(['alias']);
        expect(celula(view.cells, 'agendar').tasks.map(t => t.title)).toEqual(['sem prioridade']);
    });
});

/* ==========================================================================
   Ausência não é zero
   ========================================================================== */

describe('motor da matriz — ausência de dado tem célula própria', () => {
    it('tarefa sem `impacto` vai para `sem-impacto`, nunca para "baixo impacto"', () => {
        const view = buildMatrixView([
            tarefa({ title: 'sem impacto declarado', priority: 'normal', impact: null }),
            tarefa({ title: 'impacto declarado baixo', priority: 'normal', impact: 2 }),
        ]);
        expect(celula(view.cells, 'sem-impacto').tasks.map(t => t.title)).toEqual(['sem impacto declarado']);
        // A prova de que a ausência NÃO virou baixo impacto: "soltar" tem só quem
        // declarou impacto baixo de verdade.
        expect(celula(view.cells, 'soltar').tasks.map(t => t.title)).toEqual(['impacto declarado baixo']);
        expect(view.unclassified).toBe(1);
    });

    it('tarefa sem `priority` não é tratada como urgente nem descartada', () => {
        const view = buildMatrixView([tarefa({ title: 'sem urgência declarada', priority: '', impact: 9 })]);
        expect(celula(view.cells, 'agora').tasks).toHaveLength(0);
        expect(celula(view.cells, 'agendar').tasks.map(t => t.title)).toEqual(['sem urgência declarada']);
        expect(view.total).toBe(1);
    });

    it('ausência de impacto é lida do campo cru: vazio, nulo e `undefined` são a mesma ausência', () => {
        const view = buildMatrixView([
            tarefa({ title: 'vazio', impact: '' as unknown as null }),
            tarefa({ title: 'nulo', impact: null }),
            tarefa({ title: 'indefinido', impact: undefined as unknown as null }),
        ]);
        expect(view.unclassified).toBe(3);
        expect(view.total).toBe(3);
    });

    it('matriz vazia diz que está vazia — e não que zero itens foram descartados', () => {
        const view = matrixView([]);
        expect(view.isEmpty).toBe(true);
        expect(view.total).toBe(0);
        // `null` e não `0`: partindo das células não há como saber quantas tarefas
        // foram examinadas, e zero afirmaria "nada ficou de fora".
        expect(view.excluded).toBeNull();
    });

    it('células ausentes ou inválidas não viram exceção nem item inventado', () => {
        expect(matrixView(null).isEmpty).toBe(true);
        expect(matrixView(undefined).excluded).toBeNull();
        expect(matrixView([]).cells).toEqual([]);
    });
});

/* ==========================================================================
   O que entra na mesa — e o que fica de fora, contado
   ========================================================================== */

describe('motor da matriz — filtro canônico da mesa', () => {
    it('status não executável, arquivada e SMART-mãe ficam fora — e a diferença é contada', () => {
        const tasks = [
            tarefa({ title: 'na mesa', status: 'next-action' }),
            tarefa({ title: 'em execução', status: 'in-progress' }),
            tarefa({ title: 'capturada', status: 'inbox' }),
            tarefa({ title: 'guardada', status: 'someday' }),
            tarefa({ title: 'fechada', status: 'done' }),
            tarefa({ title: 'arquivada', status: 'next-action', archived: true }),
            tarefa({ title: 'meta-mãe', status: 'next-action', type: 'tarefa_smart', priority: 'high', impact: 10 }),
        ];
        const view = buildMatrixView(tasks);
        expect(view.total).toBe(2);
        // Nenhum dos excluídos virou item de célula.
        const todos = view.cells.flatMap(cell => cell.tasks.map(t => t.title));
        expect(todos.sort()).toEqual(['em execução', 'na mesa']);
        // O que foi examinado menos o que entrou: exato por construção.
        expect(view.excluded).toBe(5);
    });

    it('a SMART-mãe com urgência e impacto máximos não aparece em "Fazer agora"', () => {
        const view = buildMatrixView([
            tarefa({ title: 'meta', type: 'tarefa_smart', priority: 'high', impact: 10 }),
        ]);
        expect(view.isEmpty).toBe(true);
        expect(view.excluded).toBe(1);
    });

    it('lista vazia de tarefas: nada examinado, nada descartado, nada na mesa', () => {
        const view = buildMatrixView([]);
        expect(view.isEmpty).toBe(true);
        expect(view.excluded).toBe(0);
    });
});

/* ==========================================================================
   Ordem de leitura e recorte
   ========================================================================== */

describe('motor da matriz — ordem dentro da célula', () => {
    it('vencido, vence hoje, impacto decrescente, título — a mesma ordem do quadro', () => {
        // Todas as quatro são urgentes e de alto impacto de propósito: a ordem só
        // se observa dentro da mesma célula.
        const view = buildMatrixView([
            tarefa({ title: 'C sem prazo', priority: 'high', impact: 9 }),
            tarefa({ title: 'B hoje', priority: 'high', impact: 8, dueToday: true, due: '2026-09-15' }),
            tarefa({ title: 'A vencida', priority: 'high', impact: 7, overdue: true, due: '2026-09-01' }),
            tarefa({ title: 'D mesmo impacto', priority: 'high', impact: 9 }),
        ]);
        expect(celula(view.cells, 'agora').tasks.map(t => t.title))
            .toEqual(['A vencida', 'B hoje', 'C sem prazo', 'D mesmo impacto']);
    });
});

describe('motor da matriz — recorte de leitura', () => {
    const muitas = buildMatrixView(
        Array.from({ length: 8 }, (_, index) => tarefa({ title: `t${index}`, priority: 'high', impact: 9 })),
    );

    it('mostra seis por padrão e conta o resto em "+ N"', () => {
        const cell = celula(muitas.cells, 'agora');
        expect(MATRIX_VISIBLE_ITEMS).toBe(6);
        expect(visibleMatrixTasks(cell)).toHaveLength(6);
        expect(hiddenMatrixCount(cell)).toBe(2);
        // O total da célula continua sendo o total de verdade, não o recorte.
        expect(cell.tasks).toHaveLength(8);
    });

    it('`visibleItems: null` desenha todos; critério inválido cai no padrão da casa', () => {
        const cell = celula(muitas.cells, 'agora');
        expect(visibleMatrixTasks(cell, { visibleItems: null })).toHaveLength(8);
        expect(hiddenMatrixCount(cell, { visibleItems: null })).toBe(0);
        expect(visibleMatrixTasks(cell, { visibleItems: Number.NaN })).toHaveLength(6);
    });

    it('célula com menos itens que o limite não esconde nada', () => {
        const view = buildMatrixView([tarefa({ title: 'única', priority: 'high', impact: 9 })]);
        const cell = celula(view.cells, 'agora');
        expect(hiddenMatrixCount(cell)).toBe(0);
    });
});

/* ==========================================================================
   Tom e largura
   ========================================================================== */

describe('motor da matriz — tom e largura da célula', () => {
    it('cada célula tem um tom estável, e o mesmo vocabulário do console', () => {
        const tons = buildPriorityMatrix([]).map(cell => [cell.id, matrixCellTone(cell)] as const);
        expect(tons).toEqual([
            ['agora', 'red'],
            ['agendar', 'purple'],
            ['rapido', 'orange'],
            ['soltar', 'muted'],
            ['sem-impacto', 'yellow'],
        ]);
    });

    it('só a fila de classificação atravessa a grade inteira', () => {
        for (const cell of buildPriorityMatrix([])) {
            expect(matrixCellWide(cell)).toBe(cell.id === 'sem-impacto');
        }
    });
});
