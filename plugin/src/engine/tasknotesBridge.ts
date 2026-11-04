/**
 * Adaptador da API pública do TaskNotes (4.13: `plugin.api`), para o gesto.
 *
 * Liga quatro coisas, e só elas: o pomodoro na tarefa escolhida (`api.pomodoro.status`,
 * `start`, `assignTask`), o formulário nativo de criação (o mesmo do comando
 * `tasknotes:create-new-task`, com o lugar e o tempo já preenchidos), a criação pela API
 * (`api.tasks.create`, sempre com o `type`, `tasknotesCreate.ts`) e os eventos
 * (`api.events.on`: `task.created`, `pomodoro.completed`, `pomodoro.interrupted`).
 * Sem o TaskNotes carregado, cada função devolve um valor neutro e o gesto segue sem
 * pomodoro: o bloco é registrado como estimado.
 */
import type { App } from 'obsidian';
import { comTipoNaCriacao } from './tasknotesCreate';

/** O que faz: a API pública do TaskNotes, ou `null` se o plugin não está carregado. */
export function tasknotesApi(app: App): any | null {
    const plugin = (app as any)?.plugins?.plugins?.tasknotes;
    const api = plugin?.api;
    return api && typeof api === 'object' ? api : null;
}

/**
 * O que faz: põe o pomodoro do TaskNotes na tarefa. Sessão em curso: a tarefa passa a
 * ser a dela (`assignTask`); nenhuma: começa uma de `minutes` (`start`).
 * Devolve se o pomodoro ficou na tarefa.
 * Erro e ataque: a API muda de forma ou recusa (tarefa não achada): devolve `false`,
 * sem lançar; o gesto continua.
 */
export async function startPomodoroOn(app: App, taskPath: string, minutes: number | null): Promise<boolean> {
    const api = tasknotesApi(app);
    if (!api?.pomodoro || !taskPath) return false;
    try {
        const state = typeof api.pomodoro.status === 'function' ? await api.pomodoro.status() : null;
        if (state?.isRunning || state?.currentSession) {
            await api.pomodoro.assignTask(taskPath);
        } else {
            const duration = Number.isFinite(minutes as number) && (minutes as number) > 0 ? Math.round(minutes as number) : undefined;
            await api.pomodoro.start(duration ? { taskPath, duration } : { taskPath });
        }
        return true;
    } catch (e) {
        console.error('DFM gesto: o pomodoro do TaskNotes não começou na tarefa:', e);
        return false;
    }
}

/** O que faz: a sessão de pomodoro em curso está nesta tarefa? */
export async function pomodoroRunsOn(app: App, taskPath: string): Promise<boolean> {
    const api = tasknotesApi(app);
    if (!api?.pomodoro?.status || !taskPath) return false;
    try {
        const state = await api.pomodoro.status();
        return Boolean(state?.isRunning && state?.currentSession?.taskPath === taskPath);
    } catch (e) {
        return false;
    }
}

/**
 * O que faz: escuta o fim de um pomodoro (completo ou interrompido) e devolve o
 * caminho da tarefa dele. Devolve a função que desliga a escuta.
 */
export function onPomodoroEnd(app: App, listener: (taskPath: string, event: string) => void): () => void {
    const api = tasknotesApi(app);
    if (!api?.events?.on) return () => undefined;
    const refs: any[] = [];
    for (const event of ['pomodoro.completed', 'pomodoro.interrupted']) {
        try {
            refs.push(api.events.on(event, (payload: any) => {
                const path = String(payload?.taskPath ?? payload?.task?.path ?? '');
                if (path) listener(path, event);
            }));
        } catch (e) {
            console.error(`DFM gesto: não foi possível escutar ${event} do TaskNotes:`, e);
        }
    }
    return () => { for (const ref of refs) { try { api.events.off(ref); } catch (e) { /* já desligado */ } } };
}

/**
 * O que faz: cria a tarefa pela API do TaskNotes (`api.tasks.create`) com o `type` garantido
 * (`comTipoNaCriacao`) e devolve o caminho dela.
 * Por quê: o caminho único das criações do plugin por essa API (a Missão, P8): sem ele a
 * tarefa nascia sem `type: task`.
 * Erro e ataque: sem a API (o TaskNotes desligado, ou de outra versão), lança com o motivo em
 * palavras; a recusa do TaskNotes (título vazio, pasta) sobe como veio.
 */
export async function createTaskViaApi(app: App, pedido: Record<string, unknown>, contexto?: Record<string, unknown>): Promise<string> {
    const api = tasknotesApi(app);
    if (typeof api?.tasks?.create !== 'function') throw new Error('o TaskNotes não está carregado (a API de criar tarefa não respondeu)');
    const criada = await api.tasks.create(comTipoNaCriacao(pedido), contexto);
    const path = String(criada?.path ?? '');
    if (!path) throw new Error('o TaskNotes não disse onde a tarefa nasceu');
    return path;
}

/** Os campos que o formulário nativo do TaskNotes aceita preenchidos (`openTaskCreationModal`). */
export const TASK_FORM_KEYS = ['title', 'contexts', 'timeEstimate', 'projects'] as const;

