import { App, SuggestModal, TFile } from 'obsidian';
import { renderStepHeader } from './stepHeader';
import { nowSuggestionText, type NowItem } from '../engine/nowTree';
import { noteLinkName } from '../engine/noteLink';
import type { ChoiceRankItem } from '../engine/choose';
import { notasCandidatas, type NotePropertyFilter } from '../engine/noteCandidates';

/**
 * Cabeçalho para os modais de sugestão.
 *
 * Num SuggestModal o prompt só tinha um lugar: o placeholder do campo de busca. Um
 * prompt didático de 250 caracteres simplesmente não era lido — e são ~35% dos passos
 * do sistema. Aqui ele vira cabeçalho de verdade, acima da busca, e o placeholder fica
 * com a primeira linha.
 *
 * Defensivo de propósito: roda dentro do onOpen do Obsidian e não pode derrubar o modal
 * se a API mudar de forma.
 */
export function mountSuggesterHeader(modal: any, promptText?: string, info?: string) {
    try {
        const texto = String(promptText ?? '').trim();
        if ((!texto && !info) || !modal?.modalEl?.createDiv) return;
        const header = modal.modalEl.createDiv({ cls: "dfm-suggester-header" });
        renderStepHeader(header, texto, info);
        if (modal.modalEl.firstChild && header !== modal.modalEl.firstChild) {
            modal.modalEl.insertBefore(header, modal.modalEl.firstChild);
        }
    } catch (e) {
        // cabeçalho é enfeite: nunca impede o passo de rodar
    }
}

/** A linha discreta da opção que veio do formulário (`DFM_Suggester.padrao`). */
export const PADRAO_DO_FORMULARIO = '⭐ o que já estava no formulário: Enter mantém';

/**
 * O que faz: as linhas do seletor de opções para a busca: as que contêm o texto (sem caixa);
 * sem busca, o ⬅️ Voltar (quando há) e, antes dele, a opção padrão (o valor do formulário).
 * Prova: tests/engine/protocolForm.test.ts ("_valoresIniciais").
 */
export function suggesterItems(items: readonly string[], query: string, showBack: boolean, padrao: string | null): string[] {
    let suggestions = items.filter(item => item.toLowerCase().includes(query.toLowerCase()));
    if (!query && padrao && suggestions.includes(padrao)) suggestions = [padrao, ...suggestions.filter(item => item !== padrao)];
    if (showBack && !query) {
        suggestions = padrao && suggestions[0] === padrao ? [padrao, "⬅️ Voltar", ...suggestions.slice(1)] : ["⬅️ Voltar", ...suggestions];
    }
    return suggestions;
}

export class DFM_Suggester extends SuggestModal<string> {
    items: string[];
    onChoose: (result: { status: string; value?: string }) => void;
    showBack: boolean;
    stepPrompt: string;
    stepInfo: string;
    resolved: boolean;
    /**
     * A linha do porquê de cada opção (o `rankOptions` dos routers, Fase D): aparece
     * discreta, abaixo da opção; a opção escolhida continua o texto escrito no JSON.
     */
    notes: Record<string, string>;
    /**
     * A opção que abre a lista (o valor que veio do formulário, `_valoresIniciais`; P11 da
     * Missão): sem busca, ela vem primeiro, antes do ⬅️ Voltar, e o Enter a mantém.
     */
    padrao: string | null;

    constructor(app: App, items: string[], onChoose: (result: { status: string; value?: string }) => void, showBack = false, stepPrompt = "", stepInfo = "", notes: Record<string, string> = {}, padrao?: string) {
        super(app);
        this.items = items;
        this.notes = notes && typeof notes === 'object' ? notes : {};
        this.padrao = typeof padrao === 'string' && items.includes(padrao) ? padrao : null;
        if (this.padrao && !this.notes[this.padrao]) this.notes = { ...this.notes, [this.padrao]: PADRAO_DO_FORMULARIO };
        this.onChoose = onChoose;
        this.showBack = showBack;
        this.stepPrompt = stepPrompt;
        this.stepInfo = stepInfo;
        this.resolved = false;
    }

