import { describe, expect, it } from 'vitest';
import { selectionActions } from '../../src/board/canvasToolbarModel';

describe('botões DFM da barra de seleção', () => {
    it('nada selecionado, nada acrescentado', () => {
        expect(selectionActions([])).toEqual([]);
    });

    it('uma ação aberta: concluir, agendar, editar e o menu de tarefa', () => {
        expect(selectionActions([{ kind: 'acao', status: 'next-action' }])).toEqual(['concluir', 'agendar', 'editar', 'tarefa-menu']);
    });

    it('SMART aberta não se conclui com um clique; ganha "nova ação"', () => {
        const actions = selectionActions([{ kind: 'smart', status: 'in-progress' }]);
        expect(actions).not.toContain('concluir');
        expect(actions).toEqual(['agendar', 'editar', 'nova-acao', 'tarefa-menu']);
    });

    it('sem o protocolo da ação nova da SMART, o "nova ação" some (D1 do mapa da v0)', () => {
        expect(selectionActions([{ kind: 'smart', status: 'in-progress' }], false)).toEqual(['agendar', 'editar', 'tarefa-menu']);
    });

    it('ação concluída: reabrir no lugar de concluir, sem agendar', () => {
        expect(selectionActions([{ kind: 'acao', status: 'done' }])).toEqual(['reabrir', 'editar', 'tarefa-menu']);
    });

    it('ação cancelada não oferece concluir nem reabrir', () => {
        expect(selectionActions([{ kind: 'acao', status: 'cancelled' }])).toEqual(['editar', 'tarefa-menu']);
    });

    it('várias tarefas: ações em lote e grade, sem editar', () => {
        const actions = selectionActions([{ kind: 'acao', status: 'next-action' }, { kind: 'acao', status: 'done' }, { kind: 'smart', status: 'next-action' }]);
        expect(actions).toEqual(['concluir', 'agendar', 'tarefa-menu', 'grade']);
    });

    it('um widget: configurar', () => {
        expect(selectionActions([{ kind: 'widget' }])).toEqual(['widget']);
    });

    it('seleção mista: só organizar em grade', () => {
        expect(selectionActions([{ kind: 'acao', status: 'next-action' }, { kind: 'outro' }])).toEqual(['grade']);
    });

    it('um nó qualquer: nada do DFM', () => {
        expect(selectionActions([{ kind: 'outro' }])).toEqual([]);
    });
});
