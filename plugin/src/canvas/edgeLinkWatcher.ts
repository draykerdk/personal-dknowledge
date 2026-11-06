/**
 * Liga a seta desenhada ao campo da tarefa (Fase 2 do plano do canvas de
 * 13/10/2026). A decisão é de `edgeLinks.ts` (puro); aqui ficam os fios.
 *
 * **Gesto = mudança numa vista aberta deste aparelho (D12).** Por instância de
 * canvas, três métodos são embrulhados e restaurados quando o plugin
 * descarrega:
 * - `canvas.requestSave` (desenhar, apagar, mover a ponta de uma seta) e
 *   `canvas.applyHistory` (Ctrl+Z e Ctrl+Shift+Z, que no 1.14.4 não passam pelo
 *   `requestSave`) agendam a comparação;
 * - `canvas.setData` refaz a linha de base sem gravar: é por ele que a vista
 *   recarrega o arquivo mudado por fora (Sync, git, script) e que a zona gerida
 *   é aplicada.
 *
 * **Linha de base (L1):** tirada ao instalar o embrulho, no `file-open` do
 * canvas, em todo `setData` e depois de toda sincronização da zona, inclusive a
 * que não mudou nada (`accept`, chamado por `applyCanvasPlan`).
 *
 * **Comparação presa ao caminho (L2):** navegar na mesma aba reaproveita a
 * instância do canvas; a comparação agendada para um caminho é descartada se a
 * vista já mostra outro arquivo.
 *
 * **Espera (L4, L11):** 300 ms por caminho; a classe `is-connecting` e o
 * arrasto são lidos quando a espera termina (o fim da conexão chama
 * `requestSave` antes de tirar a classe). Depois de todo `await`, a vista e os
 * dados são relidos; se a linha de base mudou no meio (recarga), nada é gravado.
 *
 * **Seta apagada desfaz (Fase 3).** A comparação também vê a relação que sumiu
 * com as duas pontas presentes (apagar a seta, soltar a ponta no vazio, mover a
 * ponta para outro nó) e grava `unpatchFor`, com o aviso "Desligado: X ↛ Y" e
 * [Desfazer]. Os acréscimos gravam antes das remoções: mover a ponta de uma
 * seta de mãe para outra SMART não devolve a ação ao projeto no meio do caminho.
 * O menu da seta (`canvas:edge-menu`) tem "DFM · Desligar vínculo", que apaga a
 * seta pelo mesmo caminho.
 *
 * **Ctrl+Z (L5).** A comparação agendada pelo `applyHistory` é marcada como do
 * histórico até rodar: diferença que só toca setas `dfm-*` não grava nada (é a
 * sincronização sendo desfeita); a seta que o operador desenhou continua
 * valendo nos dois sentidos.
 *
 * Vale em todo canvas desde a Fase 6 (15/10/2026): num canvas solto, a seta
 * SMART → ação liga a ação à SMART, sem bloqueio, e o motor antigo não traduz
 * mais seta de tarefa (`managedIds.legacyEdgeAllowed`). No celular nada é
 * gravado (L7).
 * Cada gravação passa por `MissionBoard.updateTaskWith` e mostra por 8 s o
 * aviso com [Desfazer], que entra na pilha única do Desfazer (`board.desfazer`, a mesma da
 * Missão e do painel) e só desfaz o que ainda está lá (`patchDeDesfazer`); a seta sem sentido avisa uma vez que fica só como
 * desenho. A seta dia → ação acrescenta ao aviso "o dia passa de Y h" quando a
 * carga do dia passa do Bloco Sagrado da semana (`dayOverText`); só avisa. Emite `dfm:link-changed` `{kind, task, value, op, canvas}` (D14),
 * com `op` = `add`, `remove` ou `undo`.
 */
import { Notice, TFile } from 'obsidian';
import type { Menu, WorkspaceLeaf } from 'obsidian';
import type DFMPlugin from '../main';
import type { MissionBoard } from '../board/boardPlugin';
import { canvasWritesAllowed } from './managedZone';
import { annotationEdge, diffLinks, endOf, freshEdges, goneEdges, linkFor, linkLabel, meaninglessLabel, patchFor, unlinkLabel, unpatchFor } from './edgeLinks';
import type { CanvasLike, EdgeContext, Link, ManagedScope, NoteRef, Patch } from './edgeLinks';
import type { KeepEdge } from './managedIds';
import { fold } from '../project/projectCanvasModel';
import { patchDeDesfazer } from '../missao/gestos';
import { DIA } from '../engine/dia';
import { semanaOuVazio } from '../engine/periodo';

