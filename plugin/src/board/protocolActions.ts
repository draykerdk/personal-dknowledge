/**
 * Os fios da página "Protocolos": os gestos que os módulos `protocolos-*` oferecem.
 *
 * - ▶️ roda o protocolo pelo caminho de sempre (`MissionBoard.runProtocol`);
 * - a fase e o objetivo são gravados no JSON do protocolo só no clique do operador, com a
 *   prévia do que muda, sem reformatar o arquivo (`jsonKeyEdit.ts`); depois o registro de
 *   protocolos é relido, para o 🧭 ordenar com o valor novo;
 * - a bancada e o gerador do mapa do 🧭 rodam no desktop pelo mesmo caminho da Bancada DFM
 *   (`child_process.exec`, comando fixo, `cwd` no vault). No celular, gravar e rodar
 *   ficam desligados, com o motivo escrito.
 *
 * Nada aqui decide pela pessoa: nenhuma fase muda sozinha, nenhum arquivo é apagado ou
 * movido, e o texto do objetivo é exatamente o que ela escreveu.
 */
import { Menu, Modal, Notice, Platform, TFile, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from './boardPlugin';
import { setTopLevelKey } from './jsonKeyEdit';
import { FASE_LABEL, faseChoices, faseKey, objetivoProblem, type FaseUso } from './protocolModel';
import { redrawProtocolWidgets, type ProtocolJobState, type ProtocolPanelActions } from './protocolRender';
import { BENCH_SCRIPT, PROTOCOL_INVENTORY, ROUTER_MAP_CANVAS, ROUTER_MAP_SCRIPT, benchJob, idleJob, mapJob, scriptCommand } from './protocolJobs';

const MOBILE_REASON = 'No celular, gravar no JSON e rodar scripts ficam desligados: use o desktop.';

/** Onde cada chave nova entra, se ainda não existe: ao lado do ícone e da descrição. */
const ANCHORS: Record<'fase_uso' | 'objetivo', string[]> = {
    fase_uso: ['icon', 'description', 'name', 'id'],
    objetivo: ['fase_uso', 'description', 'icon', 'name', 'id'],
};

const FASE_HINT: Record<FaseUso, string> = {
    nova: 'nova (em teste)',
    em_uso: 'em uso',
    dominada: 'dominada (já faz parte)',
    aposentada: 'aposentada (o arquivo fica; no 🧭 vem por último)',
};

class ConfirmWrite extends Modal {
    constructor(app: App, private readonly title: string, private readonly path: string, private readonly lines: { before: string | null; after: string }, private readonly done: (ok: boolean) => void) { super(app); }
    onOpen(): void {
        let ok = false;
        this.titleEl.setText(this.title);
        const body = this.contentEl.createDiv('dfm-prm');
        body.createDiv({ cls: 'dfm-prm-path', text: this.path });
        if (this.lines.before !== null) {
            body.createDiv({ cls: 'dfm-prm-label', text: 'Antes' });
            body.createEl('pre', { cls: 'dfm-prm-pre', text: this.lines.before.trim() });
        } else {
            body.createDiv({ cls: 'dfm-prm-label', text: 'A chave ainda não existe: entra uma linha nova.' });
        }
        body.createDiv({ cls: 'dfm-prm-label', text: 'Depois' });
        body.createEl('pre', { cls: 'dfm-prm-pre', text: this.lines.after.trim() });
        body.createDiv({ cls: 'dfm-prm-hint', text: 'Só esta linha muda; o resto do arquivo fica como está.' });
        const buttons = body.createDiv('dfm-prm-buttons');
        buttons.createEl('button', { text: 'Cancelar' }).addEventListener('click', () => this.close());
        const save = buttons.createEl('button', { cls: 'mod-cta', text: 'Gravar' });
        save.addEventListener('click', () => { ok = true; this.close(); });
        this.onClose = () => this.done(ok);
    }
}

class ObjetivoModal extends Modal {
    constructor(app: App, private readonly name: string, private readonly current: string, private readonly done: (value: string | null) => void) { super(app); }
    onOpen(): void {
        let value: string | null = null;
        this.titleEl.setText(`Objetivo · ${this.name}`);
        const body = this.contentEl.createDiv('dfm-prm');
        body.createDiv({ cls: 'dfm-prm-hint', text: 'O porquê desta ferramenta, numa linha. Fica gravado exatamente como você escrever.' });
        const area = body.createEl('textarea', { cls: 'dfm-prm-textarea' });
        area.value = this.current;
        area.rows = 3;
        const error = body.createDiv('dfm-prm-error');
        const buttons = body.createDiv('dfm-prm-buttons');
        const submit = () => {
            const problem = objetivoProblem(area.value);
            if (problem) { error.setText(problem === 'tem mais de uma linha' ? 'O objetivo é uma linha só: tire a quebra de linha.' : 'Escreva o objetivo antes de gravar.'); return; }
            value = area.value;
            this.close();
        };
        area.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
        });
        buttons.createEl('button', { text: 'Cancelar' }).addEventListener('click', () => this.close());
        buttons.createEl('button', { cls: 'mod-cta', text: 'Continuar' }).addEventListener('click', submit);
        window.setTimeout(() => area.focus(), 10);
        this.onClose = () => this.done(value);
    }
}

