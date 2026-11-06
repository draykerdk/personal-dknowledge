/**
 * Desenho dos widgets do quadro.
 *
 * Só DOM padrão (`createElement`, `textContent`, `addEventListener`) e só
 * classes — toda aparência mora em `styles.css`, sob `.dfm-bw`. O layout se
 * adapta ao tamanho do nó por container query, então o operador redimensiona o
 * nó do canvas e o widget reorganiza sozinho: não há botão de tamanho.
 */
import type { MissionSnapshot } from '../engine/missionControl';
import type { BoardWidgetSpec } from './boardSpec';
import { BOARD_CATALOG } from './boardSpec';
import {
    FILTER_EMPTY, FILTER_TITLES, habitsModel, healthLabel, matrixModel, numbersModel,
    projectModel, projectsModel, tasksModel,
} from './boardModel';
import type { AtalhoDaMissao, HabitRow, ProjectFactsInput, TaskItem, Tone } from './boardModel';
import { atalhoDaMissao, shortDate } from './boardModel';
import type { QueryResult } from './queryModel';
import type { TaskRecord } from '../tasks/taskRecord';
import { renderProtocolWidget } from './protocolRender';
import { RAMO_DE_PARTIDA } from '../missao/ramoPrincipal';
import type { ProtocolPanelActions } from './protocolRender';

export interface BoardActions {
    /** Abre a nota sem tirar o canvas do lugar. */
    open(path: string, event: MouseEvent): void;
    /** Pré-visualização ao passar o mouse (Ctrl/Cmd + hover no Obsidian). */
    hover?(path: string, event: MouseEvent, target: HTMLElement): void;
    /** Marca a tarefa como feita. Ausente = sem botão de concluir. */
    complete?(path: string): Promise<boolean>;
    /**
     * Um dia de hábito: marca, desmarca, abre o protocolo do guiado ou avisa por
     * que não (futuro, automático). Ausente = hábitos só leitura.
     */
    habit?(path: string, date: string): Promise<void>;
    /** A decisão da revisão vencida do hábito (continuar, integrado, pausar). */
    reviewHabit?(path: string, event: MouseEvent): void;
    /**
     * O "quanto falta" e o canvas de um projeto, pela conta única do gerente do
     * canvas de projeto. Ausente = o widget `projeto` usa a soma do snapshot.
     */
    project?(name: string): ProjectFactsInput | null;
    /** Os gestos da página "Protocolos" (rodar, abrir, fase, objetivo, bancada, mapa). Ausente = só leitura. */
    protocols?: ProtocolPanelActions;
    /**
     * Onde o widget mora (o painel ou o caminho do canvas): os módulos de protocolos
     * guardam o filtro e os ramos abertos por escopo, e um filtra o outro no mesmo lugar.
     */
    scope?: string;
    /** O atalho da Missão (o bloco `tipo: missao`): abre a Missão no estado dele. Ausente = só a frase. */
    abrirMissao?(atalho: AtalhoDaMissao): void;
}

type Doc = Document;

function el<K extends keyof HTMLElementTagNameMap>(doc: Doc, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function tone(node: HTMLElement, value: Tone): void {
    node.setAttribute('data-tone', value);
}

/**
 * Cliques dentro do widget não podem virar seleção/arrasto do nó do canvas.
 * `pointerdown` é o que o canvas escuta para começar o arrasto.
 */
function guard(node: HTMLElement): void {
    node.addEventListener('pointerdown', event => event.stopPropagation());
    node.addEventListener('mousedown', event => event.stopPropagation());
}

function link(doc: Doc, cls: string, text: string, path: string | null, actions: BoardActions): HTMLElement {
    if (!path) return el(doc, 'span', cls, text);
    const a = el(doc, 'a', `${cls} is-link`, text);
    a.setAttribute('href', '#');
    a.setAttribute('title', path);
    guard(a);
    a.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        actions.open(path, event);
    });
    a.addEventListener('mouseover', event => actions.hover?.(path, event, a));
    return a;
}