    onOpen() {
        (SuggestModal.prototype as any).onOpen?.call(this);
        mountSuggesterHeader(this, this.stepPrompt, this.stepInfo);
    }

    // Esc/clique-fora também precisa resolver a Promise do protocolo: sem isto o
    // await ficava pendente para sempre e o rascunho nunca era salvo.
    onClose() {
        (SuggestModal.prototype as any).onClose?.call(this);
        if (this.resolved) return;
        this.resolved = true;
        this.onChoose({ status: 'cancel' });
    }

    /**
     * O que faz: marca o passo como respondido antes de o Obsidian fechar o modal da escolha.
     * Por quê: o `selectSuggestion` do Obsidian (Enter ou clique numa opção) chama `close()`
     * e só depois `onChooseSuggestion()`, e no desktop o `close()` chama o `onClose()` na
     * hora. Sem a marca, o `onClose` tomava a escolha por desistência e respondia 'cancel'
     * primeiro: a Promise do passo resolvia com ele e o protocolo parava ali, com RASCUNHO
     * quando já havia resposta (🌙 em 19/10 e 21/10, 📅 em 25/10). No celular o fechamento
     * é animado e o `onClose` vem depois, por isso lá a escolha chegava.
     * Prova: tests/ui/suggestChoiceLifecycle.test.ts.
     */
    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        super.selectSuggestion(value, evt);
    }

    getSuggestions(query: string): string[] {
        return suggesterItems(this.items, query, this.showBack, this.padrao);
    }

    renderSuggestion(item: string, el: HTMLElement) {
        if (item === "⬅️ Voltar") {
            el.createEl("div", { text: item, attr: { style: "font-weight: bold; color: var(--text-accent);" } });
        } else {
            el.createEl("div", { text: item });
            const note = this.notes[item];
            if (note) el.createEl("small", { text: note, cls: "suggestion-note" });
        }
    }

    onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        if (item === "⬅️ Voltar") {
            this.onChoose({ status: 'back' });
        } else {
            this.onChoose({ status: 'submit', value: item });
        }
    }
}

/** O nome de link da nota (`README.md` vira o nome da pasta): mora em `engine/noteLink.ts`. */
export { noteLinkName };

/**
 * O que faz: a posição da resposta padrão do passo na lista do seletor (a nota com esse
 * nome, sem diferença de maiúsculas e acentos), ou -1.
 * Prova: tests/ui/noteSuggesterDefault.test.ts.
 */
export function defaultFileIndex(files: ReadonlyArray<{ basename?: string } | null | undefined>, basename: string): number {
    const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const alvo = fold(basename);
    if (!alvo) return -1;
    return files.findIndex(file => !!file && fold(file.basename) === alvo);
}

export interface NoteSuggesterConfig {
    folderFilter?: string;
    allowAnyNote?: boolean;
    allowSkip?: boolean;
    allowFreeText?: boolean;
    allowCreate?: boolean;
    createLabel?: string;
    skipLabel?: string;
    preferredFolders?: string[];
    limit?: number;
    excludeArchive?: boolean;
    propertyFilter?: NotePropertyFilter | NotePropertyFilter[];
    stepPrompt?: string;
    stepInfo?: string;
    /** Notas que abrem a lista, nesta ordem (ex.: o compromisso deixado ontem pelo 🌙). */
    pinnedBasenames?: string[];
    /** Notas cujo campo começa com o valor vêm logo depois (ex.: `scheduled` de hoje). */
    preferredProperty?: { key: string; value: string } | null;
    /**
     * A resposta padrão do passo (o par de valores da semana no 🌳): sem busca, a nota com
     * este nome abre a lista, antes do ⬅️ Voltar e do pular, e o Enter a aceita.
     */
    defaultBasename?: string | null;
    /**
     * A árvore do agora (`nowTree.ts`): só estas notas, nesta ordem, cada uma com a
     * linha do porquê; as 3 primeiras em destaque e as "📥 a triar" no fim.
     */
    nowRanking?: { items: NowItem[]; newTaskLabel?: string } | null;
}

