/**
 * Kanban de tarefas — as 5 colunas de status aberto do TaskNotes, com arrasto.
 *
 * Quatro decisões sustentam este painel, e todas vêm de código que já existe:
 *
 * 1. **O gesto é de PONTEIRO, não o drag-and-drop nativo do HTML.** Dentro do
 *    Obsidian o drag nativo briga com o arrasto de nós e de pastas do próprio
 *    aplicativo, e o gesto acaba roubado pelo canvas — precedente declarado em
 *    `dragdrop.ts` e `mapViewport.ts`. A geometria das lanes é lida uma vez, no
 *    `pointerdown`, e vale para o gesto inteiro.
 * 2. **A escrita não mora aqui.** O painel monta `{ path, status }` e chama
 *    `dshOperatorBridge.dispatch('/v1/tasks/update', …)` — o caminho sancionado,
 *    que valida (`validateTaskUpdate`), confere o catálogo do TaskNotes e audita.
 *    Se a rota também publica evento de TaskNotes, isso não foi medido aqui, e
 *    por isso não é afirmado. Nenhum frontmatter é tocado à mão.
 * 3. **A UI é otimista.** O cartão muda de coluna no gesto; se a escrita falhar,
 *    ele volta para a coluna de origem e a tela mostra a mensagem REAL do erro —
 *    nunca uma causa suposta.
 * 4. **A fonte é o snapshot.** As tarefas vêm dos buckets que o console já leu.
 *    O painel não faz segunda leitura do vault, então dois painéis não discordam
 *    sobre a mesma tarefa na mesma renderização.
 *
 * O CSS não mora aqui: este painel veste classes `mc-kanban-*` e os atributos de
 * estado (`data-dragging`, `data-over`, `data-status`), e o dono da folha de
 * estilo é quem pinta.
 */
import { applyTone, card, el, emptyState, pill } from './primitives';
import type { MissionPanelContext } from './context';
import { statusToken } from './tokens';
import {
    KANBAN_STATUSES,
    KanbanCard,
    KanbanColumnRect,
    KanbanStatus,
    buildKanbanBoard,
    columnIndexAtPoint,
    isKanbanStatus,
    planKanbanDrop,
} from '../../engine/missionKanban';
import type { MissionTask } from '../../engine/missionControl';

/**
 * Limiar de deslocamento antes de o gesto virar arrasto, em px.
 *
 * Mesmo número de `DRAG_THRESHOLD` em `dragdrop.ts`: o gesto é o mesmo em toda a
 * janela. A constante é local de propósito — aquele módulo tem dono, e importar
 * a constante de lá acoplaria este painel a um arquivo que não é meu.
 */
const KANBAN_DRAG_THRESHOLD = 4;

/** Tempo do aviso de falha. Longo o bastante para a mensagem real ser lida. */
const KANBAN_ERROR_NOTICE_MS = 8000;

