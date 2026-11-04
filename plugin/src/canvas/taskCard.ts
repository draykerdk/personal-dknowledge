/**
 * O cartão de tarefa: o nó de arquivo de uma TaskNote vira o nó de tarefa da
 * arquitetura universal (19/10, 4.7). O que ele mostra vem pronto do modelo puro
 * (`taskCardModel.ts`); aqui só se desenha e se ligam os botões às ações.
 *
 * É o único lugar em que o plugin decora um nó nativo — de propósito. O cartão cobre
 * o conteúdo do nó por dentro da borda (a seleção e o arrasto do canvas continuam
 * valendo: só os botões param o clique):
 * - linha de cima: a bolinha de concluir e o título;
 * - linha do motivo (ação) ou da gramática de mostrar (SMART);
 * - linha da unidade: contexto, estimativa, prazo relativo, status;
 * - ações ao passar o mouse: 🤝 Fazer agora, ⏭️ Adiar, ↗️ Abrir, ⋯ (o resto).
 * O impacto vira a cor da borda (`data-dfm-impact` no nó).
 *
 * No celular (`model.readOnly`) nenhum botão que grava é desenhado.
 *
 * Idempotente e barato: o cartão só é redesenhado quando a assinatura do modelo
 * muda; senão o DOM fica como está.
 */
import { minutesText, type TaskCardModel } from './taskCardModel';
import type { TaskRecord } from '../tasks/taskRecord';

export interface TaskCardActions {
    /** A bolinha: concluir; quem conclui pergunta "Quando terminou?" (`false` = não concluiu). */
    complete(task: TaskRecord): Promise<boolean>;
    statusMenu(event: MouseEvent, task: TaskRecord): void;
    dateMenu(event: MouseEvent, task: TaskRecord): void;
    moreMenu(event: MouseEvent, task: TaskRecord): void;
    /** ↗️ Abre a interface da tarefa no TaskNotes. */
    edit(event: MouseEvent, task: TaskRecord): void;
    /** 🤝 Fazer agora: o gesto já com a tarefa (na SMART, com as ações dela). */
    doNow(event: MouseEvent, task: TaskRecord): void;
    /** O cofre tem o gesto do 🤝 (o papel `fazer_agora`)? Sem a leitura, o 🤝 aparece; `false` = o botão some. */
    podeFazerAgora?(): boolean;
    /** ⏭️ Adiar: amanhã ou outro dia. */
    postpone(event: MouseEvent, task: TaskRecord): void;
    newAction?(task: TaskRecord): void;
    /** O cofre tem o protocolo da ação nova da SMART (o papel `nova_tarefa_do_projeto`)? Sem a leitura, o + aparece; `false` = some. */
    podeNovaAcao?(): boolean;
}

const ROOT = 'dfm-tc';

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Cliques num botão do cartão não viram seleção nem arrasto do nó. */
function guard(node: HTMLElement): void {
    node.addEventListener('pointerdown', e => e.stopPropagation());
    node.addEventListener('mousedown', e => e.stopPropagation());
    node.addEventListener('dblclick', e => e.stopPropagation());
}

function button(doc: Document, cls: string, text: string, title: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
    const b = el(doc, 'button', cls, text);
    b.type = 'button';
    b.setAttribute('aria-label', title);
    b.setAttribute('title', title);
    guard(b);
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); onClick(e); });
    return b;
}

/** Um selo só de leitura, com o título como dica. */
function chip(doc: Document, cls: string, text: string, title?: string, tone?: string): HTMLSpanElement {
    const s = el(doc, 'span', `${ROOT}-chip ${cls}`.trim(), text);
    if (title) s.setAttribute('title', title);
    if (tone) s.setAttribute('data-tone', tone);
    return s;
}

