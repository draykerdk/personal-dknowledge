import { TFile, TFolder, Notice, App } from "obsidian";
import type { CanvasEngine } from "./canvasEngineTypes";
import { ConfirmModal, CanvasDependencyModal } from "./canvasModals";
import { ProgressionTree, arvoreCanvasPayload } from "../progressionEngine";
import { canvasNameIsProject, isTaskType } from "../../canvas/managedIds";
import { applyCanvasPlan } from "../../canvas/managedZone";
import { areaFolderOf, areaIndexPath, isAreaType } from "../areaIndex";
import type { ApplyResult } from "../../canvas/managedZone";
import type { CanvasData } from "../../project/projectCanvasModel";

export interface FrontmatterUpdates {
    [key: string]: {
        add: string[];
        remove: string[];
    };
}

export class CanvasSyncManager {
    private engine: CanvasEngine;
    private pendingLinks: Set<string> = new Set();

    constructor(engine: CanvasEngine) {
        this.engine = engine;
    }

    private get app(): App {
        return this.engine.plugin.app;
    }

    /**
     * Registra no frontmatter da TaskNote que ela aparece no canvas informado.
     *
     * POR QUE ISSO NÃO VAI PARA `projects`: `projects` é o campo do TaskNotes que liga
     * tarefa → PROJETO — é dele que saem `aggregateProjects`, `missionIntent.projectOf`
     * e o widget de projeto no canvas. E a convenção do vault é o canvas do projeto ter
     * o MESMO NOME do projeto (`<pasta do projeto>/<nome do projeto>.canvas`; medido em
     * 15/09/2026: 27 dos 63 canvas). Logo `[[Nome do Projeto]]` gravado como "canvas"
     * fica INDISTINGUÍVEL de um vínculo de projeto real: arrastar uma tarefa para um
     * canvas criaria sozinho um vínculo de projeto que o operador nunca declarou.
     *
     * O canvas é uma RELAÇÃO, não um projeto. Por isso a referência é gravada em
     * `relacoes`/`relations`, com a mesma regra de `addCanvasToRelations` logo abaixo:
     * as duas grafias são aceitas, `relations` vence quando já existe no frontmatter e
     * o link entra no formato `[[Nome do Canvas]]`. Reusar o campo que já é a casa
     * desse dado com o significado certo não cria campo novo no vault.
     *
     * O canvas com o nome de um projeto não grava nada (Passo 0 da Missão, 0d, 27/10/2026):
     * o `[[<nome do canvas>]]` abriria a nota do projeto, e o `projects` é o vínculo com o
     * projeto; o `relacoes` fica para o que não é projeto (`canvasNameIsProject`).
     *
     * O nome do método é mantido porque `canvasFormatter` e o contrato público da
     * engine o expõem assim.
     */
    async addCanvasToProject(taskFile: TFile, canvasFile: TFile) {
        if (taskFile.extension !== 'md') return;
        
        const cache = this.app.metadataCache.getFileCache(taskFile);
        const fm = cache?.frontmatter || {};
        const relacoes = fm['relacoes'];
        const relations = fm['relations'];
        const targetLink = `[[${canvasFile.basename}]]`;
        
        // Mesma chave de `addCanvasToRelations`: as duas rotas gravam o mesmo dado no
        // mesmo campo, então compartilhar a trava anti-duplicação evita escrita redundante.
        const linkKey = `rel:${taskFile.path}:${targetLink}`;
        if (this.pendingLinks.has(linkKey)) return;

        const checkLink = (val: any) => {
            if (val === undefined || val === null) return false;
            return JSON.stringify(val).includes(canvasFile.basename);
        };

        if (checkLink(relacoes) || checkLink(relations)) {
            return; // Já possui a referência, evita duplicação
        }
        if (this.canvasNamesProject(taskFile, canvasFile)) return;

        const targetField = ('relations' in fm) ? 'relations' : 'relacoes';

        this.pendingLinks.add(linkKey);
        await this.app.fileManager.processFrontMatter(taskFile, (frontmatter) => {
            if (!frontmatter[targetField]) {
                frontmatter[targetField] = [];
            }
            if (!Array.isArray(frontmatter[targetField])) {
                frontmatter[targetField] = [frontmatter[targetField]];
            }
            if (!frontmatter[targetField].includes(targetLink)) {
                frontmatter[targetField].push(targetLink);
            }
        });
        new Notice(`Canvas '${canvasFile.basename}' adicionado às relações da tarefa!`);
        setTimeout(() => this.pendingLinks.delete(linkKey), 2500);
    }