export const DEBOUNCE_MS = 300;
export const UNDO_NOTICE_MS = 8000;

export interface LinkChange { kind: Link['kind'] | string; task: string; value: string | null; op: 'add' | 'remove' | 'undo'; canvas: string }

export type ScopeResolver = (path: string) => Promise<ManagedScope | null> | ManagedScope | null;

export interface WatcherDeps {
    /** Contexto para classificar as pontas do canvas deste caminho. */
    context(path: string): Promise<EdgeContext>;
    /** Aplica o patch que `fn(fm)` devolve; devolve os valores anteriores, ou `null` se nada mudou. */
    write(task: string, fn: (fm: Record<string, any>) => Patch | null): Promise<Record<string, unknown> | null>;
    /**
     * O [Desfazer]: regrava os valores anteriores só nos campos que ainda têm o valor gravado
     * (`gravado`, o patch que a seta escreveu; sem ele, regrava tudo). Devolve se mudou algo.
     */
    restore(task: string, before: Record<string, unknown>, gravado?: Patch): Promise<boolean | void>;
    /** O aviso; com `undo`, o aviso entra na pilha única do Desfazer (`board.desfazer`). */
    notify(text: string, undo?: () => Promise<boolean | void> | void): void;
    emit(change: LinkChange): void;
    writesAllowed(): boolean;
    setTimer(fn: () => void, ms: number): number;
    clearTimer(id: number): void;
    /** Complemento do aviso de uma seta gravada (a carga do dia); `''` sem nada a dizer. Opcional. */
    linkNote?(link: Link): Promise<string> | string;
}

/** `history`: a comparação foi pedida (também) pelo Ctrl+Z ou Ctrl+Shift+Z. */
interface Pending { timer: number; view: any; history: boolean }

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? null));
}

function readData(view: any): CanvasLike | null {
    try {
        const data = view?.canvas?.getData?.();
        return data && typeof data === 'object' ? clone(data) : null;
    } catch {
        return null;
    }
}

/** Seta sendo puxada ou nó sendo arrastado: a comparação espera. */
function busy(view: any): boolean {
    const canvas = view?.canvas;
    const el = canvas?.canvasEl;
    const connecting = !!(el?.classList?.contains?.('is-connecting') ?? el?.hasClass?.('is-connecting'));
    return connecting || canvas?.isDragging === true;
}

export class EdgeLinkWatcher {
    private readonly base = new Map<string, CanvasLike>();
    private readonly pending = new Map<string, Pending>();
    private readonly running = new Map<string, Promise<boolean>>();
    private readonly hooked = new WeakSet<object>();
    private readonly restorers: Array<() => void> = [];
    private readonly resolvers: ScopeResolver[] = [];

    constructor(private readonly deps: WatcherDeps) {}

    /** Os gerentes de canvas dizem o que os ids geridos deles significam. */
    addResolver(resolver: ScopeResolver): void {
        this.resolvers.push(resolver);
    }

    /** Junta o que cada gerente sabe do canvas deste caminho. */
    async scope(path: string): Promise<ManagedScope> {
        const out: Required<ManagedScope> = { projectsByFile: {}, projectNodes: {} };
        for (const resolve of this.resolvers) {
            try {
                const s = await resolve(path);
                if (!s) continue;
                Object.assign(out.projectsByFile, s.projectsByFile ?? {});
                Object.assign(out.projectNodes, s.projectNodes ?? {});
            } catch (error) {
                console.error('DFM Setas: um gerente não respondeu sobre o canvas', path, error);
            }
        }
        return out;
    }

    /* ------------------------------------------------------- embrulho */

    /** Embrulha `requestSave`, `applyHistory` e `setData` desta instância de canvas (uma vez). */
    attach(view: any): boolean {
        const canvas = view?.canvas;
        if (!canvas || this.hooked.has(canvas)) return false;
        this.hooked.add(canvas);
        const wrap = (name: string, after: () => void) => {
            const original = canvas[name];
            if (typeof original !== 'function') return;
            const wrapper = function (this: unknown, ...args: unknown[]) {
                const result = original.apply(this, args);
                try { after(); } catch (error) { console.error(`DFM Setas: falha depois de ${name}`, error); }
                return result;
            };
            canvas[name] = wrapper;
            this.restorers.push(() => { if (canvas[name] === wrapper) canvas[name] = original; });
        };
        wrap('requestSave', () => this.observe(view));
        wrap('applyHistory', () => this.observe(view, true));
        wrap('setData', () => this.rebaseline(view));
        this.rebaseline(view);
        return true;
    }

