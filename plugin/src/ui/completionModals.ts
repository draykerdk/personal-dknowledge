/**
 * As duas telas da conclusão (arquitetura universal 4.6), só desenho: quem decide é
 * `board/taskCompletion.ts`, quem grava é quem chama.
 *
 * - "Quando terminou?": uma linha com Agora (marcado) · Mais cedo hoje (pede a hora) ·
 *   Ontem · Outro dia (pede o dia). Enter confirma o marcado. Fechar sem escolher
 *   devolve `null`. A mesma no celular. Na conclusão dita depois (não "Agora"), uma
 *   segunda linha pergunta onde foi e quanto levou, com o provável marcado: um toque
 *   confirma, "Pular" segue sem o dado (4.6).
 * - A tela do 🌙: as concluídas do dia sem lugar e tempo, com o provável marcado em
 *   cada uma; um toque confirma todas; "Agora não" não grava nada.
 */
import { App, Modal, Notice } from 'obsidian';
import {
    COMPLETION_PLACE_CONFIRM,
    COMPLETION_PLACE_INFO,
    COMPLETION_PLACE_PROMPT,
    COMPLETION_PLACE_SKIP,
    COMPLETION_WHEN_OPTIONS,
    COMPLETION_WHEN_PROMPT,
    asksCompletionPlace,
    withCompletionPlace,
    NIGHT_COMPLETIONS_INFO,
    NIGHT_COMPLETIONS_PROMPT,
    NIGHT_CONFIRM_LABEL,
    NIGHT_SKIP_LABEL,
    completionWhen,
    shiftDay,
    type CompletionWhen,
    type CompletionWhenChoice,
    type NightCandidate,
} from '../board/taskCompletion';
import { NOW_TIME_OPTIONS } from '../engine/nowTree';
import { TASK_CONTEXTS } from '../engine/taskContexts';

/** Agora, `AAAA-MM-DDTHH:mm` (hora local). */
function nowStamp(): string {
    const m = (window as any).moment?.();
    if (m?.format) return m.format('YYYY-MM-DDTHH:mm');
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** O provável de onde foi e quanto levou (a segunda linha), já marcado. */
export type CompletionPlaceGuess = { lugar: string; bloco_min: number };

export class CompletionWhenModal extends Modal {
    private result: CompletionWhen | null = null;

    constructor(app: App, private taskName: string, private done: (when: CompletionWhen | null) => void, private probable?: CompletionPlaceGuess | null) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('dfm-when-modal');
        contentEl.createEl('h3', { text: COMPLETION_WHEN_PROMPT });
        if (this.taskName) contentEl.createEl('div', { text: this.taskName, cls: 'setting-item-description' });
        const row = contentEl.createDiv({ cls: 'dfm-when-row' });
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '6px';
        row.style.margin = '10px 0';
        const extra = contentEl.createDiv({ cls: 'dfm-when-extra' });
        let first: HTMLButtonElement | null = null;
        for (const option of COMPLETION_WHEN_OPTIONS) {
            const btn = row.createEl('button', { text: option.label });
            if (option.choice === 'agora') { btn.addClass('mod-cta'); first = btn; }
            btn.addEventListener('click', () => this.pick(option.choice, extra));
        }
        window.setTimeout(() => first?.focus(), 0);
    }

    private pick(choice: CompletionWhenChoice, extra: HTMLElement) {
        extra.empty();
        const now = nowStamp();
        if (choice === 'agora' || choice === 'ontem') {
            this.finish(completionWhen(choice, now));
            return;
        }
        const input = extra.createEl('input');
        input.type = choice === 'mais_cedo' ? 'time' : 'date';
        if (choice === 'mais_cedo') {
            input.value = now.slice(11, 16);
        } else {
            input.max = now.slice(0, 10);
            input.value = shiftDay(now.slice(0, 10), -2);
        }
        const ok = extra.createEl('button', { text: 'OK', cls: 'mod-cta' });
        ok.style.marginLeft = '6px';
        const submit = () => {
            const when = completionWhen(choice, nowStamp(), input.value);
            if (!when) {
                new Notice(choice === 'mais_cedo' ? 'Escolha uma hora de hoje, até agora.' : 'Escolha um dia até hoje.', 4000);
                return;
            }
            this.finish(when);
        };
        ok.addEventListener('click', submit);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
        window.setTimeout(() => input.focus(), 0);
    }

    private finish(when: CompletionWhen | null) {
        if (!when) return;
        if (this.probable && asksCompletionPlace(when.choice)) {
            this.askPlace(when, this.probable);
            return;
        }
        this.result = when;
        this.close();
    }

    /**
     * A segunda linha: o lugar e o tamanho, com o provável marcado. Confirmar grava os
     * dois na resposta; "Pular" (ou fechar) segue com a resposta sem eles, que já vale.
     */
    private askPlace(when: CompletionWhen, probable: CompletionPlaceGuess) {
        const { contentEl } = this;
        contentEl.empty();
        this.result = when;
        contentEl.createEl('h3', { text: COMPLETION_PLACE_PROMPT });
        if (this.taskName) contentEl.createEl('div', { text: this.taskName, cls: 'setting-item-description' });
        contentEl.createEl('div', { text: COMPLETION_PLACE_INFO, cls: 'setting-item-description' });
        const row = contentEl.createDiv({ cls: 'dfm-when-row' });
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '6px';
        row.style.margin = '10px 0';
        const chosen = { ...probable };
        const place = row.createEl('select', { cls: 'dropdown' });
        for (const context of TASK_CONTEXTS) place.createEl('option', { text: context, value: context });
        place.value = chosen.lugar;
        place.addEventListener('change', () => { chosen.lugar = place.value; });
        const size = row.createEl('select', { cls: 'dropdown' });
        for (const option of NOW_TIME_OPTIONS) size.createEl('option', { text: option.label, value: String(option.minutes) });
        size.value = String(chosen.bloco_min);
        size.addEventListener('change', () => { chosen.bloco_min = Number(size.value); });
        const buttons = contentEl.createDiv();
        buttons.style.display = 'flex';
        buttons.style.gap = '6px';
        const confirm = buttons.createEl('button', { text: COMPLETION_PLACE_CONFIRM, cls: 'mod-cta' });
        confirm.addEventListener('click', () => { this.result = withCompletionPlace(when, chosen); this.close(); });
        const skip = buttons.createEl('button', { text: COMPLETION_PLACE_SKIP });
        skip.addEventListener('click', () => this.close());
        window.setTimeout(() => confirm.focus(), 0);
    }

    onClose() {
        this.contentEl.empty();
        this.done(this.result);
    }
}

