/**
 * Triagem das ações sem vínculo (e das SMART sem projeto): uma por vez, decidir
 * onde ela mora.
 *
 * Ligar a uma SMART segue o contrato do Kernel (`projects: [[SMART]]`, herda
 * `week`/`impacto`). Ligar direto ao projeto também vale — a ação aparece na
 * coluna "Direto no projeto" do canvas até ganhar uma SMART. Pular não grava nada.
 */
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { MissionBoard } from './boardPlugin';
import type { Orphan } from './panelNav';
import { TERMINAL, fold } from '../project/projectCanvasModel';

export class TriageModal extends Modal {
    private index = 0;
    private linked = 0;

    constructor(
        app: App,
        private readonly board: MissionBoard,
        private readonly orphans: Orphan[],
        private readonly projectNames: string[],
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('dfm-triage');
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        if (this.index >= this.orphans.length) {
            this.titleEl.setText('Triagem concluída');
            contentEl.createEl('p', { text: `${this.linked} ligada(s), ${this.orphans.length - this.linked} pulada(s).` });
            contentEl.createEl('button', { text: 'Fechar', cls: 'mod-cta' }).addEventListener('click', () => this.close());
            return;
        }
        const { task, reason, target } = this.orphans[this.index];
        // SMART sem projeto: só "Ligar a um projeto" faz sentido (SMART não tem SMART mãe).
        const smartTask = task.type === 'tarefa_smart';
        this.titleEl.setText(`${smartTask ? 'SMART' : 'Ação'} ${this.index + 1} de ${this.orphans.length}`);

        const card = contentEl.createDiv('dfm-triage-card');
        const title = card.createEl('a', { text: task.title, cls: 'dfm-triage-title', href: '#' });
        title.addEventListener('click', e => { e.preventDefault(); void this.app.workspace.openLinkText(task.path, '', 'tab'); });
        const facts = [
            reason === 'sem-vinculo' ? (smartTask ? 'sem projeto' : 'sem projeto nem SMART') : `aponta para "${target}", que não existe como projeto ou SMART`,
            task.week && `semana ${task.week}`,
            task.due && `prazo ${task.due}`,
            task.contexts.join(' '),
        ].filter(Boolean).join(' · ');
        card.createDiv({ cls: 'dfm-triage-meta', text: facts });

        const row = contentEl.createDiv('dfm-triage-actions');
        const button = (text: string, onClick: () => void, cta = false) => {
            const b = row.createEl('button', { text });
            if (cta) b.addClass('mod-cta');
            b.addEventListener('click', onClick);
        };
        const keep = (link: string) => reason !== 'vinculo-quebrado' || fold(link) !== fold(target ?? '');
        if (!smartTask) button('Ligar a uma SMART…', async () => {
            const smarts = this.board.tasks.all()
                .filter(t => t.type === 'tarefa_smart' && !TERMINAL.has(t.status))
                .sort((a, b) => b.week.localeCompare(a.week));
            const smart = await this.board.pick(smarts, s => `${s.basename}${s.projects[0] ? `  · ${s.projects[0]}` : ''}`, 'Qual SMART mãe?');
            if (!smart) return;
            await this.board.linkTask(task.path, { smart }, keep);
            this.next(true);
        }, true);
        button('Ligar a um projeto…', async () => {
            const project = await this.board.pick(this.projectNames, n => n, 'Qual projeto?');
            if (!project) return;
            await this.board.linkTask(task.path, { project }, keep);
            this.next(true);
        }, smartTask);
        button('Pular', () => this.next(false));
        button('Encerrar', () => this.close());
    }

    private next(linked: boolean): void {
        if (linked) this.linked++;
        this.index++;
        this.render();
    }
}
