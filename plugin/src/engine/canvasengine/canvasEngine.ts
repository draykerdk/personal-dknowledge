import { TFile, TFolder, Notice, debounce, App } from "obsidian";
import type DFMPlugin from "../../main";
import { CanvasFormatter } from "./canvasFormatter";
import { CanvasSyncManager } from "./canvasSync";
import { hasManagedZone, legacyEdgeAllowed, legacyRemovalAsks } from "../../canvas/managedIds";
import { canvasWritesAllowed } from "../../canvas/managedZone";
import { areaLink, isAreaType } from "../areaIndex";
import type { CanvasEngine as CanvasEngineContract, TaskCreationContext } from "./canvasEngineTypes";

/**
 * Rastreio do motor de canvas — **desligado por padrão**.
 *
 * O `diagLog` escrevia um arquivo na **raiz do vault** a cada evento, e a própria
 * auditoria do vault (2026-07-21) lista o `dfm-canvas-diag.log` como cruft a
 * arquivar, junto de dois planos que pedem a mesma coisa. Um plugin que gerencia o
 * vault não deve depositar lixo nele para se explicar: quem precisar do rastreio
 * liga esta constante e desliga depois.
 */
const CANVAS_DIAGNOSTICS = false;

function diagLog(msg: string, plugin?: any) {
    if (!CANVAS_DIAGNOSTICS) return;
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    if (plugin && plugin.app && plugin.app.vault && plugin.app.vault.adapter) {
        plugin.app.vault.adapter.append('dfm-canvas-diag.log', line).catch(() => {});
    }
}

/** Log de depuração do fluxo, sujeito à mesma chave do `diagLog`. */
function debugLog(msg: string, ...rest: any[]) {
    if (!CANVAS_DIAGNOSTICS) return;
    console.log(`[DFM-CANVAS] ${msg}`, ...rest);
}

/**
 * O que faz: o duplo clique num nó do canvas é do motor (que abre o editor do
 * TaskNotes)? Entra: o alvo do clique, o nó e se este aparelho grava canvas. Sai: sim
 * ou não. Não é do motor:
 * - no celular, onde o nó fica com o comportamento nativo;
 * - num botão do cartão de tarefa (⏭️, 🤝, a bolinha): o clique é do botão, e o
 *   editor abrindo por cima da ação era o defeito;
 * - num nó com o cartão montado (`__dfmTaskDbl`): o ouvinte do cartão já abre a
 *   tarefa, respeitando o só-leitura e os botões. O motor, ouvindo no `document` em
 *   captura, parava o evento antes de ele chegar ao cartão.
 */
export function engineOpensTaskOnDblclick(target: any, nodeEl: any, writesAllowed: boolean): boolean {
    if (!writesAllowed) return false;
    if (target?.closest?.('.dfm-tc button')) return false;
    if (nodeEl?.__dfmTaskDbl) return false;
    return true;
}

export interface PendingCanvasTaskInsertion {
    view: any;
    pos: any;
    context?: TaskCreationContext | null;
    createdAt?: number;
    timer?: any;
}

export class CanvasEngine implements CanvasEngineContract {
    public plugin: DFMPlugin;
    public formatter: CanvasFormatter;
    public syncManager: CanvasSyncManager;

    private processingCanvas: Set<string> = new Set();
    private queuedModifications: Set<string> = new Set();
    private previousCanvasEdges: Map<string, Set<string>> = new Map();
    private previousCanvasFiles: Map<string, Set<string>> = new Map();
    private ignoreModifyFor: string | null = null;
    private pendingCanvasInsertion: PendingCanvasTaskInsertion | null = null;
    private periodicFormatTimer: number | null = null;

    public clearPeriodicInterval(): void {
        if (this.periodicFormatTimer !== null) {
            const clearFn = typeof window !== 'undefined' ? window.clearInterval : clearInterval;
            clearFn(this.periodicFormatTimer as any);
            this.periodicFormatTimer = null;
        }
    }

    public clearPendingInsertion() {
        if (this.pendingCanvasInsertion?.timer) {
            clearTimeout(this.pendingCanvasInsertion.timer);
        }
        this.pendingCanvasInsertion = null;
    }

