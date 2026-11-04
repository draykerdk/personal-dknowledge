/**
 * Planejamento, geometria e mensagens do menu do acervo no canvas.
 */
import type { FractalReading, FractalScale } from '../missionFractal';
import type { CanvasMenuTree } from './canvasMenu';
import {
    CANVAS_MENU_GAP,
    CANVAS_MENU_LABEL,
    CANVAS_MENU_MARKER,
    CANVAS_MENU_NODE_HEIGHT,
    canvasMenuIdFor,
    canvasMenuNodeIds,
} from '../canvasMenuCanvas';
import type { CanvasMenuBlock } from '../canvasMenuCanvas';
import {
    centerOfCanvasNodes,
    elementosDoCanvas,
    findMarkedBlockSpan,
} from './canvasSplice';
import { FRACTAL_HEADER_MARKER } from '../canvasFractalContext';

/* ==========================================================================
   O quadro, o relatório e as portas
   ========================================================================== */

export interface CanvasMenuFrame {
    canvasPath: string;
    /** O texto do `.canvas` no instante da leitura — a base do guarda. */
    raw: string;
    /** Centro visível medido pela view; ausente, a inserção usa o centro dos nós. */
    preferred?: { x: number; y: number } | null;
    /**
     * O acervo já agrupado (`buildCanvasMenuTree`), medido por quem tem o motor.
     *
     * Viaja no quadro, e não num parâmetro novo, pelo mesmo motivo do cabeçalho
     * de escala: quem tem o `engine` é o comando, e quem grava só precisa da
     * decisão pronta. Ausente, o acervo é vazio — e o menu **declara** isso em
     * vez de desenhar um bloco em branco.
     */
    tree?: CanvasMenuTree | null;
}

export interface CanvasMenuPorts {
    /** Lê o arquivo **agora** — é esta leitura que o guarda compara. */
    read: () => Promise<string>;
    write: (next: string) => Promise<void>;
    notice: (message: string) => void;
    /** Diagnóstico; ausente, o aviso ao operador continua sendo dado. */
    fail?: (message: string) => void;
    /** O arquivo existe no vault? */
    exists?: (path: string) => boolean;
}

export interface CanvasMenuReport {
    outcome: 'written' | 'nothing' | 'aborted' | 'refused' | 'failed';
    scale: FractalScale;
    menuId: string | null;
    /** Ids do acervo que entraram no desenho nesta execução, na ordem dos nós. */
    added: string[];
    groups: { name: string; items: number; truncated: number }[];
    total: number;
    truncated: number;
    /** O bloco foi **substituído** nesta execução (diferente de gravado pela 1ª vez). */
    updated: boolean;
    /** A frase que foi (ou seria) mostrada ao operador. */
    message: string;
}

/* ==========================================================================
   O bloco no texto cru
   ========================================================================== */

/**
 * O span do bloco do menu no texto cru, pelo marcador dele.
 *
 * O primeiro nó do bloco é o **título** (`type:"text"`), e é por isso que a
 * varredura genérica recebe `'text'` como tipo do primeiro elemento: sem isso o
 * bloco do menu nunca seria localizado, e toda segunda execução recusaria em vez
 * de atualizar. O cabeçalho de escala continua com o padrão (`'group'`).
 *
 * `null` quando não há menu — ou quando ele existe no desenho mas o texto não
 * deixa localizá-lo, caso em que a gravação se recusa.
 */
export function findCanvasMenuSpan(raw: string): { start: number; end: number; menuId: string; x: number; y: number } | null {
    const span = findMarkedBlockSpan(raw, CANVAS_MENU_MARKER, 'text');
    if (!span) return null;
    return { start: span.start, end: span.end, menuId: span.ids[0] ?? '', x: span.x, y: span.y };
}

/** Os ids do arquivo e, entre eles, os que carregam o marcador do menu. */
export function idsDoTexto(raw: string): { ids: string[]; marcados: string[] } {
    const ids: string[] = [];
    const marcados: string[] = [];
    let parsed: any = null;
    try {
        parsed = JSON.parse(raw);
    } catch (_) {
        // Arquivo ilegível: sem ids medidos. A inserção recusa mais adiante, e a
        // substituição por span não depende desta lista.
        return { ids, marcados };
    }
    for (const node of Array.isArray(parsed?.nodes) ? parsed.nodes : []) {
        const id = String(node?.id ?? '').trim();
        if (!id) continue;
        ids.push(id);
        if (node?.mode === CANVAS_MENU_MARKER) marcados.push(id);
    }
    return { ids, marcados };
}

