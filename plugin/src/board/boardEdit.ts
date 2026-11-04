/**
 * Operações puras sobre o que o canvas guarda: texto de widget e posições de nó.
 * Sem Obsidian, sem DOM — testáveis inteiras. (O quadro em canvas lido como
 * painel, `panelFromCanvas`, saiu em 03/11/2026 com o quadro aposentado.)
 */
import type { BoardWidgetSpec } from './boardSpec';
import { parseWidgetSpec, widgetBlock } from './boardSpec';

const BLOCK = /```dfm-widget[^\n]*\n([\s\S]*?)```/;

/** O nó é um widget do quadro? Devolve a especificação lida, ou null. */
export function readWidgetText(text: string): BoardWidgetSpec | null {
    const match = String(text ?? '').match(BLOCK);
    if (!match) return null;
    const parsed = parseWidgetSpec(match[1]);
    return 'spec' in parsed ? parsed.spec : null;
}

/**
 * Reescreve só o bloco do widget, preservando o que o operador escreveu em volta
 * (um título acima, uma nota abaixo). Campo `undefined` no patch apaga o campo.
 */
export function patchWidgetText(text: string, patch: Partial<BoardWidgetSpec>): string | null {
    const current = readWidgetText(text);
    if (!current) return null;
    const next = { ...current, ...patch } as BoardWidgetSpec;
    if (next.kind !== 'projeto' && next.kind !== 'tarefas' && next.kind !== 'consulta') delete next.projeto;
    if (next.kind !== 'consulta') {
        for (const key of ['escopo', 'tarefas', 'status', 'semana', 'contexto', 'tag', 'prazo', 'mostrar', 'agrupar'] as const) delete next[key];
    }
    if (next.kind !== 'tarefas') delete next.filtro;
    if (next.kind === 'tarefas' && !next.filtro) next.filtro = 'proximas';
    return String(text).replace(BLOCK, widgetBlock(next));
}

export interface Box { id: string; x: number; y: number; width: number; height: number }

/**
 * Organiza caixas numa grade, na ordem de leitura atual (linha, depois coluna),
 * começando no canto superior esquerdo da seleção. O número de colunas é o da
 * raiz quadrada — uma grade próxima de quadrada, que cabe na tela.
 */
export function arrangeInGrid(boxes: Box[], gap = 40): Array<{ id: string; x: number; y: number }> {
    if (boxes.length === 0) return [];
    const originX = Math.min(...boxes.map(b => b.x));
    const originY = Math.min(...boxes.map(b => b.y));
    // Linhas "visuais": caixas cujo topo difere menos que metade da menor altura.
    const tolerance = Math.max(20, Math.min(...boxes.map(b => b.height)) / 2);
    const ordered = [...boxes].sort((a, b) => (Math.abs(a.y - b.y) <= tolerance ? a.x - b.x : a.y - b.y));
    const columns = Math.ceil(Math.sqrt(ordered.length));

    const colWidth: number[] = [];
    const rowHeight: number[] = [];
    ordered.forEach((b, i) => {
        const c = i % columns, r = Math.floor(i / columns);
        colWidth[c] = Math.max(colWidth[c] ?? 0, b.width);
        rowHeight[r] = Math.max(rowHeight[r] ?? 0, b.height);
    });
    const colX = colWidth.map((_, c) => originX + colWidth.slice(0, c).reduce((s, w) => s + w + gap, 0));
    const rowY = rowHeight.map((_, r) => originY + rowHeight.slice(0, r).reduce((s, h) => s + h + gap, 0));
    return ordered.map((b, i) => ({ id: b.id, x: colX[i % columns], y: rowY[Math.floor(i / columns)] }));
}