    /** Desfaz todos os embrulhos e esperas (descarregar o plugin). */
    detach(): void {
        for (const restore of this.restorers.splice(0)) restore();
        for (const p of this.pending.values()) this.deps.clearTimer(p.timer);
        this.pending.clear();
    }

    /* --------------------------------------------------- linha de base */

    /** A vista mostra agora o que vale como base: recarga, abertura ou zona aplicada. Nada é gravado. */
    rebaseline(view: any): void {
        const path: string | undefined = view?.file?.path;
        if (!path) return;
        const data = readData(view);
        // Vista ainda carregando: sem base vazia (todas as setas pareceriam novas).
        if (!data?.nodes?.length) return;
        this.cancel(path);
        this.base.set(path, data);
    }

    /** A zona foi sincronizada (aplicada ou igual): este é o estado que vale. */
    accept(path: string, data: CanvasLike): void {
        if (!data?.nodes?.length) return;
        this.base.set(path, clone(data));
    }

    /**
     * O que faz: diz se o canvas já tem o estado aceito (a base) contra o qual o gesto se compara.
     * Por quê: sem base não há com que comparar; o primeiro estado visto vira a base, não um gesto.
     * Prova: tests/canvas/edgeLinkWatcher.test.ts.
     */
    hasBaseline(path: string): boolean {
        return this.base.has(path);
    }

    /* ----------------------------------------------------- comparação */

    /** Um gesto pode ter acontecido nesta vista: compara daqui a 300 ms. `history` = veio do Ctrl+Z. */
    observe(view: any, history = false): void {
        const path: string | undefined = view?.file?.path;
        if (!path) return;
        this.arm(path, view, history);
    }

    /**
     * O que faz: diz se há uma comparação marcada ou rodando para o canvas.
     * Por quê: quem sincroniza a zona espera o gesto em curso, para não gravar por cima dele.
     * Prova: tests/canvas/edgeLinkWatcher.test.ts.
     */
    hasPending(path: string): boolean {
        return this.pending.has(path) || this.running.has(path);
    }

    private arm(path: string, view: any, history: boolean): void {
        const was = this.pending.get(path);
        if (was) this.deps.clearTimer(was.timer);
        const timer = this.deps.setTimer(() => this.fire(path), DEBOUNCE_MS);
        // A marca do histórico fica até a comparação rodar: um requestSave logo
        // depois do Ctrl+Z não a apaga.
        this.pending.set(path, { timer, view, history: history || (was?.history ?? false) });
    }

    private cancel(path: string): void {
        const was = this.pending.get(path);
        if (!was) return;
        this.deps.clearTimer(was.timer);
        this.pending.delete(path);
    }

    private fire(path: string): void {
        const p = this.pending.get(path);
        if (!p) return;
        this.pending.delete(path);
        // L11: lido no fim da espera, não na chamada.
        if (busy(p.view)) { this.arm(path, p.view, p.history); return; }
        void this.start(path, p.view, p.history);
    }

    private start(path: string, view: any, history: boolean): Promise<boolean> {
        const run = this.compare(path, view, history)
            .catch(error => { console.error('DFM Setas: falha ao comparar', path, error); return false; })
            .finally(() => { if (this.running.get(path) === run) this.running.delete(path); });
        this.running.set(path, run);
        return run;
    }

    /**
     * Antes de regravar a zona: a comparação pendente roda agora (ou a que está
     * rodando termina). `true` = gravou algum campo; a zona espera a próxima
     * sincronização, que a mudança da tarefa agenda.
     */
    async flush(path: string): Promise<boolean> {
        const inFlight = this.running.get(path);
        if (inFlight) return inFlight;
        const p = this.pending.get(path);
        if (!p) return false;
        this.cancel(path);
        return this.start(path, p.view, p.history);
    }

