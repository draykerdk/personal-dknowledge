import { App, Modal, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
import type DFMPlugin from '../main';
import { NovaArvoreModal } from './arvoreModals';
import { MODULOS_OPCIONAIS } from '../modulosOpcionais';
import { secaoDasDefinicoes } from './abaDasDefinicoes';

interface ManualHabitDraft {
    title: string;
    frequency: string;
    anchor: string;
    minimumAction: string;
    status: string;
    reviewOn: string;
}

class ManualHabitModal extends Modal {
    constructor(
        app: App,
        private readonly draft: ManualHabitDraft,
        private readonly onSave: (draft: ManualHabitDraft) => Promise<void>
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: '✍️ Hábito manual' });

        const makeInput = (label: string, value: string, placeholder: string) => {
            contentEl.createEl('label', { text: label, attr: { style: 'display:block; margin: 12px 0 4px; font-weight: 600;' } });
            const input = contentEl.createEl('input', { type: 'text', value, placeholder });
            input.style.width = '100%';
            return input;
        };

        const title = makeInput('Nome observável', this.draft.title, 'Ex.: Beber um copo de água ao acordar');
        const frequency = makeInput('Frequência', this.draft.frequency, 'Ex.: diária; semanal, quarta-feira');
        const anchor = makeInput('Âncora', this.draft.anchor, 'Quando este hábito ganha um gatilho claro?');
        const minimumAction = makeInput('Ação mínima', this.draft.minimumAction, 'A menor ação que realmente conta');
        const reviewOn = makeInput('Revisar em', this.draft.reviewOn, 'AAAA-MM-DD');
        reviewOn.type = 'date';

        contentEl.createEl('label', { text: 'Estado', attr: { style: 'display:block; margin: 12px 0 4px; font-weight: 600;' } });
        const status = contentEl.createEl('select');
        status.style.width = '100%';
        [
            ['ideia', 'Ideia'],
            ['planejado', 'Planejado'],
            ['em_treino', 'Em treino'],
            ['pausada', 'Pausado'],
            ['integrada', 'Integrado'],
            ['arquivada', 'Arquivado']
        ].forEach(([value, label]) => {
            const option = status.createEl('option', { text: label, value });
            option.selected = this.draft.status === value;
        });

        const actions = contentEl.createDiv({ cls: 'modal-button-container', attr: { style: 'margin-top: 20px;' } });
        actions.createEl('button', { text: 'Cancelar' }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: 'Salvar', cls: 'mod-cta' }).addEventListener('click', async () => {
            const next = {
                title: title.value.trim(),
                frequency: frequency.value.trim() || 'diária',
                anchor: anchor.value.trim(),
                minimumAction: minimumAction.value.trim(),
                status: status.value,
                reviewOn: reviewOn.value
            };
            if (!next.title || !next.anchor || !next.minimumAction) {
                new Notice('Nome, âncora e ação mínima são obrigatórios para criar um hábito observável.');
                return;
            }
            await this.onSave(next);
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class DFMSettingTab extends PluginSettingTab {
    plugin: DFMPlugin;
    private manualHabitStatusFilter = 'todos';

    constructor(app: App, plugin: DFMPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Configurações DFM System' });

        // As definições do sistema (B2): o nome, o fuso, os valores, as áreas, o foco, as pastas (a da
        // Caixa e a dos protocolos moravam aqui) e o protocolo de cada papel.
        secaoDasDefinicoes(this.plugin, this.app, containerEl, () => this.display());

        // As seções dos módulos opcionais (src/modulosOpcionais.ts) entram aqui, no lugar que a do agente
        // do celular sempre teve; um build sem módulos não desenha nada.
        for (const modulo of MODULOS_OPCIONAIS) {
            modulo.secaoDaAba?.({ plugin: this.plugin, app: this.app, containerEl, redesenhar: () => this.display() });
        }

        containerEl.createEl('br');
        containerEl.createEl('h2', { text: '🌱 Ciclo de vida dos hábitos' });
        containerEl.createEl('p', {
            text: 'Controle o estado de todos os hábitos. A edição de âncora e ação mínima continua disponível apenas para hábitos manuais; os guiados e automáticos preservam sua origem.',
            cls: 'setting-item-description'
        });
        const manualHabitsEl = containerEl.createDiv();
        new Setting(containerEl)
            .setName('Filtrar por estado')
            .setDesc('Ideias e planejados ficam fora do quadro Hoje até serem ativados.')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    todos: 'Todos',
                    ideia: 'Ideias',
                    planejado: 'Planejados',
                    em_treino: 'Em treino',
                    pausada: 'Pausados',
                    integrada: 'Integrados',
                    arquivada: 'Arquivados'
                })
                .setValue(this.manualHabitStatusFilter)
                .onChange(async value => {
                    this.manualHabitStatusFilter = value;
                    await this.renderHabitStatusList(manualHabitsEl);
                }));
        this.renderHabitStatusList(manualHabitsEl);
        new Setting(containerEl)
            .setName('Novo hábito manual')
            .setDesc('Cria uma nota no tracker com nome, frequência, âncora e menor ação observável.')
            .addButton(button => button
                .setButtonText('➕ Adicionar hábito')
                .setCta()
                .onClick(() => {
                    new ManualHabitModal(this.app, {
                        title: '',
                        frequency: 'diária',
                        anchor: '',
                        minimumAction: '',
                        status: 'ideia',
                        reviewOn: ''
                    }, async draft => {
                        await this.createManualHabit(draft);
                        await this.renderHabitStatusList(manualHabitsEl);
                    }).open();
                }));

        containerEl.createEl('br');
        // A seção 🔱 do alter ego (pontos, nível, C.A.O.S., E.C.H. e os botões
        // +9/+33/+108/+369) saiu em 29/10/2026, com o arquivamento da gamificação.

        containerEl.createEl('h2', { text: '🔗 Configurações de Sincronia & Canvas' });

        new Setting(containerEl)
            .setName('Formatação Automática de Tarefas')
            .setDesc('Ajusta tamanho (400x150) e cores das tarefas com base no status/prioridade ao modificar o Canvas.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.canvasFormatOnModify)
                .onChange(async (value) => {
                    this.plugin.settings.canvasFormatOnModify = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sincronização Reversa Automática')
            .setDesc('Sugere importar e conectar dependências ausentes automaticamente ao modificar/abrir o Canvas.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.canvasSyncOnModify)
                .onChange(async (value) => {
                    this.plugin.settings.canvasSyncOnModify = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sincronização de Relações de Notas')
            .setDesc('Adiciona referências e relações YAML (relatesTo/relatedBy) em notas genéricas no Canvas.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.canvasNoteRelationsEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.canvasNoteRelationsEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Prompts de Confirmação ao Excluir')
            .setDesc('Exibe caixas de diálogo perguntando se deseja remover dependências/links YAML ao apagar setas ou cards no Canvas.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.canvasDeletePromptsEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.canvasDeletePromptsEnabled = value;
                    await this.plugin.saveSettings();
                }));

        // Botões de Ações Manuais do Canvas
        const actionSetting = new Setting(containerEl)
            .setName('Ações Manuais do Canvas')
            .setDesc('Execute a sincronia ou formatação no arquivo Canvas ativo atualmente.');

        actionSetting.addButton(btn => btn
            .setButtonText('🔗 Sincronizar Canvas')
            .setCta()
            .onClick(async () => {
                const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
                if (activeView && activeView.getViewType() === "canvas") {
                    await this.plugin.canvasEngine.syncActiveCanvas(activeView);
                } else {
                    new Notice("⚠️ Abra um arquivo Canvas ativo primeiro!");
                }
            }));

        actionSetting.addButton(btn => btn
            .setButtonText('✨ Formatar Canvas')
            .onClick(async () => {
                const activeView = this.app.workspace.activeLeaf?.view || this.app.workspace.getActiveViewOfType(Object as any);
                if (activeView && activeView.getViewType() === "canvas") {
                    await this.plugin.canvasEngine.formatActiveCanvasTasks(activeView);
                } else {
                    new Notice("⚠️ Abra um arquivo Canvas ativo primeiro!");
                }
            }));

        containerEl.createEl('br');
        containerEl.createEl('h2', { text: '🌳 Árvores de Progressão' });

        const arvoreListEl = containerEl.createDiv();
        this.renderArvoreList(arvoreListEl);

        new Setting(containerEl)
            .setName('Reavaliar automaticamente')
            .setDesc('Reavalia todas as árvores ao abrir a nota diária do dia (fallback do gatilho por evento).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.arvoreProgressao.autoReavaliar)
                .onChange(async (value) => {
                    this.plugin.settings.arvoreProgressao.autoReavaliar = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Criar tarefas automaticamente')
            .setDesc('Ao desbloquear um nível, cria as tarefas dele no TaskNotes automaticamente.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.arvoreProgressao.autoCriarTarefas)
                .onChange(async (value) => {
                    this.plugin.settings.arvoreProgressao.autoCriarTarefas = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Notificar desbloqueio')
            .setDesc('Mostra um aviso quando um nível é desbloqueado ("🔓 Nível N desbloqueado em <projeto>").')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.arvoreProgressao.notificarDesbloqueio)
                .onChange(async (value) => {
                    this.plugin.settings.arvoreProgressao.notificarDesbloqueio = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Nova Árvore')
            .setDesc('Wizard: cria o esqueleto de uma nova árvore de progressão para um projeto.')
            .addButton(btn => btn
                .setButtonText('➕ Nova Árvore')
                .setCta()
                .onClick(() => {
                    new NovaArvoreModal(this.app, this.plugin, () => this.display()).open();
                }));
    }

    async renderArvoreList(containerEl: HTMLElement) {
        containerEl.empty();
        const files = this.plugin.progressionEngine.discoverTrees();

        if (files.length === 0) {
            containerEl.createEl('p', { text: 'Nenhuma árvore de progressão encontrada em 100 - AREAS.', cls: 'setting-item-description' });
            return;
        }

        for (const file of files) {
            const text = await this.app.vault.read(file);
            const tree = this.plugin.progressionEngine.parseTree(file, text);
            this.plugin.progressionEngine.evaluate(tree); // cálculo puro — só para exibição, não escreve nada

            const total = tree.tiers.length;
            const doneCount = tree.tiers.filter(t => t.status === 'done').length;
            const ativo = tree.tiers.find(t => t.status === 'ativo');
            const ativoLabel = ativo ? `🟡 N${ativo.num} — ${ativo.nome}` : (doneCount === total && total > 0 ? '✅ Completa' : '—');

            const row = new Setting(containerEl)
                .setName(tree.projectLink)
                .setDesc(`${ativoLabel} · ${doneCount}/${total} níveis concluídos`);

            row.addButton(btn => btn
                .setButtonText('🔄 Reavaliar')
                .onClick(async () => {
                    await this.plugin.progressionEngine.reevaluate(file, this.plugin.settings.arvoreProgressao);
                    new Notice(`🌳 Árvore de "${tree.projectLink}" reavaliada.`);
                    this.renderArvoreList(containerEl);
                }));

            row.addButton(btn => btn
                .setButtonText('📄 Abrir doc')
                .onClick(() => {
                    this.app.workspace.getLeaf(false).openFile(file);
                }));

            row.addButton(btn => btn
                .setButtonText('🖼️ Abrir canvas')
                .onClick(() => {
                    const canvasPath = `${file.parent.path}/${tree.projectLink.split('/').pop()} — Árvore.canvas`;
                    const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
                    if (canvasFile instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(canvasFile);
                    } else {
                        new Notice('⚠️ Canvas ainda não gerado — clique em "Reavaliar" primeiro.');
                    }
                }));
        }
    }

    private async renderHabitStatusList(containerEl: HTMLElement) {
        containerEl.empty();
        const trackerFolder = '200 - FUNCTIONS/Habits/Tracker';
        const habits = this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(`${trackerFolder}/`))
            .filter(file => this.manualHabitStatusFilter === 'todos'
                || String(this.app.metadataCache.getFileCache(file)?.frontmatter?.status || 'em_treino') === this.manualHabitStatusFilter)
            .sort((a, b) => a.path.localeCompare(b.path));

        if (habits.length === 0) {
            containerEl.createEl('p', { text: 'Nenhum hábito encontrado para este estado.', cls: 'setting-item-description' });
            return;
        }

        for (const file of habits) {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
            const title = String(frontmatter.title || file.basename);
            const frequency = String(frontmatter.frequencia || 'sem frequência definida');
            const status = String(frontmatter.status || 'em_treino');
            const tracking = String(frontmatter.tracking || 'manual');
            const reviewOn = String(frontmatter.revisar_em || 'sem revisão');
            const row = new Setting(containerEl)
                .setName(title)
                .setDesc(`${frequency} · ${status} · ${tracking} · revisar: ${reviewOn}`);

            if (tracking === 'manual') {
                row.addButton(button => button
                    .setButtonText('Editar')
                    .onClick(async () => {
                        const content = await this.app.vault.read(file);
                        new ManualHabitModal(this.app, {
                            title,
                            frequency,
                            anchor: this.extractHabitLine(content, 'Âncora'),
                            minimumAction: this.extractHabitLine(content, 'Ação mínima'),
                            status,
                            reviewOn: reviewOn === 'sem revisão' ? '' : reviewOn
                        }, async draft => {
                            await this.updateManualHabit(file, draft);
                            await this.renderHabitStatusList(containerEl);
                        }).open();
                    }));
            }
            if (status !== 'em_treino') {
                row.addButton(button => button
                    .setButtonText('Ativar')
                    .onClick(async () => {
                        await this.updateManualHabitStatus(file, 'em_treino');
                        await this.renderHabitStatusList(containerEl);
                    }));
            }
            if (status === 'em_treino') {
                row.addButton(button => button
                    .setButtonText('Pausar')
                    .onClick(async () => {
                        await this.updateManualHabitStatus(file, 'pausada');
                        await this.renderHabitStatusList(containerEl);
                    }));
            }
            if (status !== 'arquivada') {
                row.addButton(button => button
                    .setButtonText('Arquivar')
                    .onClick(async () => {
                        await this.updateManualHabitStatus(file, 'arquivada');
                        await this.renderHabitStatusList(containerEl);
                    }));
            }
            row.addButton(button => button
                .setButtonText('Abrir')
                .onClick(() => this.app.workspace.getLeaf(false).openFile(file)));
        }
    }

    private extractHabitLine(content: string, label: 'Âncora' | 'Ação mínima'): string {
        const match = content.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n\\r]*)`));
        return match?.[1]?.trim() || '';
    }

    private async createManualHabit(draft: ManualHabitDraft) {
        const trackerFolder = '200 - FUNCTIONS/Habits/Tracker';
        if (!this.app.vault.getAbstractFileByPath(trackerFolder)) {
            await this.app.vault.createFolder(trackerFolder);
        }

        const safeTitle = draft.title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Hábito manual';
        let path = `${trackerFolder}/${safeTitle}.md`;
        let suffix = 2;
        while (this.app.vault.getAbstractFileByPath(path)) {
            path = `${trackerFolder}/${safeTitle} ${suffix}.md`;
            suffix++;
        }

        const yamlTitle = draft.title.replace(/"/g, '\\"');
        const yamlFrequency = draft.frequency.replace(/"/g, '\\"');
        const content = [
            '---',
            `title: "${yamlTitle}"`,
            'entries: []',
            'type: habit',
            `status: ${draft.status}`,
            `frequencia: "${yamlFrequency}"`,
            'tracking: manual',
            ...(draft.reviewOn ? [`revisar_em: ${draft.reviewOn}`] : []),
            '---',
            '',
            `> **Âncora:** ${draft.anchor}`,
            `> **Ação mínima:** ${draft.minimumAction}`,
            '',
            '> **Função:** escolha uma prática pequena e observável; ajuste este texto quando a experiência mostrar um gatilho melhor.',
            ''
        ].join('\n');
        await this.app.vault.create(path, content);
        new Notice(`🌱 Hábito manual criado: ${draft.title}`);
    }

    private async updateManualHabit(file: TFile, draft: ManualHabitDraft) {
        const content = await this.app.vault.read(file);
        const updated = content
            .replace(/(\*\*Âncora:\*\*)[^\n\r]*/, `$1 ${draft.anchor}`)
            .replace(/(\*\*Ação mínima:\*\*)[^\n\r]*/, `$1 ${draft.minimumAction}`);
        if (updated !== content) await this.app.vault.modify(file, updated);

        await this.app.fileManager.processFrontMatter(file, fm => {
            fm.title = draft.title;
            fm.frequencia = draft.frequency;
            fm.status = draft.status;
            fm.tracking = 'manual';
            if (draft.reviewOn) fm.revisar_em = draft.reviewOn;
            else delete fm.revisar_em;
        });
        new Notice(`🌱 Hábito manual atualizado: ${draft.title}`);
    }

    private async updateManualHabitStatus(file: TFile, status: string) {
        await this.app.fileManager.processFrontMatter(file, fm => {
            fm.status = status;
        });
        new Notice(`🌱 Hábito marcado como ${status}.`);
    }
}
