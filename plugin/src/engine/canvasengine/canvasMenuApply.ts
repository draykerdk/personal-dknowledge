/**
 * Aplicação e gravação com guarda do menu do acervo no canvas.
 */
import { canvasContents, canvasIndexOf } from '../missionCanvasIndex';
import { parseCanvasGraph } from '../canvasMap';
import type { FractalReading } from '../missionFractal';
import { readFractalScale } from '../missionFractal';
import {
    CANVAS_MENU_GROUP_LIMIT,
    CANVAS_MENU_LABEL,
    CANVAS_MENU_MARKER,
    CANVAS_MENU_WIDTH,
    canvasMenuBlockHeight,
    canvasMenuNodeIds,
    planCanvasMenu,
    renderCanvasMenuNodes,
} from '../canvasMenuCanvas';
import {
    CANVAS_FILE_NODE_WIDTH,
    indentacaoDeElemento,
    insertCanvasNodeText,
} from './canvasSplice';
import type {
    CanvasMenuFrame,
    CanvasMenuPorts,
    CanvasMenuReport,
} from './canvasMenuPlan';
import { spliceMarkedBlock } from './canvasBlockSplice';
import {
    ancoraDeInsercao,
    baseReport,
    findCanvasMenuSpan,
    idColidente,
    idsDoTexto,
    mensagemDoMenu,
    reportDoBloco,
} from './canvasMenuPlan';

