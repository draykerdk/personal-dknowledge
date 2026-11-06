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
import { carimboDoMomento } from './dia';
import {
    comTipoNaCriacao, frontmatterDaTarefaNova, frontmatterDoPedido, nomeDaTarefaNova, pedidoDoFrontmatter, PASTA_DAS_TAREFAS, textoDaTarefa,
    type PedidoDeCriacao,
} from './tasknotesCreate';

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

/** O que a borda única aceita além do pedido: o corpo da nota e o relógio. */
export interface OpcoesDaCriacao {
    /**
     * O corpo da nota, pelo nome final do arquivo (o título do corpo é o nome com o " (2)"). Sem ele, o
     * corpo é o do modelo do TaskNotes (pela API) ou o título (pela volta).
     */
    corpo?: (nome: string) => string;
    /** O momento da criação (o relógio chega pela borda; sem ele, agora). */
    agora?: Date;
}

/**
 * O que faz: a borda única que cria uma tarefa (o criador único, D5, 05/11): o frontmatter na forma
 * única (`frontmatterDaTarefaNova`, com o carimbo do momento), o nome livre pela regra do TaskNotes com o
 * " (2)" (`nomeDaTarefaNova`), e a criação pela API do TaskNotes (`api.tasks.create`, com o `type`
 * garantido); o corpo do protocolo, quando há, entra depois no lugar do corpo do modelo. Sem a API (o
 * TaskNotes desligado), a volta: `vault.create` do mesmo frontmatter (`frontmatterDoPedido`). Devolve o
 * caminho.
 * Por quê: o diagnóstico do fluxo SMART (02/11, §3.2, "Criar uma tarefa"): oito caminhos, cada um com o
 * seu padrão; passam por aqui o Novo e o "＋ O que fiz" da Missão, o `createTask` do motor e o "➕ Criar a
 * que falta" de um passo.
 * Erro e ataque: sem a API e sem o cofre, lança com o motivo em palavras; a recusa do TaskNotes (título
 * vazio, pasta) sobe como veio, sem a volta (a volta é para o TaskNotes ausente, não para a recusa dele);
 * título que limpo fica vazio lança antes de gravar.
 * Prova: tests/engine/tasknotesCreate.test.ts ("a borda") e tests/engine/criadorUnico.test.ts.
 */
export async function createTaskViaApi(app: App, pedido: Record<string, unknown>, contexto?: Record<string, unknown>, opcoes: OpcoesDaCriacao = {}): Promise<string> {
    const api = tasknotesApi(app);
    const vault: any = (app as any)?.vault;
    const temApi = typeof api?.tasks?.create === 'function';
    if (!temApi && typeof vault?.create !== 'function') throw new Error('o TaskNotes não está carregado (a API de criar tarefa não respondeu)');
    const carimbo = carimboDoMomento(opcoes.agora ?? new Date());
    const titulo = String(pedido?.title ?? '').trim();
    const fm = frontmatterDaTarefaNova(frontmatterDoPedido(comTipoNaCriacao(pedido) as PedidoDeCriacao, ''), carimbo);
    const existe = (nome: string) => Boolean(vault?.getAbstractFileByPath?.(`${PASTA_DAS_TAREFAS}/${nome}.md`));
    const nome = titulo ? nomeDaTarefaNova(titulo, existe) : '';
    if (temApi) {
        const criada = await api.tasks.create(pedidoDoFrontmatter({ ...fm, title: nome || titulo }), contexto);
        const path = String(criada?.path ?? '');
        if (!path) throw new Error('o TaskNotes não disse onde a tarefa nasceu');
        if (opcoes.corpo) await trocarCorpo(app, path, opcoes.corpo(path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')));
        return path;
    }
    if (!nome) throw new Error('Title is required');
    const path = `${PASTA_DAS_TAREFAS}/${nome}.md`;
    if (!vault.getAbstractFileByPath?.(PASTA_DAS_TAREFAS)) {
        try { await vault.createFolder(PASTA_DAS_TAREFAS); } catch (e) { /* já existe */ }
    }
    const gravado = frontmatterDoPedido(pedidoDoFrontmatter({ ...fm, title: nome }), nome);
    await vault.create(path, textoDaTarefa(gravado, opcoes.corpo ? opcoes.corpo(nome) : `# ${nome}\n`));
    return path;
}

/**
 * O que faz: troca o corpo da nota recém-criada pelo do protocolo, guardando o frontmatter que o TaskNotes
 * gravou. Falha não desfaz a tarefa: ela fica com o corpo do modelo, e o console diz.
 */
async function trocarCorpo(app: App, path: string, corpo: string): Promise<void> {
    try {
        const vault: any = (app as any).vault;
        const file = vault.getAbstractFileByPath(path);
        if (!file) return;
        const trocar = (texto: string) => {
            const fm = /^---\n[\s\S]*?\n---\n?/.exec(texto);
            return `${fm ? fm[0] : ''}\n${corpo.replace(/^\n+/, '')}`;
        };
        if (typeof vault.process === 'function') await vault.process(file, trocar);
        else await vault.modify(file, trocar(await vault.read(file)));
    } catch (e) {
        console.error('DFM criar tarefa: o corpo do protocolo não entrou na nota (fica o do modelo):', e);
    }
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
