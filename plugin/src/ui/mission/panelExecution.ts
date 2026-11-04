/**
 * Painel de execução — "A escolha" (as tarefas por executabilidade) e "Esperando
 * terceiros" (página Análise). A pressão de prazo e a inbox saíram em 03/11/2026 com o código
 * aposentado: o centro do dia, os sinais e a triagem da Missão fazem o papel delas. O cartão se chamava Funil de execução até 29/10/2026:
 * fora do painel, o funil nomeia outra peça, de sentido oposto.
 *
 * O funil fecha: aberto + terminal = total lido. Cada bucket mostra a razão de
 * existir (o que significa aquele status) e as tarefas ordenadas como o motor
 * as ordena — vencidas primeiro, depois hoje, depois por impacto. Nenhuma lista
 * é reordenada na UI, senão a tela e o motor discordariam.
 */
import { actionButton, applyTone, card, el, icon, pill, emptyState, rowLink, stackedBar, metric } from './primitives';
import { MissionPanelContext, truncate } from './context';
import { MissionTask, MissionBucketSpec } from '../../engine/missionControl';
import { impactTone, priorityToken, statusToken } from './tokens';

export function renderFunnel(host: HTMLElement, ctx: MissionPanelContext): void {
    const { board } = ctx.snapshot;
    const node = card(host, {
        title: 'A escolha',
        icon: 'filter',
        tone: 'orange',
        subtitle: 'TaskNotes/Tasks, agrupado por executabilidade',
        badge: `${board.totals.open} abertas`,
        wide: true,
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    // O botão "Matriz DFM" (a vista matriz-dfm.base) saiu com a Matriz DFM de Ação (aposentadoria, fase 2, 02/11/2026).
    actionButton(head, {
        label: 'Atualizar',
        icon: 'refresh-cw',
        tone: 'accent',
        onClick: () => void ctx.refresh(true),
    });

    if (board.totals.open + board.totals.terminal === 0) {
        emptyState(node.body, 'Nenhuma tarefa lida em TaskNotes/Tasks. O vault pode ainda não ter tarefas ativas — não há falha aqui.', 'inbox');
        return;
    }

    // O rótulo da fatia carrega o bucket inteiro: clicar abre a lista completa,
    // não só as seis primeiras linhas que cabem no painel.
    const byLabel = new Map<string, MissionBucketSpec & { tasks: MissionTask[] }>(
        board.buckets.map(bucket => [bucket.label, bucket]),
    );
    stackedBar(node.body, board.buckets.map(bucket => ({
        value: bucket.tasks.length,
        tone: statusToken(bucket.statuses[0]).tone,
        label: bucket.label,
    })), {
        onPick: label => {
            const bucket = byLabel.get(label);
            if (bucket) void ctx.focusTasks(bucket.statuses, bucket.label);
        },
    });

    const tiles = el(node.body, 'div', 'mc-tiles');
    metric(tiles, { label: 'Abertas', value: board.totals.open, tone: 'orange', icon: 'circle-dashed', ...(board.totals.someday ? { hint: `+${board.totals.someday} algum dia` } : {}) });
    metric(tiles, { label: 'Fechadas', value: board.totals.terminal, tone: 'green', icon: 'check-check', hint: 'histórico terminal' });
    metric(tiles, { label: 'Vencidas', value: board.totals.overdue, tone: board.totals.overdue > 0 ? 'red' : 'muted', icon: 'alarm-clock' });
    metric(tiles, { label: 'Vencem hoje', value: board.totals.dueToday, tone: board.totals.dueToday > 0 ? 'yellow' : 'muted', icon: 'sun' });
    metric(tiles, { label: 'Alto impacto', value: board.totals.highImpact, tone: 'purple', icon: 'gem', hint: 'impacto ≥ 7' });
    metric(tiles, { label: 'Sem projeto', value: board.totals.withoutProject, tone: board.totals.withoutProject > 0 ? 'yellow' : 'muted', icon: 'unlink' });

    for (const bucket of board.buckets) {
        const token = statusToken(bucket.statuses[0]);
        const block = el(node.body, 'div', 'mc-bucket');
        const blockHead = el(block, 'div', 'mc-bucket-head');
        pill(blockHead, bucket.label, token.tone, bucket.icon);
        el(blockHead, 'span', 'mc-bucket-count', String(bucket.tasks.length));
        el(blockHead, 'span', 'mc-bucket-hint', bucket.hint);

        if (bucket.tasks.length === 0) {
            el(block, 'p', 'mc-hint', 'vazio');
            continue;
        }
        for (const task of bucket.tasks.slice(0, 6)) taskRow(block, task, ctx);
        if (bucket.tasks.length > 6) {
            const more = rowLink(block, {
                classes: ['mc-more'],
                onClick: () => void ctx.focusTasks(bucket.statuses, bucket.label),
            });
            el(more, 'span', 'mc-row-title', `+ ${bucket.tasks.length - 6} em ${bucket.label}`);
        }
    }
}

function taskRow(parent: HTMLElement, task: MissionTask, ctx: MissionPanelContext): void {
    const classes = ['mc-task'];
    if (task.overdue) classes.push('is-overdue');
    else if (task.dueToday) classes.push('is-today');
    const row = rowLink(parent, { classes, onClick: () => void ctx.openPath(task.path), title: task.path });

    const token = statusToken(task.status);
    applyTone(el(row, 'span', 'mc-task-dot'), token.tone).setAttribute('title', token.label);

    const body = el(row, 'div', 'mc-task-body');
    el(body, 'span', 'mc-task-title', task.title);
    const meta = el(body, 'div', 'mc-task-meta');
    if (task.due) {
        const due = el(meta, 'span', 'mc-task-due', task.due);
        if (task.overdue) due.addClass('is-overdue');
        else if (task.dueToday) due.addClass('is-today');
    }
    for (const project of task.projects.slice(0, 2)) el(meta, 'span', 'mc-task-project', project);
    if (task.week) el(meta, 'span', 'mc-task-week', task.week);

    if (task.impact !== null) {
        const impact = applyTone(el(row, 'span', 'mc-task-impact'), impactTone(task.impact));
        impact.setText(String(task.impact));
        impact.setAttribute('title', `Impacto estratégico ${task.impact}/10`);
    }
    const priority = priorityToken(task.priority);
    if (priority.tone !== 'muted') {
        const badge = applyTone(el(row, 'span', 'mc-task-priority'), priority.tone);
        icon(badge, priority.icon, 'mc-task-priority-icon');
        badge.setAttribute('title', `Prioridade ${priority.label}`);
    }
}

/**
 * Esperando terceiros — o que está parado por dependência, não por preguiça.
 *
 * Esta é a integração do painel "🚧 Gargalos & Bloqueios" do Control Center
 * antigo, com duas correções de fundo:
 *
 * 1. **A população mudou.** O painel velho filtrava só por `blockedBy` — campo
 *    que **nenhuma das 74 tarefas do vault preenche**, então ele nascia vazio
 *    todos os dias. O que existe de verdade são as tarefas `waiting-on`, que
 *    dependem de terceiro sem terem sido escritas como bloqueio formal. Aqui as
 *    duas aparecem: quem declarou `blockedBy` mostra **quem** bloqueia; quem só
 *    está em `waiting-on` aparece como espera sem bloqueador nomeado.
 * 2. **Nada é resolvido por escrita crua.** O botão "✅ Resolver" do painel
 *    velho trocava `status:` no texto do arquivo, fora da API do TaskNotes —
 *    sem evento, sem `completedDate`, sem evidência. Aqui a ação abre o
 *    protocolo de desbloqueio (interativo, com as perguntas que o operador
 *    escreveu). Concluir continua sendo ato do TaskNotes, com evidência, pelo
 *    caminho de sempre.
 *
 * **Lacuna declarada, não disfarçada:** o vault não registra a data do último
 * contato com quem segura a tarefa. O painel não inventa "tempo de espera".
 */
export function renderWaiting(host: HTMLElement, ctx: MissionPanelContext): void {
    const waiting = ctx.snapshot.board.buckets
        .filter(bucket => bucket.id === 'blocked')
        .flatMap(bucket => bucket.tasks);
    const withBlocker = waiting.filter(task => task.blockedBy.length > 0);

    const node = card(host, {
        title: 'Esperando terceiros',
        icon: 'hourglass',
        tone: 'red',
        subtitle: 'depende de outra pessoa ou de outra peça',
        badge: waiting.length ? `${waiting.length}` : 'nada parado',
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    // O protocolo do papel `desbloquear`; sem ele no cofre, o botão não aparece (D1 do mapa da v0).
    const desbloqueio = ctx.plugin?.manager?.idDoPapel?.('desbloquear') ?? null;
    if (desbloqueio) actionButton(head, {
        label: 'Protocolo de desbloqueio',
        icon: 'unlock',
        tone: 'red',
        onClick: () => void ctx.runProtocol(desbloqueio),
        title: 'Abre o ritual interativo para destravar o que está parado.',
    });

    if (waiting.length === 0) {
        emptyState(node.body, 'Nenhuma tarefa aguardando terceiro.', 'check-check');
        return;
    }

    if (withBlocker.length > 0) {
        el(node.body, 'h4', 'mc-subhead', `Com bloqueador nomeado · ${withBlocker.length}`);
        for (const task of withBlocker.slice(0, 8)) blockerRow(node.body, task, ctx);
    }

    const unnamed = waiting.filter(task => task.blockedBy.length === 0);
    if (unnamed.length > 0) {
        el(node.body, 'h4', 'mc-subhead', `Sem bloqueador nomeado · ${unnamed.length}`);
        for (const task of unnamed.slice(0, 8)) taskRow(node.body, task, ctx);
        el(node.body, 'p', 'mc-hint',
            'Estas estão em `waiting-on` sem `blockedBy`. Nomear o bloqueador é o que permite cobrar a pessoa certa — e o que a matriz usa para tirar da mesa o que não dá para fazer agora.');
    }

    el(node.body, 'p', 'mc-hint',
        'O vault não registra a data do último contato; por isso não há "tempo de espera" aqui — só o estado declarado.');
}

/** Linha de tarefa bloqueada, com o nome de quem bloqueia. */
function blockerRow(parent: HTMLElement, task: MissionTask, ctx: MissionPanelContext): void {
    const row = el(parent, 'div', 'mc-blocker');
    const head = el(row, 'div', 'mc-blocker-head');
    icon(head, 'octagon-alert', 'mc-blocker-icon');
    const title = el(head, 'a', 'mc-blocker-title', truncate(task.title, 60));
    title.setAttribute('href', '#');
    title.addEventListener('click', event => {
        event.preventDefault();
        void ctx.openPath(task.path);
    });

    const blockers = el(row, 'div', 'mc-blocker-list');
    for (const blocker of task.blockedBy) {
        const link = el(blockers, 'a', 'mc-blocker-link', `↳ ${blocker}`);
        link.setAttribute('href', '#');
        link.setAttribute('title', `Abrir ${blocker}`);
        link.addEventListener('click', event => {
            event.preventDefault();
            void ctx.openLink(blocker);
        });
    }
}