    public getPendingCanvasInsertion(): PendingCanvasTaskInsertion | null {
        return this.pendingCanvasInsertion;
    }
    private pendingMarkdownInsertion: { view: any } | null = null;
    private promptingCanvas: string | null = null;
    private arvoreDebounceTimers: Map<string, number> = new Map();

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
        this.formatter = new CanvasFormatter(this);
        this.syncManager = new CanvasSyncManager(this);
    }

    /**
     * Registra o estado que o próprio plugin acabou de gravar como a linha de base
     * do canvas. Sem isso, a próxima leitura veria os nós e setas da zona gerida
     * como "adicionados" ou "removidos" pelo operador e pediria confirmação à toa.
     */
    acceptCanvasState(path: string, data: { nodes?: any[]; edges?: any[] }): void {
        const fileById = new Map<string, string>();
        for (const node of data.nodes ?? []) if (node?.type === 'file' && typeof node.file === 'string') fileById.set(node.id, node.file);
        const edges = new Set<string>();
        for (const edge of data.edges ?? []) {
            const from = fileById.get(edge.fromNode), to = fileById.get(edge.toNode);
            if (from && to) edges.add(`${from}|${to}`);
        }
        this.previousCanvasFiles.set(path, new Set(fileById.values()));
        this.previousCanvasEdges.set(path, edges);
    }

    public getPromptingCanvas(): string | null {
        return this.promptingCanvas;
    }

    public setPromptingCanvas(val: string | null) {
        this.promptingCanvas = val;
    }

    public setIgnoreModifyFor(val: string | null) {
        this.ignoreModifyFor = val;
    }

    registerEvents() {
        debugLog("DFM System: CanvasEngine.registerEvents() chamado");
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) => {
                if (!this.plugin.app.workspace.layoutReady) return;
                if (file instanceof TFile && file.extension === 'canvas') {
                    debugLog(`DFM System: Canvas modify detectado: ${file.path}`);
                    this.processCanvasFile(file);
                }
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-open', (file) => {
                if (!this.plugin.app.workspace.layoutReady) return;
                if (file instanceof TFile && file.extension === 'canvas') {
                    debugLog(`DFM System: Canvas aberto: ${file.path}`);
                    this.processCanvasFile(file);
                }
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file) => {
                if (file.path) {
                    this.previousCanvasEdges.delete(file.path);
                    this.previousCanvasFiles.delete(file.path);
                }
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.vault.on('rename', async (file, oldPath) => {
                if (!(file instanceof TFolder)) return;

                if (file.path.includes('100 - PROJECTS') || file.path.includes('200 - DEPARTMENTS') || file.path.includes('100 - AREAS')) {
                    const oldNameMatch = oldPath.match(/([^\/]+)$/);
                    if (!oldNameMatch) return;
                    
                    const oldName = oldNameMatch[1];
                    const newName = file.name;

                    if (oldName === newName) return;

                    const expectedCanvasPath = `${file.path}/${oldName}.canvas`;
                    const canvasFile = this.plugin.app.vault.getAbstractFileByPath(expectedCanvasPath);
                    
                    if (canvasFile instanceof TFile) {
                        const newCanvasPath = `${file.path}/${newName}.canvas`;
                        try {
                            await this.plugin.app.fileManager.renameFile(canvasFile, newCanvasPath);
                            new Notice(`Canvas sincronizado: ${newName}.canvas`);
                        } catch (e) {
                            console.error('DFM System: Falha ao renomear canvas sincronizado', e);
                        }
                    }
                }
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file) => {
                if (!this.plugin.app.workspace.layoutReady) return;
                if (file instanceof TFile && file.extension === 'md') {
                    const hasPending = !!(this.pendingCanvasInsertion || this.pendingMarkdownInsertion);
                    const startsWithTaskNotes = file.path.startsWith('TaskNotes/');
                    diagLog(`Vault create: path=${file.path} | hasPending=${hasPending} | startsWithTaskNotes=${startsWithTaskNotes}`, this.plugin);
                    debugLog(`DFM System: Vault create: ${file.path} | pending=${hasPending} | tasknotes=${startsWithTaskNotes}`);
                    if (hasPending && startsWithTaskNotes) {
                        diagLog(`Interceptada criação de arquivo de tarefa via vault: ${file.path}. Agendando handleTaskCreatedEvent em 150ms...`, this.plugin);
                        debugLog(`DFM System: Interceptada criação de arquivo de tarefa via vault: ${file.path}`);
                        setTimeout(() => {
                            this.handleTaskCreatedEvent({ taskPath: file.path, path: file.path });
                        }, 150);
                    }
                }
            })
        );

        this.plugin.registerDomEvent(document, 'dblclick', (evt: MouseEvent) => {
            try {
                const activeView = this.plugin.app.workspace.activeLeaf?.view || this.plugin.app.workspace.getActiveViewOfType(Object as any);
                if (!activeView || activeView.getViewType() !== "canvas") return;

                const canvasNodeEl = (evt.target as HTMLElement).closest('.canvas-node');
                if (!canvasNodeEl) return;
                if (!engineOpensTaskOnDblclick(evt.target, canvasNodeEl, canvasWritesAllowed())) return;

                const nodeId = canvasNodeEl.getAttribute('data-id');
                if (!nodeId) return;

                const canvas = (activeView as any).canvas;
                const node = canvas?.nodes.get(nodeId);
                if (!node) return;

                let nodeFile: TFile | null = null;
                if (node.file && typeof node.file.path === 'string') {
                    nodeFile = node.file;
                } else if (typeof node.file === 'string') {
                    const f = this.plugin.app.vault.getAbstractFileByPath(node.file);
                    if (f && typeof f.path === 'string') nodeFile = f as TFile;
                }

                if (nodeFile && this.getFileType(nodeFile) === "tasknote") {
                    evt.preventDefault();
                    evt.stopImmediatePropagation();

                    const tasknotes = (this.plugin.app as any).plugins.plugins.tasknotes;
                    if (tasknotes && tasknotes.api) {
                        tasknotes.api.tasks.get(nodeFile.path).then((task: any) => {
                            if (task) {
                                tasknotes.openTaskEditModal(task);
                            } else {
                                if (nodeFile) this.plugin.app.workspace.getLeaf(true).openFile(nodeFile);
                            }
                        }).catch((err) => {
                            console.error("DFM System: Erro ao obter tarefa no clique duplo:", err);
                            if (nodeFile) this.plugin.app.workspace.getLeaf(true).openFile(nodeFile);
                        });
                    } else {
                        this.plugin.app.workspace.getLeaf(true).openFile(nodeFile);
                    }
                }
            } catch (err) {
                console.error("DFM System: Erro geral no manipulador de clique duplo:", err);
            }
        }, { capture: true });

        const registerTaskNotesEvents = () => {
            const tasknotes = (this.plugin.app as any).plugins.plugins.tasknotes;
            if (tasknotes && tasknotes.api && tasknotes.api.events) {
                this.plugin.registerEvent(
                    tasknotes.api.events.on('task.created', (event: any) => {
                        debugLog("CanvasEngine: Evento task.created recebido do TaskNotes", event);
                        this.handleTaskCreatedEvent(event);
                    })
                );
                this.plugin.registerEvent(
                    tasknotes.api.events.on('task.completed', (event: any) => {
                        debugLog("CanvasEngine: Evento task.completed recebido do TaskNotes", event);
                        this.handleTaskChangedEvent(event);
                    })
                );
                this.plugin.registerEvent(
                    tasknotes.api.events.on('task.updated', (event: any) => {
                        debugLog("CanvasEngine: Evento task.updated recebido do TaskNotes", event);
                        this.handleTaskChangedEvent(event);
                    })
                );
                this.plugin.registerEvent(
                    tasknotes.api.events.on('task.status.changed', (event: any) => {
                        debugLog("CanvasEngine: Evento task.status.changed recebido do TaskNotes", event);
                        this.handleTaskChangedEvent(event);
                    })
                );
                debugLog("CanvasEngine: Mapeamento de eventos adicionais do TaskNotes registrado com sucesso.");
                return true;
            }
            return false;
        };

        this.plugin.app.workspace.onLayoutReady(() => {
            if (!registerTaskNotesEvents()) {
                debugLog("CanvasEngine: API do TaskNotes não disponível na inicialização. Agendando retentativas...");
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    if (registerTaskNotesEvents() || attempts >= 5) {
                        clearInterval(interval);
                    }
                }, 1000);
            }
        });

        // A cada 5 s, formata os nós e monta os cartões nas vistas abertas (cor do
        // status, cartão de tarefa). Antes este laço apagava a linha de base do
        // motor e reprocessava o canvas inteiro: toda seta parecia nova a cada
        // 5 s, e a tradução antiga e os pedidos ("Importar ausentes") voltavam em
        // ciclo. Agora é só o passo de formatação, sem diff (Fase 6).
        this.plugin.app.workspace.onLayoutReady(() => {
            const setFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
            const timerId = setFn(() => {
                if (!this.plugin.app.workspace.layoutReady) return;
                this.formatOpenCanvases();
            }, 5000);
            this.periodicFormatTimer = timerId as any;
            if (typeof this.plugin.registerInterval === 'function') {
                this.plugin.registerInterval(timerId as any);
            }
        });
    }

    /**
     * O passo de formatação das vistas abertas: cor, tamanho e cartão de cada nó
     * (`formatNode`), e `requestSave` só se algum nó mudou. Não compara setas,
     * não toca a linha de base nem grava campo de tarefa: isso é do observador
     * de setas (`canvas/edgeLinkWatcher.ts`). Devolve quantos canvas mudaram.
     * No celular só monta os cartões, para ler (o formatador não muda nó lá), e
     * nunca pede para gravar: o canvas no iPhone só lê (4.7).
     */
    formatOpenCanvases(): number {
        if (!this.plugin.settings.canvasFormatOnModify) return 0;
        const writes = canvasWritesAllowed();
        let changed = 0;
        for (const leaf of this.plugin.app.workspace.getLeavesOfType("canvas")) {
            const view = leaf.view as any;
            const canvas = view?.canvas;
            const file = view?.file;
            if (!canvas?.nodes || !file) continue;
            let needsSave = false;
            for (const node of Array.from(canvas.nodes.values()) as any[]) {
                try {
                    if (this.formatNode(canvas, node, file)) needsSave = true;
                } catch (error) {
                    console.error("DFM System: falha ao formatar nó do canvas", file.path, error);
                }
            }
            if (needsSave && writes) {
                changed++;
                this.ignoreModifyFor = file.path;
                canvas.requestSave?.();
            }
        }
        return changed;
    }

    public getFileType(file: TFile): string | null {
        if (file.path.startsWith("TaskNotes/Tasks/")) return "tasknote";

        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm) return null;

        if (fm.type && typeof fm.type === 'string' && fm.type.startsWith('tarefa_')) return "tasknote";
        if (fm.type) return fm.type;
        
        let tags: string[] = [];
        if (Array.isArray(fm.tags)) {
            tags = fm.tags.map(t => String(t).toLowerCase());
        } else if (typeof fm.tags === 'string') {
            tags = fm.tags.split(',').map(t => t.trim().toLowerCase());
        }
        
        if (tags.some(t => t === 'task' || t === 'sidequest' || t === '- sidequest')) {
            return "tasknote";
        }

        const hasTaskProps = 
            fm.priority !== undefined || 
            fm.due !== undefined || 
            fm.scheduled !== undefined || 
            fm.timeEntries !== undefined || 
            fm.blockedBy !== undefined || 
            fm.blocking !== undefined;
            
        if (hasTaskProps) {
            return "tasknote";
        }
        
        return null;
    }

    /** O modal de confirmação, carregado só na hora de perguntar (e trocável no teste). */
    private loadConfirmModal(): any {
        return require("./canvasModals").ConfirmModal;
    }

    processCanvasFile = debounce(async (file: TFile) => {
        if (this.processingCanvas.has(file.path)) {
            this.queuedModifications.add(file.path);
            return;
        }

        if (this.ignoreModifyFor === file.path) {
            this.ignoreModifyFor = null;
            return;
        }

        this.processingCanvas.add(file.path);

        try {
            const activeView = this.plugin.app.workspace.activeLeaf?.view || this.plugin.app.workspace.getActiveViewOfType(Object as any);
            const view = activeView as any;
            if (view && view.getViewType() === "canvas" && view.file?.path === file.path) {
                const canvas = view.canvas;
                if (!canvas) return;
                // No celular o canvas só lê (4.7): os cartões são montados para ler, e
                // nenhuma seta vira campo, nenhuma pergunta abre e nada é regravado.
                if (!canvasWritesAllowed()) {
                    for (const node of canvas.nodes?.values?.() ?? []) {
                        try { this.formatNode(canvas, node, file); } catch (error) { console.error("DFM System: falha ao montar o cartão no celular", file.path, error); }
                    }
                    return;
                }
                // Setas que tocam tarefa, semana ou dia não viram campo pela tradução
                // antiga em canvas nenhum (nem na adição, nem na remoção): quem as
                // traduz é o observador de setas, com uma tabela só (Fase 6). Num
                // canvas com zona gerida, a sincronização reversa também não roda.
                const managed = hasManagedZone(canvas.nodes?.keys?.() ?? []);

                const currentEdges = new Set<string>();
                for (const [id, edge] of canvas.edges.entries()) {
                    const fromNode = edge.from?.node;
                    const toNode = edge.to?.node;
                    if (fromNode?.file instanceof TFile && toNode?.file instanceof TFile) {
                        currentEdges.add(`${fromNode.file.path}|${toNode.file.path}`);
                    }
                }

                const currentFiles = new Set<string>();
                for (const node of canvas.nodes.values()) {
                    if (node.file instanceof TFile) {
                        currentFiles.add(node.file.path);
                    } else if (typeof node.file === 'string') {
                        currentFiles.add(node.file);
                    }
                }

                const previousEdges = this.previousCanvasEdges?.get(file.path) || new Set<string>();
                const previousFiles = this.previousCanvasFiles?.get(file.path);

                const areSetsEqual = (a: Set<string>, b: Set<string>) => {
                    if (a.size !== b.size) return false;
                    for (const item of a) if (!b.has(item)) return false;
                    return true;
                };

                const filesChanged = !previousFiles || !areSetsEqual(currentFiles, previousFiles);
                const edgesChanged = !areSetsEqual(currentEdges, previousEdges);

                if (!filesChanged && !edgesChanged) {
                    return;
                }

                const filesAdded = previousFiles ? [...currentFiles].some(x => !previousFiles.has(x)) : false;

                let needsSave = false;

                if (this.plugin.settings.canvasFormatOnModify) {
                    for (const [id, node] of canvas.nodes.entries()) {
                        if (this.formatNode(canvas, node, file)) {
                            needsSave = true;
                        }
                    }
                }

                const updates = new Map<string, any>();
                const getUpdates = (path: string) => {
                    if (!updates.has(path)) updates.set(path, {});
                    return updates.get(path)!;
                };

                const addUpdate = (path: string, field: string, value: string, isRemove = false) => {
                    const up = getUpdates(path);
                    if (!up[field]) up[field] = { add: [], remove: [] };
                    if (isRemove) up[field].remove.push(value);
                    else up[field].add.push(value);
                };

                const noteRelationUpdates = new Map<string, any>();
                const getNoteRelationUpdates = (path: string) => {
                    if (!noteRelationUpdates.has(path)) noteRelationUpdates.set(path, {});
                    return noteRelationUpdates.get(path)!;
                };

                const addNoteRelationUpdate = (path: string, field: string, value: string) => {
                    const up = getNoteRelationUpdates(path);
                    if (!up[field]) up[field] = { add: [], remove: [] };
                    up[field].add.push(value);
                };

                for (const currentEdge of currentEdges) {
                    if (!previousEdges.has(currentEdge)) {
                        const [fromPath, toPath] = currentEdge.split('|');
                        const fromFile = this.plugin.app.vault.getAbstractFileByPath(fromPath) as TFile;
                        const toFile = this.plugin.app.vault.getAbstractFileByPath(toPath) as TFile;

                        if (fromFile && toFile) {
                            const fromType = this.getFileType(fromFile);
                            const toType = this.getFileType(toFile);
                            if (!legacyEdgeAllowed({ fromType, toType })) continue;
                            const fromLink = `[[${fromFile.basename}]]`;
                            const toLink = `[[${toFile.basename}]]`;

                            // Tarefa (aberta ou arquivada), semana e dia já saíram acima.
                            const isMeta = (t: string | null) => t === "meta";
                            const isProject = (t: string | null) => t === "project" || t === "iniciativa" || t === "departamento";
                            const isObjetivo = (t: string | null) => t === "objetivo" || t === "iniciativa";
                            const isArea = (t: string | null) => isAreaType(t);

                            if (isMeta(fromType) && (isProject(toType) || isObjetivo(toType))) {
                                addUpdate(fromPath, "projects", toLink);
                                addUpdate(fromPath, "projeto", toLink);
                            } else if (isProject(fromType) && (isProject(toType) || isArea(toType))) {
                                // A nota da área é um README: vai pelo caminho, e não `[[README]]`.
                                addUpdate(fromPath, "area", isArea(toType) ? areaLink(toFile) : toLink);
                            } else if (fromType === null && toType === null) {
                                const fromCache = this.plugin.app.metadataCache.getFileCache(fromFile);
                                const fromFm = fromCache?.frontmatter || {};
                                const relatesField = ('se_relaciona' in fromFm) ? 'se_relaciona' : 'relatesTo';
                                addNoteRelationUpdate(fromPath, relatesField, toLink);

                                const toCache = this.plugin.app.metadataCache.getFileCache(toFile);
                                const toFm = toCache?.frontmatter || {};
                                const relatedField = ('e_relacionado' in toFm) ? 'e_relacionado' : 'relatedBy';
                                addNoteRelationUpdate(toPath, relatedField, fromLink);
                            }
                        }
                    }
                }

                const removedUpdates: { fromFile: TFile, toFile: TFile, fromType: string | null, toType: string | null }[] = [];

                for (const prevEdge of previousEdges) {
                    if (!currentEdges.has(prevEdge)) {
                        const [fromPath, toPath] = prevEdge.split('|');
                        if (currentFiles.has(fromPath) && currentFiles.has(toPath)) {
                            const fromFile = this.plugin.app.vault.getAbstractFileByPath(fromPath) as TFile;
                            const toFile = this.plugin.app.vault.getAbstractFileByPath(toPath) as TFile;

                            if (fromFile && toFile) {
                                const fromType = this.getFileType(fromFile);
                                const toType = this.getFileType(toFile);
                                // A pergunta de desfazer fica só para nota↔nota.
                                if (legacyEdgeAllowed({ fromType, toType }) && legacyRemovalAsks({ fromType, toType })) {
                                    removedUpdates.push({ fromFile, toFile, fromType, toType });
                                }
                            }
                        }
                    }
                }

                await this.syncManager.applyBatchedUpdates(updates);

                if (this.plugin.settings.canvasNoteRelationsEnabled && noteRelationUpdates.size > 0) {
                    const notice = new Notice("", 180000);
                    const container = notice.noticeEl;
                    container.empty();
                    container.style.display = "flex";
                    container.style.flexDirection = "column";
                    container.style.gap = "8px";
                    container.style.padding = "14px";
                    container.style.borderLeft = "3px solid var(--dfm-cyber-purple)";

                    container.createEl("div", { 
                        text: "📝 Conexão de Notas", 
                        attr: { style: "font-weight: bold; font-size: 0.95em; color: var(--text-accent);" } 
                    });
                    container.createEl("div", { 
                        text: `Deseja gravar as relações nos metadados YAML das notas comuns?`, 
                        attr: { style: "font-size: 0.85em; color: var(--text-muted);" } 
                    });

                    const actionRow = container.createDiv({ attr: { style: "display: flex; gap: 8px; margin-top: 4px;" } });
                    const btnSave = actionRow.createEl("button", {
                        text: "💾 Gravar",
                        cls: "dfm-btn-mini",
                        attr: { style: "font-weight: bold; font-size: 0.8em; background: var(--interactive-accent); color: white;" }
                    });
                    const btnIgnore = actionRow.createEl("button", {
                        text: "Ignorar",
                        cls: "dfm-btn-mini",
                        attr: { style: "font-size: 0.8em;" }
                    });

                    btnSave.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        notice.hide();
                        await this.syncManager.applyBatchedUpdates(noteRelationUpdates);
                        new Notice("Relações de notas salvas com sucesso!");
                    });

                    btnIgnore.addEventListener("click", (e) => {
                        e.stopPropagation();
                        notice.hide();
                    });
                }

                const removedNotesFromCanvas: TFile[] = [];
                const targetCanvasLink = `[[${file.basename}]]`;
                const checkCanvasLink = (val: any) => {
                    if (Array.isArray(val)) return val.includes(targetCanvasLink);
                    if (typeof val === 'string') return val === targetCanvasLink || val.includes(targetCanvasLink);
                    return false;
                };

                // Só a nota que estava no canvas e saiu agora. Antes, qualquer nota do vault
                // com `relacoes: [[<canvas>]]` fora dele (até a de um nó tirado meses atrás,
                // ou a homônima) reabria a pergunta a cada processamento.
                for (const path of previousFiles ?? []) {
                    if (currentFiles.has(path)) continue;
                    const f = this.plugin.app.vault.getAbstractFileByPath(path);
                    if (!(f instanceof TFile) || f.extension !== 'md') continue;
                    const cache = this.plugin.app.metadataCache.getFileCache(f);
                    const fm = cache?.frontmatter || {};
                    const type = this.getFileType(f);
                    if (type === null && (checkCanvasLink(fm.relacoes) || checkCanvasLink(fm.relations))) {
                        removedNotesFromCanvas.push(f);
                    }
                }

                const runModals = async () => {
                    if (this.promptingCanvas === file.path) return;

                    // Carregado só quando há o que perguntar.
                    const confirmModal = () => this.loadConfirmModal();

                    if (this.plugin.settings.canvasDeletePromptsEnabled && removedUpdates.length > 0) {
                        // Cada pergunta sai da fila ao abrir: a resposta chama runModals()
                        // de novo para a pergunta seguinte, e a lista cheia reabria esta.
                        const pendingEdges = removedUpdates.splice(0);
                        const ConfirmModalClass = confirmModal();
                        this.promptingCanvas = file.path;
                        const confirmMsg = `Você removeu ${pendingEdges.length} conexões de seta no Canvas. Deseja remover também a dependência correspondente nos metadados YAML destas notas?`;
                        
                        new ConfirmModalClass(
                            this.plugin.app,
                            confirmMsg,
                            async () => {
                                try {
                                    const batchUpdates = new Map<string, any>();
                                    const getBatchUpdates = (p: string) => {
                                        if (!batchUpdates.has(p)) batchUpdates.set(p, {});
                                        return batchUpdates.get(p)!;
                                    };
                                    const addBatchUpdate = (p: string, field: string, value: string) => {
                                        const up = getBatchUpdates(p);
                                        if (!up[field]) up[field] = { add: [], remove: [] };
                                        up[field].remove.push(value);
                                    };

                                    for (const update of pendingEdges) {
                                        const fromLink = `[[${update.fromFile.basename}]]`;
                                        const toLink = `[[${update.toFile.basename}]]`;

                                        if (update.fromType === null && update.toType === null) {
                                            const fromCache = this.plugin.app.metadataCache.getFileCache(update.fromFile);
                                            const fromFm = fromCache?.frontmatter || {};
                                            const relatesField = ('se_relaciona' in fromFm) ? 'se_relaciona' : 'relatesTo';
                                            addBatchUpdate(update.fromFile.path, relatesField, toLink);

                                            const toCache = this.plugin.app.metadataCache.getFileCache(update.toFile);
                                            const toFm = toCache?.frontmatter || {};
                                            const relatedField = ('e_relacionado' in toFm) ? 'e_relacionado' : 'relatedBy';
                                            addBatchUpdate(update.toFile.path, relatedField, fromLink);
                                        }
                                    }
                                    await this.syncManager.applyBatchedUpdates(batchUpdates);
                                } finally {
                                    this.promptingCanvas = null;
                                    if (removedNotesFromCanvas.length > 0) {
                                        setTimeout(() => runModals(), 300);
                                    }
                                }
                            },
                            () => {
                                this.promptingCanvas = null;
                                if (removedNotesFromCanvas.length > 0) {
                                    setTimeout(() => runModals(), 300);
                                }
                            }
                        ).open();
                    } else if (this.plugin.settings.canvasDeletePromptsEnabled && removedNotesFromCanvas.length > 0) {
                        const pendingNotes = removedNotesFromCanvas.splice(0);
                        const ConfirmModalClass = confirmModal();
                        this.promptingCanvas = file.path;
                        const confirmMsg = `Você removeu ${pendingNotes.length} nota(s) do Canvas. Deseja remover também a referência a este Canvas nos metadados YAML delas?`;
                        
                        new ConfirmModalClass(
                            this.plugin.app,
                            confirmMsg,
                            async () => {
                                try {
                                    const canvasBatchUpdates = new Map<string, any>();
                                    const getCanvasBatch = (p: string) => {
                                        if (!canvasBatchUpdates.has(p)) canvasBatchUpdates.set(p, {});
                                        return canvasBatchUpdates.get(p)!;
                                    };
                                    const addCanvasBatchRemove = (p: string, field: string, val: string) => {
                                        const up = getCanvasBatch(p);
                                        if (!up[field]) up[field] = { add: [], remove: [] };
                                        up[field].remove.push(val);
                                    };

                                    for (const note of pendingNotes) {
                                        const noteCache = this.plugin.app.metadataCache.getFileCache(note);
                                        const noteFm = noteCache?.frontmatter || {};
                                        const field = ('relations' in noteFm) ? 'relations' : 'relacoes';
                                        addCanvasBatchRemove(note.path, field, targetCanvasLink);
                                    }
                                    await this.syncManager.applyBatchedUpdates(canvasBatchUpdates);
                                } finally {
                                    this.promptingCanvas = null;
                                }
                            },
                            () => {
                                this.promptingCanvas = null;
                            }
                        ).open();
                    }
                };

                await runModals();

                this.previousCanvasEdges.set(file.path, currentEdges);
                this.previousCanvasFiles.set(file.path, currentFiles);

                if (needsSave) {
                    this.ignoreModifyFor = file.path;
                    canvas.requestSave();
                }

                if (!managed && this.plugin.settings.canvasSyncOnModify && (!previousFiles || filesAdded || edgesChanged)) {
                    if (typeof canvas.getData === 'function') {
                        const canvasData = canvas.getData();
                        this.syncManager.checkAndPromptReverseSync(file, canvasData);
                    }
                }
            }
        } finally {
            this.processingCanvas.delete(file.path);
            if (this.queuedModifications.has(file.path)) {
                this.queuedModifications.delete(file.path);
                setTimeout(() => {
                    this.processCanvasFile(file);
                }, 100);
            }
        }
    }, 500);

    handleTaskCreatedEvent(event: any) {
        const taskPath = event.taskPath || event.path || (event.task && event.task.path);
        diagLog(`handleTaskCreatedEvent: taskPath=${taskPath} | event=${JSON.stringify(event)}`, this.plugin);
        if (!taskPath) {
            diagLog("handleTaskCreatedEvent abortada: sem taskPath", this.plugin);
            return;
        }
        debugLog(`DFM System: handleTaskCreatedEvent processando tarefa: ${taskPath}`);

        const file = this.plugin.app.vault.getAbstractFileByPath(taskPath);
        if (!(file instanceof TFile)) {
            diagLog(`handleTaskCreatedEvent abortada: arquivo não encontrado ou não TFile para ${taskPath}`, this.plugin);
            console.error(`DFM System: Arquivo de tarefa não encontrado para o caminho: ${taskPath}`);
            return;
        }

        diagLog(`handleTaskCreatedEvent: pendingCanvasInsertion=${!!this.pendingCanvasInsertion} | pendingMarkdownInsertion=${!!this.pendingMarkdownInsertion}`, this.plugin);

        if (this.pendingCanvasInsertion) {
            const pending = this.pendingCanvasInsertion;
            this.clearPendingInsertion();
            const { view, pos, context } = pending;
            
            try {
                if (view?.canvas && !context?.skipCanvasNode) {
                    const canvas = view.canvas;
                    const insertionPos = pos || this.getCenterCoordinates(canvas, 400, 150);

                    diagLog(`Inserindo no canvas: x=${insertionPos.x}, y=${insertionPos.y}`, this.plugin);

                    if (typeof canvas.createFileNode === "function") {
                        diagLog("Inserindo via createFileNode...", this.plugin);
                        canvas.createFileNode({
                            file: file,
                            pos: insertionPos,
                            size: { width: 400, height: 150 },
                            save: true
                        });
                        new Notice(`📋 ${file.basename} inserido no Canvas!`);
                    } else if (typeof canvas.importFile === "function") {
                        diagLog("Inserindo via importFile...", this.plugin);
                        canvas.importFile(file, insertionPos);
                        new Notice(`📋 ${file.basename} inserido no Canvas!`);
                    } else if (canvas.data && canvas.data.nodes) {
                        diagLog("Inserindo via manipulação direta de canvas.data.nodes...", this.plugin);
                        const nodeId = `dfm-${Date.now()}`;
                        const nodeData = {
                            id: nodeId,
                            type: "file",
                            file: file.path,
                            x: insertionPos.x,
                            y: insertionPos.y,
                            width: 400,
                            height: 150
                        };
                        canvas.data.nodes.push(nodeData);
                        
                        if (typeof canvas.createNode === "function") {
                            canvas.createNode(nodeData);
                        }
                        canvas.requestSave();
                        new Notice(`📋 ${file.basename} inserido no Canvas!`);
                    } else {
                        diagLog("handleTaskCreatedEvent erro: nenhuma estratégia de inserção disponível", this.plugin);
                        console.error("DFM System: Nenhum método de inserção disponível no canvas", {
                            methods: Object.getOwnPropertyNames(Object.getPrototypeOf(canvas)).filter(m => typeof canvas[m] === "function").slice(0, 20)
                        });
                        new Notice(`❌ Não foi possível inserir no canvas — API não disponível.`);
                    }
                }

                // Adicionar projeto via TaskNotes API ou frontmatter
                const projectLink = context?.noProjectLink
                    ? null
                    : context?.canonicalWikilink || (view?.file ? `[[${view.file.basename}]]` : null);
                const extraFields = Object.keys(context?.frontmatter ?? {}).length > 0;
                if (projectLink || extraFields) {
                    const tasknotes = (this.plugin.app as any).plugins?.plugins?.tasknotes;
                    if (projectLink && tasknotes && tasknotes.api && tasknotes.api.tasks?.addProject) {
                        diagLog(`Adicionando projeto no TaskNotes via API: ${projectLink}`, this.plugin);
                        tasknotes.api.tasks.addProject(taskPath, projectLink)
                            .catch((err: any) => console.error("CanvasEngine: Erro ao adicionar projeto via API", err));
                    }
                    const taskFile = this.plugin.app.vault.getAbstractFileByPath(taskPath);
                    if (taskFile instanceof TFile) {
                        this.plugin.app.fileManager.processFrontMatter(taskFile, (fm: Record<string, unknown>) => {
                            for (const [key, value] of Object.entries(context?.frontmatter ?? {})) {
                                if (key === 'tags') {
                                    const have = Array.isArray(fm.tags) ? fm.tags as unknown[] : fm.tags ? [fm.tags] : [];
                                    const add = (Array.isArray(value) ? value : [value]).filter(v => !have.includes(v));
                                    fm.tags = [...have, ...add];
                                } else if (value !== undefined && value !== null && value !== '') {
                                    fm[key] = value;
                                }
                            }
                            if (!projectLink) return;
                            const current = fm.projects ?? fm.projeto ?? fm.project;
                            if (!current) {
                                fm.projects = [projectLink];
                            } else if (Array.isArray(current)) {
                                if (!current.includes(projectLink)) {
                                    current.push(projectLink);
                                    fm.projects = current;
                                }
                            } else if (typeof current === "string" && current !== projectLink) {
                                fm.projects = [current, projectLink];
                            }
                        }).catch((err: any) => console.error("CanvasEngine: Erro ao adicionar projeto no frontmatter", err));
                    }
                }
            } catch(e: any) {
                diagLog(`handleTaskCreatedEvent exceção capturada: ${e.message}`, this.plugin);
                console.error("DFM System: Failed to inject node into canvas", e);
                new Notice(`❌ Erro ao inserir no canvas: ${e.message}`);
            }
        } else if (this.pendingMarkdownInsertion) {
            const { view } = this.pendingMarkdownInsertion;
            this.pendingMarkdownInsertion = null;

            try {
                const editor = view.editor;
                if (editor) {
                    const cursor = editor.getCursor();
                    editor.replaceRange(`[[${file.basename}]]`, cursor);
                    new Notice(`Link para ${file.basename} inserido!`);
                }
            } catch(e) {
                console.error("Failed to inject link into markdown", e);
            }
        }
    }

    handleTaskChangedEvent(event: any) {
        const taskPath = event.taskPath || event.path || (event.task && event.task.path);
        if (!taskPath) return;
        debugLog(`CanvasEngine: handleTaskChangedEvent atualizando canvases para: ${taskPath}`);
        this.updateOpenCanvasesForTask(taskPath);
        this.maybeTriggerArvoreReevaluation(taskPath);
    }

    /**
     * Coração da integração da Árvore de Progressão: se a tarefa concluída pertence a um
     * nível de árvore (arvore_nivel), reavalia SÓ a árvore daquele projeto ~2s depois
     * (debounce por projeto). Desbloqueio em tempo real — o hook diário (Fase 4) é fallback.
     */
    private maybeTriggerArvoreReevaluation(taskPath: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(taskPath);
        if (!(file instanceof TFile)) return;

        const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm || fm.arvore_nivel === undefined || fm.status !== "done") return;

        const projRaw = Array.isArray(fm.projects) ? fm.projects[0] : fm.projects;
        if (typeof projRaw !== "string") return;
        const projectBasename = projRaw.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
        if (!projectBasename) return;

        const existingTimer = this.arvoreDebounceTimers.get(projectBasename);
        if (existingTimer) window.clearTimeout(existingTimer);

        const timer = window.setTimeout(async () => {
            this.arvoreDebounceTimers.delete(projectBasename);
            const prefs = this.plugin.settings.arvoreProgressao;
            try {
                await this.plugin.progressionEngine.reevaluateForProject(projectBasename, {
                    autoCriarTarefas: prefs.autoCriarTarefas,
                    notificarDesbloqueio: prefs.notificarDesbloqueio
                });
            } catch (e) {
                console.error("DFM System: Falha ao reavaliar Árvore de Progressão", e);
            }
        }, 2000);
        this.arvoreDebounceTimers.set(projectBasename, timer);
    }

    updateOpenCanvasesForTask(taskPath: string) {
        const leaves = this.plugin.app.workspace.getLeavesOfType("canvas");
        for (const leaf of leaves) {
            const view = leaf.view as any;
            const canvas = view.canvas;
            const file = view.file;
            if (canvas && file) {
                for (const node of canvas.nodes.values()) {
                    let nodeFile: TFile | null = null;
                    if (node.file && typeof node.file.path === 'string') {
                        nodeFile = node.file;
                    } else if (typeof node.file === 'string') {
                        const f = this.plugin.app.vault.getAbstractFileByPath(node.file);
                        if (f && typeof f.path === 'string') nodeFile = f as TFile;
                    }

                    if (nodeFile && nodeFile.path === taskPath) {
                        debugLog(`CanvasEngine: Atualizando visualmente card para ${nodeFile.basename}`);
                        this.formatNode(canvas, node, file);
                        if (typeof node.requestFrame === 'function') {
                            node.requestFrame();
                        }
                    }
                }
            }
        }
    }

    getCenterCoordinates(canvas: any, nodeWidth: number, nodeHeight: number): { x: number, y: number } {
        if (typeof canvas.getViewportBBox === 'function') {
            const bbox = canvas.getViewportBBox();
            return {
                x: (bbox.minX + bbox.maxX) / 2 - nodeWidth / 2,
                y: (bbox.minY + bbox.maxY) / 2 - nodeHeight / 2
            };
        }
        // Fallback caso getViewportBBox falhe ou não exista
        const zoom = canvas.zoom || 1;
        const W = canvas.containerEl?.clientWidth || 800;
        const H = canvas.containerEl?.clientHeight || 600;
        return {
            x: (W / 2 - canvas.x) / zoom - nodeWidth / 2,
            y: (H / 2 - canvas.y) / zoom - nodeHeight / 2
        };
    }

    async createTaskNote(activeView: any, pos: any = null, context?: TaskCreationContext) {
        diagLog(`createTaskNote chamada: view=${activeView?.file?.path} | pos=${JSON.stringify(pos)} | context=${JSON.stringify(context)}`, this.plugin);
        const tasknotes = (this.plugin.app as any).plugins?.plugins?.tasknotes;
        if (!tasknotes) {
            diagLog("createTaskNote erro: TaskNotes não ativo", this.plugin);
            new Notice("Erro: O plugin TaskNotes não está ativo!");
            return;
        }

        // Calcular centro do Canvas (viewport)
        const canvas = activeView?.canvas;
        let insertionPos = { x: 0, y: 0 };
        if (canvas) {
            if (pos && (pos.x !== 0 || pos.y !== 0)) {
                insertionPos = pos;
            } else {
                insertionPos = this.getCenterCoordinates(canvas, 400, 150);
            }
        } else {
            insertionPos = pos ? pos : { x: 400, y: 300 };
        }

        // Limpar qualquer inserção pendente anterior para evitar contaminação
        this.clearPendingInsertion();

        const createdAt = Date.now();
        const timeoutTimer = setTimeout(() => {
            if (this.pendingCanvasInsertion?.createdAt === createdAt) {
                diagLog("pendingCanvasInsertion expirada por timeout (modal cancelado/fechado)", this.plugin);
                this.pendingCanvasInsertion = null;
            }
        }, 120000);

        // Definir flag de inserção pendente no canvas para interceptação
        this.pendingCanvasInsertion = {
            view: activeView,
            pos: insertionPos,
            context: context ?? null,
            createdAt,
            timer: timeoutTimer,
        };
        diagLog(`pendingCanvasInsertion definida: view=${activeView?.file?.path} | pos=${JSON.stringify(this.pendingCanvasInsertion.pos)} | context=${JSON.stringify(this.pendingCanvasInsertion.context)}`, this.plugin);

        // Abrir modal
        if (typeof tasknotes.openTaskCreationModal === "function") {
            diagLog("Abrindo modal via openTaskCreationModal...", this.plugin);
            tasknotes.openTaskCreationModal();
        } else {
            diagLog("Executando comando tasknotes:create-new-task...", this.plugin);
            const commands = (this.plugin.app as any).commands;
            commands?.executeCommandById?.("tasknotes:create-new-task");
        }

        new Notice("Preencha a tarefa. Ela será inserida no Canvas ao salvar.");
    }

    private addFileToCanvas(file: TFile, view: any, pos: { x: number, y: number }) {
        try {
            const canvas = view.canvas;
            if (!canvas) {
                new Notice("Canvas não disponível.");
                return;
            }

            // Estratégia 1: createFileNode (API interna do Obsidian)
            if (typeof canvas.createFileNode === 'function') {
                canvas.createFileNode({
                    file: file,
                    pos: pos,
                    size: { width: 400, height: 150 },
                    save: true
                });
                new Notice(`📋 ${file.basename} inserido no Canvas!`);
            }
            // Estratégia 2: importFile
            else if (typeof canvas.importFile === 'function') {
                canvas.importFile(file, pos);
                new Notice(`📋 ${file.basename} inserido no Canvas!`);
            }
            // Estratégia 3: manipulação direta dos dados
            else if (canvas.data?.nodes) {
                const nodeData = {
                    id: `dfm-${Date.now()}`,
                    type: "file",
                    file: file.path,
                    x: pos.x,
                    y: pos.y,
                    width: 400,
                    height: 150
                };
                canvas.data.nodes.push(nodeData);
                canvas.createNode?.(nodeData);
                canvas.requestSave?.();
                new Notice(`📋 ${file.basename} inserido no Canvas!`);
            }
            else {
                new Notice(`❌ Canvas API não disponível.`);
            }
        } catch(e) {
            console.error("[DFM] addFileToCanvas:", e);
            new Notice(`❌ Erro ao inserir: ${e.message}`);
        }
    }

    async createTaskNoteForMarkdown(activeView: any) {
        const tasknotes = (this.plugin.app as any).plugins.plugins.tasknotes;
        if (!tasknotes) {
            new Notice("Erro: O plugin TaskNotes não está ativo!");
            return;
        }

        new Notice("Preencha a tarefa no TaskNotes. O link será inserido no seu texto automaticamente.");
        
        this.pendingMarkdownInsertion = { view: activeView };

        try {
            const commands = (this.plugin.app as any).commands;
            if (commands && commands.executeCommandById) {
                commands.executeCommandById('tasknotes:create-new-task');
            }
        } catch(e) {
            console.error("DFM System: Erro ao executar comando TaskNotes:", e);
            new Notice("Erro: Não foi possível abrir o modal de criação de tarefa.");
            this.pendingMarkdownInsertion = null;
        }
    }

    async syncActiveCanvas(activeView: any) {
        const canvas = activeView.canvas;
        if (!canvas) {
            new Notice("Nenhum canvas carregado no view ativo.");
            return;
        }
        const file = activeView.file;
        if (!(file instanceof TFile)) {
            new Notice("Não foi possível determinar o arquivo do Canvas.");
            return;
        }

        this.promptingCanvas = null;

        if (typeof canvas.getData === 'function') {
            const canvasData = canvas.getData();
            await this.syncManager.checkAndPromptReverseSync(file, canvasData, true);
        } else {
            new Notice("Não foi possível ler os dados do Canvas.");
        }
    }

    async formatActiveCanvasTasks(activeView: any) {
        const canvas = activeView.canvas;
        if (!canvas) {
            new Notice("Nenhum canvas carregado no view ativo.");
            return;
        }
        const file = activeView.file;
        if (!(file instanceof TFile)) {
            new Notice("Não foi possível determinar o arquivo do Canvas.");
            return;
        }

        let needsSave = false;
        let formattedCount = 0;

        for (const [id, node] of canvas.nodes.entries()) {
            if (this.formatNode(canvas, node, file)) {
                needsSave = true;
                formattedCount++;
            }
        }

        if (needsSave) {
            this.ignoreModifyFor = file.path;
            canvas.requestSave();
            new Notice(`✨ ${formattedCount} card(s) de tarefa(s) formatado(s) com sucesso!`);
        } else {
            new Notice("✅ Todos os cards no Canvas já estão formatados.");
        }
    }

    async generateDFMTreeCanvas() {
        return this.syncManager.generateDFMTreeCanvas();
    }

    async generateStrategicCanvas(targetFile: TFile, type: 'project' | 'department' | 'area') {
        return this.syncManager.generateStrategicCanvas(targetFile, type);
    }

    async generateSufferingInventoryCanvas(items: string[], notePath: string) {
        return this.syncManager.generateSufferingInventoryCanvas(items, notePath);
    }

    getNodeColorForTask(fm: any): string {
        return this.formatter.getNodeColorForTask(fm);
    }

    formatNode(canvas: any, node: any, canvasFile: TFile): boolean {
        return this.formatter.formatNode(canvas, node, canvasFile);
    }

    async addCanvasToRelations(noteFile: TFile, canvasFile: TFile) {
        return this.syncManager.addCanvasToRelations(noteFile, canvasFile);
    }

    async addCanvasToProject(taskFile: TFile, canvasFile: TFile) {
        return this.syncManager.addCanvasToProject(taskFile, canvasFile);
    }

    async checkAndPromptReverseSync(canvasFile: TFile, canvasData: any, isManual = false) {
        return this.syncManager.checkAndPromptReverseSync(canvasFile, canvasData, isManual);
    }
}
