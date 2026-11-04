import { TFile } from "obsidian";
import { taskColor } from '../../canvas/taskColor';
import { fold } from '../../project/projectCanvasModel';
import { canvasRelationsAllowed, isManagedId } from '../../canvas/managedIds';
import { canvasWritesAllowed } from '../../canvas/managedZone';
import type { CanvasEngine } from "./canvasEngineTypes";

export class CanvasFormatter {
    private engine: CanvasEngine;

    constructor(engine: CanvasEngine) {
        this.engine = engine;
    }

    /**
     * Formata o nó (cor, tamanho, conversão de texto em arquivo, `relacoes`) e monta o
     * cartão de tarefa. Devolve se o nó mudou (quem chama grava o canvas).
     * No celular (`canvasWritesAllowed()` falso; arquitetura 4.7: "No iPhone, onde o
     * canvas só lê") só o cartão é montado, só para ler: nada é recolorido,
     * redimensionado nem convertido, nenhuma nota ganha `relacoes`, e o nó não conta
     * como mudado (o canvas não é regravado pelo Sync por cima do desenho do Mac).
     */
    public formatNode(canvas: any, node: any, canvasFile: TFile): boolean {
        let modified = false;
        const writes = canvasWritesAllowed();
        // Nós das zonas geridas (canvas de projeto e do trimestre) são do plano da zona:
        // tamanho, cor e tipo vêm de lá. Aqui só ganham o cartão; não viram arquivo,
        // não são recoloridos (a cor do formatador contava outra lista de filhas e o
        // canvas era regravado duas vezes por sincronização) e não gravam `relacoes`
        // na nota (`[[2026-Q4]]` resolveria para a nota homônima).
        const managed = isManagedId(node.id);
        // Num canvas gerido ou temporal, nenhuma nota ganha `relacoes`, nem a posta
        // fora da zona: a tarefa já se liga pelos campos dela, e `[[2026-Q4]]`
        // resolveria para a nota homônima.
        const relationsAllowed = canvasRelationsAllowed(canvasFile?.path, canvas?.nodes?.keys?.() ?? []);

        // 1. Process text nodes representing wikilinks or paths (drag-and-drop support)
        if (writes && !managed && node.text && typeof node.text === 'string') {
            const text = node.text.trim();
            let filePath = text;
            
            const wikiMatch = text.match(/^\[\[(.*?)\]\]$/);
            if (wikiMatch) {
                filePath = wikiMatch[1];
                if (filePath.includes('|')) {
                    filePath = filePath.split('|')[0].trim();
                }
                if (filePath.includes('#')) {
                    filePath = filePath.split('#')[0].trim();
                }
            }

            let possibleFile = this.engine.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!possibleFile && !filePath.endsWith('.md')) {
                possibleFile = this.engine.plugin.app.vault.getAbstractFileByPath(filePath + '.md');
            }

            if (!possibleFile) {
                const files = this.engine.plugin.app.vault.getMarkdownFiles();
                possibleFile = files.find(f => f.basename === filePath || f.name === filePath) || null;
            }

            if (possibleFile instanceof TFile && this.engine.getFileType(possibleFile) === "tasknote") {
                const pos = { x: node.x, y: node.y };
                canvas.removeNode(node);
                canvas.createFileNode({
                    file: possibleFile,
                    pos: pos,
                    size: { width: 400, height: 150 },
                    save: true
                });
                if (relationsAllowed) this.engine.syncManager.addCanvasToProject(possibleFile, canvasFile);
                return true; 
            }
        }

        // 2. Resolve target file reference
        let nodeFile: TFile | null = null;
        if (node.file instanceof TFile) {
            nodeFile = node.file;
        } else if (typeof node.file === 'string') {
            const f = this.engine.plugin.app.vault.getAbstractFileByPath(node.file);
            if (f instanceof TFile) nodeFile = f;
        } else if (node.filePath && typeof node.filePath === 'string') {
            const f = this.engine.plugin.app.vault.getAbstractFileByPath(node.filePath);
            if (f instanceof TFile) nodeFile = f;
        }