/** O filtro de propriedade do passo: mora com a filtragem das candidatas (`engine/noteCandidates.ts`). */
export type { NotePropertyFilter };

export class NoteSuggester extends SuggestModal<any> {
    folderFilter: string;
    allowAnyNote: boolean;
    allowSkip: boolean;
    allowFreeText: boolean;
    allowCreate: boolean;
    createLabel: string;
    skipLabel: string;
    preferredFolders: string[];
    limit: number;
    excludeArchive: boolean;
    propertyFilter: NotePropertyFilter | NotePropertyFilter[] | null;
    stepPrompt: string;
    stepInfo: string;
    pinnedBasenames: string[];
    preferredProperty: { key: string; value: string } | null;
    defaultBasename: string | null;
    nowRanking: { items: NowItem[]; newTaskLabel?: string } | null;
    nowIndex: Map<string, number>;
    /** `rankWith` (núcleo, 21/10): a ordem da escolha e a linha dos motivos de cada nota. */
    choiceRanking: ChoiceRankItem[] | null = null;
    choiceIndex: Map<string, number> = new Map();
    onChoose: (result: { status: string; value?: string; display?: string; item?: any }) => void;
    showBack: boolean;
    files: TFile[];
    activeFile: TFile | null;
    resolved: boolean;

    constructor(app: App, config: NoteSuggesterConfig | string, onChoose: (result: { status: string; value?: string; display?: string; item?: any }) => void, showBack = false) {
        super(app);
        const normalizedConfig = typeof config === "string"
            ? { folderFilter: config }
            : (config || {});

        this.folderFilter = normalizedConfig.folderFilter || "";
        this.allowAnyNote = normalizedConfig.allowAnyNote || false;
        this.allowSkip = normalizedConfig.allowSkip || false;
        this.allowFreeText = normalizedConfig.allowFreeText || false;
        this.allowCreate = normalizedConfig.allowCreate || false;
        this.createLabel = normalizedConfig.createLabel || "➕ Criar uma nota nova";
        this.skipLabel = normalizedConfig.skipLabel || "⏭️ Pular (sem conexão)";
        this.preferredFolders = (normalizedConfig.preferredFolders || []).filter(Boolean);
        this.limit = normalizedConfig.limit || 40;
        this.excludeArchive = normalizedConfig.excludeArchive !== false;
        this.propertyFilter = normalizedConfig.propertyFilter || null;
        this.stepPrompt = normalizedConfig.stepPrompt || "";
        this.stepInfo = normalizedConfig.stepInfo || "";
        this.pinnedBasenames = (normalizedConfig.pinnedBasenames || []).filter(Boolean);
        this.preferredProperty = normalizedConfig.preferredProperty?.key && normalizedConfig.preferredProperty?.value
            ? normalizedConfig.preferredProperty
            : null;
        this.defaultBasename = typeof normalizedConfig.defaultBasename === 'string' && normalizedConfig.defaultBasename.trim()
            ? normalizedConfig.defaultBasename.trim()
            : null;
        this.nowRanking = normalizedConfig.nowRanking && Array.isArray(normalizedConfig.nowRanking.items)
            ? normalizedConfig.nowRanking
            : null;
        this.nowIndex = new Map((this.nowRanking?.items ?? []).map((item, index) => [item.path, index]));
        this.onChoose = onChoose;
        this.showBack = showBack;
        this.files = app.vault.getMarkdownFiles();
        this.activeFile = app.workspace.getActiveFile();
        this.resolved = false;
    }

    onOpen() {
        (SuggestModal.prototype as any).onOpen?.call(this);
        mountSuggesterHeader(this, this.stepPrompt, this.stepInfo);
    }