export class ProtocolTools {
    private benchState: ProtocolJobState = idleJob();
    private mapState: ProtocolJobState = idleJob();

    constructor(private readonly plugin: DFMPlugin, private readonly board: MissionBoard) {}

    private get app(): App { return this.plugin.app; }

    private manager(): any { return (this.plugin as any).manager; }

    /** Os gestos que os módulos usam (um objeto novo por desenho; o estado fica aqui). */
    actions(): ProtocolPanelActions {
        return {
            readOnlyReason: Platform.isMobile ? MOBILE_REASON : null,
            run: id => this.board.runProtocol(id),
            openFile: path => this.openFile(path),
            chooseFase: (id, event) => this.chooseFase(id, event),
            writeObjetivo: id => this.writeObjetivo(id),
            runBench: () => this.runScript('bench'),
            regenerateMap: () => this.runScript('map'),
            openMapCanvas: () => this.openNote(ROUTER_MAP_CANVAS),
            openInventory: () => this.openNote(PROTOCOL_INVENTORY),
            bench: () => this.benchState,
            map: () => this.mapState,
            icon: (el, name) => { try { setIcon(el, name); } catch (_) { /* ícone desconhecido: fica vazio */ } },
        };
    }

    /** O JSON abre no aplicativo padrão do sistema (o Obsidian não tem vista de JSON). */
    private openFile(path: string): void {
        const app: any = this.app;
        if (path.endsWith('.json') && typeof app.openWithDefaultApp === 'function') {
            app.openWithDefaultApp(path);
            return;
        }
        if (!path.endsWith('.json')) { void this.app.workspace.openLinkText(path, '', 'tab'); return; }
        new Notice(`Abra o arquivo: ${path}`, 8000);
    }

