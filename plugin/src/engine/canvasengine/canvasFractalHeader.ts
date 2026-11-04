/**
 * Gravação com guarda e substituição por span do cabeçalho fractal.
 *
 * Atualiza o cabeçalho se ele já existe no desenho, ou insere um novo — nunca os
 * dois. O x/y do grupo existente é preservado para não mover o cabeçalho.
 */
import type { FractalHeaderBlock } from '../canvasFractalContext';
import {
    FRACTAL_HEADER_MARKER,
    FRACTAL_HEADER_WIDTH,
    fractalHeaderBlockHeight,
    fractalHeaderNodeIds,
    renderFractalHeaderNodes,
} from '../canvasFractalContext';
import {
    centerOfCanvasNodes,
    indentacaoDeElemento,
    insertCanvasNodeText,
} from './canvasSplice';
import type {
    CanvasFractalPorts,
    FractalCanvasFrame,
} from './canvasFractalPlan';
import { spliceMarkedBlock } from './canvasBlockSplice';
import {
    ancoraDoCabecalho,
    findFractalHeaderSpan,
    idsDoTexto,
} from './canvasFractalPlan';

export type FractalHeaderOutcome = 'inserted' | 'updated' | 'unchanged' | 'refused' | 'aborted' | 'failed';

export interface FractalHeaderStep {
    outcome: FractalHeaderOutcome;
    /** O texto do arquivo depois deste passo — a base do próximo guarda. */
    baseline: string;
    updatedNodeIds: string[];
    /** Mensagem pronta quando o passo é terminal (recusado, abortado ou falho). */
    message?: string;
    /** Motivo curto para o diagnóstico. */
    detail: string;
}

/**
 * Grava o cabeçalho: atualiza o que existe, insere o que não existe — nunca os
 * dois. Devolve o texto de agora para o próximo guarda e, quando o desfecho é
 * terminal, a mensagem medida.
 *
 * Os desfechos terminais são nomeados e cada um diz o que foi MEDIDO:
 *  quando gravar criaria um segundo cabeçalho ou um id duplicado,
 *  quando o arquivo não é mais o que foi lido,  quando a
 * leitura ou a escrita falha.
 */
async function persistirCabecalho(
    canvasPath: string,
    next: string,
    ports: CanvasFractalPorts,
    verbo: string,
): Promise<{ ok: boolean; detail?: string; message?: string }> {
    try {
        await ports.write(next);
    } catch (error) {
        const detail = `fractal: falha ao ${verbo} o cabeçalho de "${canvasPath}": ${String(error)}`;
        return { ok: false, detail, message: `🧭 Contexto fractal: falha ao ${verbo} o cabeçalho — ${String(error)}.` };
    }
    try {
        const post = await ports.read();
        if (post !== next) {
            const detail = `fractal: persistência divergiu em "${canvasPath}"; o conteúdo gravado difere do lido.`;
            return { ok: false, detail, message: '🧭 Contexto fractal: persistência do cabeçalho divergiu do esperado.' };
        }
    } catch (_) {}
    return { ok: true };
}