export function mountTaskCard(nodeEl: HTMLElement, task: TaskRecord, model: TaskCardModel, actions: TaskCardActions): void {
    const doc = nodeEl.ownerDocument;
    nodeEl.classList.add('dfm-task-node');
    nodeEl.classList.toggle('is-smart', model.kind === 'smart');
    nodeEl.classList.toggle('is-acao', model.kind === 'acao');
    nodeEl.classList.toggle('is-done', model.done);
    nodeEl.setAttribute('data-dfm-impact', model.impactLevel);
    nodeEl.querySelector(':scope > .dfm-task-hud')?.remove();

    // Duplo clique no nó de tarefa abre a interface dela no TaskNotes, no lugar de
    // abrir o arquivo cru. Um ouvinte por nó (captura: roda antes do canvas). No
    // celular o nó fica com o comportamento nativo.
    const anyEl = nodeEl as any;
    anyEl.__dfmTaskPath = task.path;
    anyEl.__dfmTaskReadOnly = model.readOnly;
    if (!anyEl.__dfmTaskDbl) {
        anyEl.__dfmTaskDbl = true;
        nodeEl.addEventListener('dblclick', (e: MouseEvent) => {
            if (anyEl.__dfmTaskReadOnly) return;
            if ((e.target as HTMLElement)?.closest?.(`.${ROOT} button`)) return;
            e.preventDefault();
            e.stopPropagation();
            actions.edit(e, { ...task, path: anyEl.__dfmTaskPath });
        }, true);
    }

    let root = nodeEl.querySelector(`:scope > .${ROOT}`) as HTMLElement | null;
    if (root && root.getAttribute('data-sig') === model.signature && root.getAttribute('data-path') === task.path) return;
    if (!root) {
        root = el(doc, 'div', ROOT);
        nodeEl.appendChild(root);
    }
    root.textContent = '';
    root.setAttribute('data-sig', model.signature);
    root.setAttribute('data-path', task.path);
    root.setAttribute('data-kind', model.kind);
    root.toggleAttribute('data-readonly', model.readOnly);
    if (model.impacto !== null) root.setAttribute('title', `Impacto ${model.impacto}`);
    else root.removeAttribute('title');

    // 1. Linha de cima: a bolinha de concluir e o título.
    const top = el(doc, 'div', `${ROOT}-top`);
    if (model.kind === 'acao') {
        const cls = `${ROOT}-check${model.done ? ' is-done' : ''}`;
        if (model.readOnly || model.done) {
            const dot = el(doc, 'span', cls, model.done ? '✓' : '');
            dot.setAttribute('title', model.done ? 'Concluída' : 'Aberta');
            top.appendChild(dot);
        } else {
            const check = button(doc, cls, '', 'Concluir', async () => {
                check.classList.add('is-done');
                check.textContent = '✓';
                if (!(await actions.complete(task))) { check.classList.remove('is-done'); check.textContent = ''; }
            });
            top.appendChild(check);
        }
    }
    const title = el(doc, 'div', `${ROOT}-title`, model.title);
    title.setAttribute('title', model.title);
    top.appendChild(title);
    root.appendChild(top);

    // 2. Linha do motivo (ação) ou da gramática de mostrar (SMART).
    if (model.kind === 'smart' && model.grammar) {
        const g = el(doc, 'div', `${ROOT}-why is-grammar`, model.grammar);
        if (model.progress) g.setAttribute('title', `${model.progress.done} de ${model.progress.total} ações concluídas`);
        root.appendChild(g);
    } else if (model.reasons) {
        const why = el(doc, 'div', `${ROOT}-why`, model.reasons.label);
        why.setAttribute('title', model.reasons.title);
        root.appendChild(why);
    }

    // 3. Linha da unidade: contexto, estimativa, prazo relativo, status.
    const unit = el(doc, 'div', `${ROOT}-chips`);
    if (model.kind === 'smart') {
        unit.appendChild(chip(doc, 'is-smart', model.week ? model.week.slice(5) : 'SMART', model.week ? `SMART da semana ${model.week}` : 'SMART sem semana'));
    }
    if (model.context) unit.appendChild(chip(doc, 'is-context', model.context.label, model.context.title));
    if (model.estimate) unit.appendChild(chip(doc, 'is-estimate', model.estimate, 'Estimativa'));
    if (model.date) {
        if (model.readOnly) unit.appendChild(chip(doc, 'is-date', model.date.label, model.date.title, model.date.tone));
        else {
            const date = button(doc, `${ROOT}-chip is-date`, model.date.label, `${model.date.title} — clique para agendar`, e => actions.dateMenu(e, task));
            date.setAttribute('data-tone', model.date.tone);
            unit.appendChild(date);
        }
    }
    // Na SMART o status padrão (próxima) não ocupa espaço.
    if (model.kind === 'acao' || model.status.key !== 'next-action') {
        if (model.readOnly) unit.appendChild(chip(doc, 'is-status', model.status.label, undefined, model.status.tone));
        else {
            const status = button(doc, `${ROOT}-chip is-status`, model.status.label, 'Mudar status', e => actions.statusMenu(e, task));
            status.setAttribute('data-tone', model.status.tone);
            unit.appendChild(status);
        }
    }
    if (model.peca) unit.appendChild(chip(doc, 'is-peca', model.peca.label, model.peca.title));
    if (model.tracking || model.focusMinutes > 0) {
        unit.appendChild(chip(doc, `is-focus${model.tracking ? ' is-live' : ''}`, `⏱ ${model.tracking ? 'focando · ' : ''}${minutesText(model.focusMinutes)}`));
    }
    root.appendChild(unit);

    // 4. Ações ao passar o mouse; no celular, nenhuma.
    if (model.readOnly) return;
    const bar = el(doc, 'div', `${ROOT}-actions`);
    if (!model.done && model.status.key !== 'cancelled') {
        if (actions.podeFazerAgora?.() !== false) bar.appendChild(button(doc, `${ROOT}-act is-now`, '🤝', model.kind === 'smart' ? 'Fazer agora: uma ação desta SMART' : 'Fazer agora', e => actions.doNow(e, task)));
        if (model.kind === 'acao') bar.appendChild(button(doc, `${ROOT}-act is-postpone`, '⏭️', 'Adiar (amanhã ou outro dia)', e => actions.postpone(e, task)));
        if (model.kind === 'smart' && actions.newAction && actions.podeNovaAcao?.() !== false) {
            bar.appendChild(button(doc, `${ROOT}-act is-add`, '+', 'Nova ação atômica desta SMART', () => actions.newAction!(task)));
        }
    }
    bar.appendChild(button(doc, `${ROOT}-act is-open`, '↗️', 'Abrir no TaskNotes (duplo clique no nó também)', e => actions.edit(e, task)));
    bar.appendChild(button(doc, `${ROOT}-act is-more`, '⋯', 'Mais (agendar, semana, status, Comando do Dia…)', e => actions.moreMenu(e, task)));
    root.appendChild(bar);
}
