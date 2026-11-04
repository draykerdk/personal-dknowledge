/**
 * O nó de arquivo: o que a seção 3 grava, e o que ela recusa gravar.
 *
 * A inserção é textual — o nó novo entra na lista `"nodes"` e o resto do arquivo
 * volta byte a byte. Este teste prova exatamente isso, porque é o que separa esta
 * escrita de um `JSON.stringify(parse(raw))` que reformataria o canvas do
 * operador inteiro.
 *
 * Também prova o guarda de releitura na forma em que ele é decidido aqui: o plano
 * é calculado sobre um texto e **quem grava compara** com a releitura. A corrida
 * com o disco é exercitada no teste de DOM (`tests/ui/canvasRailView.test.ts`),
 * que é onde as duas leituras acontecem.
 */
import { describe, expect, it, vi } from 'vitest';

// O `obsidian` não é resolvível fora do aplicativo; nenhuma asserção daqui depende dele.
// Os testes da posição livre e do recuo vieram de canvasRail.test.ts quando o catálogo
// lateral (morto desde 25/09) saiu, em 02/11/2026: as funções ficam, em canvasSplice.
vi.mock('obsidian', () => {
    const dual = function () { return {} as any; };
    const known: Record<string, unknown> = {
        ItemView: class { constructor(public leaf?: any) {} registerEvent() { /* no-op */ } },
        Notice: class { constructor(public message?: string) {} },
        TFile: class {},
        TFolder: class {},
        Platform: { isMobile: false, isDesktopApp: true },
        setIcon: () => undefined,
        MarkdownRenderer: { render: async () => undefined },
        moment: () => ({ format: () => '', subtract: () => ({ format: () => '' }) }),
        debounce: (fn: any) => fn,
        Menu: class {},
        Modal: class {},
        WorkspaceLeaf: class {},
    };
    return new Proxy(known, {
        get: (target, key: string) => (key in target ? target[key] : dual),
    });
});

import {
    centerOfCanvasNodes,
    findCanvasArraySpan,
    findFreeCanvasPosition,
    indentacaoDeElemento,
    insertCanvasNodeText,
    railNodeIdFor,
} from '../../src/engine/canvasengine/canvasSplice';
import { planCanvasFileNodeInsertion } from '../../src/engine/canvasengine/canvasRailPlan';

const CANVAS = [
    '{',
    '\t"nodes":[',
    '\t\t{"id":"n1","type":"text","text":"Nó do operador","x":0,"y":0,"width":400,"height":200},',
    '\t\t{"id":"n2","type":"text","text":"vizinho","x":600,"y":0,"width":400,"height":200}',
    '\t],',
    '\t"edges":[]',
    '}',
    '',
].join('\n');

const NOTA = 'TaskNotes/Tarefas/Peça H.md';

describe('inserção do nó de arquivo no texto do canvas', () => {
    it('grava o formato do canvas do Obsidian, com id, arquivo, posição e tamanho', () => {
        const plano = planCanvasFileNodeInsertion(CANVAS, { filePath: NOTA, preferred: { x: 100, y: 200 } });
        expect(plano.kind).toBe('insert');
        if (plano.kind !== 'insert') return;

        const nodes = JSON.parse(plano.next).nodes;
        expect(nodes).toHaveLength(3);

        const novo = nodes[2];
        expect(novo).toEqual({
            id: plano.nodeId,
            type: 'file',
            file: NOTA,
            x: plano.position.x,
            y: plano.position.y,
            width: 400,
            height: 150,
        });
        expect(plano.nodeId.startsWith('dfm-file-')).toBe(true);
    });

    it('o resto do arquivo volta byte a byte — só a lista de nós cresce', () => {
        const plano = planCanvasFileNodeInsertion(CANVAS, { filePath: NOTA, preferred: { x: 100, y: 200 } });
        if (plano.kind !== 'insert') throw new Error('esperava inserção');

        const antigo = CANVAS;
        const novo = plano.next;

        // O prefixo vai até o fim do último nó e é idêntico.
        const corte = antigo.indexOf('\n\t],');
        expect(novo.startsWith(antigo.slice(0, corte))).toBe(true);
        // O sufixo (fechamento da lista, arestas, chaves) é idêntico.
        expect(novo.endsWith(antigo.slice(corte))).toBe(true);
        // E o que entrou no meio é exatamente um nó, separado por vírgula.
        const meio = novo.slice(corte, novo.length - antigo.slice(corte).length);
        expect(meio.startsWith(',\n\t\t')).toBe(true);
        expect(JSON.parse(`[${meio.slice(1)}]`)).toHaveLength(1);
        // A formatação do operador continua lá: indentação por tab, texto intacto.
        expect(novo).toContain('"text":"Nó do operador"');
        expect(novo).toContain('\t"edges":[]');
    });

    it('não duplica: nó de arquivo para a mesma nota é idempotente', () => {
        const primeiro = planCanvasFileNodeInsertion(CANVAS, { filePath: NOTA, preferred: { x: 0, y: 0 } });
        if (primeiro.kind !== 'insert') throw new Error('esperava inserção');

        const segundo = planCanvasFileNodeInsertion(primeiro.next, { filePath: NOTA, preferred: { x: 0, y: 0 } });
        expect(segundo.kind).toBe('already');
        if (segundo.kind === 'already') expect(segundo.nodeId).toBe(primeiro.nodeId);
    });

    it('recusa quando a lista "nodes" não está no texto — e aí não se grava', () => {
        const semLista = '{\n\t"edges":[]\n}\n';
        const plano = planCanvasFileNodeInsertion(semLista, { filePath: NOTA });
        expect(plano.kind).toBe('refused');
        if (plano.kind === 'refused') expect(plano.reason).toContain('"nodes"');
    });
});