    // Mesma razão do DFM_Suggester: fechar sem escolher é uma resposta legítima
    // ('cancel'), não um await eterno.
    onClose() {
        (SuggestModal.prototype as any).onClose?.call(this);
        if (this.resolved) return;
        this.resolved = true;
        this.onChoose({ status: 'cancel' });
    }

    /** O que faz: marca a escolha antes do `close()` do Obsidian (a razão está no `DFM_Suggester.selectSuggestion`). */
    selectSuggestion(value: any, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        super.selectSuggestion(value, evt);
    }

    /**
     * O que faz: liga a ordem da escolha de um domínio (`rankWith`): as notas na ordem
     * dela, cada uma com a linha dos motivos; os eliminados por filtro vêm no fim,
     * marcados. As candidatas continuam as mesmas: só a ordem, a nota pequena e o limite
     * (que passa a caber a lista inteira) mudam.
     */
    setChoiceRanking(items: ChoiceRankItem[] | null) {
        this.choiceRanking = Array.isArray(items) && items.length ? items : null;
        this.choiceIndex = new Map((this.choiceRanking ?? []).map((item, index) => [item.path, index]));
        // O eliminado nunca some: a lista cabe inteira, mesmo acima do limite do passo.
        if (this.choiceRanking) this.limit = Math.max(this.limit, this.choiceRanking.length);
    }

    /**
     * O hábito da árvore do agora (o 🔁 em treino, 2.29): mora no tracker, fora da pasta
     * e do filtro de propriedades do passo, e entra mesmo assim (a árvore já o filtrou).
     */
    isNowHabit(file: TFile): boolean {
        const item = this.nowRanking ? this.nowRanking.items[this.nowIndex.get(file.path) ?? -1] : undefined;
        return item?.tipo === 'habito';
    }

    /**
     * O que faz: as candidatas do passo, pela filtragem única (`notasCandidatas`): a árvore do
     * agora, o arquivo, a pasta e as propriedades, com os hábitos do agora no fim.
     */
    getCandidateFiles(): TFile[] {
        return notasCandidatas(this.files, {
            agora: this.nowRanking ? this.nowIndex : null,
            habitoDoAgora: file => this.isNowHabit(file),
            excludeArchive: this.excludeArchive,
            folderFilter: this.folderFilter,
            allowAnyNote: this.allowAnyNote,
            propertyFilter: this.propertyFilter,
        }, file => this.app.metadataCache.getFileCache(file)?.frontmatter);
    }

    isPreferredFile(file: TFile): boolean {
        if (this.folderFilter && file.path.startsWith(this.folderFilter)) {
            return true;
        }
        return this.preferredFolders.some(folder => file.path.startsWith(folder));
    }

    scoreFile(file: TFile, query: string): number {
        const basename = file.basename.toLowerCase();
        const path = file.path.toLowerCase();
        let score = 0;

        if (this.activeFile && file.path === this.activeFile.path) score += 1000;
        if (this.isPreferredFile(file)) score += 250;
        // A pauta do dia no topo da lista: o compromisso de ontem primeiro, depois o
        // agendado para hoje. Por data de modificação, qualquer tarefa tocada depois do
        // 🌙 (seta de canvas, sync do celular) passava na frente da "única coisa".
        // Só sem busca: com texto digitado, quem manda é o que foi digitado.
        const pin = query ? -1 : this.pinnedBasenames.indexOf(file.basename);
        if (pin >= 0) score += 4000 - pin;
        if (this.preferredProperty && !query) {
            const raw = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.preferredProperty.key];
            if (raw !== undefined && raw !== null && String(raw).startsWith(this.preferredProperty.value)) score += 2000;
        }
        if (file.path.includes("/000 - INDEX/")) score += 80;
        if (file.basename === "00 - INDEX") score += 60;
        if (path.startsWith("200 - functions/")) score -= 250;
        if (path.startsWith("900 - archive/")) score -= 150;

        if (query) {
            if (basename === query) score += 600;
            else if (basename.startsWith(query)) score += 450;
            else if (basename.includes(query)) score += 300;
            else if (path.includes(query)) score += 120;
            else score -= 200;
        } else {
            score += Math.floor((file.stat?.mtime || 0) / 10000000);
        }