function head(root: HTMLElement, title: string, sub?: string): void {
    const doc = root.ownerDocument;
    const header = el(doc, 'header', 'dfm-bw-head');
    header.appendChild(el(doc, 'span', 'dfm-bw-title', title));
    if (sub) header.appendChild(el(doc, 'span', 'dfm-bw-sub', sub));
    root.appendChild(header);
}

function empty(parent: HTMLElement, text: string): void {
    parent.appendChild(el(parent.ownerDocument, 'div', 'dfm-bw-empty', text));
}

function more(parent: HTMLElement, count: number, noun = 'mais'): void {
    if (count > 0) parent.appendChild(el(parent.ownerDocument, 'div', 'dfm-bw-more', `+ ${count} ${noun}`));
}

function taskRow(parent: HTMLElement, item: TaskItem, actions: BoardActions): void {
    const doc = parent.ownerDocument;
    const row = el(doc, 'div', 'dfm-bw-task');
    tone(row, item.tone);

    if (actions.complete) {
        const check = el(doc, 'button', 'dfm-bw-check');
        check.type = 'button';
        check.setAttribute('aria-label', `Concluir: ${item.title}`);
        check.setAttribute('title', 'Concluir');
        guard(check);
        check.addEventListener('click', async event => {
            event.stopPropagation();
            row.classList.add('is-completing');
            const ok = await actions.complete!(item.path);
            if (!ok) row.classList.remove('is-completing');
        });
        row.appendChild(check);
    } else {
        row.appendChild(el(doc, 'span', 'dfm-bw-dot'));
    }

    const main = el(doc, 'div', 'dfm-bw-task-main');
    main.appendChild(link(doc, 'dfm-bw-task-title', item.title, item.path, actions));
    if (item.meta) main.appendChild(el(doc, 'div', 'dfm-bw-meta', item.meta));
    row.appendChild(main);

    if (item.badge) {
        const badge = el(doc, 'span', 'dfm-bw-badge', item.badge.text);
        tone(badge, item.badge.tone);
        row.appendChild(badge);
    }
    parent.appendChild(row);
}

function taskList(parent: HTMLElement, items: TaskItem[], actions: BoardActions, emptyText: string): void {
    const list = el(parent.ownerDocument, 'div', 'dfm-bw-list');
    if (items.length === 0) empty(list, emptyText);
    for (const item of items) taskRow(list, item, actions);
    parent.appendChild(list);
}

/* ------------------------------------------------------------- widgets */

function renderNumeros(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot): void {
    const doc = root.ownerDocument;
    if (spec.titulo) head(root, spec.titulo);
    const grid = el(doc, 'div', 'dfm-bw-stats');
    for (const stat of numbersModel(s)) {
        const tile = el(doc, 'div', 'dfm-bw-stat');
        tone(tile, stat.tone);
        tile.appendChild(el(doc, 'div', 'dfm-bw-stat-value', stat.value));
        tile.appendChild(el(doc, 'div', 'dfm-bw-stat-label', stat.label));
        if (stat.sub) tile.appendChild(el(doc, 'div', 'dfm-bw-stat-sub', stat.sub));
        if (stat.hint) tile.setAttribute('title', stat.hint);
        grid.appendChild(tile);
    }
    root.appendChild(grid);
}

function renderMatriz(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot, actions: BoardActions): void {
    const doc = root.ownerDocument;
    const model = matrixModel(s, spec.limite);
    head(root, spec.titulo ?? 'Matriz', 'urgência × impacto');
    const grid = el(doc, 'div', 'dfm-bw-matrix');
    for (const q of model.quadrants) {
        const cell = el(doc, 'div', 'dfm-bw-quad');
        tone(cell, q.tone);
        const top = el(doc, 'div', 'dfm-bw-quad-head');
        top.appendChild(el(doc, 'span', 'dfm-bw-quad-label', q.label));
        top.appendChild(el(doc, 'span', 'dfm-bw-quad-count', String(q.count)));
        cell.appendChild(top);
        if (q.hint) cell.appendChild(el(doc, 'div', 'dfm-bw-quad-hint', q.hint));
        const items = el(doc, 'div', 'dfm-bw-quad-items');
        for (const item of q.items) items.appendChild(link(doc, 'dfm-bw-quad-item', item.title, item.path, actions));
        more(items, q.count - q.items.length);
        cell.appendChild(items);
        grid.appendChild(cell);
    }
    root.appendChild(grid);
    if (model.unclassified > 0) {
        root.appendChild(el(doc, 'div', 'dfm-bw-foot', `${model.unclassified} na mesa sem impacto declarado`));
    }
}

