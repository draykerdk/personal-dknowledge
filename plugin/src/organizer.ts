import { App, TFile, Notice } from 'obsidian';
import type DFMPlugin from './main';
import { definicoesDe, regrasDoOrganizador } from './definicoes';

export class DFMOrganizer {
    plugin: DFMPlugin;
    app: App;

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    async getRules(): Promise<{tag: string, folder: string}[]> {
        const configPath = "200 - FUNCTIONS/Sistema de Roteamento.md";
        const file = this.app.vault.getAbstractFileByPath(configPath);
        let rules: {tag: string, folder: string}[] = [];

        if (file && file instanceof TFile) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('|') && line.includes('#')) {
                    const parts = line.split('|').map(p => p.trim());
                    if (parts.length >= 3) {
                        const tag = parts[1];
                        const folder = parts[2];
                        if (tag.startsWith('#') && folder.length > 0 && tag !== 'Tag de Gatilho') {
                            rules.push({ tag, folder });
                        }
                    }
                }
            }
        }

        if (rules.length === 0) {
            rules = regrasDoOrganizador(this.plugin.settings.organizerRules, definicoesDe(this.plugin).areas);
            if (rules.length > 0) {
                try {
                    let mdContent = `# Sistema de Roteamento DFM\n\n> 🤖 *Este arquivo define as regras de organização automática do cofre. Para adicionar uma nova regra, basta criar uma nova linha na tabela abaixo.*\n\n| Tag de Gatilho | Pasta Destino |\n| --- | --- |\n`;
                    for (const rule of rules) {
                        mdContent += `| ${rule.tag} | ${rule.folder} |\n`;
                    }
                    
                    if (!this.app.vault.getAbstractFileByPath("200 - FUNCTIONS")) {
                        await this.app.vault.createFolder("200 - FUNCTIONS");
                    }
                    if (!this.app.vault.getAbstractFileByPath(configPath)) {
                        await this.app.vault.create(configPath, mdContent);
                    }
                } catch (e) {
                    console.error("DFM: Erro ao criar arquivo de roteamento:", e);
                }
            }
        }
        return rules;
    }

    async organize(file: TFile | null) {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        const excluded = definicoesDe(this.plugin).pastas.excluidas;
        if (excluded.some(f => file.path.startsWith(f))) return;

        const content = await this.app.vault.read(file);
        const rules = await this.getRules();

        for (const rule of rules) {
            if (content.includes(rule.tag)) {
                const isAlreadyInTargetOrSubfolder = file.parent?.path === rule.folder || file.parent?.path.startsWith(rule.folder + '/');
                if (!isAlreadyInTargetOrSubfolder) {
                    const newPath = `${rule.folder}/${file.name}`;
                    // A pasta da regra tem de existir: criar a que falta fazia nascer árvores
                    // de arquiteturas antigas (`500 - RESOURCES/Knowledge/…`). Sem ela, avisa
                    // e não move (proposta de organização de 27/10/2026, item 11).
                    if (!this.app.vault.getAbstractFileByPath(rule.folder)) {
                        new Notice(`📂 DFM Organizer: a pasta ${rule.folder} não existe — nada foi movido.`, 8000);
                        break;
                    }
                    try {
                        await this.app.fileManager.renameFile(file, newPath);
                        new Notice(`📂 DFM Organizer: Movido para ${rule.folder}`);
                    } catch (e) {
                        console.error("DFM Organizer Error:", e);
                    }
                }
                break;
            }
        }
    }
}