        return score;
    }

    getSuggestions(query: string): any[] {
        const lowerQuery = query.toLowerCase();
        let suggestions = this.getCandidateFiles()
            .filter(file => {
                if (this.isNowHabit(file)) {
                    const name = this.nowRanking!.items[this.nowIndex.get(file.path) ?? -1]?.name ?? '';
                    return !lowerQuery || name.toLowerCase().includes(lowerQuery) || file.basename.toLowerCase().includes(lowerQuery);
                }
                if (this.folderFilter && !this.allowAnyNote && !file.path.startsWith(this.folderFilter)) return false;
                return file.basename.toLowerCase().includes(lowerQuery) || file.path.toLowerCase().includes(lowerQuery);
            })
            .sort((a, b) => {
                // Árvore do agora: a ordem é a dos pesos, com ou sem busca.
                if (this.nowRanking) return (this.nowIndex.get(a.path) ?? 0) - (this.nowIndex.get(b.path) ?? 0);
                // `rankWith`: a ordem da escolha, com ou sem busca (a nota fora dela, no fim).
                if (this.choiceRanking) {
                    const rank = (this.choiceIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (this.choiceIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER);
                    if (rank !== 0) return rank;
                }
                const scoreDiff = this.scoreFile(b, lowerQuery) - this.scoreFile(a, lowerQuery);
                if (scoreDiff !== 0) return scoreDiff;
                return (b.stat?.mtime || 0) - (a.stat?.mtime || 0);
            })
            .slice(0, this.limit);

        const special: any[] = [];
        // Na árvore do agora, o ⬅️ Voltar (trocar de lugar ou de tempo) e o ✨ tarefa nova
        // ficam também com texto digitado: a busca que não acha nada no filtro (a tarefa é
        // de outro lugar, ou não existe) não pode virar beco sem saída, em que só o Esc
        // cancelava o gesto inteiro. Com texto, o ✨ leva o texto como título do formulário.
        if (this.showBack && (!query || this.nowRanking)) {
            special.push({ isBack: true });
        }
        if (this.nowRanking) {
            const typed = query.trim();
            const label = this.nowRanking.newTaskLabel || '✨ Trabalhar numa tarefa nova';
            special.push({ isNewTask: true, label: typed ? `${label}: "${typed}"` : label, value: typed });
        }
        if (this.allowSkip && !query) {
            special.push({ isSkip: true, label: this.skipLabel });
        }
        if (this.allowFreeText && query.trim().length > 0) {
            special.push({ isFreeText: true, label: `✏️ Usar texto livre: "${query.trim()}"`, value: query.trim() });
        }
        // A criação aparece SEMPRE que habilitada — sem texto ela pergunta o nome depois,
        // com texto ela já usa o que foi digitado. Sem isso, não achar a nota na lista era
        // um beco sem saída: só restava abortar o protocolo e ir criar a nota à mão.
        if (this.allowCreate) {
            const typed = query.trim();
            special.push({
                isCreate: true,
                label: typed ? `➕ Criar: "${typed}"` : this.createLabel,
                value: typed
            });
        }

        // A resposta padrão (o par de valores da semana no 🌳) abre a lista, antes das
        // linhas especiais: o Enter a aceita. Com texto digitado, quem manda é a busca.
        const padrao = !query && this.defaultBasename ? defaultFileIndex(suggestions, this.defaultBasename) : -1;
        if (padrao >= 0) {
            const [first] = suggestions.splice(padrao, 1);
            return [first, ...special, ...suggestions];
        }
        return [...special, ...suggestions];
    }

    renderSuggestion(file: any, el: HTMLElement) {
        if (file.isBack) {
            el.createEl("div", { text: "⬅️ Voltar", attr: { style: "font-weight: bold; color: var(--text-accent);" } });
            return;
        }

        if (file.isSkip) {
            el.createEl("div", { text: file.label, attr: { style: "font-weight: bold;" } });
            el.createEl("small", { text: "Seguir sem conectar a nenhuma nota específica", cls: "suggestion-note" });
            return;
        }

        if (file.isFreeText) {
            el.createEl("div", { text: file.label, attr: { style: "font-weight: bold; color: var(--text-accent);" } });
            el.createEl("small", { text: "Ignorar notas e inserir como texto livre", cls: "suggestion-note" });
            return;
        }

        if (file.isCreate) {
            el.createEl("div", { text: file.label, attr: { style: "font-weight: bold; color: var(--text-accent);" } });
            el.createEl("small", { text: "Criar a nota agora e seguir com ela", cls: "suggestion-note" });
            return;
        }

        if (file.isNewTask) {
            el.createEl("div", { text: file.label, attr: { style: "font-weight: bold; color: var(--text-accent);" } });
            el.createEl("small", { text: "Abre o formulário do TaskNotes; a tarefa salva vira a escolhida", cls: "suggestion-note" });
            return;
        }

        const choiceItem = this.choiceRanking ? this.choiceRanking[this.choiceIndex.get(file.path) ?? -1] : undefined;
        if (choiceItem) {
            el.createEl("div", { text: choiceItem.title, attr: choiceItem.destaque ? { style: "font-weight: bold;" } : {} });
            el.createEl("small", { text: choiceItem.note, cls: "suggestion-note" });
            return;
        }

        const nowItem = this.nowRanking ? this.nowRanking.items[this.nowIndex.get(file.path) ?? -1] : undefined;
        if (nowItem) {
            const text = nowSuggestionText(nowItem);
            el.createEl("div", { text: text.title, attr: nowItem.destaque ? { style: "font-weight: bold;" } : {} });
            el.createEl("small", { text: text.note, cls: "suggestion-note" });
            return;
        }

        el.createEl("div", { text: file.basename });
        const badges: string[] = [];
        if (this.defaultBasename && defaultFileIndex([file], this.defaultBasename) === 0) badges.push("⭐ resposta padrão desta semana");
        if (this.activeFile && file.path === this.activeFile.path) badges.push("nota atual");
        if (this.isPreferredFile(file)) badges.push("contexto");
        const suffix = badges.length > 0 ? ` • ${badges.join(" • ")}` : "";
        el.createEl("small", { text: `${file.path}${suffix}`, cls: "suggestion-note" });
    }

    onChooseSuggestion(file: any, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        if (file.isBack) {
            this.onChoose({ status: 'back' });
        } else if (file.isSkip) {
            this.onChoose({ status: 'submit', value: "", display: "Sem conexão contextual" });
        } else if (file.isFreeText) {
            this.onChoose({ status: 'submit', value: file.value, display: file.value });
        } else if (file.isCreate) {
            this.onChoose({ status: 'create', value: file.value });
        } else if (file.isNewTask) {
            this.onChoose(file.value ? { status: 'newtask', value: file.value } : { status: 'newtask' });
        } else {
            const name = noteLinkName(file);
            this.onChoose({ status: 'submit', value: name, display: `[[${name}]]`, item: file });
        }
    }
}

