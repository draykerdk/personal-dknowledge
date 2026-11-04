import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type DFMPlugin from '../../main';

export const VIEW_TYPE_DFM_RECENT = "dfm-recent-files-view";

export class DFMRecentFilesView extends ItemView {
    plugin: DFMPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: DFMPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_DFM_RECENT;
    }

    getDisplayText() {
        return "Arquivos Recentes";
    }

    getIcon() {
        return "history";
    }

    async onOpen() {
        if (!this.plugin.app.workspace.layoutReady) {
            const container = this.containerEl.children[1];
            container.empty();
            container.createEl("div", { text: "Carregando...", cls: "suggestion-note" });
            
            this.plugin.app.workspace.onLayoutReady(() => {
                this.render();
            });
            return;
        }
        this.render();
    }

    render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Arquivos Recentes", attr: { style: "margin-top: 0; padding-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border);" } });
        
        const listEl = container.createEl("div", { cls: "dfm-recent-files-list" });
        listEl.style.display = "flex";
        listEl.style.flexDirection = "column";
        listEl.style.gap = "4px";

        const files = this.plugin.settings.recentFiles || [];
        
        if (files.length === 0) {
            listEl.createEl("div", { text: "Nenhum arquivo recente", cls: "suggestion-note" });
            return;
        }

        files.forEach(path => {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file && file instanceof TFile) {
                const itemEl = listEl.createEl("div", { cls: "dfm-recent-file-item nav-file-title" });
                itemEl.style.cursor = "pointer";
                itemEl.style.padding = "4px 8px";
                itemEl.style.borderRadius = "4px";
                
                itemEl.addEventListener("mouseenter", () => itemEl.style.backgroundColor = "var(--background-modifier-hover)");
                itemEl.addEventListener("mouseleave", () => itemEl.style.backgroundColor = "transparent");

                const titleEl = itemEl.createEl("div", { text: file.basename, cls: "nav-file-title-content" });
                titleEl.style.fontWeight = "bold";
                titleEl.style.fontSize = "13px";
                
                const pathEl = itemEl.createEl("div", { text: file.path, cls: "nav-file-title-content" });
                pathEl.style.fontSize = "11px";
                pathEl.style.color = "var(--text-muted)";
                
                itemEl.addEventListener("click", () => {
                    this.plugin.app.workspace.getLeaf(false).openFile(file);
                });
            }
        });
    }
}
