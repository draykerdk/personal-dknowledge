/**
 * Aplica um plano a um canvas — o mesmo caminho para toda zona gerida.
 *
 * Canvas aberto: `getData` → plano → `setData` + `requestSave`. É o caminho do
 * próprio Obsidian, entra no histórico e o Ctrl+Z desfaz.
 * Canvas fechado: `vault.process` sobre o arquivo.
 *
 * Nos dois casos o motor de canvas recebe a nova linha de base
 * (`acceptCanvasState`), para não tratar os nós e setas da zona como edição do
 * operador — o que abriria pedidos de confirmação à toa.
 *
 * Guardas (cada uma tem teste em `tests/canvas/managedZone.test.ts`):
 * - **Canvas aberto não se grava pelo arquivo.** Vista aberta mas ainda vazia
 *   (carregando), ou com o operador no meio de um gesto (puxando seta,
 *   arrastando, editando texto), espera e tenta de novo; o `setData` no meio de
 *   um arrasto apagaria a seta em curso. Depois de 3 tentativas, desiste e
 *   registra no console; a próxima mudança tenta outra vez.
 * - **Vista desatualizada não regrava o disco.** Antes do `setData`, a parte do
 *   operador da vista é comparada com o arquivo. Se divergem e a vista não tem
 *   mudança por salvar, a vista é uma cópia velha (gravação externa ignorada
 *   enquanto ela salvava, git, outro aparelho): gravar a zona por cima
 *   devolveria ao disco o desenho velho. Aborta e registra.
 * - **Celular só lê.** Dois aparelhos regravando o mesmo `.canvas` pelo Sync
 *   (que não mescla JSON) é perda de desenho; no celular nenhuma zona é gravada.
 * - Depois de todo `await`, a vista e os dados são lidos de novo.
 * - **Setas que gravam (Fase 2).** Com a vista aberta, a comparação pendente do
 *   observador de setas (`edgeLinkWatcher.ts`) roda antes do plano: se ela
 *   gravou algum campo, a zona devolve `'adiado'` e a mudança da tarefa agenda
 *   a próxima sincronização (o plano de agora já nasceria velho). Gesto que
 *   chega durante a leitura do disco também é comparado antes do `setData`.
 *   Depois de toda sincronização ao vivo, aplicada ou igual, o observador
 *   recebe a nova linha de base (`accept`).
 */
import type { App } from 'obsidian';
import { Keymap, Platform, TFile } from 'obsidian';
import type { CanvasData } from '../project/projectCanvasModel';
import { sameCanvas } from '../project/projectCanvasModel';
import { unmanagedSignature } from './managedIds';

export type ApplyResult =
    | 'aplicado'
    | 'igual'
    | 'sem-canvas'
    /** Vista aberta sem dados ou ocupada por um gesto, depois de todas as tentativas. */
    | 'adiado'
    /** A vista aberta diverge do disco fora da zona e não tem mudança por salvar. */
    | 'vista-desatualizada'
    /** Aparelho em que as zonas geridas só leem (celular). */
    | 'somente-leitura';

export type ApplyRoute = 'live' | 'retry' | 'file';

export interface ViewState {
    /** Há uma vista aberta deste canvas. */
    hasView: boolean;
    /** Nós que a vista tem carregados agora. */
    liveNodes: number;
    /** Seta sendo puxada (`is-connecting` no canvas). */
    connecting?: boolean;
    /** Arrasto em curso (`canvas.isDragging`). */
    dragging?: boolean;
    /** Algum nó em edição de texto. */
    editing?: boolean;
}

export const RETRY_DELAY_MS = 800;
export const MAX_RETRIES = 3;

/** Por onde gravar a zona agora. Decisão pura. */
export function applyRoute(state: ViewState): ApplyRoute {
    if (!state.hasView) return 'file';
    if (state.liveNodes <= 0) return 'retry';
    if (state.connecting || state.dragging || state.editing) return 'retry';
    return 'live';
}