export class TaskSuggester extends SuggestModal<any> {
    items: any[];
    onChoose: (result: { status: string; value?: string; item?: any }) => void;
    showBack: boolean;
    resolved: boolean;

    constructor(app: App, items: any[], onChoose: (result: { status: string; value?: string; item?: any }) => void, showBack = false) {
        super(app);
        this.items = items;
        this.onChoose = onChoose;
        this.showBack = showBack;
        this.resolved = false;
    }

    // Sem isto, fechar o seletor de tarefas deixava o passo pendente e o protocolo
    // morria em silêncio.
    onClose() {
        (SuggestModal.prototype as any).onClose?.call(this);
        if (this.resolved) return;
        this.resolved = true;
        this.onChoose({ status: 'cancel' });
    }

    /** O que faz: marca a escolha antes do `close()` do Obsidian (a razão está no `DFM_Suggester.selectSuggestion`). */
    selectSuggestion(value: any, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        super.selectSuggestion(value, evt);
    }

    getSuggestions(query: string): any[] {
        const lowerQuery = query.toLowerCase();
        let suggestions = this.items.filter(item => {
            if (item.isCreate || item.isBack) return true;
            const text = `${item.text} ${item.file.path}`.toLowerCase();
            return text.includes(lowerQuery);
        });

        const createItem = suggestions.find(item => item.isCreate);
        const backItem = suggestions.find(item => item.isBack);
        const tasks = suggestions.filter(item => !item.isCreate && !item.isBack);

        const ordered: any[] = [];
        if (this.showBack && backItem) ordered.push(backItem);
        if (createItem) ordered.push(createItem);
        return [...ordered, ...tasks.slice(0, 100)];
    }

