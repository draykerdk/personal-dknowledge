import { describe, expect, it } from 'vitest';
import { arrangeInGrid, patchWidgetText, readWidgetText } from '../../src/board/boardEdit';

describe('texto do widget', () => {
    const text = '## Meu título\n\n```dfm-widget\ntipo: tarefas\nfiltro: vencidas\nlimite: 5\n```\n\nnota minha';

    it('lê o bloco no meio de outro texto e ignora texto sem bloco', () => {
        expect(readWidgetText(text)).toMatchObject({ kind: 'tarefas', filtro: 'vencidas', limite: 5 });
        expect(readWidgetText('só texto')).toBeNull();
        expect(readWidgetText('```dfm-widget\ntipo: pizza\n```')).toBeNull();
    });

    it('troca só o bloco e preserva o que o operador escreveu em volta', () => {
        const next = patchWidgetText(text, { filtro: 'hoje', projeto: 'Livro' })!;
        expect(next.startsWith('## Meu título\n\n```dfm-widget\n')).toBe(true);
        expect(next.endsWith('```\n\nnota minha')).toBe(true);
        expect(readWidgetText(next)).toMatchObject({ kind: 'tarefas', filtro: 'hoje', projeto: 'Livro' });
    });

    it('trocar o tipo limpa campos que o tipo novo não usa; projeto undefined apaga', () => {
        const numeros = patchWidgetText(text, { kind: 'numeros' })!;
        expect(numeros).not.toContain('filtro');
        const semProjeto = patchWidgetText(patchWidgetText(text, { projeto: 'Livro' })!, { projeto: undefined })!;
        expect(readWidgetText(semProjeto)?.projeto).toBeUndefined();
    });
});

describe('organizar em grade', () => {
    it('mantém a ordem de leitura, parte do canto da seleção e não sobrepõe', () => {
        const boxes = [
            { id: 'c', x: 900, y: 10, width: 300, height: 200 },
            { id: 'a', x: 100, y: 0, width: 400, height: 100 },
            { id: 'b', x: 500, y: 20, width: 200, height: 300 },
            { id: 'd', x: 50, y: 800, width: 250, height: 150 },
            { id: 'e', x: 700, y: 820, width: 100, height: 100 },
        ];
        const moves = arrangeInGrid(boxes, 40);
        expect(moves.map(m => m.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(moves[0]).toMatchObject({ x: 50, y: 0 });
        const placed = moves.map(m => ({ ...boxes.find(b => b.id === m.id)!, x: m.x, y: m.y }));
        for (const p of placed) for (const q of placed) {
            if (p === q) continue;
            expect(p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height, `${p.id}×${q.id}`).toBe(false);
        }
    });

    it('seleção vazia não move nada', () => {
        expect(arrangeInGrid([])).toEqual([]);
    });
});