export async function gravarCabecalho(
    frame: FractalCanvasFrame,
    header: FractalHeaderBlock,
    baseline: string,
    ports: CanvasFractalPorts,
): Promise<FractalHeaderStep> {
    let latest: string;
    try {
        latest = await ports.read();
    } catch (error) {
        const detail = `fractal: falha ao reler "${frame.canvasPath}": ${String(error)}`;
        ports.fail?.(detail);
        return {
            outcome: 'failed',
            baseline,
            updatedNodeIds: [],
            detail,
            message: `🧭 Contexto fractal: não foi possível reler o canvas — ${String(error)}. Nada foi gravado.`,
        };
    }

    // Guarda de concorrência: o conteúdo do arquivo mudou entre a leitura e a gravação.
    if (latest !== baseline) {
        const detail = `fractal: "${frame.canvasPath}" mudou entre a leitura e a gravação; escrita do cabeçalho abortada.`;
        ports.fail?.(detail);
        return {
            outcome: 'aborted',
            baseline,
            updatedNodeIds: [],
            detail,
            message: 'O conteúdo do canvas mudou entre a leitura e a gravação. Nenhum nó foi gravado — nem o cabeçalho —, para não descartar a mudança.',
        };
    }

    const span = findFractalHeaderSpan(latest);
    const recuo = indentacaoDeElemento(latest);
    const altura = fractalHeaderBlockHeight(header);
    const { ids, marcados } = idsDoTexto(latest);

    if (!span) {
        // 1. Nós marcados sem grupo marcado: inserir criaria um segundo cabeçalho.
        if (marcados.length) {
            const lista = marcados.map(id => `"${id}"`).join(', ');
            const detail = `fractal: ${marcados.length} nó(s) com o marcador "${FRACTAL_HEADER_MARKER}" (${lista}) e nenhum grupo marcado em "${frame.canvasPath}"; nada foi gravado.`;
            ports.fail?.(detail);
            return {
                outcome: 'refused',
                baseline: latest,
                updatedNodeIds: [],
                detail,
                message: `🧭 Contexto fractal: o desenho tem ${marcados.length} nó(s) com o marcador "${FRACTAL_HEADER_MARKER}" (${lista}) e nenhum grupo marcado — o bloco do cabeçalho não foi achado, e inserir de novo criaria um segundo cabeçalho. Nada foi gravado.`,
            };
        }

        // 2. Colisão de id: nós do cabeçalho não podem colidir com nós existentes.
        const colidente = fractalHeaderNodeIds(header).find(id => ids.includes(id));
        if (colidente) {
            const detail = `fractal: id "${colidente}" já pertence a outro nó de "${frame.canvasPath}"; nada foi gravado.`;
            ports.fail?.(detail);
            return {
                outcome: 'refused',
                baseline: latest,
                updatedNodeIds: [],
                detail,
                message: `🧭 Contexto fractal: o id "${colidente}" já pertence a um nó deste canvas que não carrega o marcador "${FRACTAL_HEADER_MARKER}": gravar criaria dois nós com o mesmo id. Nada foi gravado.`,
            };
        }

        let parsed: any = null;
        try {
            parsed = JSON.parse(latest);
        } catch (error) {
            const detail = `fractal: "${frame.canvasPath}" não é JSON legível (${String((error as Error)?.message ?? error)}); nada foi gravado.`;
            ports.fail?.(detail);
            return {
                outcome: 'refused',
                baseline: latest,
                updatedNodeIds: [],
                detail,
                message: `🧭 Contexto fractal: o arquivo do canvas não é JSON legível (${String((error as Error)?.message ?? error)}); nada foi inserido.`,
            };
        }
        const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : null;
        if (!nodes) {
            const detail = `fractal: "${frame.canvasPath}" não tem a lista "nodes"; nada foi gravado.`;
            ports.fail?.(detail);
            return {
                outcome: 'refused',
                baseline: latest,
                updatedNodeIds: [],
                detail,
                message: '🧭 Contexto fractal: o arquivo do canvas não tem a lista "nodes"; nada foi inserido.',
            };
        }

        // Âncora: preferred da view (ou abaixo do menu se já existir), centro dos nós ou origem.
        const ancora = ancoraDoCabecalho(latest, frame.preferred, nodes);
        const bloco = renderFractalHeaderNodes(header, { x: ancora.x, y: ancora.y, width: FRACTAL_HEADER_WIDTH, height: altura })
            .join(',\n' + recuo);
        const next = insertCanvasNodeText(latest, bloco);
        if (next === null) {
            const detail = `fractal: lista "nodes" não localizada em "${frame.canvasPath}"; nada foi gravado.`;
            ports.fail?.(detail);
            return {
                outcome: 'refused',
                baseline: latest,
                updatedNodeIds: [],
                detail,
                message: '🧭 Contexto fractal: não foi possível localizar a lista "nodes" no arquivo do canvas; nada foi inserido.',
            };
        }

        const gravado = await persistirCabecalho(frame.canvasPath, next, ports, 'gravar');
        if (!gravado.ok) {
            ports.fail?.(gravado.detail!);
            return {
                outcome: 'failed',
                baseline: latest,
                updatedNodeIds: [],
                detail: gravado.detail,
                message: gravado.message,
            };
        }

        return {
            outcome: 'inserted',
            baseline: next,
            updatedNodeIds: [],
            detail: 'cabeçalho inserido',
        };
    }

    // 3. Atualização: reutiliza x/y do grupo existente para preservar posição.
    const foraDoBloco = ids.filter(id => !marcados.includes(id));
    const colidenteAtualizacao = fractalHeaderNodeIds(header).find(id => foraDoBloco.includes(id));
    if (colidenteAtualizacao) {
        const detail = `fractal: id "${colidenteAtualizacao}" já pertence a outro nó de "${frame.canvasPath}"; nada foi gravado.`;
        ports.fail?.(detail);
        return {
            outcome: 'refused',
            baseline: latest,
            updatedNodeIds: [],
            detail,
            message: `🧭 Contexto fractal: o id "${colidenteAtualizacao}" já pertence a um nó deste canvas que não carrega o marcador "${FRACTAL_HEADER_MARKER}": gravar criaria dois nós com o mesmo id. Nada foi gravado.`,
        };
    }

    const x = Number.isFinite(span.x) ? span.x : null;
    const y = Number.isFinite(span.y) ? span.y : null;
    let ancora: { x: number; y: number };
    if (x === null || y === null) {
        // Posição ilegível: recalcula âncora para evitar gravar x/y null.
        let nodes: any[] = [];
        try {
            const parsed = JSON.parse(latest);
            nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        } catch (_) {
            nodes = [];
        }
        ancora = frame.preferred ?? centerOfCanvasNodes(nodes) ?? { x: 0, y: 0 };
    } else {
        ancora = { x, y };
    }

    const bloco = renderFractalHeaderNodes(header, { x: ancora.x, y: ancora.y, width: FRACTAL_HEADER_WIDTH, height: altura })
        .join(',\n' + recuo);

    const spliced = spliceMarkedBlock(latest, FRACTAL_HEADER_MARKER, bloco, 'group');
    if (!spliced || spliced.outcome === 'unchanged') {
        return {
            outcome: 'unchanged',
            baseline: latest,
            updatedNodeIds: [],
            detail: 'cabeçalho já era byte a byte o que seria gravado',
        };
    }
    if (spliced.outcome === 'refused') {
        const detail = `fractal: ${spliced.refusalReason ?? 'aresta conectada a nó do cabeçalho; gravação recusada.'}`;
        ports.fail?.(detail);
        return {
            outcome: 'refused',
            baseline: latest,
            updatedNodeIds: [],
            detail,
            message: `🧭 Contexto fractal: ${spliced.refusalReason ?? 'gravação recusada para proteger integridade do canvas.'}`,
        };
    }

    const next = spliced.next;
    // O Obsidian salva canvas como JSON indentado com tabs; o bloco costurado sai
    // compacto. Diferença só de formatação não é mudança: sem esta comparação por
    // significado, cada salvamento do Obsidian faria o cabeçalho ser regravado.
    if (mesmoConteudo(latest, next)) {
        return {
            outcome: 'unchanged',
            baseline: latest,
            updatedNodeIds: [],
            detail: 'cabeçalho igual em conteúdo; só a formatação do arquivo difere',
        };
    }
    const gravado = await persistirCabecalho(frame.canvasPath, next, ports, 'atualizar');
    if (!gravado.ok) {
        ports.fail?.(gravado.detail!);
        return {
            outcome: 'failed',
            baseline: latest,
            updatedNodeIds: [],
            detail: gravado.detail,
            message: gravado.message,
        };
    }

    return {
        outcome: 'updated',
        baseline: next,
        updatedNodeIds: fractalHeaderNodeIds(header),
        detail: 'cabeçalho atualizado',
    };
}

/** Mesmo canvas em significado (nós e setas), ignorando espaços e quebras de linha. */
function mesmoConteudo(a: string, b: string): boolean {
    try {
        return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
    } catch {
        return false;
    }
}