    renderSuggestion(item: any, el: HTMLElement) {
        if (item.isBack) {
            el.createEl("div", { text: "⬅️ Voltar", attr: { style: "font-weight: bold; color: var(--text-accent);" } });
            return;
        }

        if (item.isCreate) {
            el.createEl("div", { text: item.label, attr: { style: "font-weight: bold;" } });
            el.createEl("small", { text: "Criar nova tarefa agora no contexto atual", cls: "suggestion-note" });
            return;
        }

        el.createEl("div", { text: item.text });
        el.createEl("small", {
            text: `${item.file.path}:${item.line} [${item.status}]`,
            cls: "suggestion-note"
        });
    }

    onChooseSuggestion(item: any, evt: MouseEvent | KeyboardEvent) {
        this.resolved = true;
        if (item.isBack) {
            this.onChoose({ status: 'back' });
            return;
        }

        if (item.isCreate) {
            this.onChoose({ status: 'create' });
            return;
        }

        this.onChoose({ status: 'submit', value: item.text, item });
    }
}

/**
 * Texto comparável para busca: sem acento e sem caixa.
 *
 * O operador digita "bussola" e "revisao" no meio do fluxo; exigir o acento (ou o
 * emoji do nome) era o que transformava o menu de 139 itens num exercício de memória.
 * NFD separa a letra do acento e o range U+0300–U+036F remove a marca combinante.
 */