/** As zonas geridas podem ser gravadas neste aparelho? No celular, não. */
export function canvasWritesAllowed(): boolean {
    try {
        return !Platform.isMobile;
    } catch {
        return true;
    }
}

function openCanvas(app: App, path: string): any | null {
    return app.workspace.getLeavesOfType('canvas').map(l => l.view as any).find(v => v?.file?.path === path && v.canvas) ?? null;
}

/** Há uma aba com este canvas aberto? */
export function isCanvasOpen(app: App, path: string): boolean {
    return openCanvas(app, path) !== null;
}

function liveData(view: any): CanvasData | null {
    try {
        return view?.canvas?.getData?.() ?? null;
    } catch {
        return null;
    }
}

function viewState(view: any): ViewState {
    if (!view) return { hasView: false, liveNodes: 0 };
    const canvas = view.canvas;
    const nodes: any[] = Array.from(canvas?.nodes?.values?.() ?? []);
    const el = canvas?.canvasEl;
    return {
        hasView: true,
        liveNodes: liveData(view)?.nodes?.length ?? 0,
        connecting: !!(el?.classList?.contains?.('is-connecting') ?? el?.hasClass?.('is-connecting')),
        dragging: canvas?.isDragging === true,
        editing: nodes.some(n => n?.isEditing === true),
    };
}

/** A vista tem mudança ainda não gravada no disco. */
function viewDirty(view: any): boolean {
    return view?.dirty === true || view?.saving === true;
}

function parse(raw: string): CanvasData | null {
    try {
        const data = JSON.parse(raw || '{}');
        return data && typeof data === 'object' ? data : null;
    } catch {
        return null;
    }
}

/** O que a zona pede ao observador de setas (`EdgeLinkWatcher`). */
export interface ZoneLinkHooks {
    /** Roda a comparação pendente deste canvas; `true` = gravou campo de tarefa. */
    flush(path: string): Promise<boolean>;
    /** Há comparação agendada ou rodando para este canvas? */
    hasPending(path: string): boolean;
    /** O estado da vista depois da sincronização vira a linha de base. */
    accept(path: string, data: CanvasData): void;
}

export interface ApplyDeps {
    /** Espera entre tentativas (teste injeta uma que não espera). */
    wait?: (ms: number) => Promise<void>;
    /** Pode gravar neste aparelho? Padrão: `canvasWritesAllowed`. */
    writesAllowed?: () => boolean;
    /** Observador das setas desenhadas; sem ele, a zona é aplicada como antes. */
    links?: ZoneLinkHooks | null;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * O que faz: aplica um plano ao canvas de `path`: aberto, pela vista (`getData` → plano → `setData` e
 * `requestSave`, que o Ctrl+Z desfaz); fechado, pelo arquivo.
 * Por quê: um caminho só de gravação de canvas para toda zona gerida.
 * Erro e ataque: sem permissão de gravar neste aparelho (`writesAllowed`), não grava.
 * Prova: tests/canvas/managedZone.test.ts.
 */
export async function applyCanvasPlan(
    app: App,
    engine: any,
    path: string,
    plan: (current: CanvasData) => CanvasData,
    deps: ApplyDeps = {},
): Promise<ApplyResult> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return 'sem-canvas';
    if (!(deps.writesAllowed ?? canvasWritesAllowed)()) return 'somente-leitura';
    const wait = deps.wait ?? sleep;

