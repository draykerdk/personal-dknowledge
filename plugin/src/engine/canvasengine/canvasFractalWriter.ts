/**
 * Aplicação e gravação do contexto fractal no canvas.
 *
 * Coordena a escrita do cabeçalho e dos nós de contexto adicionais,
 * com emissão de relatórios estruturados e mensagens ao operador.
 */
import type { FractalReading } from '../missionFractal';
import type {
    FractalContextPlan,
    FractalContextSkip,
    FractalHeaderBlock,
} from '../canvasFractalContext';
import {
    FRACTAL_CONTEXT_LIMIT,
    fractalHeaderTrail,
} from '../canvasFractalContext';
import { CANVAS_FILE_NODE_WIDTH, CANVAS_FILE_NODE_HEIGHT } from './canvasSplice';
import { planCanvasFileNodeInsertion } from './canvasRailPlan';
import type {
    CanvasFractalPorts,
    CanvasFractalReport,
    FractalCanvasFrame,
} from './canvasFractalPlan';
import { gravarCabecalho } from './canvasFractalHeader';

function baseReport(reading: FractalReading, plan: FractalContextPlan, message: string): CanvasFractalReport {
    return {
        outcome: 'nothing',
        scale: reading.scale,
        label: reading.label,
        readingReason: reading.reason,
        planReason: plan.reason,
        added: [],
        already: [...plan.already],
        skipped: [...plan.skipped],
        truncated: plan.truncated,
        updated: false,
        updatedNodeIds: [],
        headerId: null,
        message,
    };
}

/** Mensagem sem o ponto final — as partes são unidas por '. ' e fechadas com um só. */
function semPontoFinal(texto: string): string {
    return String(texto ?? '').trim().replace(/\.+$/, '');
}

/**
 * A frase do operador — determinística, byte a byte, para o mesmo estado.
 *
 * Ela declara a trilha, o que aconteceu com o cabeçalho (gravado, atualizado ou
 * inalterado, com o número de ligações de subir e de descer) e **o que ficou de
 * fora com o motivo**: irmãos além do teto, alvo inexistente, área sem cockpit,
 * tarefas não ligadas. Corte silencioso é mentira; a ordem das partes é fixa para
 * que duas execuções iguais produzam a mesma string.
 */
function mensagemDeEscrita(
    reading: FractalReading,
    plan: FractalContextPlan,
    header: FractalHeaderBlock | null,
    estado: 'gravado' | 'atualizado' | 'inalterado' | 'ausente',
    soltos: string[],
    jaLigados: string[],
    skipped: ReadonlyArray<FractalContextSkip>,
    limit: number,
): string {
    const subir = (header?.links ?? []).filter(link => link.direction === 'subir').length;
    const descer = (header?.links ?? []).filter(link => link.direction === 'descer').length;
    const partes: string[] = [`trilha ${fractalHeaderTrail(reading)}`];

    if (!header) {
        partes.push('nenhum cabeçalho proposto para esta execução');
    } else if (estado === 'ausente') {
        partes.push('cabeçalho não proposto para esta escala');
    } else {
        partes.push(`cabeçalho ${estado} (${subir} ligação(ões) de subir, ${descer} de descer)`);
    }

    if (soltos.length) partes.push(`${soltos.length} nó(s) de contexto escritos`);
    if (estado === 'inalterado' && !soltos.length) {
        partes.push('nada a escrever: o cabeçalho já é byte a byte o que seria gravado');
    } else if (header && !soltos.length && estado !== 'ausente') {
        partes.push(`nenhum nó solto: ${header.links.length} alvo(s) já ligados pelo cabeçalho`);
    }
    if (jaLigados.length) partes.push(`${jaLigados.length} alvo(s) já ligados no desenho`);
    if (plan.truncated) partes.push(`${plan.truncated} projeto(s) ficaram fora do teto de ${limit}`);

    const motivos: string[] = [];
    for (const item of skipped) {
        const motivo = semPontoFinal(item?.reason ?? '');
        if (motivo && !motivos.includes(motivo)) motivos.push(motivo);
    }
    partes.push(...motivos);

    return `🧭 Contexto fractal — ${reading.label}: ${partes.map(semPontoFinal).join('. ')}.`;
}