    private openNote(path: string): void {
        if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
            new Notice(`Não achei ${path}.`);
            return;
        }
        void this.app.workspace.openLinkText(path, '', 'tab');
    }

    private pathOf(id: string): string | null {
        return this.manager()?.sources?.get?.(id) ?? null;
    }

    private chooseFase(id: string, event: MouseEvent): void {
        const def = this.manager()?.get?.(id)?.def;
        const current = faseKey(def);
        const menu = new Menu();
        menu.addItem(i => i.setTitle(`Fase de ${def?.name ?? id}: ${FASE_LABEL[current]}`).setIcon('tag').setDisabled(true));
        for (const fase of faseChoices(current)) {
            menu.addItem(i => i.setTitle(`Mudar para ${FASE_HINT[fase]}`).onClick(() => void this.writeKey(id, 'fase_uso', fase)));
        }
        menu.showAtMouseEvent(event);
    }

    private writeObjetivo(id: string): void {
        if (Platform.isMobile) { new Notice(MOBILE_REASON); return; }
        const def = this.manager()?.get?.(id)?.def;
        // Só o texto que já está no arquivo (o dele) entra na caixa; nada é sugerido.
        const current = typeof def?.objetivo === 'string' ? def.objetivo : '';
        new ObjetivoModal(this.app, String(def?.name ?? id), current, value => {
            if (value !== null) void this.writeKey(id, 'objetivo', value);
        }).open();
    }

    /**
     * Grava `key` no JSON do protocolo: lê, calcula a troca no lugar, mostra o antes e o
     * depois, e só grava no "Gravar" (relendo o arquivo: se mudou desde a prévia, não grava).
     * Depois relê o registro de protocolos e o painel.
     */
    private async writeKey(id: string, key: 'fase_uso' | 'objetivo', value: string): Promise<void> {
        if (Platform.isMobile) { new Notice(MOBILE_REASON); return; }
        const path = this.pathOf(id);
        if (!path) { new Notice(`O arquivo de ${id} não é conhecido: releia os protocolos.`); return; }
        const adapter = this.app.vault.adapter;
        let original: string;
        try { original = await adapter.read(path); } catch (_) { new Notice(`Não consegui ler ${path}.`); return; }
        const edit = setTopLevelKey(original, key, value, ANCHORS[key]);
        if ('error' in edit) { new Notice(`Nada foi gravado: ${edit.error}.`, 8000); return; }
        if (!edit.changed) { new Notice(`${key} de ${id} já é esse; nada muda.`); return; }
        new ConfirmWrite(this.app, `Gravar ${key} em ${id}?`, path, { before: edit.beforeLine, after: edit.afterLine }, async ok => {
            if (!ok) return;
            const now = await adapter.read(path).catch(() => null);
            if (now !== original) { new Notice(`${path} mudou desde a prévia: nada foi gravado. Abra de novo.`, 8000); return; }
            try {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) await this.app.vault.modify(file, edit.text);
                else await adapter.write(path, edit.text);
            } catch (error) {
                new Notice(`Não consegui gravar ${path}: ${error instanceof Error ? error.message : String(error)}`, 8000);
                return;
            }
            await this.manager()?.loadProtocols?.();
            await this.board.store.refreshNow();
            new Notice(`${id}: ${key} gravado. O registro de protocolos foi relido.`);
        }).open();
    }

    private basePath(): string {
        const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
        return String(adapter?.basePath ?? adapter?.getBasePath?.() ?? '');
    }

    /** Roda a bancada ou o gerador do mapa: comando fixo, `cwd` no vault, só no desktop. */
    private runScript(which: 'bench' | 'map'): void {
        if (Platform.isMobile) { new Notice(MOBILE_REASON); return; }
        const current = which === 'bench' ? this.benchState : this.mapState;
        if (current.running) return;
        const set = (state: ProtocolJobState) => {
            if (which === 'bench') this.benchState = state; else this.mapState = state;
            redrawProtocolWidgets(document);
        };
        set({ ...idleJob(), running: true });
        try {
            const { exec } = require('child_process') as typeof import('child_process');
            exec(scriptCommand(which === 'bench' ? BENCH_SCRIPT : ROUTER_MAP_SCRIPT), { cwd: this.basePath(), timeout: 180_000 }, (error, stdout, stderr) => {
                const message = error ? String(error.message ?? error) : null;
                const state = which === 'bench' ? benchJob(String(stdout ?? ''), String(stderr ?? ''), message) : mapJob(String(stdout ?? ''), String(stderr ?? ''), message);
                set(state);
                new Notice(`${which === 'bench' ? 'Bancada' : 'Mapa do 🧭'}: ${state.summary}`);
            });
        } catch (error) {
            set({ running: false, summary: 'Não foi possível rodar o script aqui.', ok: false, detail: [error instanceof Error ? error.message : String(error)] });
        }
    }
}
