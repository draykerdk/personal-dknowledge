/**
 * Rotinas — o tracker de hábitos dentro do console.
 *
 * Esta aba traz para o Mission Control a única superfície do Control Center
 * antigo que não existia em lugar nenhum do console novo. A leitura é a mesma
 * dos blocos ```dfm-habits``` das notas (`engine/habits.ts`), e a escrita de
 * marcação reusa **exatamente** o caminho canônico: `resolveClick` decide,
 * `toggleEntry` calcula a lista e `fileManager.processFrontMatter` grava. Nada
 * de write novo inventado aqui.
 *
 * O que a tela promete, e por que:
 * 1. **Contagem de execuções, nunca sequência.** Não há streak, não há dívida,
 *    não há "dias perdidos" — o número é quantas vezes aconteceu na janela.
 * 2. **Célula vazia não é falha.** Ausência de registro é ausência de dado, e a
 *    legenda diz isso em vez de deixar o vazio sugerir culpa.
 * 3. **Marcar atrasado é o uso normal.** O registro acontece quando o operador
 *    lembra — muitas vezes dias depois. Qualquer dia até hoje alterna; só o
 *    futuro é bloqueado, porque registrar o que não aconteceu seria inventar
 *    dado. No hábito guiado, o dia corrente ainda não marcado abre o protocolo;
 *    fora dele, alterna como qualquer outro. A tela não reinterpreta nada:
 *    `resolveClick` devolve `toggle`, `protocol` ou `blocked`, e é o que vale.
 * 4. **Hábito automático não se marca à mão.** Quem grava é o DFM (Pomodoro,
 *    Comando do Dia); o clique informa em vez de fingir que registrou.
 */
import { TFile } from 'obsidian';
import { applyTone, card, el, emptyState, icon, metric, pill, rowLink } from './primitives';
import { MissionPanelContext, truncate } from './context';
import { MissionHabitRow } from '../../engine/missionControl';
import { Habit, parseHabit, resolveClick, toggleEntry } from '../../engine/habits';

/** `2026-09-14` → `14`. O cabeçalho já diz o mês; o número é o que se lê. */
function dayNumber(date: string): string {
    return date.slice(8, 10);
}