export function renderKanban(host: HTMLElement, ctx: MissionPanelContext): void {
    // Uma fonte só: o snapshot que o console já leu (`buildTaskBoard` já mandou
    // status desconhecido para o balde `inbox` e já deixou estado final de fora).
    const tasks: MissionTask[] = ctx.snapshot.board.buckets.flatMap(bucket => bucket.tasks);

    const node = card(host, {
        title: 'Kanban de tarefas',
        icon: 'folder-kanban',
        tone: 'purple',
        wide: true,
        badge: `${tasks.length} abertas`,
        subtitle: 'arraste o cartão entre as 5 colunas de status — a escrita passa pela ponte do DFM',
    });

    const boardEl = el(node.body, 'div', 'mc-kanban');
    const footNote = el(node.body, 'p', 'mc-hint');

    /**
     * Movimentos já mostrados na tela e ainda não reconciliados pelo snapshot.
     *
     * O snapshot é imutável para o painel: a sobreposição vive aqui e vira uma
     * cópia da tarefa com o status novo. Quando a view se redesenha a partir do
     * snapshot atualizado, este mapa morre junto — é o que reconcilia a tela com
     * a verdade do vault sem nenhum cache paralelo.
     */
    const overrides = new Map<string, KanbanStatus>();
    /** Última falha de escrita por caminho: a mensagem real do erro, sem paráfrase. */
    const errors = new Map<string, string>();

    /** Lanes na ordem canônica: `lanes[i]` é a coluna `KANBAN_STATUSES[i]`. */
    let lanes: HTMLElement[] = [];

    /* ----------------------------------------------------------------------
       Gesto
       ---------------------------------------------------------------------- */
    let gesturePointer: number | null = null;
    let gestureTask: MissionTask | null = null;
    let gestureEl: HTMLElement | null = null;
    /** `true` no clique que fecha um arrasto: ele não abre a nota. */
    let suppressClick = false;
    let dragging = false;
    let travel = 0;
    let previous = { x: 0, y: 0 };
    let overIndex: number | null = null;
    let rects: KanbanColumnRect[] = [];

    const paintGesture = (): void => {
        for (let i = 0; i < lanes.length; i++) {
            if (dragging && i === overIndex) lanes[i].setAttribute('data-over', 'true');
            else lanes[i].removeAttribute('data-over');
        }
        if (gestureEl) {
            if (dragging) gestureEl.setAttribute('data-dragging', 'true');
            else gestureEl.removeAttribute('data-dragging');
        }
    };

    const endGesture = (): void => {
        if (gesturePointer !== null && typeof boardEl.releasePointerCapture === 'function') {
            try { boardEl.releasePointerCapture(gesturePointer); } catch (_) { /* já liberado */ }
        }
        gesturePointer = null;
        gestureTask = null;
        gestureEl = null;
        dragging = false;
        travel = 0;
        overIndex = null;
        paintGesture();
    };

    const beginGesture = (event: PointerEvent, entry: KanbanCard, root: HTMLElement): void => {
        if (event.button !== 0 || gesturePointer !== null) return;
        event.stopPropagation();
        suppressClick = false;
        gesturePointer = event.pointerId;
        gestureTask = entry.task;
        gestureEl = root;
        dragging = false;
        travel = 0;
        overIndex = null;
        previous = { x: event.clientX, y: event.clientY };
        // Geometria congelada no `pointerdown` (mesmo precedente de dragdrop.ts):
        // rolagem no meio do gesto não reposiciona o alvo declarado.
        rects = lanes.map(lane => {
            const rect = lane.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
        });
        if (typeof boardEl.setPointerCapture === 'function') {
            // Sem captura restam os listeners no próprio quadro: o gesto piora, não some.
            try { boardEl.setPointerCapture(event.pointerId); } catch (_) { /* sem captura */ }
        }
    };

    const onPointerMove = (event: PointerEvent): void => {
        if (gesturePointer === null || event.pointerId !== gesturePointer) return;
        travel += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
        previous = { x: event.clientX, y: event.clientY };
        // Até o limiar o gesto ainda pode ser um clique: nenhum estado visual.
        if (!dragging) {
            if (travel <= KANBAN_DRAG_THRESHOLD) return;
            dragging = true;
        }
        const index = columnIndexAtPoint(rects, event.clientX);
        if (index === overIndex) return;
        overIndex = index;
        paintGesture();
    };

    const onPointerUp = (event: PointerEvent): void => {
        if (gesturePointer === null || event.pointerId !== gesturePointer) return;
        const task = gestureTask;
        const wasDragging = dragging;
        const index = wasDragging ? columnIndexAtPoint(rects, event.clientX) : -1;
        // O clique que fecha o arrasto não abre a nota; o próximo `pointerdown` limpa a marca.
        suppressClick = wasDragging;
        endGesture();
        if (!wasDragging || !task || index < 0) return;
        void move(task, KANBAN_STATUSES[index]);
    };

    const onPointerCancel = (event: PointerEvent): void => {
        if (gesturePointer === null || event.pointerId !== gesturePointer) return;
        suppressClick = true; // cancelar aborta: não escreve e não abre a nota
        endGesture();
    };

    const onCardKeyDown = (event: KeyboardEvent, task: MissionTask, laneIndex: number): void => {
        if (!event.altKey) return;
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step === 0) return;
        const target = laneIndex + step;
        if (target < 0 || target >= KANBAN_STATUSES.length) return; // nas pontas não faz nada
        event.preventDefault(); // só quando o evento foi de fato tratado
        void move(task, KANBAN_STATUSES[target]);
    };

    /* ----------------------------------------------------------------------
       O drop: uma escrita sancionada, com reversão
       ---------------------------------------------------------------------- */
    const move = async (task: MissionTask, target: KanbanStatus): Promise<void> => {
        const plan = planKanbanDrop(task, target);
        // Mesma coluna visível — inclusive o cartão sem status solto no acolhimento —
        // não é movimento: não há escrita. O silêncio aqui é contrato.
        if (!plan) return;

        const previousStatus = task.status;
        overrides.set(task.path, target);
        errors.delete(task.path);
        paint();

        try {
            await ctx.plugin.dshOperatorBridge.dispatch(plan.route, plan.body);
            // A view se redesenha a partir do snapshot; até lá a sobreposição sustenta
            // a coluna nova. `true` força a coleta: uma escrita deliberada justifica
            // reler o vault, senão o funil e o quadro discordariam por 15 s.
            void ctx.refresh(true);
        } catch (error) {
            // Reversão: o cartão volta para a coluna de onde saiu…
            if (isKanbanStatus(previousStatus)) overrides.set(task.path, previousStatus);
            else overrides.delete(task.path);
            // …e a falha é dita com a mensagem REAL do erro, nunca com uma causa suposta.
            const message = error instanceof Error ? error.message : String(error ?? 'falha sem mensagem');
            errors.set(task.path, message);
            paint();
            ctx.notice(`⚠️ Não foi possível mover "${task.title}": ${message}`, KANBAN_ERROR_NOTICE_MS);
        }
    };

    /* ----------------------------------------------------------------------
       Desenho
       ---------------------------------------------------------------------- */
    const cardNode = (parent: HTMLElement, entry: KanbanCard, laneIndex: number): void => {
        const task = entry.task;
        const root = el(parent, 'article', `mc-kanban-card${entry.unclassified ? ' is-unclassified' : ''}`);
        root.setAttribute('tabindex', '0');
        root.setAttribute('data-path', task.path);
        root.setAttribute('data-lane', KANBAN_STATUSES[laneIndex]);
        root.setAttribute('title', `${task.title} · ${task.path}`);

        el(root, 'span', 'mc-kanban-title', task.title);

        const meta = el(root, 'div', 'mc-kanban-meta');
        if (task.due) {
            const due = el(meta, 'span', 'mc-kanban-due', task.due);
            if (task.overdue) due.addClass('is-overdue');
            else if (task.dueToday) due.addClass('is-today');
        }
        for (const project of task.projects.slice(0, 2)) el(meta, 'span', 'mc-kanban-project', project);
        if (!task.due && task.projects.length === 0) el(meta, 'span', 'mc-kanban-muted', 'sem prazo e sem projeto');

        if (entry.unclassified) {
            const flag = el(root, 'span', 'mc-kanban-flag', 'sem status reconhecido');
            flag.setAttribute('title', `Status declarado: "${task.status || 'ausente'}". O cartão fica no Inbox — é onde "A escolha" do console também o coloca — e nunca sai do quadro.`);
        }

        const error = errors.get(task.path);
        if (error) el(root, 'p', 'mc-kanban-error', `⚠️ ${error}`);

        root.addEventListener('click', event => {
            event.preventDefault();
            if (suppressClick) {
                suppressClick = false;
                return;
            }
            void ctx.openPath(task.path);
        });
        root.addEventListener('pointerdown', event => beginGesture(event as PointerEvent, entry, root));
        root.addEventListener('keydown', event => onCardKeyDown(event as KeyboardEvent, task, laneIndex));
    };

    const paint = (): void => {
        boardEl.empty();
        lanes = [];

        // A sobreposição vira uma cópia da tarefa com o status novo: o objeto do
        // snapshot não é mutado, porque ele é de todos os painéis.
        const source = overrides.size === 0
            ? tasks
            : tasks.map(task => {
                const status = overrides.get(task.path);
                return status && status !== task.status ? { ...task, status } : task;
            });
        const board = buildKanbanBoard(source);

        const declared = [`${board.total} cartões em ${board.columns.length} colunas`];
        if (board.unclassified > 0) declared.push(`${board.unclassified} sem status reconhecido (no Inbox)`);
        if (board.terminal > 0) declared.push(`${board.terminal} em estado final fora do quadro`);
        if (board.duplicates > 0) declared.push(`${board.duplicates} caminho repetido contado uma vez`);
        footNote.setText(declared.join(' · '));

        if (board.total === 0) {
            emptyState(boardEl, 'Nenhuma tarefa aberta lida em TaskNotes/Tasks — ausência de dado, não falha.', 'inbox');
            return;
        }

        board.columns.forEach((column, index) => {
            const token = statusToken(column.status);
            const lane = applyTone(el(boardEl, 'section', 'mc-kanban-column'), token.tone);
            lane.setAttribute('data-status', column.status);

            const head = el(lane, 'header', 'mc-kanban-column-head');
            pill(head, token.label, token.tone, token.icon);
            el(head, 'span', 'mc-kanban-column-count', String(column.count));
            if (column.unclassified > 0) {
                el(head, 'span', 'mc-kanban-column-note', `${column.unclassified} sem status`);
            }

            const list = el(lane, 'div', 'mc-kanban-cards');
            // Coluna vazia continua na tela: ela é um destino possível do arrasto.
            if (column.cards.length === 0) el(list, 'p', 'mc-hint', 'vazio');
            for (const entry of column.cards) cardNode(list, entry, index);

            lanes.push(lane);
        });
    };

    boardEl.addEventListener('pointermove', onPointerMove);
    boardEl.addEventListener('pointerup', onPointerUp);
    boardEl.addEventListener('pointercancel', onPointerCancel);

    paint();
}
