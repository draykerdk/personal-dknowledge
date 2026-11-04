/**
 * Planejamento puro do cabeçalho de escala fractal.
 * Gramática: 'subir' (cockpits), 'descer' (áreas/projetos/tarefas), 'lateral' (irmãos), 'retorno' (projeto pai).
 */
import { COCKPIT_PATH } from '../canvasTree';
import type { MissionCanvasIndex } from '../missionCanvasIndex';
import { areaCockpitOf } from '../missionCanvasIndex';
import { railNodeIdFor } from './canvasSplice';
import type {
    FractalContextRole,
    FractalContextSkip,
    FractalHeaderBlock,
    FractalHeaderDirection,
    FractalHeaderGeometry,
    FractalHeaderLink,
    FractalHeaderRequest,
} from './canvasFractalModel';
import {
    FRACTAL_HEADER_COLOR,
    FRACTAL_HEADER_GAP,
    FRACTAL_HEADER_LABEL,
    FRACTAL_HEADER_MARKER,
    FRACTAL_HEADER_NODE_HEIGHT,
    FRACTAL_HEADER_WIDTH,
    fractalHeaderBlockHeight,
    fractalHeaderIdFor,
    fractalHeaderNodeIds,
    fractalHeaderTitle,
    fractalHeaderTrail,
} from './canvasFractalModel';
import {
    areaOfCanvas,
    findEntry,
    normalizeLimit,
    projetosDaArea,
} from './canvasFractalNodesPlan';
import type { ProjectTarget } from './canvasFractalTaskLink';
import { resolveProjectTasks, tarefasDoProjeto } from './canvasFractalTaskLink';

export { tarefasDoProjeto };