function renderProjeto(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot, actions: BoardActions): void {
    const doc = root.ownerDocument;
    const model = projectModel(s, spec.projeto ?? '', spec.limite, actions.project?.(spec.projeto ?? '') ?? null);
    const header = el(doc, 'header', 'dfm-bw-head');
    // O título leva ao canvas do projeto quando ele existe; senão, à nota-índice.
    header.appendChild(link(doc, 'dfm-bw-title', spec.titulo ?? model.name, model.canvasPath ?? model.indexPath, actions));
    const tags = [model.stage, model.area].filter(Boolean).join(' · ');
    if (tags) header.appendChild(el(doc, 'span', 'dfm-bw-sub', tags));
    root.appendChild(header);

    if (!model.found) {
        empty(root, `Nenhum projeto chamado "${model.name}" foi encontrado no vault.`);
        return;
    }

    // A forma de mostrar do projeto (a função única): contagens, sem porcentagem nem barra.
    const summary = el(doc, 'div', 'dfm-bw-progress');
    const numbers = el(doc, 'div', 'dfm-bw-progress-line');
    numbers.appendChild(el(doc, 'span', 'dfm-bw-meta',
        [model.progressText, model.total > 0 && model.health !== 'no-data' ? healthLabel(model.health) : ''].filter(Boolean).join(' · ')));
    summary.appendChild(numbers);
    root.appendChild(summary);

    taskList(root, model.items, actions, 'Nenhuma tarefa aberta neste projeto.');
    more(root, model.remaining, 'abertas');
}

function renderProjetos(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot, actions: BoardActions): void {
    const doc = root.ownerDocument;
    const model = projectsModel(s, spec.limite);
    head(root, spec.titulo ?? 'Projetos', `${model.rows.length + model.hidden} com trabalho`);
    const list = el(doc, 'div', 'dfm-bw-projects');
    if (model.rows.length === 0) empty(list, 'Nenhum projeto com tarefas ligadas.');
    for (const row of model.rows) {
        const line = el(doc, 'div', 'dfm-bw-project');
        if (row.inFocus) line.classList.add('is-focus');
        const top = el(doc, 'div', 'dfm-bw-project-top');
        const dot = el(doc, 'span', 'dfm-bw-health');
        tone(dot, row.tone);
        dot.setAttribute('title', healthLabel(row.health));
        top.appendChild(dot);
        top.appendChild(link(doc, 'dfm-bw-project-name', row.name, row.indexPath, actions));
        line.appendChild(top);
        // A linha do projeto pela função única, no lugar da barra de porcentagem.
        line.appendChild(el(doc, 'div', 'dfm-bw-meta', row.grammar));
        list.appendChild(line);
    }
    more(list, model.hidden);
    root.appendChild(list);
}

