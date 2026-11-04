import { describe, expect, it } from 'vitest';
import {
    cleanOrphanEdges,
    elementosDeArray,
    extractNodeIdsFromJson,
    findAttachedEdges,
    removeCanvasElement,
    spliceMarkedBlock,
} from '../../src/engine/canvasengine/canvasBlockSplice';

describe('canvasBlockSplice — integridade de blocos marcados e nós autorais intercalados', () => {
    describe('removeCanvasElement', () => {
        it('remove primeiro elemento preservando vírgula e formatação', () => {
            const raw = '{"nodes": [{"id":"1"},{"id":"2"}]}';
            const res = removeCanvasElement(raw, { start: 11, end: 21 });
            expect(JSON.parse(res)).toEqual({ nodes: [{ id: '2' }] });
        });

        it('remove elemento intermediário', () => {
            const raw = '{"nodes": [{"id":"1"},{"id":"2"},{"id":"3"}]}';
            const res = removeCanvasElement(raw, { start: 22, end: 32 });
            expect(JSON.parse(res)).toEqual({ nodes: [{ id: '1' }, { id: '3' }] });
        });

        it('remove último elemento consumindo vírgula anterior', () => {
            const raw = '{"nodes": [{"id":"1"},{"id":"2"}]}';
            const res = removeCanvasElement(raw, { start: 22, end: 32 });
            expect(JSON.parse(res)).toEqual({ nodes: [{ id: '1' }] });
        });

        it('remove único elemento resultando em array vazio válido', () => {
            const raw = '{"nodes": [{"id":"1"}]}';
            const res = removeCanvasElement(raw, { start: 11, end: 21 });
            expect(JSON.parse(res)).toEqual({ nodes: [] });
        });
    });

    describe('findAttachedEdges', () => {
        it('detecta arestas conectadas a nós alvo em fromNode ou toNode', () => {
            const raw = `{
  "edges": [
    {"id":"e1", "fromNode":"target1", "toNode":"u1"},
    {"id":"e2", "fromNode":"u1", "toNode":"u2"},
    {"id":"e3", "fromNode":"u2", "toNode":"target2"}
  ]
}`;
            const attached = findAttachedEdges(raw, ['target1', 'target2']);
            expect(attached).toHaveLength(2);
            expect(attached.map(e => e.id)).toEqual(['e1', 'e3']);
        });

        it('retorna vazio se não houver arestas conectadas', () => {
            const raw = '{"edges": [{"id":"e1", "fromNode":"u1", "toNode":"u2"}]}';
            expect(findAttachedEdges(raw, ['target1'])).toEqual([]);
            expect(findAttachedEdges(raw, [])).toEqual([]);
        });
    });

    describe('cleanOrphanEdges', () => {
        it('remove arestas conectadas a nós removidos e preserva outras', () => {
            const raw = `{
  "nodes": [{"id":"u1"}, {"id":"u2"}],
  "edges": [
    {"id":"e1", "fromNode":"old_h1", "toNode":"u1"},
    {"id":"e2", "fromNode":"u1", "toNode":"u2"},
    {"id":"e3", "fromNode":"u2", "toNode":"old_h2"}
  ]
}`;
            const cleaned = cleanOrphanEdges(raw, ['old_h1', 'old_h2']);
            const parsed = JSON.parse(cleaned);
            expect(parsed.edges).toHaveLength(1);
            expect(parsed.edges[0].id).toBe('e2');
            expect(parsed.edges[0].fromNode).toBe('u1');
            expect(parsed.edges[0].toNode).toBe('u2');
        });

        it('não altera raw se não houver edges ou removedNodeIds vazio', () => {
            const raw = '{"nodes": [{"id":"u1"}]}';
            expect(cleanOrphanEdges(raw, [])).toBe(raw);
            expect(cleanOrphanEdges(raw, ['u1'])).toBe(raw);
        });
    });

    describe('extractNodeIdsFromJson', () => {
        it('extrai todos os ids de um bloco candidate', () => {
            const candidate = `{"id":"header-group","type":"group"},\n{"id":"header-title","type":"text"}`;
            expect(extractNodeIdsFromJson(candidate)).toEqual(['header-group', 'header-title']);
        });

        it('retorna array vazio para string vazia', () => {
            expect(extractNodeIdsFromJson('')).toEqual([]);
        });
    });

    describe('spliceMarkedBlock', () => {
        it('atualiza bloco contíguo padrão', () => {
            const raw = `{
  "nodes": [
    {"id": "h0", "type": "group", "mode": "dfm-test"},
    {"id": "h1", "type": "text", "mode": "dfm-test"},
    {"id": "u1", "type": "text", "text": "Autoral"}
  ]
}`;
            const candidate = `{"id": "h0", "type": "group", "mode": "dfm-test"},
    {"id": "h1_v2", "type": "text", "mode": "dfm-test"}`;
            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group');

            expect(result).not.toBeNull();
            expect(result?.outcome).toBe('replaced');
            expect(result?.removedIds).toEqual(['h1']);

            const parsed = JSON.parse(result!.next);
            expect(parsed.nodes).toHaveLength(3);
            expect(parsed.nodes[0].id).toBe('h0');
            expect(parsed.nodes[1].id).toBe('h1_v2');
            expect(parsed.nodes[2].id).toBe('u1');
        });

        it('recusa sem gravar quando nó a ser removido possui aresta autoral conectada (A3)', () => {
            const raw = `{
  "nodes": [
    {"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "u1", "type": "text", "text": "Nota Autoral 1", "x": 500, "y": 200},
    {"id": "h1", "type": "text", "mode": "dfm-test", "x": 110, "y": 140}
  ],
  "edges": [
    {"id": "e_h1_u1", "fromNode": "h1", "toNode": "u1"}
  ]
}`;
            const candidate = `{"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "h_new", "type": "text", "mode": "dfm-test", "x": 110, "y": 140}`;

            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group');
            expect(result).not.toBeNull();
            expect(result?.outcome).toBe('refused');
            expect(result?.next).toBe(raw);
            expect(result?.refusalReason).toContain('impactaria aresta(s)');
            expect(result?.conflictingEdges).toHaveLength(1);
            expect(result?.conflictingEdges![0].id).toBe('e_h1_u1');
        });

        it('permite limpeza explícita quando edgePolicy é clean', () => {
            const raw = `{
  "nodes": [
    {"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "u1", "type": "text", "text": "Nota Autoral 1", "x": 500, "y": 200},
    {"id": "h1", "type": "text", "mode": "dfm-test", "x": 110, "y": 140}
  ],
  "edges": [
    {"id": "e_h1_u1", "fromNode": "h1", "toNode": "u1"}
  ]
}`;
            const candidate = `{"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "h_new", "type": "text", "mode": "dfm-test", "x": 110, "y": 140}`;

            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group', { edgePolicy: 'clean' });
            expect(result).not.toBeNull();
            expect(result?.outcome).toBe('replaced');
            const parsed = JSON.parse(result!.next);
            expect(parsed.edges).toEqual([]);
        });

        it('preserva nós e arestas autorais intercalados quando nós marcados não têm arestas presas', () => {
            const raw = `{
  "nodes": [
    {"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "u1", "type": "text", "text": "Nota Autoral 1", "x": 500, "y": 200},
    {"id": "h1", "type": "text", "mode": "dfm-test", "x": 110, "y": 140},
    {"id": "u2", "type": "text", "text": "Nota Autoral 2", "x": 500, "y": 300}
  ],
  "edges": [
    {"id": "e_u1_u2", "fromNode": "u1", "toNode": "u2"}
  ]
}`;
            const candidate = `{"id": "h0", "type": "group", "mode": "dfm-test", "x": 100, "y": 100},
    {"id": "h_new", "type": "text", "mode": "dfm-test", "x": 110, "y": 140}`;
            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group');

            expect(result).not.toBeNull();
            expect(result?.outcome).toBe('replaced');

            const parsed = JSON.parse(result!.next);
            const nodeIds = parsed.nodes.map((n: any) => n.id);
            expect(nodeIds).toEqual(['h0', 'h_new', 'u1', 'u2']);
            expect(parsed.edges).toHaveLength(1);
            expect(parsed.edges[0].id).toBe('e_u1_u2');
        });

        it('detecta frescor/idempotência quando o bloco já é idêntico', () => {
            const raw = `{"nodes": [{"id":"h0","type":"group","mode":"dfm-test"}]}`;
            const candidate = `{"id":"h0","type":"group","mode":"dfm-test"}`;
            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group');

            expect(result).not.toBeNull();
            expect(result?.outcome).toBe('unchanged');
            expect(result?.next).toBe(raw);
        });

        it('lida com nó marcado localizado antes do cluster primário', () => {
            const raw = `{
  "nodes": [
    {"id": "h_early", "type": "text", "mode": "dfm-test"},
    {"id": "u1", "type": "text", "text": "Nota 1"},
    {"id": "h0", "type": "group", "mode": "dfm-test"}
  ]
}`;
            const candidate = `{"id": "h0", "type": "group", "mode": "dfm-test"},
    {"id": "h_new", "type": "text", "mode": "dfm-test"}`;
            const result = spliceMarkedBlock(raw, 'dfm-test', candidate, 'group');

            expect(result).not.toBeNull();
            const parsed = JSON.parse(result!.next);
            const nodeIds = parsed.nodes.map((n: any) => n.id);
            expect(nodeIds).toEqual(['u1', 'h0', 'h_new']);
        });

        it('retorna null se o marcador não estiver presente', () => {
            const raw = '{"nodes": [{"id":"u1","type":"text"}]}';
            expect(spliceMarkedBlock(raw, 'inexistente', '{}')).toBeNull();
        });
    });
});