describe('a lista de nós no texto cru', () => {
    it('acha a lista de verdade e não a chave dentro do texto de um nó', () => {
        const armadilha = '{\n\t"nodes":[{"id":"n1","type":"text","text":"\\"nodes\\": [1,2]"}],\n\t"edges":[]\n}\n';
        const span = findCanvasArraySpan(armadilha, 'nodes');
        expect(span).not.toBeNull();
        expect(armadilha.slice(span!.open, span!.open + 1)).toBe('[');

        const plano = planCanvasFileNodeInsertion(armadilha, { filePath: NOTA, preferred: { x: 0, y: 0 } });
        if (plano.kind !== 'insert') throw new Error('esperava inserção');
        const nodes = JSON.parse(plano.next).nodes;
        expect(nodes).toHaveLength(2);
        expect(nodes[0].text).toBe('"nodes": [1,2]');
    });

    it('lista vazia e lista numa linha só recebem o nó sem quebra inventada', () => {
        const vazia = '{\n\t"nodes":[],\n\t"edges":[]\n}\n';
        const comVazio = insertCanvasNodeText(vazia, '{"id":"x"}')!;
        expect(JSON.parse(comVazio).nodes).toEqual([{ id: 'x' }]);
        expect(comVazio).toContain('\t"edges":[]');

        const linha = '{"nodes":[],"edges":[]}';
        expect(insertCanvasNodeText(linha, '{"id":"x"}')).toBe('{"nodes":[{"id":"x"}],"edges":[]}');
    });

    it('sem a lista, a resposta é nula — e nula significa não gravar', () => {
        expect(findCanvasArraySpan('{"edges":[]}', 'nodes')).toBeNull();
        expect(insertCanvasNodeText('{"edges":[]}', '{"id":"x"}')).toBeNull();
        expect(findCanvasArraySpan('{"nodes":[}', 'nodes')).toBeNull();
    });
});

describe('posição livre do nó de arquivo', () => {
    const tamanho = { width: 400, height: 150 };

    it('usa a posição preferida quando ela está livre', () => {
        expect(findFreeCanvasPosition([], { x: 100, y: 200 }, tamanho)).toEqual({ x: 100, y: 200 });
    });

    it('anda para a primeira posição livre, sempre na mesma ordem', () => {
        const ocupado = [{ x: 100, y: 200, width: 400, height: 150 }];
        const primeira = findFreeCanvasPosition(ocupado, { x: 100, y: 200 }, tamanho);
        const segunda = findFreeCanvasPosition(ocupado, { x: 100, y: 200 }, tamanho);

        expect(primeira).toEqual(segunda);
        expect(primeira).not.toEqual({ x: 100, y: 200 });
        // A grade usa o tamanho do nó mais a folga: os dois não nascem colados.
        expect(Math.abs(primeira.x - 100) === 424 || Math.abs(primeira.y - 200) === 174).toBe(true);
    });

    it('o centro da caixa dos nós existentes responde quando não há centro visível', () => {
        expect(centerOfCanvasNodes([])).toBeNull();
        expect(centerOfCanvasNodes([{ x: 0, y: 0 }, { x: 400, y: 200, width: 400, height: 200 }]))
            .toEqual({ x: 400, y: 200 });
    });

    it('o id do nó é determinístico e não colide com o que já existe', () => {
        const primeiro = railNodeIdFor('TaskNotes/Tarefas/T.md');
        expect(primeiro).toBe(railNodeIdFor('TaskNotes/Tarefas/T.md'));
        expect(primeiro.startsWith('dfm-file-')).toBe(true);
        expect(railNodeIdFor('outra/nota.md')).not.toBe(primeiro);

        const comColisao = railNodeIdFor('TaskNotes/Tarefas/T.md', [primeiro]);
        expect(comColisao).not.toBe(primeiro);
        expect(comColisao.startsWith(primeiro)).toBe(true);
    });

    it('arquivo ilegível ou sem lista "nodes" não vira escrita', () => {
        const semLista = '{\n  "edges": []\n}\n';
        const plano = planCanvasFileNodeInsertion(semLista, { filePath: 'T/a.md' });
        expect(plano.kind).toBe('refused');
        expect(plano.kind === 'refused' && plano.reason).toContain('"nodes"');

        const ilegivel = planCanvasFileNodeInsertion('{ nao e json', { filePath: 'T/a.md' });
        expect(ilegivel.kind).toBe('refused');
        expect(ilegivel.kind === 'refused' && ilegivel.reason).toContain('JSON legível');

        const vazio = planCanvasFileNodeInsertion('   ', { filePath: 'T/a.md' });
        expect(vazio.kind).toBe('refused');
        expect(vazio.kind === 'refused' && vazio.reason).toContain('vazio');

        const semCaminho = planCanvasFileNodeInsertion(semLista, { filePath: '  ' });
        expect(semCaminho.kind).toBe('refused');
        expect(semCaminho.kind === 'refused' && semCaminho.reason).toContain('caminho de nota');
    });
});

describe('o recuo dos elementos (Achado G)', () => {
    it('indentacaoDeElemento extrai a indentação uniforme de nodes', () => {
        const rawTab = '{\n\t"nodes": [\n\t\t{"id": "n1"}\n\t]\n}';
        expect(indentacaoDeElemento(rawTab)).toBe('\t\t');

        const rawEspaco = '{\n  "nodes": [\n    {"id": "n1"}\n  ]\n}';
        expect(indentacaoDeElemento(rawEspaco)).toBe('    ');
    });
});