function renderHabitos(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot, actions: BoardActions): void {
    const doc = root.ownerDocument;
    const model = habitsModel(s, spec.limite, spec.dias ?? 14);
    const sub = model.rows.length || model.hidden
        ? `${model.doneToday} ${model.doneToday === 1 ? 'feito' : 'feitos'} hoje`
        : undefined;
    head(root, spec.titulo ?? 'Hábitos', sub);
    const list = el(doc, 'div', 'dfm-bw-habits');
    if (actions.habit) list.classList.add('is-interactive');
    if (model.rows.length === 0) empty(list, model.folder ? `Nenhum hábito ativo em ${model.folder}.` : 'Nenhum hábito ativo.');
    for (const row of model.rows) {
        const line = el(doc, 'div', 'dfm-bw-habit');
        if (row.doneToday) line.classList.add('is-done');
        if (row.pending) line.classList.add('is-pending');

        line.appendChild(habitTodayButton(doc, row, s.today, actions));

        const main = el(doc, 'div', 'dfm-bw-habit-main');
        main.appendChild(link(doc, 'dfm-bw-habit-name', row.title, row.path, actions));
        const meta = el(doc, 'div', 'dfm-bw-habit-meta');
        if (row.priority === 1) line.classList.add('is-priority');
        if (row.pillar) meta.appendChild(el(doc, 'span', 'dfm-bw-habit-pillar', row.pillar));
        if (row.target && row.target > 1) {
            // A semana em contagem (núcleo, 4.4: o hábito conta na semana, sem sequência):
            // `N vezes na semana · meta M`, sem barra nem razão (25/10/2026).
            const goal = el(doc, 'span', 'dfm-bw-habit-goal');
            goal.appendChild(el(doc, 'span', 'dfm-bw-habit-goal-text', habitWeekText(row.week, row.target)));
            if (row.week >= row.target) goal.classList.add('is-met');
            meta.appendChild(goal);
        } else {
            const cadence = row.cadence === 'diária' || row.cadence === 'dias úteis'
                ? row.cadence
                : `${row.cadence} · ${row.week === 0 ? 'nenhuma nesta semana' : `${row.week} nesta semana`}`;
            meta.appendChild(el(doc, 'span', undefined, cadence));
        }
        if (row.tracking === 'automatico') meta.appendChild(el(doc, 'span', undefined, 'registrado pelo DFM'));
        else if (row.tracking === 'protocol') meta.appendChild(el(doc, 'span', undefined, 'guiado'));
        if (row.reviewDue !== null) {
            const review = el(doc, actions.reviewHabit ? 'button' : 'span', 'dfm-bw-habit-review', 'revisar');
            review.setAttribute('title', `Revisão marcada para ${row.reviewDue || 'data passada'}: continuar, integrar ou pausar`);
            if (actions.reviewHabit) {
                (review as HTMLButtonElement).type = 'button';
                guard(review);
                review.addEventListener('click', event => { event.stopPropagation(); actions.reviewHabit!(row.path, event as MouseEvent); });
            }
            meta.appendChild(review);
        }
        main.appendChild(meta);
        line.appendChild(main);

        const cells = el(doc, 'div', 'dfm-bw-habit-cells');
        for (const cell of row.cells) {
            const writable = !!actions.habit && row.tracking !== 'automatico';
            const c = el(doc, writable ? 'button' : 'span', 'dfm-bw-cell');
            if (cell.done) c.classList.add('is-on');
            if (cell.isToday) c.classList.add('is-today');
            c.setAttribute('title', `${cell.date}${cell.done ? ' · registrado' : ''}${writable ? ' — clique para marcar ou desmarcar' : ''}`);
            if (writable) {
                (c as HTMLButtonElement).type = 'button';
                c.setAttribute('aria-label', `${row.title} em ${cell.date}${cell.done ? ': registrado' : ': sem registro'}`);
                guard(c);
                c.addEventListener('click', event => {
                    event.stopPropagation();
                    c.classList.toggle('is-on');
                    void actions.habit!(row.path, cell.date);
                });
            }
            cells.appendChild(c);
        }
        line.appendChild(cells);
        const count = el(doc, 'span', 'dfm-bw-habit-count', String(row.count));
        count.setAttribute('title', `${row.count} de ${row.cells.length} dias com registro — contagem, não sequência`);
        line.appendChild(count);
        list.appendChild(line);
    }
    more(list, model.hidden);
    if (actions.habit && model.rows.length) {
        list.appendChild(el(doc, 'div', 'dfm-bw-hint-line', 'Marcar dias atrás vale: registre quando lembrar. Célula vazia é ausência de registro, não falha.'));
    }
    root.appendChild(list);
}

/**
 * O que faz: a semana de um hábito em contagem: "3 vezes na semana · meta 5".
 * Por quê: o hábito conta na semana, sem sequência (núcleo, 4.4); a barra de
 * preenchimento media a pessoa contra a meta (25/10/2026).
 */
