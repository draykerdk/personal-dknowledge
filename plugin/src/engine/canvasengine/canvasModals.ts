import { Modal, App } from "obsidian";

/**
 * ConfirmModal is a simple modal for asking the operator to confirm edge/node updates.
 */
export class ConfirmModal extends Modal {
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    private actionTaken = false;
    
    constructor(app: App, message: string, onConfirm: () => void, onCancel?: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel || (() => {});
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Sincronizar Dependências do Canvas" });
        contentEl.createEl("p", { text: this.message });
        
        const btnContainer = contentEl.createDiv({ 
            cls: "modal-button-container", 
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;" } 
        });
        
        const cancelBtn = btnContainer.createEl("button", { text: "Não" });
        cancelBtn.addEventListener("click", () => {
            this.actionTaken = true;
            this.close();
            this.onCancel();
        });
        
        const confirmBtn = btnContainer.createEl("button", { text: "Sim", cls: "mod-cta" });
        confirmBtn.addEventListener("click", () => {
            this.actionTaken = true;
            this.close();
            this.onConfirm();
        });
    }
    
    onClose() {
        this.contentEl.empty();
        if (!this.actionTaken) {
            this.onCancel();
        }
    }
}

/**
 * CanvasDependencyModal displays multiple choices to resolve sync differences.
 */
export class CanvasDependencyModal extends Modal {
    message: string;
    options: { label: string; cls?: string; callback: () => void }[];
    onCancel: () => void;
    private actionTaken = false;
    
    constructor(app: App, message: string, options: { label: string; cls?: string; callback: () => void }[], onCancel?: () => void) {
        super(app);
        this.message = message;
        this.options = options;
        this.onCancel = onCancel || (() => {});
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "Sincronizar Dependências do Canvas" });
        contentEl.createEl("p", { text: this.message });
        
        const btnContainer = contentEl.createDiv({ 
            cls: "modal-button-container", 
            attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; flex-wrap: wrap;" } 
        });
        
        this.options.forEach(opt => {
            const btn = btnContainer.createEl("button", { text: opt.label, cls: opt.cls });
            btn.addEventListener("click", () => {
                this.actionTaken = true;
                this.close();
                opt.callback();
            });
        });
    }
    
    onClose() {
        this.contentEl.empty();
        if (!this.actionTaken) {
            this.onCancel();
        }
    }
}
