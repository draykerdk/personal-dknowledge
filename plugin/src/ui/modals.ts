import { App, Modal, TextAreaComponent } from 'obsidian';
import { renderStepHeader } from './stepHeader';

/** Id do checkbox de uma opção do multiselect. `/\s/` — e não `/\\s/`, que casa barra
 *  invertida + "s" — troca os espaços, e o índice garante id único mesmo quando duas
 *  opções normalizam para o mesmo texto (sem isso, o `for=` do label mira o checkbox errado). */
export function multiselectOptionId(index: number, option: string): string {
    return `ms-${index}-${String(option ?? '').replace(/\s/g, '-')}`;
}

export class InputModal extends Modal {
    promptText: string;
    placeholder: string;
    onSubmit: (result: { status: string; value?: string }) => void;
    showBack: boolean;
    initialValue: string;
    info: string;
    submitted: boolean;

    constructor(app: App, promptText: string, placeholder: string, onSubmit: (result: { status: string; value?: string }) => void, showBack = false, initialValue = "", info = "") {
        super(app);
        this.promptText = promptText;
        this.placeholder = placeholder;
        this.onSubmit = onSubmit;
        this.showBack = showBack;
        this.initialValue = initialValue || "";
        this.info = info || "";
        this.submitted = false;
    }

    onOpen() {
        const { contentEl } = this;
        renderStepHeader(contentEl, this.promptText, this.info, this.app as any);

        const input = contentEl.createEl("input", { type: "text" });
        input.placeholder = this.placeholder || "";
        input.style.width = "100%";
        input.value = this.initialValue;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);

        const submit = () => {
            this.submitted = true;
            this.close();
            this.onSubmit({ status: 'submit', value: input.value });
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit();
        });

        const btnContainer = contentEl.createDiv({ cls: "modal-button-container", attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;" } });

        if (this.showBack) {
            const backBtn = btnContainer.createEl("button", { text: "Voltar" });
            backBtn.addEventListener("click", () => {
                this.submitted = true;
                this.close();
                this.onSubmit({ status: 'back' });
            });
        }

        const submitBtn = btnContainer.createEl("button", { text: "Confirmar", cls: "mod-cta" });
        submitBtn.addEventListener("click", submit);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (!this.submitted) {
            this.onSubmit({ status: 'cancel' });
        }
    }
}

export class TextAreaModal extends Modal {
    promptText: string;
    placeholder: string;
    onSubmit: (result: { status: string; value?: string }) => void;
    showBack: boolean;
    initialValue: string;
    info: string;
    submitted: boolean;

    constructor(app: App, promptText: string, placeholder: string, onSubmit: (result: { status: string; value?: string }) => void, showBack = false, initialValue = "", info = "") {
        super(app);
        this.promptText = promptText;
        this.placeholder = placeholder;
        this.onSubmit = onSubmit;
        this.showBack = showBack;
        this.initialValue = initialValue || "";
        this.info = info || "";
        this.submitted = false;
    }

    onOpen() {
        const { contentEl } = this;
        renderStepHeader(contentEl, this.promptText, this.info, this.app as any);

        const input = new TextAreaComponent(contentEl);
        input.setPlaceholder(this.placeholder || "");
        input.inputEl.style.width = "100%";
        input.inputEl.style.minHeight = "160px";
        if (this.initialValue) {
            // Redundante de propósito: setValue() é a API pública, mas escrevemos
            // também direto no elemento como salvaguarda — se por algum motivo
            // setValue() não "pegar" (timing, versão do Obsidian), o valor ainda
            // aparece. Nunca vimos isso falhar, mas o custo de garantir é zero.
            input.setValue(this.initialValue);
            input.inputEl.value = this.initialValue;
        }
        input.inputEl.focus();
        input.inputEl.setSelectionRange(input.inputEl.value.length, input.inputEl.value.length);

        const submit = () => {
            this.submitted = true;
            this.close();
            this.onSubmit({ status: 'submit', value: input.getValue() });
        };

        input.inputEl.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                submit();
            }
        });

        const help = contentEl.createEl("small", {
            text: "Use Cmd/Ctrl + Enter para confirmar.",
            cls: "suggestion-note"
        });
        help.style.display = "block";
        help.style.marginTop = "8px";

        const btnContainer = contentEl.createDiv({ cls: "modal-button-container", attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;" } });

        if (this.showBack) {
            const backBtn = btnContainer.createEl("button", { text: "Voltar" });
            backBtn.addEventListener("click", () => {
                this.submitted = true;
                this.close();
                this.onSubmit({ status: 'back' });
            });
        }

        const submitBtn = btnContainer.createEl("button", { text: "Confirmar", cls: "mod-cta" });
        submitBtn.addEventListener("click", submit);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (!this.submitted) {
            this.onSubmit({ status: 'cancel' });
        }
    }
}

export class MultiSelectModal extends Modal {
    promptText: string;
    info: string;
    options: string[];
    onSubmit: (result: { status: string; value?: string; values?: string[] }) => void;
    showBack: boolean;
    selected: Set<string>;
    submitted: boolean;

    constructor(app: App, promptText: string, options: string[], onSubmit: (result: { status: string; value?: string; values?: string[] }) => void, showBack = false, initialValue = "", info = "") {
        super(app);
        this.promptText = promptText;
        this.info = info || "";
        this.options = options;
        this.onSubmit = onSubmit;
        this.showBack = showBack;
        // Reconstrói a seleção anterior (formato "A, B, C" gerado no submit) para que
        // voltar a este passo reabra com as opções já marcadas em vez de vazias.
        const previous = initialValue && initialValue !== "Nenhum"
            ? initialValue.split(",").map(s => s.trim()).filter(Boolean)
            : [];
        this.selected = new Set(previous);
        this.submitted = false;
    }

    onOpen() {
        const { contentEl } = this;
        renderStepHeader(contentEl, this.promptText, this.info, this.app as any);

        const listEl = contentEl.createDiv({ cls: "dfm-multiselect-list" });

        for (const [index, option] of this.options.entries()) {
            const itemEl = listEl.createDiv({ cls: "dfm-multiselect-item" });
            const checkbox = itemEl.createEl("input", { type: "checkbox" });
            checkbox.id = multiselectOptionId(index, option);
            checkbox.checked = this.selected.has(option);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    this.selected.add(option);
                } else {
                    this.selected.delete(option);
                }
            });
            const label = itemEl.createEl("label", { text: option });
            label.setAttribute("for", checkbox.id);
            label.style.marginLeft = "8px";
            label.style.cursor = "pointer";
        }

        const btnContainer = contentEl.createDiv({ cls: "modal-button-container", attr: { style: "display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;" } });

        if (this.showBack) {
            const backBtn = btnContainer.createEl("button", { text: "Voltar" });
            backBtn.addEventListener("click", () => {
                this.submitted = true;
                this.close();
                this.onSubmit({ status: 'back' });
            });
        }

        const submitBtn = btnContainer.createEl("button", { text: "Confirmar", cls: "mod-cta" });
        submitBtn.addEventListener("click", () => {
            this.submitted = true;
            this.close();
            // `values`: a lista, para quem precisa dela sem desfazer o texto (um rótulo
            // com vírgula não se perde); `value` segue o texto de sempre.
            const values = this.options.filter(option => this.selected.has(option));
            const result = Array.from(this.selected).join(", ");
            this.onSubmit({ status: 'submit', value: result || "Nenhum", values });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (!this.submitted) {
            this.onSubmit({ status: 'cancel' });
        }
    }
}
