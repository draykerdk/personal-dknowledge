import { describe, expect, it } from 'vitest';
import { canvasRelationsAllowed, hasManagedZone, isManagedId, isTaskType, legacyEdgeAllowed, legacyRemovalAsks, operatorEdges, unmanagedSignature } from '../../src/canvas/managedIds';

describe('ids geridos', () => {
    it('reconhece as zonas de projeto e do trimestre, e só elas', () => {
        expect(isManagedId('dfm-pc-zone')).toBe(true);
        expect(isManagedId('dfm-qw-2026-W42')).toBe(true);
        expect(isManagedId('dfm-qs-zone')).toBe(true);
        expect(isManagedId('dfm-1700000000')).toBe(false);
        expect(isManagedId('node-sync-1')).toBe(false);
        expect(isManagedId(undefined)).toBe(false);
        expect(isManagedId(42)).toBe(false);
    });

    it('canvas com um nó gerido tem zona; sem nenhum, não', () => {
        expect(hasManagedZone(['a', 'dfm-qs-zone'])).toBe(true);
        expect(hasManagedZone(new Map([['dfm-pc-1', {}]]).keys())).toBe(true);
        expect(hasManagedZone(['a', 'b'])).toBe(false);
        expect(hasManagedZone([])).toBe(false);
    });
});

describe('tradução antiga de setas (Fase 6: em todo canvas)', () => {
    it('recusa par com tarefa, tarefa arquivada, semana ou dia, com ou sem zona gerida', () => {
        for (const managed of [true, false, undefined]) {
            for (const t of ['tasknote', 'task', 'weekly_note', 'daily_note']) {
                expect(legacyEdgeAllowed({ managed, fromType: t, toType: null })).toBe(false);
                expect(legacyEdgeAllowed({ managed, fromType: null, toType: t })).toBe(false);
            }
            expect(legacyEdgeAllowed({ managed, fromType: 'tasknote', toType: 'tasknote' })).toBe(false);
        }
    });

    it('num canvas solto, SMART → ação e tarefa → semana também não passam pela tradução antiga', () => {
        expect(legacyEdgeAllowed({ managed: false, fromType: 'tasknote', toType: 'tasknote' })).toBe(false);
        expect(legacyEdgeAllowed({ managed: false, fromType: 'tasknote', toType: 'weekly_note' })).toBe(false);
    });

    it('nota↔nota, meta→projeto e projeto↔área seguem', () => {
        expect(legacyEdgeAllowed({ fromType: null, toType: null })).toBe(true);
        expect(legacyEdgeAllowed({ fromType: 'project', toType: 'area' })).toBe(true);
        expect(legacyEdgeAllowed({ fromType: 'meta', toType: 'project' })).toBe(true);
    });

    it('a pergunta de desfazer a seta apagada fica só para nota↔nota', () => {
        expect(legacyRemovalAsks({ fromType: null, toType: null })).toBe(true);
        expect(legacyRemovalAsks({ fromType: 'tasknote', toType: 'tasknote' })).toBe(false);
        expect(legacyRemovalAsks({ fromType: 'tasknote', toType: null })).toBe(false);
        expect(legacyRemovalAsks({ fromType: 'project', toType: 'area' })).toBe(false);
    });

    it('tipo de tarefa: aberta e arquivada', () => {
        expect(isTaskType('tasknote')).toBe(true);
        expect(isTaskType('task')).toBe(true);
        expect(isTaskType('meta')).toBe(false);
        expect(isTaskType(null)).toBe(false);
    });
});

describe('relacoes gravadas pelo formatador', () => {
    it('canvas com zona gerida: nenhuma nota ganha relacoes, nem a posta fora da zona', () => {
        expect(canvasRelationsAllowed('Areas/Venda/Venda.canvas', ['meu-no', 'dfm-pc-zone'])).toBe(false);
    });

    it('canvas solto: sim (o comportamento antigo)', () => {
        expect(canvasRelationsAllowed('Areas/Pesquisa.canvas', ['meu-no', 'dfm-1700000000'])).toBe(true);
        expect(canvasRelationsAllowed(undefined, [])).toBe(true);
    });
});