// indentacaoDeElemento importada de canvasRail.ts (Achado G)


/** O passo da coluna: 150 de nó + 24 de folga — os mesmos do desenho do bloco. */
const PASSO = CANVAS_MENU_NODE_HEIGHT + CANVAS_MENU_GAP;

/**
 * A âncora da primeira inserção — e a de uma regeneração sem x/y legível.
 *
 * Com o cabeçalho de escala já no canvas, o menu nasce **na coluna dele, uma
 * folga abaixo do bloco** (`n nós × 174` é exatamente a altura do cabeçalho mais
 * a folga): o cabeçalho é o primeiro bloco e não é deslocado. Sem cabeçalho,
 * vale a regra do `preferred` medido pela view; sem ele, o centro dos nós; sem
 * nós, a origem.
 */
export function ancoraDeInsercao(
    raw: string,
    preferred: { x: number; y: number } | null | undefined,
    nodes: ReadonlyArray<unknown>,
): { x: number; y: number } {
    const cabecalho = findMarkedBlockSpan(raw, FRACTAL_HEADER_MARKER);
    if (cabecalho && Number.isFinite(cabecalho.y)) {
        // O fundo real medido pelos nós marcados do cabeçalho existentes no desenho:
        // impede sobreposição mesmo se houver nós intercalados ou deslocados (Achados E & H).
        let maxBottom = cabecalho.y;
        let found = false;
        if (Array.isArray(nodes)) {
            for (const n of nodes as any[]) {
                if (n && n.mode === FRACTAL_HEADER_MARKER && Number.isFinite(n.y) && Number.isFinite(n.height)) {
                    maxBottom = Math.max(maxBottom, n.y + n.height);
                    found = true;
                }
            }
        }
        const y = found ? maxBottom : cabecalho.y + alturaDoBloco(cabecalho.ids.length);
        return { x: cabecalho.x, y };
    }
    return preferred ?? centerOfCanvasNodes(nodes) ?? { x: 0, y: 0 };
}

/** Altura de um bloco de `nos` nós, no mesmo passo com que eles são desenhados. */
function alturaDoBloco(nos: number): number {
    const total = Math.max(0, Math.floor(nos));
    if (total === 0) return 0;
    return total * CANVAS_MENU_NODE_HEIGHT + (total - 1) * CANVAS_MENU_GAP;
}

/* ==========================================================================
   A mensagem: determinística, byte a byte
   ========================================================================== */

function semPontoFinal(texto: string): string {
    return String(texto ?? '').trim().replace(/\.+$/, '');
}

/**
 * A frase do operador — determinística, byte a byte, para o mesmo estado.
 *
 * Ela declara a **escala lida**, o acervo (quantos itens e em quantos grupos),
 * **quantos itens entraram por grupo**, quantos ficaram **fora do teto efetivo**
 * e o que **não pôde virar nó** (item sem arquivo clicável — o caso normal, já
 * que o acervo vivo não tem caminho). Corte silencioso é mentira; a ordem das
 * partes é fixa para que duas execuções iguais produzam a mesma string.
 */