export function habitWeekText(week: number, target: number | null): string {
    const n = Math.max(0, Math.round(Number(week) || 0));
    const times = n === 0 ? 'nenhuma vez na semana' : `${n} ${n === 1 ? 'vez' : 'vezes'} na semana`;
    return target && target > 0 ? `${times} · meta ${target}` : times;
}

/** O gesto do dia: marca hoje (manual), abre o protocolo (guiado) ou mostra que o DFM registra (automático). */
function habitTodayButton(doc: Doc, row: HabitRow, today: string, actions: BoardActions): HTMLElement {
    const auto = row.tracking === 'automatico';
    const btn = el(doc, actions.habit && !auto ? 'button' : 'span', 'dfm-bw-hcheck');
    if (row.doneToday) btn.classList.add('is-on');
    if (auto) btn.classList.add('is-auto');
    const label = row.doneToday
        ? 'Registrado hoje — clique para desfazer'
        : auto ? 'O DFM registra este hábito sozinho'
            : row.tracking === 'protocol' ? 'Abrir o protocolo guiado de hoje' : 'Registrar hoje';
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', `${row.title}: ${label}`);
    if (actions.habit && !auto) {
        (btn as HTMLButtonElement).type = 'button';
        guard(btn);
        btn.addEventListener('click', event => {
            event.stopPropagation();
            // Guiado ainda não feito abre o protocolo: a marca vem dele, não do botão.
            if (row.tracking !== 'protocol' || row.doneToday) btn.classList.toggle('is-on');
            void actions.habit!(row.path, today);
        });
    }
    return btn;
}

function renderTarefas(root: HTMLElement, spec: BoardWidgetSpec, s: MissionSnapshot, actions: BoardActions): void {
    const filtro = spec.filtro ?? 'proximas';
    const model = tasksModel(s, spec);
    const title = spec.titulo ?? (spec.projeto ? `${FILTER_TITLES[filtro]} · ${spec.projeto}` : FILTER_TITLES[filtro]);
    head(root, title, String(model.total));
    taskList(root, model.items, actions, FILTER_EMPTY[filtro]);
    more(root, model.total - model.items.length);
}

/* ------------------------------------------------------------- consulta */

const TERMINAL_STATUS = new Set(['done', 'cancelled']);

/** Tarefa do índice → linha do quadro, com o mesmo tom e selo das outras listas. */
export function recordToItem(t: TaskRecord, today: string): TaskItem {
    const open = !TERMINAL_STATUS.has(t.status);
    const overdue = open && !!t.due && t.due < today;
    const dueToday = open && (t.due === today || t.scheduled === today);
    const parts: string[] = [];
    if (t.projects[0]) parts.push(t.projects[0]);
    if (t.due) parts.push(overdue ? `venceu ${shortDate(t.due, today)}` : `prazo ${shortDate(t.due, today)}`);
    else if (t.scheduled) parts.push(`agendada ${shortDate(t.scheduled, today)}`);
    let badge: TaskItem['badge'];
    if (t.status === 'done') badge = { text: 'feita', tone: 'good' };
    else if (t.status === 'cancelled') badge = { text: 'cancelada', tone: 'muted' };
    else if (overdue) badge = { text: 'vencida', tone: 'bad' };
    else if (dueToday) badge = { text: 'hoje', tone: 'warn' };
    else if (t.status === 'in-progress') badge = { text: 'em curso', tone: 'accent' };
    else if (t.status === 'waiting-on') badge = { text: 'esperando', tone: 'muted' };
    else if (t.type === 'tarefa_smart') badge = { text: 'SMART', tone: 'accent' };
    const tone: Tone = overdue ? 'bad' : dueToday ? 'warn' : t.status === 'in-progress' ? 'accent' : open ? 'neutral' : 'muted';
    return { path: t.path, title: t.title, meta: parts.join(' · '), tone, badge };
}

