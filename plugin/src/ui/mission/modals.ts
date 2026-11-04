/**
 * Modais de apoio do Mission Control.
 *
 * - `MissionFocusModal`: o drill-down de um bucket do funil. Existe porque o
 *   painel mostra as primeiras linhas; clicar num bucket precisa abrir a lista
 *   inteira, não um beco sem saída.
 * - `MissionPromptModal`: proposta de invocação para o DSH. O console monta o
 *   texto canônico e o humano decide. Copiar é um clique explícito — nada é
 *   despachado ao agente sem um gesto.
 *
 * O `MissionTextModal` (o nome da nota da fábrica de notas) saiu em 03/11/2026 com
 * a fábrica (código aposentado).
 */
import { App, Modal, Notice, Setting } from 'obsidian';
import { applyTone, el, icon } from './primitives';
import { statusToken } from './tokens';
import { MissionTask } from '../../engine/missionControl';
import { openVaultPath } from './context';

export class MissionFocusModal extends Modal {
    constructor(
        app: App,
        private readonly title: string,
        private readonly tasks: MissionTask[],
        private readonly subtitle: string,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('mc-modal');
        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { cls: 'mc-modal-sub', text: this.subtitle });

        if (this.tasks.length === 0) {
            contentEl.createEl('p', { cls: 'mc-hint', text: 'Nenhuma tarefa neste filtro.' });
            return;
        }

        const list = el(contentEl, 'div', 'mc-modal-list');
        for (const task of this.tasks) {
            const row = el(list, 'div', 'mc-task is-clickable');
            applyTone(el(row, 'span', 'mc-task-dot'), statusToken(task.status).tone);
            const body = el(row, 'div', 'mc-task-body');
            el(body, 'span', 'mc-task-title', task.title);
            const meta = el(body, 'div', 'mc-task-meta');
            if (task.due) el(meta, 'span', 'mc-task-due', task.due);
            for (const project of task.projects) el(meta, 'span', 'mc-task-project', project);
            if (task.impact !== null) el(meta, 'span', 'mc-task-week', `impacto ${task.impact}`);
            el(meta, 'span', 'mc-task-week', task.status);
            row.addEventListener('click', () => {
                this.close();
                void openVaultPath(this.app, task.path);
            });
        }

        new Setting(contentEl).addButton(button => button
            .setButtonText('Fechar')
            .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class MissionPromptModal extends Modal {
    constructor(
        app: App,
        private readonly title: string,
        private readonly prompt: string,
        private readonly hint: string,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('mc-modal');
        const head = el(contentEl, 'div', 'mc-modal-head');
        icon(head, 'bot', 'mc-modal-icon');
        head.createEl('h2', { text: this.title });
        if (this.hint) contentEl.createEl('p', { cls: 'mc-modal-sub', text: this.hint });

        const pre = contentEl.createEl('pre', { cls: 'mc-prompt' });
        pre.setText(this.prompt);

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Copiar invocação')
                .setCta()
                .onClick(async () => {
                    try {
                        await navigator.clipboard.writeText(this.prompt);
                        new Notice('✅ Invocação copiada.');
                    } catch (_) {
                        new Notice('⚠️ Não foi possível copiar — selecione o texto manualmente.', 6000);
                    }
                }))
            .addButton(button => button
                .setButtonText('Fechar')
                .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
