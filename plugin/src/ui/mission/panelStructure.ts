/**
 * Painel de estrutura — projetos, áreas, árvores de progressão e mapas.
 *
 * Esta é a camada onde a interface antiga mais falhava: projetos, áreas e
 * canvas viviam em abas separadas, então ninguém via que a árvore de progressão
 * de um projeto e o número de tarefas dele são o mesmo objeto de trabalho. Aqui
 * eles ficam lado a lado, alimentados pelo mesmo snapshot.
 *
 * O canvas de uma área também não é mais derivado aqui: `renderAreas` pergunta ao
 * `missionCanvasIndex` quantos desenhos a árvore dela tem e qual é o cockpit.
 * `area.canvas` continua no motor e na projeção, mas era uma segunda cópia da
 * mesma convenção — e a cópia que não conhece o cockpit.
 */
import { actionButton, applyTone, card, el, icon, pill, emptyState, rowLink, stackedBar } from './primitives';
import { MissionPanelContext, openVaultPath, truncate } from './context';
import { MissionArea, MissionCanvas, MissionProject, MissionTree } from '../../engine/missionControl';
import { areaCockpitOf, canvasIndexOf, canvasesOfArea, MissionCanvasIndex } from '../../engine/missionCanvasIndex';
import { healthToken, tierToken } from './tokens';
import { missionProjectGrammar } from '../../board/boardModel';

export function renderProjects(host: HTMLElement, ctx: MissionPanelContext): void {
    const { projects } = ctx.snapshot;
    const focus = projects.filter(project => project.inFocus);
    const active = projects.filter(project => !project.inFocus && project.pending > 0);
    // O título declara o recorte: este painel agrega por TAREFA (foco da semana,
    // trabalho aberto, bloqueio). O ciclo de vida da PASTA — coluna, nota-índice,
    // árvore — vive no quadro de projetos, e os dois aparecem lado a lado.
    const node = card(host, {
        title: 'Projetos por tarefa',
        icon: 'folder-kanban',
        tone: 'blue',
        subtitle: `${focus.length} em foco nesta semana · ${active.length} com trabalho aberto`,
        badge: `${projects.length}`,
        wide: true,
    });

    // O antigo botão "Validar projetos" morava aqui e só emitia uma `Notice`
    // mandando rodar no terminal. A validação de verdade vive na aba Projetos,
    // junto da lista do que ela reprova — um botão por painel, e o botão executa.
    if (projects.length === 0) {
        emptyState(node.body, 'Nenhum projeto derivado: sem foco declarado na semana e sem tarefa com projeto vinculado.', 'folder-open');
        return;
    }

    if (focus.length > 0) {
        el(node.body, 'h4', 'mc-subhead', 'Foco da semana');
        for (const project of focus) projectBlock(node.body, project, ctx);
    }

    if (active.length > 0) {
        el(node.body, 'h4', 'mc-subhead', 'Outros com trabalho aberto');
        for (const project of active.slice(0, 12)) projectBlock(node.body, project, ctx);
    }

    const blocked = projects.filter(project => project.blocked > 0);
    if (blocked.length > 0) {
        el(node.body, 'h4', 'mc-subhead', `Com bloqueio · ${blocked.length}`);
        const strip = el(node.body, 'div', 'mc-chipstrip');
        for (const project of blocked) {
            const chip = rowLink(strip, { classes: ['mc-chip'], onClick: () => void ctx.openLink(project.name) });
            pill(chip, `${project.name} · ${project.blocked}`, 'red', 'octagon-alert');
        }
    }
}

function projectBlock(parent: HTMLElement, project: MissionProject, ctx: MissionPanelContext): void {
    const token = healthToken(project.health);
    const block = rowLink(parent, { classes: ['mc-project-block'], onClick: () => void ctx.openLink(project.name) });
    const head = el(block, 'div', 'mc-project-head');
    el(head, 'span', 'mc-project-name', project.name);
    pill(head, token.label, token.tone, token.icon);

    // A forma de mostrar do projeto, pela função única (`engine/showGrammar.ts`), no
    // horizonte do projeto no trimestre, como a aba Projetos: contagens, sem porcentagem.
    // O "faltam" e o "algum dia" da linha substituem o antigo "N pendente(s)".
    el(block, 'div', 'mc-project-count', missionProjectGrammar(project, ctx.snapshot.quarter, 'sem tarefa — ausência de dado').text);

    const meta = el(block, 'div', 'mc-task-meta');
    if (project.doing > 0) el(meta, 'span', 'mc-task-week', `${project.doing} em execução`);
    if (project.blocked > 0) el(meta, 'span', 'mc-task-due is-overdue', `${project.blocked} bloqueada(s)`);
}