export function normalizeForSearch(text: unknown): string {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/**
 * Aliases declarados no JSON (`def.aliases`). A forma canônica é lista, mas um JSON
 * antigo pode trazer string solta — normalizar aqui evita um alias virar 12 letras
 * pesquisáveis uma a uma.
 */
export function protocolAliases(protocol: any): string[] {
    const aliases = protocol?.def?.aliases;
    if (!aliases) return [];
    const lista = Array.isArray(aliases) ? aliases : [aliases];
    return lista.filter((alias: any) => typeof alias === 'string' && alias.trim().length > 0);
}

/**
 * A consulta casa contra nome, id, aliases e descrição — todos sem acento e sem caixa.
 *
 * Consulta vazia casa com tudo (o menu abre completo, como antes); quem exclui os
 * redirects é o `getSuggestions`, não esta função.
 */
export function protocolMatchesQuery(protocol: any, query: string): boolean {
    const alvo = normalizeForSearch(query).trim();
    if (!alvo) return true;
    const campos = [
        protocol?.name,
        protocol?.id,
        ...protocolAliases(protocol),
        protocol?.def?.description
    ];
    return campos.some(campo => normalizeForSearch(campo).includes(alvo));
}

/** Chave de ordenação do nome: sem acento, sem caixa e sem o emoji/ícone da frente. */
function protocolNameSortKey(protocol: any): string {
    return normalizeForSearch(protocol?.name).replace(/^[^a-z0-9]+/, '').trim();
}

/** Chave de agrupamento: a fase declarada, normalizada. */
function protocolPhaseSortKey(protocol: any): string {
    return normalizeForSearch(protocol?.def?.fase).trim();
}

/**
 * Ordem do menu: agrupado por fase e, dentro do grupo, por nome.
 *
 * Antes a lista saía na ordem interna do Map do manager — que depende da ordem em que
 * o vault devolveu os arquivos. Aqui a ordem é função só do conteúdo: `<` compara
 * code units, sem depender de ICU/locale, e o id desempata dois nomes iguais. Protocolo
 * sem fase vai para o fim, para o menu não abrir com um grupo sem rótulo.
 */
export function sortProtocolsForMenu(protocols: any[]): any[] {
    return [...(protocols || [])].sort((a, b) => {
        const faseA = protocolPhaseSortKey(a);
        const faseB = protocolPhaseSortKey(b);
        if (faseA !== faseB) {
            if (!faseA) return 1;
            if (!faseB) return -1;
            return faseA < faseB ? -1 : 1;
        }
        const nomeA = protocolNameSortKey(a);
        const nomeB = protocolNameSortKey(b);
        if (nomeA !== nomeB) return nomeA < nomeB ? -1 : 1;
        const idA = normalizeForSearch(a?.id);
        const idB = normalizeForSearch(b?.id);
        return idA < idB ? -1 : idA > idB ? 1 : 0;
    });
}

/** Trecho de descrição exibido na terceira linha (o teto pedido é ~90 caracteres). */
export const PROTOCOL_DESCRIPTION_MAX = 90;

/** Corta a descrição em fronteira de palavra e marca o corte com reticências. */
export function truncateForSuggestion(text: unknown, max: number = PROTOCOL_DESCRIPTION_MAX): string {
    const limpo = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (limpo.length <= max) return limpo;
    const corte = limpo.lastIndexOf(' ', max);
    const base = limpo.slice(0, corte > 0 ? corte : max).replace(/[\s,;:.!?—-]+$/u, '');
    return `${base}…`;
}

export interface ProtocolSuggestionText {
    /** Linha principal: ícone + nome (como antes). */
    title: string;
    /** Linha pequena: `id · fase`, com a fase só quando declarada. */
    meta: string;
    /** Terceira linha discreta: trecho da descrição, vazio quando não há. */
    description: string;
}

/**
 * Texto da sugestão extraído como função pura: o harness de teste não tem DOM, então
 * o que o menu mostra precisa ser verificável fora do `createEl`.
 */
export function protocolSuggestionText(protocol: any): ProtocolSuggestionText {
    const id = String(protocol?.id ?? '');
    const fase = String(protocol?.def?.fase ?? '').trim();
    return {
        title: `${protocol?.icon || 'star'} ${protocol?.name ?? ''}`.trim(),
        meta: fase ? `${id} · ${fase}` : id,
        description: truncateForSuggestion(protocol?.def?.description)
    };
}

export class ProtocolSelectorModal extends SuggestModal<any> {
    manager: any; // ProtocolManager

    constructor(app: App, manager: any) {
        super(app);
        this.manager = manager;
    }

    // Diferente dos outros três, este menu não tem callback nem Promise: escolher
    // apenas dispara `protocol.run()`. Fechar sem escolher não executa nada, então
    // o onClose só mantém explícita a limpeza do modal base.
    onClose() {
        (SuggestModal.prototype as any).onClose?.call(this);
    }

    getSuggestions(query: string): any[] {
        const protocols = this.manager.getAll();
        // Aliases (redirects) continuam executáveis via botões/ids antigos, mas não poluem o menu
        const executaveis = protocols.filter((p: any) => !p?.def?.redirect);
        return sortProtocolsForMenu(executaveis.filter((p: any) => protocolMatchesQuery(p, query)));
    }

    renderSuggestion(protocol: any, el: HTMLElement) {
        const texto = protocolSuggestionText(protocol);
        el.createEl("div", { text: texto.title });
        el.createEl("small", { text: texto.meta, cls: "suggestion-note" });
        if (texto.description) {
            el.createEl("small", { text: texto.description, cls: "suggestion-note" });
        }
    }

    onChooseSuggestion(protocol: any, evt: MouseEvent | KeyboardEvent) {
        protocol.run();
    }
}