export async function runCanvasMenuForFrame(
    frame: CanvasMenuFrame,
    snapshot: any,
    ports: CanvasMenuPorts,
    limit?: number,
): Promise<CanvasMenuReport> {
    const canvasPath = String(frame?.canvasPath ?? '').trim();
    const baseline = typeof frame?.raw === 'string' ? frame.raw : '';
    const teto = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : CANVAS_MENU_GROUP_LIMIT;
    const exists = ports?.exists ?? (() => true);

    // 1. A escala lida: a mesma leitura do cabeçalho de escala, sem recriar nada.
    const graph = parseCanvasGraph(canvasPath, baseline, exists);
    const contents = canvasContents(graph, snapshot);
    const index = canvasIndexOf(snapshot);
    const reading = readFractalScale({
        canvasPath,
        contents: { tasks: contents.tasks.length, projects: contents.projects },
        index,
    });

    // 2. O plano, com os ids que o desenho já usa — menos os do próprio bloco do
    // menu, que não podem empurrar o id dele para um sufixo a cada execução.
    const { ids, marcados } = idsDoTexto(baseline);
    const tomados = ids.filter(id => !marcados.includes(id));
    const block = planCanvasMenu({
        canvasPath,
        reading,
        tree: frame?.tree ?? null,
        limit: teto,
        exists,
        takenIds: tomados,
    });

    const span = findCanvasMenuSpan(baseline);
    const recuo = indentacaoDeElemento(baseline);
    const altura = canvasMenuBlockHeight(block);

    /* --- 3. Sem bloco no arquivo: inserir, ou declarar que não há o que inserir -- */

    if (!span) {
        // Nós marcados e nenhum nó de TÍTULO marcado (o bloco do menu começa por
        // nó de texto, ao contrário do cabeçalho de escala, que começa por grupo):
        // inserir de novo criaria o SEGUNDO menu — o defeito proibido. A mensagem
        // e o diagnóstico dizem o que foi MEDIDO (quantos nós carregam o marcador
        // e quais ids são), sem copiar a causa do cabeçalho: "nenhum grupo marcado"
        // era texto do outro bloco e afirmava um grupo que este desenho não tem
        // (achado da revisão independente, 2026-09-15).
        if (marcados.length) {
            const lista = marcados.map(id => `"${id}"`).join(', ');
            const detail = `menu: ${marcados.length} nó(s) com o marcador "${CANVAS_MENU_MARKER}" (${lista}) e nenhum nó de título marcado em "${canvasPath}"; nada foi gravado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: o desenho tem ${marcados.length} nó(s) com o marcador "${CANVAS_MENU_MARKER}" (${lista}) e nenhum nó de título marcado — o bloco do menu não foi achado, e inserir de novo criaria um segundo menu. Nada foi gravado.`;
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
        }

        // O id do bloco já pertence a outro nó — id duplicado quebraria o canvas.
        const colidente = idColidente(canvasPath, block, tomados);
        if (colidente) {
            const detail = `menu: id "${colidente}" já pertence a outro nó de "${canvasPath}"; nada foi gravado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: o id "${colidente}" já pertence a um nó deste canvas que não carrega o marcador "${CANVAS_MENU_MARKER}": gravar criaria dois nós com o mesmo id. Nada foi gravado.`;
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
        }

        // Acervo vazio: não se desenha um menu em branco — o estado é DECLARADO.
        if (block.empty) {
            const message = mensagemDoMenu(reading, block, 'vazio', teto);
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block) };
        }

        let nodes: any[] = [];
        try {
            const parsed = JSON.parse(baseline);
            nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : null;
        } catch (error) {
            const detail = `menu: "${canvasPath}" não é JSON legível (${String((error as Error)?.message ?? error)}); nada foi gravado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: o arquivo do canvas não é JSON legível (${String((error as Error)?.message ?? error)}); nada foi inserido.`;
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
        }
        if (!nodes) {
            const detail = `menu: "${canvasPath}" não tem a lista "nodes"; nada foi gravado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: o arquivo do canvas não tem a lista "nodes"; nada foi inserido.`;
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
        }

        const ancora = ancoraDeInsercao(baseline, frame?.preferred, nodes);
        // Uma chamada só ao inserter, com as linhas unidas — e **cada linha com o
        // mesmo recuo**: o inserter não replica a indentação nas linhas 2..n.
        const linhas = renderCanvasMenuNodes(block, { x: ancora.x, y: ancora.y, width: CANVAS_FILE_NODE_WIDTH, height: altura });
        const next = insertCanvasNodeText(baseline, linhas.join(',\n' + recuo));
        if (next === null) {
            const detail = `menu: lista "nodes" não localizada em "${canvasPath}"; nada foi gravado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: não foi possível localizar a lista "nodes" no arquivo do canvas; nada foi inserido.`;
            ports?.notice?.(message);
            return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
        }

        const terminal = await gravarComGuarda(frame, baseline, next, ports, reading);
        if (terminal) {
            // Abortado ou falho: o bloco NÃO foi gravado, então `added` fica vazio.
            ports?.notice?.(terminal.message);
            return { ...terminal, ...reportDoBloco(block) } as CanvasMenuReport;
        }

        const message = mensagemDoMenu(reading, block, 'gravado', teto);
        ports?.notice?.(message);
        return {
            ...baseReport(reading, message),
            ...reportDoBloco(block, true),
            outcome: 'written',
            updated: false,
        };
    }

    /* --- 4. Com bloco no arquivo: atualizar no mesmo span, nunca duplicar ----- */

    const foraDoBloco = ids.filter(id => !marcados.includes(id));
    const colidente = idColidente(canvasPath, block, foraDoBloco);
    if (colidente) {
        const detail = `menu: id "${colidente}" já pertence a outro nó de "${canvasPath}"; nada foi gravado.`;
        ports?.fail?.(detail);
        const message = `${CANVAS_MENU_LABEL}: o id "${colidente}" já pertence a um nó deste canvas que não carrega o marcador "${CANVAS_MENU_MARKER}": gravar criaria dois nós com o mesmo id. Nada foi gravado.`;
        ports?.notice?.(message);
        return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
    }

    // O x/y do bloco que já existe é REUSADO: o menu não pode dançar entre
    // execuções. Só quando a posição é ilegível a âncora é recalculada.
    const x = Number.isFinite(span.x) ? span.x : null;
    const y = Number.isFinite(span.y) ? span.y : null;
    let ancora: { x: number; y: number };
    if (x === null || y === null) {
        let nodes: any[] = [];
        try {
            const parsed = JSON.parse(baseline);
            nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        } catch (_) {
            nodes = [];
        }
        ancora = ancoraDeInsercao(baseline, frame?.preferred, nodes);
    } else {
        ancora = { x, y };
    }

    const linhas = renderCanvasMenuNodes(block, { x: ancora.x, y: ancora.y, width: CANVAS_FILE_NODE_WIDTH, height: altura });
    const corpo = linhas.join(',\n' + recuo);

    const spliced = spliceMarkedBlock(baseline, CANVAS_MENU_MARKER, corpo, 'text');
    if (!spliced || spliced.outcome === 'unchanged') {
        const message = mensagemDoMenu(reading, block, 'inalterado', teto);
        ports?.notice?.(message);
        return { ...baseReport(reading, message), ...reportDoBloco(block) };
    }
    if (spliced.outcome === 'refused') {
        const detail = `menu: ${spliced.refusalReason ?? 'aresta conectada a nó do menu; gravação recusada.'}`;
        ports?.fail?.(detail);
        const message = `${CANVAS_MENU_LABEL}: ${spliced.refusalReason ?? 'gravação recusada para preservar integridade do canvas.'}`;
        ports?.notice?.(message);
        return { ...baseReport(reading, message), ...reportDoBloco(block), outcome: 'refused' };
    }

    const next = spliced.next;
    const gravado = await gravarComGuarda(frame, baseline, next, ports, reading);
    if (gravado) {
        ports?.notice?.(gravado.message);
        return { ...gravado, ...reportDoBloco(block) } as CanvasMenuReport;
    }

    const message = mensagemDoMenu(reading, block, 'atualizado', teto);
    ports?.notice?.(message);
    return {
        ...baseReport(reading, message),
        ...reportDoBloco(block, true),
        outcome: 'written',
        updated: true,
    };
}