export function renderConsulta(root: HTMLElement, spec: BoardWidgetSpec, result: QueryResult | null, actions: BoardActions, today: string): void {
    root.textContent = '';
    root.className = 'dfm-bw';
    root.setAttribute('data-kind', 'consulta');
    const doc = root.ownerDocument;
    const title = spec.titulo ?? 'Consulta';
    if (!result) {
        head(root, title);
        root.appendChild(el(doc, 'div', 'dfm-bw-loading', 'Lendo o vault…'));
        return;
    }
    // Com escopo de projeto o nome já costuma estar no título: o subtítulo fica só com o total.
    const sub = spec.escopo === 'projeto' ? `${result.total}` : `${result.scopeLabel} · ${result.total}`;
    head(root, title, result.unavailable ? undefined : sub);
    if (result.unavailable) {
        empty(root, result.unavailable);
        return;
    }
    const noTasks = 'Nenhuma tarefa neste recorte.';
    const itemsOf = (list: TaskRecord[]) => list.map(t => recordToItem(t, today));

    switch (spec.mostrar ?? 'lista') {
        case 'contagem': {
            const grid = el(doc, 'div', 'dfm-bw-stats');
            const main = el(doc, 'div', 'dfm-bw-stat');
            tone(main, 'accent');
            main.appendChild(el(doc, 'div', 'dfm-bw-stat-value', String(result.total)));
            main.appendChild(el(doc, 'div', 'dfm-bw-stat-label', 'no recorte'));
            grid.appendChild(main);
            for (const s of result.statusCounts) {
                const tile = el(doc, 'div', 'dfm-bw-stat');
                tone(tile, s.status === 'done' ? 'good' : s.status === 'in-progress' ? 'accent' : s.status === 'waiting-on' ? 'muted' : 'neutral');
                tile.appendChild(el(doc, 'div', 'dfm-bw-stat-value', String(s.count)));
                tile.appendChild(el(doc, 'div', 'dfm-bw-stat-label', s.label));
                grid.appendChild(tile);
            }
            root.appendChild(grid);
            return;
        }
        case 'progresso': {
            // O recorte na forma de mostrar (a função única): contagens, sem porcentagem nem barra.
            const box = el(doc, 'div', 'dfm-bw-progress');
            const line = el(doc, 'div', 'dfm-bw-progress-line');
            line.appendChild(el(doc, 'span', 'dfm-bw-meta', result.progress.text));
            box.appendChild(line);
            root.appendChild(box);
            const open = result.items.filter(t => !TERMINAL_STATUS.has(t.status));
            if (open.length) taskList(root, itemsOf(open), actions, noTasks);
            return;
        }
        case 'kanban': {
            const board = el(doc, 'div', 'dfm-bw-kanban');
            if (result.groups.length === 0) empty(board, noTasks);
            for (const g of result.groups) {
                const col = el(doc, 'div', 'dfm-bw-kcol');
                col.setAttribute('data-status', g.key);
                const top = el(doc, 'div', 'dfm-bw-kcol-head');
                top.appendChild(el(doc, 'span', 'dfm-bw-kcol-title', g.label));
                top.appendChild(el(doc, 'span', 'dfm-bw-day-count', String(g.count)));
                col.appendChild(top);
                for (const item of itemsOf(g.items)) {
                    const card = link(doc, 'dfm-bw-kcard', item.title, item.path, actions);
                    tone(card, item.tone);
                    col.appendChild(card);
                }
                more(col, g.count - g.items.length);
                board.appendChild(col);
            }
            root.appendChild(board);
            return;
        }
        case 'grupos': {
            if (result.groups.length === 0) empty(root, noTasks);
            for (const g of result.groups) {
                const section = el(doc, 'div', 'dfm-bw-group');
                const top = el(doc, 'div', 'dfm-bw-group-head');
                top.appendChild(el(doc, 'span', 'dfm-bw-group-title', g.label));
                top.appendChild(el(doc, 'span', 'dfm-bw-day-count', String(g.count)));
                section.appendChild(top);
                taskList(section, itemsOf(g.items), actions, noTasks);
                more(section, g.count - g.items.length);
                root.appendChild(section);
            }
            return;
        }
        case 'gantt':
            renderGantt(root, result, actions, today);
            return;
        case 'matriz': {
            const m = result.matrix;
            if (!m) return;
            const grid = el(doc, 'div', 'dfm-bw-matrix');
            const tones: Record<string, Tone> = { agora: 'bad', agendar: 'accent', rapido: 'warn', soltar: 'muted' };
            for (const c of m.cells) {
                const cell = el(doc, 'div', 'dfm-bw-quad');
                tone(cell, tones[c.id]);
                const top = el(doc, 'div', 'dfm-bw-quad-head');
                top.appendChild(el(doc, 'span', 'dfm-bw-quad-label', c.label));
                top.appendChild(el(doc, 'span', 'dfm-bw-quad-count', String(c.count)));
                cell.appendChild(top);
                cell.appendChild(el(doc, 'div', 'dfm-bw-quad-hint', c.hint));
                const items = el(doc, 'div', 'dfm-bw-quad-items');
                for (const t of c.items) items.appendChild(link(doc, 'dfm-bw-quad-item', t.title, t.path, actions));
                more(items, c.count - c.items.length);
                cell.appendChild(items);
                grid.appendChild(cell);
            }
            root.appendChild(grid);
            if (m.unclassified) root.appendChild(el(doc, 'div', 'dfm-bw-foot', `${m.unclassified} na mesa sem impacto declarado`));
            return;
        }
        default:
            taskList(root, itemsOf(result.items), actions, noTasks);
            more(root, result.total - result.items.length);
    }
}