export function mensagemDoMenu(
    reading: FractalReading,
    block: CanvasMenuBlock,
    estado: 'gravado' | 'atualizado' | 'inalterado' | 'vazio',
    limit: number,
): string {
    const groups = block?.groups ?? [];
    const truncated = groups.reduce((soma, group) => soma + group.truncated, 0);
    const semDestino = groups.reduce((soma, group) => soma + group.semDestino, 0);

    const partes: string[] = [`escala ${reading?.label ?? block?.scaleLabel ?? ''}`];

    if (block?.empty || groups.length === 0) {
        partes.push('acervo vazio: nenhum protocolo ou comando do DFM foi encontrado');
    } else {
        partes.push(`${block.total} item(ns) no acervo em ${groups.length} grupo(s)`);
        partes.push(`no desenho: ${groups.map(group => `${group.name} ${group.items.length} de ${group.total}`).join(', ')}`);
        if (truncated) partes.push(`${truncated} item(ns) ficaram fora do teto de ${limit} por grupo`);
        if (semDestino) partes.push(`${semDestino} item(ns) sem arquivo clicável — o menu executa por id`);
    }

    if (estado === 'gravado') partes.push('bloco gravado');
    else if (estado === 'atualizado') partes.push('bloco atualizado');
    else if (estado === 'inalterado') partes.push('nada a escrever: o bloco já é byte a byte o que seria gravado');
    else partes.push('nada foi gravado');

    return `${CANVAS_MENU_LABEL} — ${partes.map(semPontoFinal).join('; ')}.`;
}

/* ==========================================================================
   A gravação, com o guarda
   ========================================================================== */

export function baseReport(reading: FractalReading, message: string): CanvasMenuReport {
    return {
        outcome: 'nothing',
        scale: reading?.scale ?? 'indefinida',
        menuId: null,
        added: [],
        groups: [],
        total: 0,
        truncated: 0,
        updated: false,
        message,
    };
}

/**
 * Os números do bloco medido, para o relatório — o mesmo em todo desfecho.
 *
 * `added` só é preenchido quando o bloco **foi gravado**: `added` é o que entrou
 * no desenho nesta execução, e um desfecho que não escreveu (abortado, recusado,
 * nada a fazer) não acrescentou nada a lugar nenhum. Preenchê-lo antes seria
 * afirmar um desenho que o arquivo não tem.
 */
export function reportDoBloco(
    block: CanvasMenuBlock,
    escrito: boolean = false,
): Pick<CanvasMenuReport, 'menuId' | 'added' | 'groups' | 'total' | 'truncated'> {
    return {
        menuId: block?.menuId ?? null,
        added: escrito ? (block?.groups ?? []).flatMap(group => group.items.map(item => item.entryId)) : [],
        groups: (block?.groups ?? []).map(group => ({
            name: group.name,
            items: group.items.length,
            truncated: group.truncated,
        })),
        total: block?.total ?? 0,
        truncated: (block?.groups ?? []).reduce((soma, group) => soma + group.truncated, 0),
    };
}

/**
 * O id do bloco (ou de um nó dele) que já pertence a outro nó do desenho.
 *
 * A checagem é feita sobre o id **base** (`<canvasPath>#dfm-canvas-menu`), e não
 * só sobre o id que o plano devolveu: `planCanvasMenu` desvia de um id tomado
 * somando um sufixo, então o plano nunca devolveria o id em conflito — e a
 * gravação seguiria em frente criando um bloco com id desviado ao lado de um nó
 * que já ocupa o id canônico. É a mesma regra do cabeçalho de escala: o id
 * canônico ocupado por outro nó é **recusa medida**, não desvio silencioso.
 *
 * A segunda metade (ids de grupo e de item) é a rede defensiva: os ids de item já
 * nascem com os tomados na semente, mas os de grupo são derivados só do id do
 * bloco e do nome do grupo, e um nó do operador pode ocupá-los.
 */
export function idColidente(canvasPath: string, block: CanvasMenuBlock, tomados: ReadonlyArray<string>): string | null {
    const base = canvasMenuIdFor(canvasPath);
    if (base && tomados.includes(base)) return base;
    // Defensivo: hoje inalcançável pelos ids de item (a semente já os protege),
    // alcançável pelos ids de grupo.
    return canvasMenuNodeIds(block).find(id => id && tomados.includes(id)) ?? null;
}

/**
 * Grava o bloco do menu: atualiza o que existe, insere o que não existe — nunca
 * os dois. Devolve o relatório já com a mensagem medida.
 *
 * Os desfechos terminais são nomeados e cada um diz o que foi MEDIDO: `refused`
 * quando gravar criaria um segundo menu ou um id duplicado, `aborted` quando o
 * arquivo não é mais o que foi lido, `failed` quando a leitura ou a escrita
 * falha, `nothing` quando não há o que escrever (acervo vazio, ou bloco já
 * byte a byte igual ao que seria gravado).
 */