export function renderAreas(host: HTMLElement, ctx: MissionPanelContext): void {
    const { areas } = ctx.snapshot;
    const node = card(host, {
        title: 'Áreas e ciclo de vida',
        icon: 'layers',
        tone: 'purple',
        subtitle: 'Backlog → Active → Waiting → Review → Done → Integration',
    });

    if (areas.length === 0) {
        emptyState(node.body, 'Nenhuma área encontrada em 100 - AREAS.', 'layers');
        return;
    }

    // Um índice por renderização: `canvasIndexOf` é memoizado pelo snapshot, então
    // as quatro áreas leem o mesmo índice em vez de varrer os canvas quatro vezes.
    const index = canvasIndexOf(ctx.snapshot);
    for (const area of areas) areaRow(node.body, area, ctx, index);
}

function areaRow(parent: HTMLElement, area: MissionArea, ctx: MissionPanelContext, index: MissionCanvasIndex): void {
    const block = el(parent, 'div', 'mc-area');
    const head = el(block, 'div', 'mc-area-head');
    el(head, 'span', 'mc-area-name', area.name);
    // `initiatives` e `departments` já estavam aqui; o canvas entra como o dado
    // novo. A contagem é da ÁRVORE, não da pasta do topo: uma área tem 24, 12, 11
    // ou 3 desenhos, e mostrar só o cockpit esconderia os outros. O texto vai no
    // mesmo nó de contagem de propósito — a classe `mc-area-counts` já existe, e
    // um `<span>` a mais aqui seria classe nova para o mesmo tratamento visual.
    const canvases = canvasesOfArea(index, area.id);
    const cockpit = areaCockpitOf(index, area.id);
    // Uma ausência só, e a mais informativa das duas: sem canvas na árvore já
    // implica não ter cockpit, e dizer as duas coisas na mesma linha seria
    // repetir a mesma falta em duas frases.
    const canvasFacts = canvases.length === 0
        ? 'sem canvas na árvore'
        : `${canvases.length} canvas na árvore${cockpit ? '' : ' · sem cockpit'}`;
    el(head, 'span', 'mc-area-counts',
        `${area.initiatives} iniciativas · ${area.departments} departamentos · ${canvasFacts}`);

    if (cockpit) {
        // O cockpit é o mapa do topo da área; o rótulo "Mapa" continua o mesmo da
        // tela antiga, mas o caminho agora vem do modelo, que também reconhece o
        // cockpit quando a pasta tem prefixo numérico.
        actionButton(head, {
            label: 'Mapa',
            icon: 'share-2',
            tone: 'purple',
            onClick: () => void openVaultPath(ctx.app, cockpit.path),
            title: cockpit.path,
        });
    }
    // Sem cockpit nenhum botão aparece: botão desabilitado seria uma ação
    // desenhada que não existe, e a ausência já está dita na contagem acima.

    stackedBar(block, area.staged.map(stage => ({
        value: stage.count,
        tone: stageTone(stage.stage),
        label: stage.stage,
    })));
    const meta = el(block, 'div', 'mc-task-meta');
    for (const stage of area.staged) {
        if (stage.count === 0) continue;
        el(meta, 'span', 'mc-task-week', `${stage.stage}: ${stage.count}`);
    }
}

function stageTone(stage: string): 'green' | 'cyan' | 'orange' | 'yellow' | 'purple' | 'muted' {
    switch (stage) {
        case 'Active': return 'orange';
        case 'Waiting': return 'yellow';
        case 'Review': return 'purple';
        case 'Done': return 'green';
        case 'Integration': return 'cyan';
        case 'Backlog': return 'muted';
        default: return 'muted';
    }
}