    for (let attempt = 0; ; attempt++) {
        // Teto para qualquer volta (vista que abre e fecha, gesto que começa e acaba).
        if (attempt > MAX_RETRIES + 1) {
            console.warn(`DFM Canvas: zona de "${path}" não gravada — a vista mudou a cada tentativa. Fica para a próxima mudança.`);
            return 'adiado';
        }
        const view = openCanvas(app, path);
        const route = applyRoute(viewState(view));

        if (route === 'retry') {
            if (attempt >= MAX_RETRIES) {
                console.warn(`DFM Canvas: zona de "${path}" não gravada — a vista aberta está vazia ou no meio de um gesto. Fica para a próxima mudança.`);
                return 'adiado';
            }
            await wait(RETRY_DELAY_MS);
            continue;
        }

        if (route === 'file') {
            let result: ApplyResult = 'igual';
            let reopened = false;
            await app.vault.process(file, raw => {
                // Uma vista pode ter aberto durante a espera: aí o caminho é o dela.
                if (openCanvas(app, path)) { reopened = true; return raw; }
                const current = parse(raw);
                if (!current) return raw;
                current.nodes = current.nodes ?? [];
                current.edges = current.edges ?? [];
                const next = plan(current);
                if (sameCanvas(current, next)) return raw;
                result = 'aplicado';
                engine?.setIgnoreModifyFor?.(path);
                engine?.acceptCanvasState?.(path, next);
                return JSON.stringify(next, null, '\t');
            });
            if (reopened && attempt < MAX_RETRIES) continue;
            return reopened ? 'adiado' : result;
        }

        // route === 'live'
        // O gesto que o operador acabou de fazer vira campo antes de a zona ser refeita.
        if (deps.links && await deps.links.flush(path)) return 'adiado';
        let disk: CanvasData | null = null;
        try {
            disk = parse(await app.vault.read(file));
        } catch (error) {
            console.warn(`DFM Canvas: não foi possível ler "${path}" para conferir a vista.`, error);
        }
        // Depois do await: a vista pode ter fechado, trocado de arquivo ou entrado num gesto.
        const now = openCanvas(app, path);
        if (now !== view || applyRoute(viewState(now)) !== 'live') continue;
        // Gesto que chegou durante a leitura: compara antes de regravar.
        if (deps.links?.hasPending(path)) continue;
        const live = liveData(now);
        if (!live) continue;
        if (!viewDirty(now) && (!disk || unmanagedSignature(live) !== unmanagedSignature(disk))) {
            console.warn(`DFM Canvas: a vista aberta de "${path}" diverge do arquivo fora da zona gerida e não tem mudança por salvar. A zona não foi gravada, para não devolver ao disco uma cópia velha. Feche e reabra o canvas.`);
            return 'vista-desatualizada';
        }
        const next = plan(live);
        if (sameCanvas(live, next)) {
            deps.links?.accept(path, live);
            return 'igual';
        }
        engine?.acceptCanvasState?.(path, next);
        now.canvas.setData(next);
        deps.links?.accept(path, next);
        now.canvas.requestSave?.();
        return 'aplicado';
    }
}

/**
 * Abre um canvas gerido para o operador (D13): se ele já está numa aba, vai até
 * ela; senão abre **na mesma aba** (o voltar da aba retorna), ou numa aba nova
 * com Cmd/Ctrl (`newTab`). Nunca duas vistas do mesmo canvas.
 */
export async function revealCanvas(app: App, file: TFile, newTab = false): Promise<void> {
    const leaf = app.workspace.getLeavesOfType('canvas').find(l => (l.view as any)?.file?.path === file.path);
    if (leaf) {
        app.workspace.setActiveLeaf(leaf, { focus: true });
        return;
    }
    await app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file);
}

/** O clique pediu aba nova (Cmd no Mac, Ctrl no resto)? */
export function wantsNewTab(evt: MouseEvent | KeyboardEvent | null | undefined): boolean {
    if (!evt) return false;
    try {
        return !!Keymap.isModEvent(evt);
    } catch {
        return !!(evt.metaKey || evt.ctrlKey);
    }
}

/** Leva a vista do canvas aberto até um grupo (ex.: a zona da semana). */
export function focusNode(app: App, path: string, nodeId: string): boolean {
    const view = openCanvas(app, path);
    const node = view?.canvas?.nodes?.get?.(nodeId);
    if (!node || typeof view.canvas.zoomToBbox !== 'function') return false;
    view.canvas.zoomToBbox({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height });
    return true;
}