/**
 * Grava o cabeçalho e, depois, os nós de contexto que ainda faltam.
 *
 * A ordem é a do desenho: o cabeçalho primeiro (atualizar se existe, inserir se
 * não existe), os nós soltos depois. Alvo que o cabeçalho já liga não vira um
 * segundo nó: a ligação do cabeçalho **é** a conexão, e duplicá-la seria dizer a
 * mesma coisa duas vezes no mesmo desenho — o que ele já declara entra em
 * `already`.
 *
 * Os desfechos são todos nomeados: `nothing` (nada a escrever, e a mensagem diz
 * por quê), `aborted` (o conteúdo mudou entre a leitura e a gravação — nada
 * daquela altura em diante foi gravado), `refused` (a gravação recusou, com o
 * motivo dela), `failed` (erro de leitura/escrita, nunca engolido).
 */
export async function applyFractalContext(
    frame: FractalCanvasFrame,
    plan: FractalContextPlan,
    reading: FractalReading,
    ports: CanvasFractalPorts,
    /** Teto EFETIVO desta execução: a API pública aceita outro, e o aviso não pode
     *  dizer "teto de 5" quando o corte veio de 1 (achado da revisão). */
    limit: number = FRACTAL_CONTEXT_LIMIT,
): Promise<CanvasFractalReport> {
    const header = frame?.header ?? null;

    // 1. As escalas que não escrevem nada — nem nós, nem cabeçalho. O motivo
    // inteiro de cada uma vai para a mensagem, em palavras (`FRACTAL_HEADER_SKIP`),
    // junto da evidência que decidiu a escala: o operador precisa saber por que
    // "não deu para determinar" e não só que não deu.
    if (plan.kind === 'skip' && !header) {
        const message = `🧭 Contexto fractal — ${reading.label}: ${plan.reason} Evidência da escala: ${reading.reason}`;
        ports.notice(message);
        return baseReport(reading, plan, message);
    }

    const added: string[] = [];
    const already: string[] = [...plan.already];
    // O que ficou de fora vem dos dois planos: os motivos do cabeçalho (área sem
    // cockpit, alvo inexistente, tarefas não ligadas) e os do plano dos nós.
    const skipped: FractalContextSkip[] = [...(header?.skipped ?? []), ...plan.skipped];
    let baseline = frame.raw;
    let estado: 'gravado' | 'atualizado' | 'inalterado' | 'ausente' = 'ausente';
    let updated = false;
    const updatedNodeIds: string[] = [];
    let cabecalhoEscrito = false;

    // 2. O cabeçalho primeiro.
    if (header) {
        const passo = await gravarCabecalho(frame, header, baseline, ports);
        baseline = passo.baseline;

        if (passo.outcome === 'aborted' || passo.outcome === 'refused' || passo.outcome === 'failed') {
            const message = passo.message ?? `🧭 Contexto fractal: ${passo.detail}`;
            ports.notice(message);
            return {
                ...baseReport(reading, plan, message),
                outcome: passo.outcome,
                added,
                already,
                skipped,
                updated,
                updatedNodeIds,
                headerId: header.headerId,
            };
        }

        if (passo.outcome === 'inserted') {
            estado = 'gravado';
            cabecalhoEscrito = true;
            added.push(...header.links.map(link => link.filePath));
        } else if (passo.outcome === 'updated') {
            estado = 'atualizado';
            cabecalhoEscrito = true;
            updated = true;
            updatedNodeIds.push(...passo.updatedNodeIds);
        } else {
            estado = 'inalterado';
        }
    }

    // 3. Depois, os nós que faltam — sem repetir o que o cabeçalho já liga.
    const ligadosPeloCabecalho = new Set((header?.links ?? []).map(link => link.filePath));
    const planNodes = plan.kind === 'plan' ? plan.nodes : [];
    const soltos = planNodes.filter(node => !ligadosPeloCabecalho.has(node.filePath));
    for (const node of planNodes) {
        if (!ligadosPeloCabecalho.has(node.filePath)) continue;
        if (!added.includes(node.filePath) && !already.includes(node.filePath)) already.push(node.filePath);
    }

    for (const node of soltos) {
        let latest: string;
        try {
            latest = await ports.read();
        } catch (error) {
            const message = `🧭 Contexto fractal: não foi possível reler o canvas — ${String(error)}. Nada mais foi gravado.`;
            ports.fail?.(`fractal: falha ao reler "${frame.canvasPath}": ${String(error)}`);
            ports.notice(message);
            return {
                ...baseReport(reading, plan, message),
                outcome: 'failed',
                added,
                already,
                skipped,
                updated,
                updatedNodeIds,
                headerId: header?.headerId ?? null,
            };
        }

        if (latest !== baseline) {
            const message = added.length
                ? `O conteúdo do canvas mudou entre a leitura e a gravação: ${added.length} nó(s) já tinham sido gravados e os restantes não foram, para não descartar a mudança.`
                : 'O conteúdo do canvas mudou entre a leitura e a gravação. Nenhum nó de contexto foi gravado para não descartar a mudança.';
            ports.fail?.(`fractal: "${frame.canvasPath}" mudou entre a leitura e a gravação; escrita abortada.`);
            ports.notice(message);
            return {
                ...baseReport(reading, plan, message),
                outcome: 'aborted',
                added,
                already,
                skipped,
                updated,
                updatedNodeIds,
                headerId: header?.headerId ?? null,
            };
        }

        const insertion = planCanvasFileNodeInsertion(latest, {
            filePath: node.filePath,
            width: CANVAS_FILE_NODE_WIDTH,
            height: CANVAS_FILE_NODE_HEIGHT,
            preferred: frame.preferred ?? undefined,
        });

        if (insertion.kind === 'already') {
            // Defensivo, e hoje INALCANÇÁVEL por este caminho: o plano deduplica
            // exatamente o mesmo texto que o guarda acabou de confirmar, com
            // comparação mais estrita. Fica como rede para um chamador futuro (a
            // API pública aceita um `limit`), e por isso não tem teste — dizer que
            // aqui houve "corrida perdida" seria afirmar o que o guarda exclui.
            already.push(node.filePath);
            continue;
        }
        if (insertion.kind === 'refused') {
            const message = `🧭 Contexto fractal: ${insertion.reason}`;
            ports.fail?.(`fractal: ${insertion.reason}`);
            ports.notice(message);
            return {
                ...baseReport(reading, plan, message),
                outcome: 'refused',
                added,
                already,
                skipped,
                updated,
                updatedNodeIds,
                headerId: header?.headerId ?? null,
            };
        }

        try {
            await ports.write(insertion.next);
        } catch (error) {
            const message = `🧭 Contexto fractal: falha ao gravar "${node.filePath}" — ${String(error)}.`;
            ports.fail?.(`fractal: falha ao gravar "${node.filePath}": ${String(error)}`);
            ports.notice(message);
            return {
                ...baseReport(reading, plan, message),
                outcome: 'failed',
                added,
                already,
                skipped,
                updated,
                updatedNodeIds,
                headerId: header?.headerId ?? null,
            };
        }

        // A base avança para o que acabamos de gravar: o próximo guarda compara
        // com o arquivo de agora, e não com o de antes da nossa própria escrita.
        baseline = insertion.next;
        added.push(node.filePath);
    }

    const message = mensagemDeEscrita(reading, plan, header, estado, soltos.map(node => node.filePath), already, skipped, limit);
    ports.notice(message);

    return {
        ...baseReport(reading, plan, message),
        outcome: (cabecalhoEscrito || soltos.length) ? 'written' : 'nothing',
        added,
        already,
        skipped,
        updated,
        updatedNodeIds,
        headerId: header?.headerId ?? null,
    };
}