        // 3. Format and apply styles to TaskNote nodes
        if (nodeFile && this.engine.getFileType(nodeFile) === "tasknote") {
            let nodeModified = false;
            const cache = this.engine.plugin.app.metadataCache.getFileCache(nodeFile);
            const fm = cache?.frontmatter || {};

            // Verify if there are external blockers (dependencies not present in the active Canvas)
            let hasExternalBlockers = false;
            if (fm.blockedBy) {
                const list = Array.isArray(fm.blockedBy) ? fm.blockedBy : [fm.blockedBy];
                const canvasFiles = new Set<string>();
                for (const n of canvas.nodes.values()) {
                    let f: TFile | null = null;
                    if (n.file instanceof TFile) f = n.file;
                    else if (typeof n.file === 'string') {
                        const af = this.engine.plugin.app.vault.getAbstractFileByPath(n.file);
                        if (af instanceof TFile) f = af;
                    }
                    if (f) {
                        canvasFiles.add(f.basename);
                    }
                }
                
                const resolveLinkToBasename = (linkStr: any): string => {
                    const raw = typeof linkStr === 'object' && linkStr !== null && 'uid' in linkStr ? linkStr.uid : linkStr;
                    return String(raw ?? '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
                };
                
                for (const b of list) {
                    const basename = resolveLinkToBasename(b);
                    if (basename && !canvasFiles.has(basename)) {
                        const files = this.engine.plugin.app.vault.getMarkdownFiles();
                        const exists = files.some(f => f.basename === basename);
                        if (exists) {
                            hasExternalBlockers = true;
                            break;
                        }
                    }
                }
            }

            if (node.nodeEl) {
                node.nodeEl.classList.toggle('has-external-blockers', hasExternalBlockers);
                // Cartão de tarefa (canvas/taskCard.ts)
                const cards = (this.engine.plugin as any).board?.taskCards;
                cards?.mount?.(node, nodeFile);
            }

            if (!writes) return false;

            const targetColor = managed ? null : this.colorFor(nodeFile, fm);
            if (targetColor !== null && (node.color || '') !== (targetColor || '')) {
                if (typeof node.setColor === 'function') node.setColor(targetColor || '');
                else node.color = targetColor || '';
                nodeModified = true;
            }
            
            // O nó assume o formato de tarefa; a SMART, um pouco mais alta (barra de avanço).
            const targetWidth = 400;
            const targetHeight = String(fm.type) === 'tarefa_smart' ? 180 : 150;
            if (!managed && (node.width !== targetWidth || node.height !== targetHeight)) {
                if (typeof node.moveAndResize === 'function') {
                    node.moveAndResize({ x: node.x, y: node.y, width: targetWidth, height: targetHeight });
                } else {
                    node.width = targetWidth;
                    node.height = targetHeight;
                }
                nodeModified = true;
            }

            if (!managed && relationsAllowed) this.engine.syncManager.addCanvasToProject(nodeFile, canvasFile);
            
            if (nodeModified) {
                modified = true;
            }
        } else if (writes && !managed && nodeFile && this.engine.getFileType(nodeFile) === null) {
            if (relationsAllowed && this.engine.plugin.settings.canvasNoteRelationsEnabled) {
                this.engine.syncManager.addCanvasToRelations(nodeFile, canvasFile);
            }
        }

        return modified;
    }

    /**
     * A cor pela regra única de `canvas/taskColor.ts` (a mesma das zonas geridas),
     * com o avanço das ações para a SMART. Sem o índice de tarefas, cai na regra antiga.
     */
    private colorFor(file: TFile, fm: any): string {
        const board = (this.engine.plugin as any).board;
        const record = board?.tasks?.read?.(file);
        if (!record) return this.getNodeColorForTask(fm);
        const today = (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
        const children = record.type === 'tarefa_smart'
            ? board.tasks.all().filter((t: any) => t.type !== 'tarefa_smart' && t.projects.some((p: string) => fold(p) === fold(record.basename)))
            : undefined;
        return taskColor(record, today, { children }) ?? '';
    }

    /**
     * A cor de reserva (sem o índice de tarefas): só pelo status. A prioridade não pinta
     * (regra de `canvas/taskColor.ts`; decisão de 19/10): ela mora no campo, nos pesos e na
     * borda do cartão (impacto), e pintar de vermelho a urgência confundia com "bloqueada".
     */
    public getNodeColorForTask(fm: any): string {
        const status = String(fm.status || 'open').toLowerCase();

        // 1. Done/Completed -> Green (4)
        if (status === 'done' || status === 'completed' || status === 'complete') {
            return "4"; 
        }

        // 2. Other status mapping
        switch (status) {
            case 'in-progress':
                return "2"; // Orange (In Progress)
            case 'someday':
                return "3"; // Yellow (Someday / Maybe)
            case 'waiting-on':
                return "1"; // Red (Waiting On / Blocked)
            case 'next-action':
                return "6"; // Purple (Next Action)
            case 'inbox':
            case 'open':
            case 'todo':
            case 'backlog':
            default:
                return "5"; // Cyan (Inbox / Todo / Backlog)
        }
    }
}