    private async compare(path: string, view: any, history: boolean): Promise<boolean> {
        // L2: a mesma instância pode estar mostrando outro arquivo.
        if (view?.file?.path !== path) return false;
        const base = this.base.get(path);
        const first = readData(view);
        if (!first?.nodes?.length) return false;
        if (!base?.nodes?.length) { this.base.set(path, first); return false; }
        const quiet = freshEdges(base, first, { fromHistory: history }).length === 0 && goneEdges(base, first).length === 0;
        if (!this.deps.writesAllowed() || quiet) {
            this.base.set(path, first);
            return false;
        }

        const ctx = await this.deps.context(path);
        // L4: depois do await, tudo de novo. Base trocada = a vista recarregou; nada a gravar.
        if (view?.file?.path !== path || this.base.get(path) !== base) return false;
        const cur = readData(view);
        if (!cur?.nodes?.length) return false;
        const diff = diffLinks(base, cur, ctx, { fromHistory: history });
        this.base.set(path, cur);

        for (const m of diff.meaningless) this.deps.notify(meaninglessLabel(m.from, m.to));
        // Acréscimos antes das remoções: com a ponta movida de uma SMART para
        // outra, a ação já tem a mãe nova quando a velha sai.
        const steps: Array<{ link: Link; op: 'add' | 'remove' }> = [
            ...diff.added.map(link => ({ link, op: 'add' as const })),
            ...diff.removed.map(link => ({ link, op: 'remove' as const })),
        ];
        let wrote = false;
        for (const { link, op } of steps) {
            let gravado: Patch | null = null;
            const before = await this.deps.write(link.task, fm => {
                gravado = op === 'add' ? patchFor(fm, link) : unpatchFor(fm, link, ctx);
                return gravado;
            });
            if (!before) continue;
            wrote = true;
            const note = op === 'add' && this.deps.linkNote
                ? await Promise.resolve(this.deps.linkNote(link)).catch(error => { console.error('DFM Setas: sem a carga do dia', error); return ''; })
                : '';
            const written: Patch | undefined = gravado ?? undefined;
            this.deps.notify(op === 'add' ? `${linkLabel(link)}${note}` : unlinkLabel(link), () =>
                this.deps.restore(link.task, before, written).then(changed => {
                    if (changed !== false) this.deps.emit({ kind: link.kind, task: link.task, value: link.value, op: 'undo', canvas: path });
                    return changed;
                }));
            this.deps.emit({ kind: link.kind, task: link.task, value: link.value, op, canvas: path });
        }
        return wrote;
    }

    /* ----------------------------------------------- zona e menu da seta */

    /** O contexto das pontas deste canvas (o mesmo da comparação). */
    edgeContext(path: string): Promise<EdgeContext> {
        return this.deps.context(path);
    }

    /** Para o plano da zona: fica a seta do operador que é anotação (Fase 3, `keepEdge`). */
    async keepEdgeFor(path: string): Promise<KeepEdge> {
        return annotationEdge(await this.deps.context(path));
    }

    /**
     * "DFM · Desligar vínculo": apaga a seta, e a comparação desliga o campo com o
     * aviso de sempre. Seta sem sentido de dado não é apagada; o aviso diz por quê.
     * Devolve `true` se a seta foi apagada.
     */
    async unlinkEdge(view: any, edge: any): Promise<boolean> {
        const path: string | undefined = view?.file?.path;
        const canvas = view?.canvas;
        if (!path || !canvas || !this.deps.writesAllowed()) return false;
        const ctx = await this.deps.context(path);
        // Depois do await: a vista pode ter trocado de arquivo, ou a seta sumido.
        if (view?.file?.path !== path) return false;
        const data = readData(view);
        const drawn = (data?.edges ?? []).find(e => String(e?.id) === String(edge?.id));
        if (!data || !drawn) return false;
        const nodes = new Map((data.nodes ?? []).map(n => [String(n?.id), n]));
        const a = endOf(nodes.get(String(drawn.fromNode)), ctx);
        const b = endOf(nodes.get(String(drawn.toNode)), ctx);
        if (!a || !b || !linkFor(a, b)) {
            this.deps.notify('Esta seta não liga nenhum campo: fica só como desenho.');
            return false;
        }
        const live = canvas.edges?.get?.(String(edge?.id)) ?? edge;
        canvas.removeEdge?.(live);
        canvas.requestSave?.();
        return true;
    }

    private edgeMenu(plugin: DFMPlugin, menu: Menu, edge: any): void {
        const canvas = edge?.canvas;
        const view: any = plugin.app.workspace.getLeavesOfType('canvas').map(l => l.view as any).find(v => v?.canvas === canvas);
        if (!view?.file?.path || !this.deps.writesAllowed()) return;
        menu.addItem(item => item.setSection('action').setTitle('DFM · Desligar vínculo').setIcon('unlink')
            .onClick(() => void this.unlinkEdge(view, edge).catch(error => console.error('DFM Setas: falha ao desligar', error))));
    }

    /* ------------------------------------------------------------ fios */