    /**
     * O canvas tem o nome de um projeto? O link `[[<nome do canvas>]]` resolvido a partir da
     * tarefa e o dono do canvas pelo gerente dos canvas de projeto (o README de repositório).
     */
    private canvasNamesProject(taskFile: TFile, canvasFile: TFile): boolean {
        const dest = this.app.metadataCache.getFirstLinkpathDest?.(canvasFile.basename, taskFile.path) ?? null;
        const linkType = dest ? this.app.metadataCache.getFileCache(dest)?.frontmatter?.type ?? null : null;
        const owner = (this.engine.plugin as any)?.board?.projectCanvas?.projectForCanvas?.(canvasFile.path) ?? null;
        return canvasNameIsProject({ linkType, ownerName: owner?.name ?? null, canvasName: canvasFile.basename });
    }

    async addCanvasToRelations(noteFile: TFile, canvasFile: TFile) {
        if (noteFile.extension !== 'md') return;
        
        const cache = this.app.metadataCache.getFileCache(noteFile);
        const fm = cache?.frontmatter || {};
        const relacoes = fm['relacoes'];
        const relations = fm['relations'];
        const targetLink = `[[${canvasFile.basename}]]`;
        
        const linkKey = `rel:${noteFile.path}:${targetLink}`;
        if (this.pendingLinks.has(linkKey)) return;

        const checkLink = (val: any) => {
            if (val === undefined || val === null) return false;
            return JSON.stringify(val).includes(canvasFile.basename);
        };

        if (checkLink(relacoes) || checkLink(relations)) {
            return; // Já possui a referência, evita duplicação
        }

        const targetField = ('relations' in fm) ? 'relations' : 'relacoes';

        this.pendingLinks.add(linkKey);
        await this.app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
            if (!frontmatter[targetField]) {
                frontmatter[targetField] = [];
            }
            if (!Array.isArray(frontmatter[targetField])) {
                frontmatter[targetField] = [frontmatter[targetField]];
            }
            if (!frontmatter[targetField].includes(targetLink)) {
                frontmatter[targetField].push(targetLink);
            }
        });
        new Notice(`Canvas '${canvasFile.basename}' adicionado às relações da nota!`);
        setTimeout(() => this.pendingLinks.delete(linkKey), 2500);
    }

    async applyBatchedUpdates(updates: Map<string, FrontmatterUpdates>) {
        for (const [path, updateFields] of updates.entries()) {
            const tfile = this.app.vault.getAbstractFileByPath(path);
            if (tfile instanceof TFile) {
                let fileModified = false;

                await this.app.fileManager.processFrontMatter(tfile, (fm) => {
                    for (const [field, actions] of Object.entries(updateFields)) {
                        if (actions.add.length > 0 || actions.remove.length > 0) {
                            if (!fm[field]) fm[field] = field === 'area' && fm.Area ? (Array.isArray(fm.Area) ? [...fm.Area] : fm.Area) : []; // o `Area` antigo, só como ponto de partida
                            if (!Array.isArray(fm[field])) fm[field] = [fm[field]];
                            
                            for (const val of actions.add) {
                                if (!fm[field].includes(val)) {
                                    fm[field].push(val);
                                    fileModified = true;
                                }
                            }

                            if (actions.remove.length > 0) {
                                const newArr = fm[field].filter((l: string) => !actions.remove.includes(l));
                                if (newArr.length !== fm[field].length) {
                                    fm[field] = newArr;
                                    fileModified = true;
                                }
                            }
                        }
                    }
                });
                if (fileModified) {
                    new Notice(`Link DFM atualizado em ${tfile.basename}`);
                }
            }
        }
    }

    /**
     * Sincronização reversa: o vínculo que está nos metadados e não tem seta no
     * canvas vira pedido de desenhar a seta (ou de importar o nó que falta).
     *
     * Tarefa não entra, nem como origem nem como destino (Fase 6 do plano do
     * canvas, 15/10/2026): a relação de tarefa é gravada e desfeita pela seta
     * (`canvas/edgeLinks.ts`), e o pedido "Importar ausentes" reaparecia a cada
     * ciclo para `projects`/`blockedBy`/`blocking`. Ficam nota↔nota
     * (`relatesTo`/`relatedBy`), meta→projeto e projeto→área.
     *
     * A gravação passa por `applyCanvasPlan`: com o canvas aberto, pela vista
     * (nunca `vault.modify` num canvas aberto); fechado, pelo arquivo.
     */
    async checkAndPromptReverseSync(canvasFile: TFile, canvasData: any, isManual = false) {
        const nodes = canvasData.nodes || [];
        const edges = canvasData.edges || [];
        
        const fileToNodeId = new Map<string, string>();
        const nodeIdToPos = new Map<string, { x: number, y: number, width: number, height: number }>();
        const filesInCanvas: { path: string; basename: string; type: string | null }[] = [];
        
        for (const node of nodes) {
            if (node.type === 'file' && node.file) {
                const targetFile = this.app.vault.getAbstractFileByPath(node.file);
                if (targetFile instanceof TFile) {
                    fileToNodeId.set(targetFile.basename, node.id);
                    nodeIdToPos.set(node.id, {
                        x: node.x || 0,
                        y: node.y || 0,
                        width: node.width || 400,
                        height: node.height || 150
                    });
                    const type = this.engine.getFileType(targetFile);
                    if (isTaskType(type)) continue;
                    filesInCanvas.push({ 
                        path: targetFile.path, 
                        basename: targetFile.basename, 
                        type 
                    });
                }
            }
        }
        
        if (filesInCanvas.length === 0) {
            if (isManual) new Notice("✅ Nenhuma inconsistência de dependências encontrada no Canvas!");
            return;
        }
        
        const existingConnections = new Set<string>();
        for (const edge of edges) {
            existingConnections.add(`${edge.fromNode}|${edge.toNode}`);
        }
        
        const resolveLinkToBasename = (linkStr: any): string => {
            const raw = typeof linkStr === 'object' && linkStr !== null && 'uid' in linkStr ? linkStr.uid : linkStr;
            return String(raw ?? '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
        };

        const findFileByBasename = (basename: string): TFile | null => {
            const files = this.app.vault.getMarkdownFiles();
            return files.find(f => f.basename === basename) || null;
        };

        const connections: { sourceFile: TFile, sourceNodeId: string, targetBasename: string, fromIsSource: boolean }[] = [];
        
        for (const item of filesInCanvas) {
            const file = this.app.vault.getAbstractFileByPath(item.path);
            if (!(file instanceof TFile)) continue;
            const sourceNodeId = fileToNodeId.get(item.basename);
            if (!sourceNodeId) continue;
            
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};
            
            if (item.type === 'meta') {
                const projLink = fm.projects || fm.projeto;
                if (projLink) {
                    const list = Array.isArray(projLink) ? projLink : [projLink];
                    for (const p of list) {
                        connections.push({ sourceFile: file, sourceNodeId, targetBasename: resolveLinkToBasename(p), fromIsSource: true });
                    }
                }
            }
            
            if (item.type === 'project' || item.type === 'iniciativa') {
                const areaLink = fm.area || fm.Area;
                if (areaLink) {
                    const list = Array.isArray(areaLink) ? areaLink : [areaLink];
                    for (const a of list) {
                        connections.push({ sourceFile: file, sourceNodeId, targetBasename: resolveLinkToBasename(a), fromIsSource: false });
                    }
                }
            }
            
            if (item.type === 'departamento') {
                const areaLink = fm.area || fm.Area;
                if (areaLink) {
                    const list = Array.isArray(areaLink) ? areaLink : [areaLink];
                    for (const a of list) {
                        connections.push({ sourceFile: file, sourceNodeId, targetBasename: resolveLinkToBasename(a), fromIsSource: false });
                    }
                }
            }

            if (item.type === null) {
                const relates = fm.relatesTo || fm.se_relaciona;
                if (relates) {
                    const list = Array.isArray(relates) ? relates : [relates];
                    for (const r of list) {
                        const targetName = resolveLinkToBasename(r);
                        if (targetName !== file.basename && targetName !== canvasFile.basename) {
                            connections.push({ sourceFile: file, sourceNodeId, targetBasename: targetName, fromIsSource: true });
                        }
                    }
                }
                const related = fm.relatedBy || fm.e_relacionado;
                if (related) {
                    const list = Array.isArray(related) ? related : [related];
                    for (const r of list) {
                        const targetName = resolveLinkToBasename(r);
                        if (targetName !== file.basename && targetName !== canvasFile.basename) {
                            connections.push({ sourceFile: file, sourceNodeId, targetBasename: targetName, fromIsSource: false });
                        }
                    }
                }
            }
        }

        const missingConnections: { fromNode: string; toNode: string }[] = [];
        const missingNodesToImport = new Map<string, { targetFile: TFile, sourceNodeId: string, fromIsSource: boolean }>();
        const edgesToCreateAfterImport: { sourceNodeId: string, targetPath: string, fromIsSource: boolean }[] = [];

        for (const conn of connections) {
            const targetFile = findFileByBasename(conn.targetBasename);
            if (!targetFile) continue;
            if (isTaskType(this.engine.getFileType(targetFile))) continue;

            const targetNodeId = fileToNodeId.get(targetFile.basename);
            if (targetNodeId) {
                const fromNode = conn.fromIsSource ? conn.sourceNodeId : targetNodeId;
                const toNode = conn.fromIsSource ? targetNodeId : conn.sourceNodeId;
                if (!existingConnections.has(`${fromNode}|${toNode}`)) {
                    if (!missingConnections.some(e => e.fromNode === fromNode && e.toNode === toNode)) {
                        missingConnections.push({ fromNode, toNode });
                    }
                }
            } else {
                if (!missingNodesToImport.has(targetFile.path)) {
                    missingNodesToImport.set(targetFile.path, {
                        targetFile,
                        sourceNodeId: conn.sourceNodeId,
                        fromIsSource: conn.fromIsSource
                    });
                }
                edgesToCreateAfterImport.push({
                    sourceNodeId: conn.sourceNodeId,
                    targetPath: targetFile.path,
                    fromIsSource: conn.fromIsSource
                });
            }
        }

        const missingNodesList = Array.from(missingNodesToImport.values());

        if (missingConnections.length === 0 && missingNodesList.length === 0) {
            if (isManual) {
                new Notice("✅ Nenhuma inconsistência de dependências encontrada no Canvas!");
            }
            return;
        }

        if (this.engine.getPromptingCanvas() === canvasFile.path) return;
        this.engine.setPromptingCanvas(canvasFile.path);

        const applyCanvasChanges = async (importNodes: boolean, connectExisting: boolean) => {
            try {
                const plan = (current: CanvasData): CanvasData => {
                    const freshData: any = JSON.parse(JSON.stringify(current));
                    freshData.nodes = freshData.nodes || [];
                    freshData.edges = freshData.edges || [];
                
                    let idCounter = Date.now();
                    const tempNodeMap = new Map<string, string>();
                
                    if (importNodes) {
                        const leftOffsetCount = new Map<string, number>();
                        const rightOffsetCount = new Map<string, number>();

                        for (const item of missingNodesList) {
                            if (freshData.nodes.some((n: any) => n.type === 'file' && n.file === item.targetFile.path)) continue;
                            const sourcePos = nodeIdToPos.get(item.sourceNodeId);
                            let x = 0;
                            let y = 0;
                        
                            if (sourcePos) {
                                if (item.fromIsSource) {
                                    const count = rightOffsetCount.get(item.sourceNodeId) || 0;
                                    x = sourcePos.x + sourcePos.width + 100;
                                    y = sourcePos.y + count * 180;
                                    rightOffsetCount.set(item.sourceNodeId, count + 1);
                                } else {
                                    const count = leftOffsetCount.get(item.sourceNodeId) || 0;
                                    x = sourcePos.x - 400 - 100;
                                    y = sourcePos.y + count * 180;
                                    leftOffsetCount.set(item.sourceNodeId, count + 1);
                                }
                            }

                            const newNodeId = `node-sync-${idCounter++}-${Math.random().toString(36).substring(2,5)}`;
                            freshData.nodes.push({
                                id: newNodeId,
                                type: "file",
                                file: item.targetFile.path,
                                x: x,
                                y: y,
                                width: 400,
                                height: 150
                            });
                            tempNodeMap.set(item.targetFile.path, newNodeId);
                        }

                        for (const edge of edgesToCreateAfterImport) {
                            const targetNodeId = tempNodeMap.get(edge.targetPath);
                            if (targetNodeId) {
                                const fromNode = edge.fromIsSource ? edge.sourceNodeId : targetNodeId;
                                const toNode = edge.fromIsSource ? targetNodeId : edge.sourceNodeId;
                            
                                const edgeExists = freshData.edges.some((e: any) => e.fromNode === fromNode && e.toNode === toNode);
                                if (!edgeExists) {
                                    freshData.edges.push({
                                        id: `edge-sync-${idCounter++}-${Math.random().toString(36).substring(2,5)}`,
                                        fromNode,
                                        toNode,
                                        fromSide: "bottom",
                                        toSide: "top"
                                    });
                                }
                            }
                        }
                    }

                    if (connectExisting) {
                        const ids = new Set(freshData.nodes.map((n: any) => n.id));
                        for (const conn of missingConnections) {
                            if (!ids.has(conn.fromNode) || !ids.has(conn.toNode)) continue;
                            const edgeExists = freshData.edges.some((e: any) => e.fromNode === conn.fromNode && e.toNode === conn.toNode);
                            if (!edgeExists) {
                                freshData.edges.push({
                                    id: `edge-sync-${idCounter++}-${Math.random().toString(36).substring(2,5)}`,
                                    fromNode: conn.fromNode,
                                    toNode: conn.toNode,
                                    fromSide: "bottom",
                                    toSide: "top"
                                });
                            }
                        }
                    }
                    return freshData;
                };

                // Canvas aberto: pela vista (o Ctrl+Z desfaz); fechado: pelo arquivo.
                const links = (this.engine.plugin as any).edgeLinks ?? null;
                const result: ApplyResult = await applyCanvasPlan(this.app, this.engine, canvasFile.path, plan, { links });
                if (result === 'aplicado') new Notice("Sincronia de dependências do Canvas concluída com sucesso!");
                else if (result === 'igual') new Notice("✅ O Canvas já tem essas setas.");
                else new Notice("O Canvas não foi alterado agora (aberto e em uso, ou desatualizado). Tente de novo em instantes.");
            } catch (err) {
                console.error("DFM System: Falha ao sincronizar Canvas", err);
                new Notice("Erro ao salvar alterações no Canvas.");
            } finally {
                this.engine.setPromptingCanvas(null);
            }
        };

        const openSyncModal = () => {
            if (missingConnections.length > 0 && missingNodesList.length > 0) {
                const confirmMsg = `Foram encontradas dependências nos metadados YAML: há ${missingConnections.length} conexões não desenhadas entre tarefas existentes e ${missingNodesList.length} tarefas dependentes que não estão no Canvas. O que deseja fazer?`;
                
                new CanvasDependencyModal(
                    this.app,
                    confirmMsg,
                    [
                        {
                            label: "Não fazer nada",
                            callback: () => { this.engine.setPromptingCanvas(null); }
                        },
                        {
                            label: "Apenas conectar existentes",
                            callback: () => applyCanvasChanges(false, true)
                        },
                        {
                            label: "Importar ausentes e conectar todas",
                            cls: "mod-cta",
                            callback: () => applyCanvasChanges(true, true)
                        }
                    ],
                    () => { this.engine.setPromptingCanvas(null); }
                ).open();

            } else if (missingConnections.length === 0 && missingNodesList.length > 0) {
                const confirmMsg = `Esta tarefa possui dependência com ${missingNodesList.length} tarefa(s) que não está(ão) no Canvas. Deseja importar e conectar esta(s) tarefa(s) automaticamente?`;
                
                new CanvasDependencyModal(
                    this.app,
                    confirmMsg,
                    [
                        {
                            label: "Não fazer nada",
                            callback: () => { this.engine.setPromptingCanvas(null); }
                        },
                        {
                            label: "Importar e conectar",
                            cls: "mod-cta",
                            callback: () => applyCanvasChanges(true, false)
                        }
                    ],
                    () => { this.engine.setPromptingCanvas(null); }
                ).open();

            } else if (missingConnections.length > 0 && missingNodesList.length === 0) {
                const confirmMsg = `Foram encontradas ${missingConnections.length} conexões de dependência nos metadados YAML que não estão representadas visualmente neste Canvas. Deseja adicionar estas setas de dependência automaticamente?`;
                
                new CanvasDependencyModal(
                    this.app,
                    confirmMsg,
                    [
                        {
                            label: "Não",
                            callback: () => { this.engine.setPromptingCanvas(null); }
                        },
                        {
                            label: "Sim",
                            cls: "mod-cta",
                            callback: () => applyCanvasChanges(false, true)
                        }
                    ],
                    () => { this.engine.setPromptingCanvas(null); }
                ).open();
            }
        };

        if (isManual) {
            openSyncModal();
        } else {
            const notice = new Notice("", 180000);
            const container = notice.noticeEl;
            container.empty();
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.gap = "8px";
            container.style.padding = "14px";
            container.style.borderLeft = "3px solid var(--dfm-cyber-blue)";

            container.createEl("div", { 
                text: "🔗 Sincronia de Dependências", 
                attr: { style: "font-weight: bold; font-size: 0.95em; color: var(--text-accent);" } 
            });
            container.createEl("div", { 
                text: "Foram detectadas inconsistências no Canvas aberto.", 
                attr: { style: "font-size: 0.85em; color: var(--text-muted);" } 
            });

            const btn = container.createEl("button", {
                text: "⚡ Resolver",
                cls: "dfm-btn-mini",
                attr: { style: "align-self: flex-start; margin-top: 4px; font-weight: bold; font-size: 0.8em;" }
            });

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                notice.hide();
                openSyncModal();
            });

            container.addEventListener("click", () => {
                notice.hide();
                openSyncModal();
            });
        }
    }

    async generateDFMTreeCanvas() {
        const dv = (this.engine.plugin.app as any).plugins.plugins.dataview?.api;
        if (!dv) {
            new Notice("Dataview plugin must be enabled to generate the tree.");
            return;
        }

        new Notice("Gerando o Mapa Geral DFM...");

        const getPages = (query: string) => dv.pages(query).values;

        const allPages = getPages('"100 - AREAS"');
        // A área é o README do `000 - INDEX` com `type: area` (areaIndex.ts); a nota
        // `000 - INDEX.md` que se procurava aqui nunca existiu.
        const areas = allPages.filter((p: any) => isAreaType(p.type));
        const departments = allPages.filter((p: any) => (p.file.path.includes('200 - DEPARTMENTS') && p.file.basename === p.file.folder.split('/').pop()) || p.type === 'departamento');
        const projects = getPages('"100 - AREAS" or "100 - PROJECTS" or "200 - FUNCTIONS"').filter((p: any) => (p.file.path.includes('100 - PROJECTS') && p.file.basename === p.file.folder.split('/').pop()) || p.type === 'project' || p.type === 'iniciativa');
        const principles = getPages('"000 - KERNEL"').filter((p: any) => !p.file.path.endsWith('.canvas') && (p.file.path.includes('Princípios') || p.file.path.includes('FILOSOFIA_SISTEMICA') || p.file.name === '000 - KERNEL.md' || p.type === 'principio'));

        const nodes: any[] = [];
        const edges: any[] = [];
        
        let idCounter = 1;
        const getId = () => `node-${idCounter++}`;
        const getEdgeId = () => `edge-${idCounter++}`;

        const fileToNodeId = new Map<string, string>();

        const addNode = (file: TFile, x: number, y: number, color?: string) => {
            const id = getId();
            
            let targetPath = file.path;
            if (file.parent) {
                const folderPath = file.parent.path;
                let canvasName = file.parent.name;
                if (canvasName === '000 - INDEX' && file.parent.parent) {
                    canvasName = file.parent.parent.name;
                }
                const canvasPath = `${folderPath}/${canvasName}.canvas`;
                const canvasFile = this.app.vault.getAbstractFileByPath(canvasPath);
                if (canvasFile instanceof TFile) {
                    targetPath = canvasPath;
                }
            }

            fileToNodeId.set(file.path, id);
            nodes.push({
                id: id,
                type: "file",
                file: targetPath,
                x: x,
                y: y,
                width: 400,
                height: 150,
                color: color
            });
            return id;
        };

        const addTextNode = (text: string, x: number, y: number, width: number, height: number, color?: string) => {
            const id = getId();
            nodes.push({
                id: id,
                type: "text",
                text: text,
                x: x,
                y: y,
                width: width,
                height: height,
                color: color
            });
            return id;
        };

        const addEdge = (fromId: string, toId: string) => {
            edges.push({
                id: getEdgeId(),
                fromNode: fromId,
                toNode: toId,
                fromSide: "bottom",
                toSide: "top"
            });
        };

        let yLevel = -800;

        // A raiz eram três nós da gamificação (`ALTER EGO` com nível e pontos, `RADAR
        // C.A.O.S.` e `MÉTRICAS E.C.H.`), que saíram em 29/10/2026 com o arquivamento dela.
        // Um nó neutro fica no lugar do radar, como raiz dos princípios e das áreas.
        const rootId = addTextNode("# 🗺️ Mapa Geral DFM", 300, yLevel, 450, 120, "4");

        yLevel += 500;

        let xPrinciple = -200;
        for (const p of principles) {
            const file = this.app.vault.getAbstractFileByPath(p.file.path);
            if (file instanceof TFile) {
                const pId = addNode(file, xPrinciple, yLevel, "6");
                addEdge(rootId, pId);
                xPrinciple += 450;
            }
        }

        if (principles.length > 0) {
            yLevel += 400;
        } else {
            yLevel += 100;
        }

        let xArea = 0;
        for (const area of areas) {
            const file = this.app.vault.getAbstractFileByPath(area.file.path);
            if (file instanceof TFile) {
                const areaId = addNode(file, xArea, yLevel, "2");
                addEdge(rootId, areaId);
                xArea += 450;
            }
        }

        yLevel += 300;

        let xDept = 0;
        for (const dept of departments) {
            const file = this.app.vault.getAbstractFileByPath(dept.file.path);
            if (file instanceof TFile) {
                const deptId = addNode(file, xDept, yLevel, "3");
                xDept += 450;

                let parentId = null;
                if (dept.Area) {
                    parentId = fileToNodeId.get(dept.Area.path);
                }
                if (!parentId) {
                    const areaPath = areaFolderOf(dept.file.path);
                    if (areaPath) parentId = fileToNodeId.get(areaIndexPath(areaPath));
                }
                if (parentId) addEdge(parentId, deptId);
            }
        }

        let xProj = xDept + 100;
        for (const proj of projects) {
            const file = this.app.vault.getAbstractFileByPath(proj.file.path);
            if (file instanceof TFile) {
                const projId = addNode(file, xProj, yLevel, "4");
                xProj += 450;

                let parentId = null;
                
                if (proj.departamento) {
                    const deptLink = Array.isArray(proj.departamento) ? proj.departamento[0] : proj.departamento;
                    if (deptLink && deptLink.path) {
                        parentId = fileToNodeId.get(deptLink.path);
                    }
                }
                if (!parentId) {
                    const parts = proj.file.path.split('/');
                    const deptIdx = parts.indexOf("200 - DEPARTMENTS");
                    if (deptIdx !== -1 && parts.length > deptIdx + 1) {
                        const deptName = parts[deptIdx + 1];
                        const areaPath = parts[1];
                        const deptPath = `100 - AREAS/${areaPath}/200 - DEPARTMENTS/${deptName}/${deptName}.md`;
                        parentId = fileToNodeId.get(deptPath);
                    }
                }

                if (!parentId) {
                    if (proj.Area) {
                        parentId = fileToNodeId.get(proj.Area.path);
                    }
                }
                if (!parentId) {
                    const areaPath = areaFolderOf(proj.file.path);
                    if (areaPath) parentId = fileToNodeId.get(areaIndexPath(areaPath));
                }

                if (parentId) addEdge(parentId, projId);
            }
        }

        const canvasData = { nodes, edges };
        const canvasJson = JSON.stringify(canvasData, null, 2);

        const canvasPath = "000 - KERNEL/MAPA_GERAL_DFM.canvas";
        const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
        
        if (existingFile instanceof TFile) {
            this.engine.setIgnoreModifyFor(existingFile.path);
            await this.app.vault.modify(existingFile, canvasJson);
        } else {
            const folder = this.app.vault.getAbstractFileByPath("000 - KERNEL");
            if (!folder) await this.app.vault.createFolder("000 - KERNEL");
            await this.app.vault.create(canvasPath, canvasJson);
        }

        new Notice("Árvore DFM gerada no arquivo: " + canvasPath);
        
        const finalFile = this.app.vault.getAbstractFileByPath(canvasPath);
        if (finalFile instanceof TFile) {
            this.app.workspace.getLeaf(false).openFile(finalFile);
        }
    }

    async generateStrategicCanvas(targetFile: TFile, type: 'project' | 'department' | 'area') {
        const folderPath = targetFile.parent.path;
        let canvasName = targetFile.parent.name;
        
        if (type === 'area' && canvasName === '000 - INDEX') {
            canvasName = targetFile.parent.parent.name; 
        }

        const canvasPath = `${folderPath}/${canvasName}.canvas`;
        const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
        if (existingFile instanceof TFile) {
            new Notice("Canvas Estratégico já existe.");
            this.app.workspace.getLeaf(false).openFile(existingFile as any);
            return;
        }

        const templatePath = `200 - FUNCTIONS/Templates/Project_Canvas_Template.canvas`;
        const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
        
        let canvasJson = "{}";
        if (templateFile && templateFile.name.endsWith('.canvas')) {
            const templateContent = await this.app.vault.read(templateFile as any);
            canvasJson = templateContent.replace(/\{\{Nome_do_Projeto\}\}/g, canvasName);
            canvasJson = canvasJson.replace(/\{\{folderPath\}\}/g, folderPath);
        } else {
            new Notice("Aviso: Template Project_Canvas_Template.canvas não encontrado. Gerando estrutura básica.");
            const nodes = [{
                id: "node-root-1", type: "file", file: targetFile.path, x: 0, y: -400, width: 400, height: 400, color: "5"
            }];
            canvasJson = JSON.stringify({ nodes, edges: [] }, null, 2);
        }

        await this.app.vault.create(canvasPath, canvasJson);
        new Notice(`Estrutura do Canvas '${canvasName}' gerada com sucesso!`);
        
        const finalFile = this.app.vault.getAbstractFileByPath(canvasPath);
        if (finalFile instanceof TFile) {
            this.app.workspace.getLeaf(false).openFile(finalFile as any);
        }
    }

    /** Cria um canvas companheiro com 1 node de texto por item de uma lista arbitrária
     *  (ex: Inventário do Sofrimento — cada sofrimento vira um node; o usuário desenha
     *  as setas de conexão manualmente no Obsidian, como o exercício de origem pede fazer
     *  no papel). Sem edges pré-criadas por design. */
    async generateSufferingInventoryCanvas(items: string[], notePath: string): Promise<TFile | null> {
        const canvasPath = notePath.replace(/\.md$/, "") + " — Mapa.canvas";

        const existingFile = this.app.vault.getAbstractFileByPath(canvasPath);
        if (existingFile instanceof TFile) {
            new Notice("Canvas de mapa já existe para esta nota.");
            return existingFile;
        }

        const cols = 3;
        const nodeWidth = 280;
        const nodeHeight = 140;
        const gapX = 60;
        const gapY = 60;

        const nodes = items.map((item, i) => ({
            id: `node-sofrimento-${i}-${Date.now()}`,
            type: "text",
            text: item,
            x: (i % cols) * (nodeWidth + gapX),
            y: Math.floor(i / cols) * (nodeHeight + gapY),
            width: nodeWidth,
            height: nodeHeight,
            color: "1"
        }));

        const canvasJson = JSON.stringify({ nodes, edges: [] }, null, 2);
        const file = await this.app.vault.create(canvasPath, canvasJson);
        new Notice("🗺️ Mapa de conexões gerado — desenhe setas entre os itens relacionados.");
        return file instanceof TFile ? file : null;
    }

    /**
     * Regenera `<Projeto> — Árvore.canvas` a partir de uma ProgressionTree já avaliada.
     * Irmã de generateStrategicCanvas — mesma família, mesmos helpers.
     * Níveis done/locked: nós TEXT. Nível ativo: as tarefas já criadas no TaskNotes viram
     * nós de ARQUIVO — assim o formatNode/handleTaskChangedEvent existente repinta ao vivo
     * quando a pessoa conclui, sem código novo de reatividade. Placeholders `(...)` continuam texto.
     */
    async generateArvoreCanvas(tree: ProgressionTree): Promise<void> {
        // O desenho é a função pura `arvoreCanvasPayload` (gêmea de `canvas_payload`, python):
        // sem trilhas, a coluna de sempre; com trilhas, uma coluna por trilha.
        const { nodes, edges } = arvoreCanvasPayload(
            tree.tiers,
            raw => this.engine.plugin.progressionEngine.activeTaskFileInTaskNotes(raw)?.path ?? null
        );

        const canvasJson = JSON.stringify({ nodes, edges }, null, 1);
        const folderPath = tree.file.parent.path;
        const canvasPath = `${folderPath}/${tree.projectLink.split("/").pop()} — Árvore.canvas`;
        const existing = this.app.vault.getAbstractFileByPath(canvasPath);

        // Canvas aberto não se grava pelo arquivo: a vista regravaria a cópia dela por
        // cima (ou a nossa gravação atropelaria o que o operador mexeu na aba). A Árvore
        // é refeita na próxima reavaliação, com a aba fechada.
        const openInTab = this.app.workspace.getLeavesOfType?.('canvas')
            ?.some(leaf => (leaf.view as any)?.file?.path === canvasPath) ?? false;
        if (openInTab) {
            console.warn(`DFM Árvore: "${canvasPath}" está aberto numa aba; não foi regravado. Feche a aba e reavalie a árvore.`);
            return;
        }

        if (existing instanceof TFile) {
            this.engine.setIgnoreModifyFor(existing.path);
            await this.app.vault.modify(existing, canvasJson);
        } else {
            await this.app.vault.create(canvasPath, canvasJson);
        }
    }
}