/** `2026-09-14` → `Seg`. Cabeçalho de coluna precisa de duas letras, não de um nome. */
function weekdayShort(date: string): string {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const parsed = new Date(`${date}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? '' : names[parsed.getUTCDay()];
}

const TRACKING_LABEL: Record<string, { label: string; icon: string }> = {
    manual: { label: 'manual', icon: 'hand' },
    protocol: { label: 'guiado', icon: 'workflow' },
    automatico: { label: 'automático', icon: 'cpu' },
};

/**
 * Um clique na célula. Devolve `true` quando gravou algo — a view decide se
 * re-renderiza. Toda a decisão vem do motor: a tela não reinterpreta regra.
 */
async function clickCell(
    ctx: MissionPanelContext,
    row: MissionHabitRow,
    date: string,
    today: string,
): Promise<boolean> {
    const file = ctx.app.vault.getAbstractFileByPath(row.path);
    if (!(file instanceof TFile)) {
        ctx.notice(`Nota do hábito não encontrada: ${row.path}`);
        return false;
    }
    // Relê o frontmatter no clique: entre o desenho e o clique o DFM pode ter
    // marcado o mesmo dia por outra via (Pomodoro, protocolo, sync).
    const habit: Habit = parseHabit(row.path, ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? null);
    const decision = resolveClick(habit, date, today);

    if (decision.action === 'blocked') {
        ctx.notice(decision.reason);
        return false;
    }
    if (decision.action === 'protocol') {
        // Mesmo comando que o botão da nota dispara: `dfm-system:dfm-<id>`.
        ctx.executeCommand(`dfm-${decision.protocolId}`);
        return false;
    }
    await ctx.app.fileManager.processFrontMatter(file, frontmatter => {
        frontmatter.entries = toggleEntry(frontmatter.entries, date);
    });
    return true;
}

function cellFor(
    parent: HTMLElement,
    ctx: MissionPanelContext,
    row: MissionHabitRow,
    date: string,
    today: string,
    onWritten: () => void,
): void {
    const done = row.cells.find(cell => cell.date === date)?.done ?? false;
    const isToday = date === today;
    const isFuture = date > today;
    const classes = ['mc-habit-cell'];
    if (done) classes.push('is-done');
    else if (isFuture) classes.push('is-future');
    else if (isToday) classes.push('is-today-empty');

    const cell = el(parent, 'button', classes.join(' '));
    cell.setAttribute('type', 'button');
    cell.setText(done ? '✓' : isFuture ? '' : '·');
    cell.setAttribute('aria-label', `${row.title} em ${date}${done ? ': cumprido' : ': sem registro'}`);
    cell.setAttribute('title', [
        `${row.title} · ${date}${isToday ? ' (hoje)' : ''}`,
        done ? 'Cumprido' : isFuture ? 'Dia futuro — não há o que registrar' : 'Sem registro',
        row.protocolId && isToday && !done ? 'Abre o protocolo guiado' : '',
    ].filter(Boolean).join('\n'));

    cell.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void clickCell(ctx, row, date, today).then(written => {
            if (written) onWritten();
        });
    });
}

function habitRow(parent: HTMLElement, ctx: MissionPanelContext, row: MissionHabitRow, today: string, onWritten: () => void): void {
    const line = el(parent, 'div', 'mc-habit-row');
    const name = el(line, 'div', 'mc-habit-name');
    const link = el(name, 'a', 'mc-habit-title', truncate(row.title, 46));
    link.setAttribute('href', '#');
    link.setAttribute('title', row.path);
    link.addEventListener('click', event => {
        event.preventDefault();
        void ctx.openPath(row.path);
    });

    const tracking = TRACKING_LABEL[row.tracking] ?? TRACKING_LABEL.manual;
    const badges = el(name, 'div', 'mc-habit-badges');
    pill(badges, tracking.label, row.tracking === 'automatico' ? 'muted' : row.tracking === 'protocol' ? 'cyan' : 'blue', tracking.icon);
    if (row.revisaoVencida) pill(badges, 'revisão vencida', 'orange', 'alarm-clock');

    const grid = el(line, 'div', 'mc-habit-cells');
    for (const date of ctx.snapshot.habits.days) cellFor(grid, ctx, row, date, today, onWritten);

    const total = el(line, 'div', 'mc-habit-total');
    // A cor diz só se houve registro: a razão execuções/dias pintava de vermelho a
    // janela com pouco registro, uma nota sobre a pessoa (25/10/2026).
    applyTone(total, row.execucoes > 0 ? 'orange' : 'muted');
    el(total, 'span', 'mc-habit-total-value', String(row.execucoes));
    total.setAttribute('title', `${row.execucoes} de ${ctx.snapshot.habits.windowDays} dias com registro na janela. Contagem, não sequência.`);
}

export function renderHabits(host: HTMLElement, ctx: MissionPanelContext): void {
    renderToday(host, ctx);
    renderTracker(host, ctx);
}

/**
 * O dia de hoje, por hábito, com o estado de cada regime.
 *
 * Esta é a peça que o Control Center antigo chamava de "☀️ Hoje — N/M
 * registrados". Ela existe porque os três regimes **esperam coisas diferentes**,
 * e tratar todos como "pendente" esconderia isso: o automático aguarda um evento
 * do próprio DFM, o guiado aguarda o protocolo, o manual aguarda o gesto.
 */
function renderToday(host: HTMLElement, ctx: MissionPanelContext): void {
    const { habits } = ctx.snapshot;
    const node = card(host, {
        title: `Hoje · ${ctx.snapshot.today}`,
        icon: 'sun',
        tone: 'accent',
        subtitle: 'o estado de cada rotina agora',
        badge: `${habits.stats.concluidosHoje} ${habits.stats.concluidosHoje === 1 ? 'registrado' : 'registrados'}`,
    });

    if (habits.rows.length === 0) {
        emptyState(node.body, 'Nenhuma rotina ativa para acompanhar hoje.', 'flame');
        return;
    }

    const due = habits.rows.filter(row => row.revisaoVencida);
    if (due.length > 0) {
        const line = el(node.body, 'div', 'mc-trigger');
        icon(line, 'alarm-clock', 'mc-trigger-icon');
        const text = el(line, 'div', 'mc-trigger-text');
        el(text, 'span', 'mc-trigger-label', 'Revisão vencida');
        el(text, 'span', 'mc-trigger-value', due.map(row => row.title).join(' · '));
        el(node.body, 'p', 'mc-hint',
            'A data de revisão foi declarada no próprio hábito. Vencer não é cobrança: é o lembrete que o autor deixou para si mesmo.');
    }

    const list = el(node.body, 'div', 'mc-rows');
    for (const row of habits.rows) {
        const state = row.doneToday
            ? { label: 'Registrado', tone: 'green' as const, icon: 'check' }
            : row.tracking === 'automatico'
                ? { label: 'Aguarda sinal', tone: 'muted' as const, icon: 'cpu' }
                : row.tracking === 'protocol'
                    ? { label: 'Aguarda protocolo', tone: 'cyan' as const, icon: 'workflow' }
                    : { label: 'Pendente', tone: 'orange' as const, icon: 'circle' };

        const line = rowLink(list, {
            classes: ['mc-field'],
            onClick: () => void ctx.openPath(row.path),
            title: row.protocolId ? `Protocolo guiado: ${row.protocolId}` : row.path,
        });
        el(line, 'span', 'mc-field-label', truncate(row.title, 34));
        const value = el(line, 'span', 'mc-field-value');
        const badge = applyTone(el(value, 'span', 'mc-habit-state'), state.tone);
        icon(badge, state.icon, 'mc-habit-state-icon');
        el(badge, 'span', undefined, state.label);
    }
}

function renderTracker(host: HTMLElement, ctx: MissionPanelContext): void {
    const { habits } = ctx.snapshot;
    const node = card(host, {
        title: 'Rotinas',
        icon: 'flame',
        tone: 'orange',
        subtitle: 'contagem de execuções na janela — nunca sequência, nunca dívida',
        badge: habits.rows.length ? `${habits.stats.ativos} ativo(s)` : 'tracker vazio',
        wide: true,
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    head.append(
        (() => {
            const button = el(head, 'button', 'mc-action');
            icon(button, 'folder-open', 'mc-action-icon');
            el(button, 'span', 'mc-action-label', 'Abrir tracker');
            button.setAttribute('title', habits.folder);
            button.addEventListener('click', () => {
                const target = ctx.app.vault.getAbstractFileByPath(habits.folder);
                if (target) void ctx.openPath(`${habits.folder}/`);
                else ctx.notice(`Pasta do tracker não encontrada: ${habits.folder}`);
            });
            return button;
        })(),
    );

    if (habits.rows.length === 0) {
        emptyState(node.body,
            `Nenhum hábito ativo em ${habits.folder}. Ausência de registro não é falha — é ausência de dado.`,
            'flame');
        return;
    }

    const tiles = el(node.body, 'div', 'mc-tiles');
    metric(tiles, {
        label: 'Concluídos hoje',
        value: habits.stats.concluidosHoje,
        tone: habits.stats.concluidosHoje > 0 ? 'green' : 'muted',
        icon: 'check-check',
    });
    metric(tiles, {
        label: `Execuções · ${habits.windowDays}d`,
        value: habits.stats.execucoesJanela,
        tone: habits.stats.execucoesJanela > 0 ? 'orange' : 'muted',
        icon: 'activity',
        hint: 'soma da janela exibida',
    });
    // O hábito conta na semana, sem sequência (núcleo, 4.4): no lugar da adesão em %,
    // quantas vezes os hábitos aconteceram de segunda até hoje.
    metric(tiles, {
        label: 'Nesta semana',
        value: habits.stats.execucoesSemana,
        unit: habits.stats.execucoesSemana === 1 ? 'vez' : 'vezes',
        tone: habits.stats.execucoesSemana > 0 ? 'orange' : 'muted',
        icon: 'calendar-check',
        hint: 'execuções de segunda até hoje, somadas entre os hábitos',
    });

    // Cabeçalho da grade: só os dias, alinhados com as células. Sem ele, 24
    // colunas de quadrados não dizem a que dia pertencem.
    const header = el(node.body, 'div', 'mc-habit-head');
    el(header, 'div', 'mc-habit-name', 'Hábito');
    const headCells = el(header, 'div', 'mc-habit-cells');
    for (const date of habits.days) {
        const cell = el(headCells, 'div', `mc-habit-day${date === ctx.snapshot.today ? ' is-today' : ''}`);
        el(cell, 'span', 'mc-habit-day-week', weekdayShort(date));
        el(cell, 'span', 'mc-habit-day-num', dayNumber(date));
        cell.setAttribute('title', date);
    }
    el(header, 'div', 'mc-habit-total', '✔');

    const grid = el(node.body, 'div', 'mc-habit-grid');
    for (const row of habits.rows) habitRow(grid, ctx, row, ctx.snapshot.today, () => void ctx.refresh(true));

    el(node.body, 'p', 'mc-hint',
        'Clique numa célula para marcar ou desmarcar o dia — inclusive dias atrás. Registrar quando lembra é o uso normal; só o futuro fica fechado, porque não há o que registrar ainda.');
    el(node.body, 'p', 'mc-hint',
        'Execuções contam quantas vezes aconteceu na janela. Célula vazia é ausência de registro — não é falha, não é dívida e não existe sequência a manter.');
}