    /** Os fios do Obsidian: embrulha cada canvas aberto e refaz a base ao abrir um arquivo. */
    register(plugin: DFMPlugin): void {
        // L7: no celular o observador não grava (as zonas também só leem lá).
        if (!this.deps.writesAllowed()) return;
        const { workspace } = plugin.app;
        const hookAll = () => workspace.getLeavesOfType('canvas').forEach((leaf: WorkspaceLeaf) => this.attach(leaf.view));
        plugin.registerEvent(workspace.on('layout-change', hookAll));
        plugin.registerEvent(workspace.on('active-leaf-change', hookAll));
        workspace.onLayoutReady(hookAll);
        plugin.registerEvent(workspace.on('canvas:edge-menu' as any, (menu: Menu, edge: any) => this.edgeMenu(plugin, menu, edge)));
        plugin.registerEvent(workspace.on('file-open', file => {
            if (!(file instanceof TFile) || file.extension !== 'canvas') return;
            hookAll();
            window.setTimeout(() => {
                for (const leaf of workspace.getLeavesOfType('canvas')) {
                    const view: any = leaf.view;
                    if (view?.file?.path === file.path && !this.hasPending(file.path)) this.rebaseline(view);
                }
            }, 50);
        }));
        plugin.register(() => this.detach());
    }

    /** As dependências reais: TaskIndex e metadataCache, `MissionBoard`, `Notice`, `workspace.trigger`. */
    static depsFor(plugin: DFMPlugin, board: MissionBoard, scope: (path: string) => Promise<ManagedScope>): WatcherDeps {
        const app = plugin.app;
        const fmOf = (file: TFile) => app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        return {
            async context(path: string): Promise<EdgeContext> {
                const managed = await scope(path);
                const smarts = new Set(board.tasks.all().filter(t => t.type === 'tarefa_smart').map(t => fold(t.basename)));
                return {
                    ...managed,
                    isSmartName: (name: string) => smarts.has(fold(name)),
                    taskAt(p: string) {
                        const file = app.vault.getAbstractFileByPath(p);
                        if (!(file instanceof TFile)) return null;
                        const task = board.tasks.read(file);
                        if (!task) return null;
                        const fm = fmOf(file);
                        return { path: task.path, basename: task.basename, type: task.type, projects: task.projects, week: fm.week, impacto: fm.impacto };
                    },
                    noteAt(p: string): NoteRef | null {
                        const file = app.vault.getAbstractFileByPath(p);
                        if (!(file instanceof TFile) || file.extension !== 'md') return null;
                        const fm = fmOf(file);
                        if (fm.type === 'weekly_note') {
                            const week = (semanaOuVazio(fm.week ?? file.basename) || undefined);
                            return week ? { kind: 'week', week } : null;
                        }
                        if (fm.type === 'daily_note') {
                            const date = String(fm.date ?? file.basename).slice(0, 10);
                            return DIA.test(date) ? { kind: 'day', date } : null;
                        }
                        return null;
                    },
                };
            },
            async write(task, fn) {
                const result = await board.updateTaskWith(task, fn);
                return result.changed ? result.before : null;
            },
            async restore(task, before, gravado) {
                // Só o que ainda está lá (a guarda de `unpatchFor`, §12 da página Missão).
                if (!gravado) { await board.updateTask(task, before); return true; }
                const result = await board.updateTaskWith(task, fm => patchDeDesfazer(fm, before, gravado).patch);
                return result.changed;
            },
            notify(text, undo) {
                if (!undo) { new Notice(text, UNDO_NOTICE_MS); return; }
                // A pilha única do Desfazer (a Missão, o painel e as setas): o aviso e o ⌘Z da Missão.
                board.desfazer.registrar({
                    rotulo: text,
                    desfazer: async () => {
                        const changed = await undo();
                        return changed === false
                            ? { feito: false, texto: `Nada a desfazer: o campo mudou depois (${text})` }
                            : { feito: true, texto: `Desfeito: ${text}` };
                    },
                });
            },
            emit(change) {
                app.workspace.trigger('dfm:link-changed' as any, change);
            },
            writesAllowed: canvasWritesAllowed,
            setTimer: (fn, ms) => window.setTimeout(fn, ms),
            clearTimer: id => window.clearTimeout(id),
            linkNote(link) {
                if (link.kind !== 'scheduled' || !link.value) return '';
                // A mesma leitura do aviso dos gestos da Missão (02/11): o Bloco Sagrado da Week e a conta da carga.
                return board.avisoDeCargaNoDia(String(link.value), link.task);
            },
        };
    }
}