function pctOf(date: string, start: string, end: string): number {
    const s = Date.parse(`${start}T00:00:00Z`), e = Date.parse(`${end}T00:00:00Z`) + 86_400_000;
    const d = Date.parse(`${date}T00:00:00Z`);
    return Math.max(0, Math.min(100, ((d - s) / (e - s)) * 100));
}

/** Linha do tempo: uma barra por tarefa, a linha de hoje atravessando tudo. */
function renderGantt(root: HTMLElement, result: QueryResult, actions: BoardActions, today: string): void {
    const doc = root.ownerDocument;
    const g = result.gantt;
    if (!g || g.rows.length === 0) {
        empty(root, g?.undated ? `${g.undated} tarefa(s) sem data — agende ou dê prazo para aparecerem aqui.` : 'Nenhuma tarefa neste recorte.');
        return;
    }
    const wrap = el(doc, 'div', 'dfm-bw-gantt');
    wrap.style.setProperty('--today', `${pctOf(today, g.start, g.end)}%`);
    const scale = el(doc, 'div', 'dfm-bw-gantt-scale');
    scale.appendChild(el(doc, 'span', '', shortDate(g.start, today)));
    scale.appendChild(el(doc, 'span', 'dfm-bw-gantt-today', 'hoje'));
    scale.appendChild(el(doc, 'span', '', shortDate(g.end, today)));
    wrap.appendChild(scale);
    for (const row of g.rows) {
        const item = recordToItem(row.task, today);
        const line = el(doc, 'div', 'dfm-bw-gantt-row');
        if (row.task.type === 'tarefa_smart') line.classList.add('is-smart');
        line.appendChild(link(doc, 'dfm-bw-gantt-label', item.title, item.path, actions));
        const track = el(doc, 'div', 'dfm-bw-gantt-track');
        const bar = el(doc, 'div', 'dfm-bw-gantt-bar');
        const s = pctOf(row.start, g.start, g.end);
        const e = pctOf(row.end, g.start, g.end);
        bar.style.setProperty('--s', `${Math.min(s, 99)}%`);
        bar.style.setProperty('--w', `${Math.max(1.2, e + (100 / Math.max(1, (Date.parse(g.end) - Date.parse(g.start)) / 86_400_000 + 1)) - s)}%`);
        tone(bar, row.task.status === 'done' ? 'good' : row.overdue ? 'bad' : row.task.status === 'in-progress' ? 'accent' : row.task.status === 'waiting-on' ? 'warn' : 'neutral');
        bar.setAttribute('title', `${row.start} → ${row.end}`);
        track.appendChild(bar);
        line.appendChild(track);
        wrap.appendChild(line);
    }
    root.appendChild(wrap);
    const foot = [g.hidden && `+ ${g.hidden} mais`, g.undated && `${g.undated} sem data`].filter(Boolean).join(' · ');
    if (foot) root.appendChild(el(doc, 'div', 'dfm-bw-foot', foot));
}