export function renderTrees(host: HTMLElement, ctx: MissionPanelContext): void {
    const { trees } = ctx.snapshot;
    const node = card(host, {
        title: 'Árvores de progressão',
        icon: 'git-branch',
        tone: 'green',
        subtitle: 'estado real dos níveis, avaliado pela árvore do projeto',
        badge: `${trees.length}`,
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    actionButton(head, {
        label: 'Reavaliar todas',
        icon: 'refresh-ccw',
        tone: 'green',
        onClick: () => ctx.executeCommand('dfm-arvore-reavaliar-todas'),
    });

    if (trees.length === 0) {
        emptyState(node.body, 'Nenhuma árvore de progressão encontrada.', 'git-branch');
        return;
    }

    for (const tree of trees) treeRow(node.body, tree, ctx);
}

function treeRow(parent: HTMLElement, tree: MissionTree, ctx: MissionPanelContext): void {
    const block = rowLink(parent, { classes: ['mc-tree'], onClick: () => void ctx.openPath(tree.file) });
    const head = el(block, 'div', 'mc-tree-head');
    el(head, 'span', 'mc-project-name', truncate(tree.project || tree.file.split('/').pop()?.replace(/\.md$/, '') || '?', 60));
    el(head, 'span', 'mc-project-count', `${tree.done}/${tree.total}`);

    const track = el(block, 'div', 'mc-tier-track');
    for (const tier of tree.tiers) {
        const token = tierToken(tier.status);
        const cell = applyTone(el(track, 'span', 'mc-tier-cell'), token.tone);
        cell.setAttribute('title', `${tier.prefixo || 'N'}${tier.num} — ${tier.nome} (${token.label})`);
        if (tier.status === 'ativo') cell.addClass('is-active');
    }

    if (tree.active) {
        const active = el(block, 'div', 'mc-tree-active');
        icon(active, 'circle-dot', 'mc-tree-active-icon');
        el(active, 'span', 'mc-tree-active-text', `${tree.active.prefixo || 'N'}${tree.active.num} — ${tree.active.nome}`);
        if (tree.active.objetivo) el(active, 'span', 'mc-tree-active-goal', truncate(tree.active.objetivo, 120));
    } else if (tree.total > 0 && tree.done === tree.total) {
        el(block, 'div', 'mc-tree-active', 'Árvore completa.');
    }
}

export function renderCanvases(host: HTMLElement, ctx: MissionPanelContext): void {
    const { canvases } = ctx.snapshot;
    const system = canvases.filter(canvas => canvas.system);
    const node = card(host, {
        title: 'Mapas (.canvas)',
        icon: 'share-2',
        tone: 'cyan',
        subtitle: `${canvases.length} mapas no vault · ${system.length} de sistema`,
        badge: `${canvases.length}`,
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    actionButton(head, {
        label: 'Formatar canvas ativo',
        icon: 'wand-2',
        tone: 'cyan',
        onClick: () => ctx.executeCommand('dfm-format-active-canvas-tasks'),
        title: 'Formata os TaskNotes do canvas ativo (mesma rotina do plugin).',
    });

    if (canvases.length === 0) {
        emptyState(node.body, 'Nenhum arquivo .canvas no vault.', 'share-2');
        return;
    }

    if (system.length > 0) {
        el(node.body, 'h4', 'mc-subhead', 'Mapas de sistema');
        for (const canvas of system) canvasRow(node.body, canvas, ctx);
    }

    el(node.body, 'h4', 'mc-subhead', 'Recentes');
    for (const canvas of canvases.filter(candidate => !candidate.system).slice(0, 12)) canvasRow(node.body, canvas, ctx);

    const empty = canvases.filter(canvas => canvas.nodes === null).length;
    if (empty > 0) {
        el(node.body, 'p', 'mc-hint', `${empty} mapa(s) sem contagem de nós (acima do teto de leitura ou JSON ilegível) — não inventamos número.`);
    }
}

function canvasRow(parent: HTMLElement, canvas: MissionCanvas, ctx: MissionPanelContext): void {
    const row = rowLink(parent, { classes: ['mc-canvas'], onClick: () => void openVaultPath(ctx.app, canvas.path), title: canvas.path });
    icon(row, 'share-2', 'mc-row-icon');
    const body = el(row, 'div', 'mc-task-body');
    el(body, 'span', 'mc-task-title', canvas.name);
    const meta = el(body, 'div', 'mc-task-meta');
    el(meta, 'span', 'mc-task-project', truncate(canvas.folder || '/', 48));
    if (canvas.nodes !== null) el(meta, 'span', 'mc-task-week', `${canvas.nodes} nós · ${canvas.edges} arestas`);
    else el(meta, 'span', 'mc-task-week', 'sem contagem');
    el(meta, 'span', 'mc-task-due', new Date(canvas.mtime).toLocaleDateString('pt-BR'));
}