/**
 * O que faz: pergunta "Quando terminou?" e devolve a resposta, ou `null` se a tela
 * fechou sem escolha. Com `probable`, a conclusão dita depois pergunta também onde foi
 * e quanto levou (a segunda linha); sem ele (a seleção de várias tarefas), só o quando.
 */
export function askCompletionWhen(app: App, taskName: string, probable?: CompletionPlaceGuess | null): Promise<CompletionWhen | null> {
    return new Promise(resolve => new CompletionWhenModal(app, taskName, resolve, probable).open());
}

type NightItem = NightCandidate & { lugar: string; bloco_min: number };

class NightCompletionsModal extends Modal {
    private result: NightItem[] | null = null;

    constructor(app: App, private items: NightItem[], private done: (items: NightItem[] | null) => void) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: NIGHT_COMPLETIONS_PROMPT });
        contentEl.createEl('div', { text: NIGHT_COMPLETIONS_INFO, cls: 'setting-item-description' });
        const chosen = this.items.map(item => ({ ...item }));
        const list = contentEl.createDiv({ cls: 'dfm-night-list' });
        list.style.margin = '10px 0';
        chosen.forEach(item => {
            const row = list.createDiv({ cls: 'dfm-night-item' });
            row.style.margin = '8px 0';
            const head = row.createDiv();
            head.createEl('strong', { text: item.tarefa });
            if (item.fim) head.createSpan({ text: ` · ${item.fim.slice(11, 16)}`, cls: 'setting-item-description' });
            const controls = row.createDiv();
            controls.style.display = 'flex';
            controls.style.flexWrap = 'wrap';
            controls.style.gap = '6px';
            const place = controls.createEl('select', { cls: 'dropdown' });
            for (const context of TASK_CONTEXTS) place.createEl('option', { text: context, value: context });
            place.value = item.lugar;
            place.addEventListener('change', () => { item.lugar = place.value; });
            const size = controls.createEl('select', { cls: 'dropdown' });
            for (const option of NOW_TIME_OPTIONS) size.createEl('option', { text: option.label, value: String(option.minutes) });
            size.value = String(item.bloco_min);
            size.addEventListener('change', () => { item.bloco_min = Number(size.value); });
        });
        const buttons = contentEl.createDiv();
        buttons.style.display = 'flex';
        buttons.style.gap = '6px';
        const confirm = buttons.createEl('button', { text: NIGHT_CONFIRM_LABEL, cls: 'mod-cta' });
        confirm.addEventListener('click', () => { this.result = chosen; this.close(); });
        const skip = buttons.createEl('button', { text: NIGHT_SKIP_LABEL });
        skip.addEventListener('click', () => this.close());
        window.setTimeout(() => confirm.focus(), 0);
    }

    onClose() {
        this.contentEl.empty();
        this.done(this.result);
    }
}

/** O que faz: mostra a tela do 🌙 e devolve as confirmadas, ou `null` ("Agora não"). */
export function askNightCompletions(app: App, items: NightItem[]): Promise<NightItem[] | null> {
    return new Promise(resolve => new NightCompletionsModal(app, items, resolve).open());
}