/* ------------------------------------------------------------- entrada */

export function renderBoardWidget(root: HTMLElement, spec: BoardWidgetSpec, snapshot: MissionSnapshot | null, actions: BoardActions): void {
    root.textContent = '';
    root.className = 'dfm-bw';
    root.setAttribute('data-kind', spec.kind);
    if (!snapshot) {
        const label = BOARD_CATALOG.find(entry => entry.kind === spec.kind)?.label ?? spec.kind;
        head(root, spec.titulo ?? label);
        root.appendChild(el(root.ownerDocument, 'div', 'dfm-bw-loading', 'Lendo o vault…'));
        return;
    }
    switch (spec.kind) {
        case 'numeros': return renderNumeros(root, spec, snapshot);
        case 'matriz': return renderMatriz(root, spec, snapshot, actions);
        case 'projeto': return renderProjeto(root, spec, snapshot, actions);
        case 'projetos': return renderProjetos(root, spec, snapshot, actions);
        case 'habitos': return renderHabitos(root, spec, snapshot, actions);
        case 'tarefas': return renderTarefas(root, spec, snapshot, actions);
        case 'protocolos-saude':
        case 'protocolos-catalogo':
        case 'protocolos-mapa':
        case 'protocolos-uso':
        case 'protocolos-versoes':
        case 'protocolos-avisos':
        case 'protocolos-ferramentas':
            return renderProtocolWidget(root, { ...spec, kind: spec.kind }, snapshot, actions);
        case 'missao':
            return renderMissaoAtalho(root, spec, atalhoDaMissao(spec), actions);
    }
}

/**
 * O que faz: o bloco `tipo: missao` num canvas ou numa nota: o atalho da Missão (item 8 do roteiro), um
 * botão que a abre no lugar que o atalho diz (o zoom no projeto, o período, o ramo pedido) e a frase.
 * Por quê: a Missão nunca é desenhada por `renderBoardWidget` (§3.4): ela monta uma vez e se atualiza por
 * dentro, na aba dela; no canvas ela é só um atalho para um ramo ou uma escala (Arquitetura e
 * Roteiro, §4). Quem decide para onde é o `atalhoDaMissao` (puro).
 * Erro e ataque: sem a ação de abrir (o lugar que não abre a Missão), só a frase, sem botão.
 * Prova: tests/board/missaoAtalho.test.ts.
 */
export function renderMissaoAtalho(root: HTMLElement, spec: BoardWidgetSpec, atalho: AtalhoDaMissao, actions: Pick<BoardActions, 'abrirMissao'>): void {
    root.textContent = '';
    root.className = 'dfm-bw dfm-bw-missao';
    root.setAttribute('data-kind', 'missao');
    const doc = root.ownerDocument;
    head(root, spec.titulo ?? 'Missão');
    if (actions.abrirMissao) {
        const b = el(doc, 'button', 'dfm-bw-pr-btn mod-cta dfm-bw-missao-abrir', atalho.rotulo);
        b.type = 'button';
        b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); actions.abrirMissao!(atalho); });
        root.appendChild(b);
    }
    empty(root, atalho.texto);
}

export function renderBoardError(root: HTMLElement, message: string): void {
    root.textContent = '';
    root.className = 'dfm-bw is-error';
    const doc = root.ownerDocument;
    head(root, 'Widget DFM');
    root.appendChild(el(doc, 'div', 'dfm-bw-error', message));
    const hint = el(doc, 'pre', 'dfm-bw-hint', `tipo: ${BOARD_CATALOG.map(e => e.kind).join(' | ')}`);
    root.appendChild(hint);
}