/**
 * O que faz: o preenchimento do formulário nativo a partir de um frontmatter inicial (os
 * nomes do TaskNotes): o título, os contextos, a estimativa e os projetos (sem os `[[ ]]`).
 * Entra → sai: o frontmatter → `TaskFormPrefill` (a entrada não muda).
 * Erro e ataque: estimativa que não é número positivo sai; projeto vazio sai; sem projeto,
 * a lista vai vazia ("nenhuma, solta"), para o TaskNotes não pôr a nota aberta.
 */
export function prefillFromFrontmatter(fm: Record<string, unknown>): TaskFormPrefill {
    const lista = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]).map(x => String(x ?? '').trim()).filter(Boolean);
    const out: TaskFormPrefill = { projects: lista(fm.projects).map(p => p.replace(/^\[\[|\]\]$/g, '').split('|')[0]).filter(Boolean) };
    const title = String(fm.title ?? '').trim();
    if (title) out.title = title;
    const contexts = lista(fm.contexts);
    if (contexts.length) out.contexts = contexts;
    const minutos = Number(fm.timeEstimate);
    if (Number.isFinite(minutos) && minutos > 0) out.timeEstimate = Math.round(minutos);
    return out;
}

export interface TaskFormPrefill {
    contexts?: string[];
    timeEstimate?: number;
    /** O texto digitado na busca do gesto (o formulário do TaskNotes aceita `title`). */
    title?: string;
    /**
     * A mãe escolhida antes do formulário (nomes, sem [[ ]]). Vazio = "nenhuma, solta".
     * Sempre explícito: sem ele, o TaskNotes (useParentNoteAsProject) põe a Day aberta.
     */
    projects?: string[];
}

/**
 * O que faz: abre o formulário nativo de criação do TaskNotes e espera a tarefa salva.
 * Devolve o caminho da tarefa criada, ou `null` se o formulário foi fechado sem salvar.
 * Por quê: `✨ Trabalhar numa tarefa nova` (desde 19/10/2026): a tarefa nasce
 * completa, pelo formulário do próprio TaskNotes, e o evento de criação a torna o
 * compromisso. Substitui a criação em texto livre.
 * Como sabe que fechou sem salvar: o modal que apareceu depois de abrir sai do DOM e,
 * 1,5 s depois, nenhum `task.created` chegou. Teto de 30 min como guarda.
 * Erro e ataque: sem API de eventos, não há como saber qual tarefa nasceu: abre o
 * formulário mesmo assim e devolve `null` (a tarefa entra na próxima rodada do gesto).
 */
export function openTaskForm(app: App, prefill: TaskFormPrefill = {}, timeoutMs = 30 * 60 * 1000): Promise<string | null> {
    const plugin = (app as any)?.plugins?.plugins?.tasknotes;
    const api = tasknotesApi(app);
    const values: Record<string, any> = {};
    if (prefill.contexts?.length) values.contexts = [...prefill.contexts];
    if (Number.isFinite(prefill.timeEstimate as number) && (prefill.timeEstimate as number) > 0) values.timeEstimate = prefill.timeEstimate;
    if (typeof prefill.title === 'string' && prefill.title.trim()) values.title = prefill.title.trim();
    if (Array.isArray(prefill.projects)) values.projects = prefill.projects.filter(Boolean).map(name => `[[${name}]]`);

    const open = () => {
        if (typeof plugin?.openTaskCreationModal === 'function') {
            plugin.openTaskCreationModal(values);
            return true;
        }
        return Boolean((app as any)?.commands?.executeCommandById?.('tasknotes:create-new-task'));
    };

    if (!api?.events?.on) {
        open();
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        let done = false;
        let ref: any = null;
        let observer: MutationObserver | null = null;
        let timer: any = null;
        const finish = (path: string | null) => {
            if (done) return;
            done = true;
            try { if (ref) api.events.off(ref); } catch (e) { /* já desligado */ }
            observer?.disconnect();
            if (timer) clearTimeout(timer);
            resolve(path);
        };
        try {
            ref = api.events.on('task.created', (payload: any) => {
                const path = String(payload?.taskPath ?? payload?.task?.path ?? '');
                if (path) finish(path);
            });
        } catch (e) {
            finish(null);
            return;
        }
        const doc: Document | undefined = (globalThis as any).document;
        const before = new Set<Element>(doc ? Array.from(doc.querySelectorAll('.modal-container')) : []);
        if (!open()) {
            finish(null);
            return;
        }
        timer = setTimeout(() => finish(null), timeoutMs);
        if (!doc || typeof MutationObserver === 'undefined') return;
        const opened = Array.from(doc.querySelectorAll('.modal-container')).filter(el => !before.has(el));
        if (opened.length === 0) return;
        observer = new MutationObserver(() => {
            if (opened.every(el => !el.isConnected)) {
                observer?.disconnect();
                setTimeout(() => finish(null), 1500);
            }
        });
        observer.observe(doc.body, { childList: true, subtree: true });
    });
}