export function planFractalHeader(request: FractalHeaderRequest): FractalHeaderBlock | null {
    const canvasPath = String(request?.canvasPath ?? '').trim();
    const reading = request?.reading ?? null;
    const scale = reading?.scale ?? 'indefinida';

    // 1. Escalas que não escrevem cabeçalho por omissão
    if (scale === 'indefinida' || !reading) return null;

    const index = request?.index ?? null;
    const limit = normalizeLimit(request?.limit);
    const exists = typeof request?.exists === 'function' ? request!.exists! : () => true;
    const entry = findEntry(index, canvasPath);
    const areaId = areaOfCanvas(index, canvasPath, entry);
    const cockpit = areaId ? areaCockpitOf(index as MissionCanvasIndex, areaId) : null;

    // 2. Ids reservados
    const drawing = request?.drawing ?? null;
    const doCabecalho = new Set((drawing?.headerIds ?? []).map(id => String(id ?? '').trim()).filter(Boolean));
    const tomados = (drawing?.ids ?? []).map(id => String(id ?? '').trim()).filter(id => Boolean(id) && !doCabecalho.has(id));

    const headerId = fractalHeaderIdFor(canvasPath);
    tomados.push(headerId);

    const links: FractalHeaderLink[] = [];
    const skipped: FractalContextSkip[] = [];
    const vistos = new Set<string>();

    const propor = (candidato: {
        direction: FractalHeaderDirection;
        filePath: string;
        label: string;
        role: FractalContextRole | 'tarefas';
        reason: string;
    }): void => {
        const filePath = String(candidato.filePath ?? '').trim();
        if (!filePath) {
            skipped.push({ path: '', reason: 'a ligação não declara caminho de arquivo; nada a inserir.' });
            return;
        }
        if (filePath === canvasPath) {
            skipped.push({ path: filePath, reason: 'é o próprio canvas aberto: uma ligação para si mesmo não conecta nada.' });
            return;
        }
        if (vistos.has(filePath)) {
            skipped.push({ path: filePath, reason: 'já ligado por outro papel nesta mesma geração; um arquivo, um nó.' });
            return;
        }
        if (!exists(filePath)) {
            skipped.push({ path: filePath, reason: 'o arquivo não existe no vault; um nó apontando para ele nasceria órfão.' });
            return;
        }
        vistos.add(filePath);
        const nodeId = railNodeIdFor(filePath, tomados);
        tomados.push(nodeId);
        links.push({ direction: candidato.direction, filePath, label: candidato.label, nodeId, role: candidato.role, reason: candidato.reason });
    };

    // 3. Roteamento por escala:
    if (scale === 'sistema') {
        const areaLinks = planSystemAreaLinks(index, limit);
        const total = index?.byAreaCockpit ? index.byAreaCockpit.size : 0;
        for (const al of areaLinks) {
            propor({ direction: 'descer', filePath: al.filePath, label: al.label, role: al.role, reason: al.reason });
        }
        if (total > limit) {
            skipped.push({ path: '', reason: `${total - limit} área(s) adicional(is) omitida(s) pelo limite de ${limit}.` });
        } else if (total === 0) {
            skipped.push({ path: '', reason: 'Nenhuma área registrada no índice do sistema.' });
        }
    } else if (scale === 'tarefas') {
        propor({
            direction: 'subir',
            filePath: COCKPIT_PATH,
            label: 'Cockpit do sistema',
            role: 'sistema',
            reason: `Toda a árvore converge para ${COCKPIT_PATH}: é o nó acima de qualquer tarefa.`,
        });
        const taskProject = request?.taskProject ?? entry?.project ?? (request?.tasks?.[0] as any)?.project;
        const returnLink = planTaskProjectReturn(index, canvasPath, taskProject);
        if (returnLink) {
            propor({ direction: 'retorno', filePath: returnLink.filePath, label: returnLink.label, role: returnLink.role, reason: returnLink.reason });
        } else {
            skipped.push({
                path: '',
                reason: taskProject
                    ? `Canvas do projeto "${taskProject}" não encontrado no índice para retorno.`
                    : 'Canvas de tarefas sem projeto pai identificado no índice para retorno.',
            });
        }
    } else {
        if (scale === 'projeto') {
            if (!cockpit) {
                skipped.push({
                    path: areaId ? '' : canvasPath,
                    reason: areaId
                        ? `A área "${areaId}" não tem canvas de topo (cockpit) no índice: não há cockpit de área para subir.`
                        : 'O canvas não está na árvore de nenhuma área: não há cockpit de área para subir.',
                });
            } else {
                propor({
                    direction: 'subir',
                    filePath: cockpit.path,
                    label: `Cockpit da área ${areaId}`,
                    role: 'area-cockpit',
                    reason: `O projeto mora na área "${areaId}"; byAreaCockpit aponta ${cockpit.path} como o canvas do topo dela.`,
                });
            }
        }

        propor({
            direction: 'subir',
            filePath: COCKPIT_PATH,
            label: 'Cockpit do sistema',
            role: 'sistema',
            reason: `Toda a árvore converge para ${COCKPIT_PATH}: é o nó acima de qualquer área.`,
        });

        const excluidos = scale === 'projeto' ? [canvasPath, cockpit?.path ?? ''] : [canvasPath];
        for (const projeto of projetosDaArea(index, areaId, excluidos).slice(0, limit)) {
            const nome = projeto.project ?? projeto.name;
            propor({
                direction: 'descer',
                filePath: projeto.path,
                label: `Projeto ${nome}`,
                role: scale === 'projeto' ? 'projeto-irmao' : 'projeto-da-area',
                reason: scale === 'projeto'
                    ? `Projeto irmão de "${entry?.project ?? nome}" na área "${areaId}": ${projeto.path}.`
                    : `Projeto da área "${areaId}": ${projeto.path}.`,
            });
        }

        if (scale === 'area') {
            skipped.push({
                path: '',
                reason: 'Escala de área não liga tarefas: o nível de baixo dela são os canvas de projeto, e as tarefas moram dentro de cada projeto.',
            });
        } else {
            const target: ProjectTarget = { name: entry?.project ?? '', projectPath: entry?.projectPath ?? null, canvasPath };
            const { candidates, orphans } = resolveProjectTasks(request?.tasks, target, exists, index);
            if (!candidates.length) {
                skipped.push({
                    path: '',
                    reason: target.name
                        ? `Nenhuma tarefa aberta do projeto "${target.name}" existe no vault: nenhum link de tarefa foi criado.`
                        : 'O canvas não declara projeto dono no índice: nenhum link de tarefa foi criado.',
                });
            } else {
                propor({
                    direction: 'descer',
                    filePath: candidates[0].path,
                    label: `Tarefas do projeto (${candidates.length} aberta(s))`,
                    role: 'tarefas',
                    reason: `Entre as ${candidates.length} tarefa(s) aberta(s) do projeto "${target.name}" que existem no vault, a de prazo mais próximo é ${candidates[0].path}.`,
                });
                if (candidates.length > 1) {
                    skipped.push({ path: '', reason: `${candidates.length - 1} tarefa(s) aberta(s) do projeto não foram ligadas: só a de prazo mais próximo vira nó.` });
                }
            }
            for (const orfa of orphans) {
                skipped.push({ path: orfa.path, reason: `Tarefa em triagem (${orfa.path}): ${orfa.reason}.` });
            }
        }
    }

    const counts = (dir: FractalHeaderDirection) => links.filter(l => l.direction === dir).length;
    const detalhes = ['subir', 'descer', 'lateral', 'retorno']
        .map(d => (counts(d as FractalHeaderDirection) ? `${counts(d as FractalHeaderDirection)} ${d}` : ''))
        .filter(Boolean).join(', ');

    return {
        headerId,
        scale,
        label: reading.label,
        trail: [...(reading.trail ?? [])],
        title: fractalHeaderTitle(reading),
        links,
        skipped,
        reason: `Cabeçalho da escala ${reading.label}: ${detalhes || '0 ligações'} (trilha ${fractalHeaderTrail(reading)}).`,
    };
}