/**
 * O guarda de releitura + a escrita. `null` quando a escrita aconteceu; o
 * relatório terminal (`aborted` ou `failed`) quando não aconteceu.
 *
 * A mensagem diz o que foi **MEDIDO** — o conteúdo do arquivo não é mais o que
 * lemos — e não atribui autoria: quem reescreveu pode ter sido o operador, outra
 * sessão, ou o próprio Obsidian normalizando o arquivo depois do nosso `modify`.
 */
async function gravarComGuarda(
    frame: CanvasMenuFrame,
    baseline: string,
    next: string,
    ports: CanvasMenuPorts,
    reading: FractalReading,
): Promise<CanvasMenuReport | null> {
    let latest: string;
    try {
        latest = await ports.read();
    } catch (error) {
        const detail = `menu: falha ao reler "${frame?.canvasPath}": ${String(error)}`;
        ports?.fail?.(detail);
        const message = `${CANVAS_MENU_LABEL}: não foi possível reler o canvas — ${String(error)}. Nada foi gravado.`;
        return { ...baseReport(reading, message), outcome: 'failed' };
    }

    if (latest !== baseline) {
        const detail = `menu: "${frame?.canvasPath}" mudou entre a leitura e a gravação; escrita do menu abortada.`;
        ports?.fail?.(detail);
        const message = 'O conteúdo do canvas mudou entre a leitura e a gravação. Nenhum nó do menu foi gravado, para não descartar a mudança.';
        return { ...baseReport(reading, message), outcome: 'aborted' };
    }

    try {
        await ports.write(next);
    } catch (error) {
        const detail = `menu: falha ao gravar o menu de "${frame?.canvasPath}": ${String(error)}`;
        ports?.fail?.(detail);
        const message = `${CANVAS_MENU_LABEL}: falha ao gravar o bloco — ${String(error)}.`;
        return { ...baseReport(reading, message), outcome: 'failed' };
    }

    try {
        const persisted = await ports.read();
        if (persisted !== next) {
            const detail = `menu: persistência divergiu em "${frame?.canvasPath}"; conteúdo gravado não confirmado.`;
            ports?.fail?.(detail);
            const message = `${CANVAS_MENU_LABEL}: persistência do menu divergiu do esperado.`;
            return { ...baseReport(reading, message), outcome: 'failed' };
        }
    } catch (_) {}

    return null;
}

/* ==========================================================================
   O comando: quadro → plano → gravação
   ========================================================================== */