describe('assinatura da parte do operador', () => {
    const base = {
        nodes: [
            { id: 'meu', type: 'text', text: 'Norte', x: 0, y: 0, width: 300, height: 100, color: '5' },
            { id: 'dfm-qs-zone', type: 'group', x: 0, y: 400, width: 900, height: 600 },
        ],
        edges: [
            { id: 'e1', fromNode: 'meu', toNode: 'dfm-qs-zone' },
            { id: 'dfm-qs-e1', fromNode: 'dfm-qs-a', toNode: 'dfm-qs-b' },
        ],
    };

    it('ignora a zona, a ordem, a cor e frações da geometria', () => {
        const other = {
            edges: [{ id: 'e1', toNode: 'dfm-qs-zone', fromNode: 'meu', color: '1' }],
            nodes: [
                { id: 'dfm-qs-zone', type: 'group', x: 40, y: 400, width: 900, height: 900 },
                { id: 'meu', type: 'text', text: 'Norte', x: 0.2, y: 0, width: 300, height: 100 },
            ],
        };
        expect(unmanagedSignature(other)).toBe(unmanagedSignature(base));
    });

    it('muda quando o operador tem um nó, uma seta ou um texto a mais ou a menos', () => {
        const sig = unmanagedSignature(base);
        expect(unmanagedSignature({ ...base, nodes: [...base.nodes, { id: 'map-1', type: 'text', text: 'Mapa', x: 0, y: 0, width: 1, height: 1 }] })).not.toBe(sig);
        expect(unmanagedSignature({ ...base, edges: [] })).not.toBe(sig);
        expect(unmanagedSignature({ ...base, nodes: [{ ...base.nodes[0], text: 'Sul' }, base.nodes[1]] })).not.toBe(sig);
        expect(unmanagedSignature({ ...base, nodes: [{ ...base.nodes[0], x: 200 }, base.nodes[1]] })).not.toBe(sig);
    });

    it('seta órfã do arquivo (ponta sem nó) não conta: a vista não a carrega', () => {
        const disk = { ...base, edges: [...base.edges, { id: 'orfa', fromNode: 'meu', toNode: 'apagado' }] };
        expect(unmanagedSignature(disk)).toBe(unmanagedSignature(base));
    });
});

describe('setas do operador que o plano mantém (Fase 3)', () => {
    const owned = (id: string) => id.startsWith('dfm-q');
    const next = [{ id: 'norte' }, { id: 'nota' }, { id: 'dfm-qs-a' }, { id: 'dfm-qs-b' }];
    const edges = [
        { id: 'fora', fromNode: 'norte', toNode: 'nota' },
        { id: 'orfa', fromNode: 'norte', toNode: 'sumiu' },
        { id: 'anotacao', fromNode: 'norte', toNode: 'dfm-qs-a' },
        { id: 'dado', fromNode: 'dfm-qs-a', toNode: 'dfm-qs-b' },
        { id: 'ponta-velha', fromNode: 'norte', toNode: 'dfm-qs-velho' },
        { id: 'dfm-qs-ea-1', fromNode: 'dfm-qs-a', toNode: 'dfm-qs-b' },
    ];

    it('fora da zona fica (até a órfã); na zona, só a anotação com as duas pontas no plano; a gerida é refeita pelo plano', () => {
        const keep = (e: { id: string }) => e.id !== 'dado';
        expect(operatorEdges(edges, next, owned, keep).map(e => e.id)).toEqual(['fora', 'orfa', 'anotacao']);
    });

    it('sem keepEdge, toda seta do operador que toca a zona sai (o desenho de antes)', () => {
        expect(operatorEdges(edges, next, owned).map(e => e.id)).toEqual(['fora', 'orfa']);
    });

    it('keepEdge recebe a seta e os dois nós do plano novo', () => {
        const seen: string[] = [];
        operatorEdges(edges, next, owned, (e, from, to) => { seen.push(`${e.id}:${from.id}>${to.id}`); return true; });
        expect(seen).toEqual(['anotacao:norte>dfm-qs-a', 'dado:dfm-qs-a>dfm-qs-b']);
    });
});