export function renderFractalHeaderNodes(block: FractalHeaderBlock, geometry: FractalHeaderGeometry): string[] {
    const x = Number.isFinite(geometry?.x) ? geometry.x : 0;
    const y = Number.isFinite(geometry?.y) ? geometry.y : 0;
    const largura = FRACTAL_HEADER_WIDTH;
    const passo = FRACTAL_HEADER_NODE_HEIGHT + FRACTAL_HEADER_GAP;
    const posicao = (indice: number) => ({ x, y: y + indice * passo, width: largura, height: FRACTAL_HEADER_NODE_HEIGHT });

    const ids = fractalHeaderNodeIds(block);
    const conteudos: Array<Record<string, unknown>> = [
        { type: 'group', label: FRACTAL_HEADER_LABEL, color: FRACTAL_HEADER_COLOR, ...posicao(0), height: fractalHeaderBlockHeight(block) },
        { type: 'text', text: block.title, ...posicao(1) },
        ...block.links.map((link, indice) => ({ type: 'file', file: link.filePath, ...posicao(indice + 2) })),
    ];

    return conteudos.map((c, i) => JSON.stringify({ id: ids[i], ...c, mode: FRACTAL_HEADER_MARKER }));
}

export function fractalNavigationDirection(link: FractalHeaderLink): FractalHeaderDirection {
    if (link.role === 'projeto-irmao') return 'lateral';
    if (link.role === 'tarefas') return 'descer';
    if (link.direction) return link.direction;
    if (link.role === 'sistema' || link.role === 'area-cockpit') return 'subir';
    return 'descer';
}

export function planSystemAreaLinks(index: MissionCanvasIndex | null | undefined, limit = 5): FractalHeaderLink[] {
    const areas = index?.byAreaCockpit ? Array.from(index.byAreaCockpit.entries()) : [];
    return areas.slice(0, limit).map(([aId, aCockpit]) => ({
        direction: 'descer' as const,
        filePath: aCockpit.path,
        label: `Área ${aId}`,
        nodeId: railNodeIdFor(aCockpit.path),
        role: 'area-cockpit' as const,
        reason: `Cockpit da área "${aId}" registrado no índice.`,
    }));
}

export function planTaskProjectReturn(index: MissionCanvasIndex | null | undefined, canvasPath: string, taskProject?: string): FractalHeaderLink | null {
    if (!taskProject) return null;
    const proj = (index?.entries ?? []).find(e => Boolean(e?.project && e.project === taskProject && e.path !== canvasPath));
    if (!proj?.path) return null;
    return {
        direction: 'retorno' as const,
        filePath: proj.path,
        label: `Retornar ao Projeto ${taskProject}`,
        nodeId: railNodeIdFor(proj.path),
        role: 'projeto-da-area' as const,
        reason: `Projeto pai "${taskProject}" da tarefa.`,
    };
}
