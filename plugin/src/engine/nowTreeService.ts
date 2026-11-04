/**
 * O serviço da árvore do agora e do bloco aberto: liga as funções puras
 * (`decisionWeights.ts`, `nowTree.ts`, `blockLog.ts`) ao vault e ao TaskNotes.
 *
 * Liga:
 * - a tabela de pesos (`DECISION_WEIGHTS_PATH`), lida a cada uso (o operador ajusta e
 *   vale na hora);
 * - as tarefas (frontmatter do metadataCache), a SMART da vez, a Temporada e a
 *   linhagem pelo `projects`;
 * - o registro dos blocos (`blockLog.ts`) e o pomodoro do TaskNotes (`tasknotesBridge.ts`).
 *
 * Regula: o bloco novo fecha o anterior (o próximo gesto); o fim do pomodoro fecha o
 * bloco da tarefa dele; o 🌙 fecha os que ficaram abertos (medido se o pomodoro ainda
 * roda na tarefa, senão estimado). A pasta do registro já existe no vault (com a nota
 * índice), para o primeiro bloco não mudar a árvore do cofre. A conclusão ("Quando
 * terminou?", 4.6) entra no registro com a hora real (`recordCompletion`); no fim do 🌙,
 * a tela opcional recolhe as concluídas do dia sem lugar e tempo (`offerNightCompletions`);
 * o 🔀 Mudei de frente põe a frente anterior em pausa (`frontToPause`, `pauseFront`).
 * Nada aqui decide pela pessoa: ordena, registra e põe o pomodoro onde ela escolheu.
 *
 * Oferece aos scripts (a pauta, no pacote seguinte) a mesma ordem do gesto:
 * `app.plugins.plugins['dfm-system'].nowTree.rankPages(páginas, { lugar, tempoMin })`.
 */
import { App, TFile } from 'obsidian';
import {
    DECISION_WEIGHTS_PATH,
    buildTaskRelations,
    isoWeekOf,
    lineageOf,
    linkName,
    parseWeightTable,
    taskUnitFrom,
    type DecisionContext,
    type TaskUnit,
    type WeightTableParse,
} from './decisionWeights';
import { blockOutcomeOf, rankForNow, smartsDaSemanaDe, type NowRanking } from './nowTree';
import {
    blockLogPath,
    closeBlockRecords,
    lastChoice,
    parseBlockLog,
    previousMonth,
    renderBlockLog,
    withCompletion,
    type BlockMeasure,
    type BlockRecord,
    type CompletionFact,
} from './blockLog';
import { onPomodoroEnd, openTaskForm, pomodoroRunsOn, startPomodoroOn, tasknotesApi, type TaskFormPrefill } from './tasknotesBridge';
import { HABIT_TRACKER_FOLDER, parseHabit, type Habit } from './habits';
import { temporadaFrom } from './temporada';
import { currentQuarter } from './calendario';
import { confirmNightRecords, nightCandidates, probableNightChoice, type NightCandidate } from '../board/taskCompletion';
import { DIA } from './dia';
import { DEFINICOES_PADRAO } from '../definicoes';

const TASKS_FOLDER = 'TaskNotes/Tasks';
const QUARTER_FOLDER = '300 - RUNTIME/302 - Daymiss/Quarterly';
const DAY_FOLDER = '300 - RUNTIME/302 - Daymiss/Day';

/** O 🌙 Fechar o dia (o papel `fechar_dia`): o fechamento dele fecha os blocos que ficaram abertos. */
const NIGHT_PAPEL = 'fechar_dia' as const;

export interface NowRankRequest {
    /** `AAAA-MM-DD` (a data de contexto do protocolo). */
    hoje: string;
    lugar?: string;
    /** O tamanho do bloco escolhido (o registro e o aprendizado). */
    blocoMin?: number | null;
    /** O teto do filtro (`null` = sem teto). */
    tempoCap?: number | null;
    /** Pasta das tarefas (a do passo); padrão `TaskNotes/Tasks`. */
    folder?: string;
    pinned?: string[];
    /** Quando o compromisso fixado foi deixado ("ontem" ou `DD/MM`), para a marca. */
    pinnedWhen?: string;
}

export interface OpenBlockRequest {
    taskPath: string;
    lugar: string;
    blocoMin: number | null;
    /** `AAAA-MM-DD` do bloco (a data de contexto). */
    dia: string;
}

/** O que faz: `AAAA-MM-DDTHH:mm` do relógio local. */
function stampNow(): string {
    const m = (window as any).moment?.();
    if (m?.format) return m.format('YYYY-MM-DDTHH:mm');
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * O que faz: o dia que o 🌙 está fechando. Entra: o payload de `dfm:protocol-complete`
 * e agora (`AAAA-MM-DDTHH:mm`). Sai: `AAAA-MM-DD`.
 * Por quê: o 🌙 depois da meia-noite fecha o dia da Day aberta (a data de contexto da
 * rodada, `contextDate`), não o do relógio; sem ela, vale a `_context_date` passada à
 * rodada e, por último, o relógio.
 */
export function nightDayOf(payload: any, now: string): string {
    for (const raw of [payload?.contextDate, payload?.variables?._context_date]) {
        const day = String(raw ?? '').slice(0, 10);
        if (DIA.test(day)) return day;
    }
    return String(now ?? '').slice(0, 10);
}

/**
 * O que faz: a frente em andamento hoje quando não há bloco aberto nem pomodoro (o 🔀
 * Mudei de frente). Entra: as tarefas, o que a Day de hoje aponta (`command_task_path`,
 * do ▶️, e `compromisso_act`, do 🤝) e o dia. Sai: os caminhos, sem repetir, da Day
 * primeiro e depois as tarefas em andamento agendadas para hoje; nunca `except`.
 * Por quê: a tarefa posta em andamento pelo 🤝 da fileira (⚡ Agora), pelo ▶️ ou pelo
 * menu de status não abre bloco; sem isto, ela não era pausada e a pauta mostrava as
 * duas frentes como "a única coisa" (grupo 3 das jornadas).
 * Só a que está em andamento conta (a checagem final do status é de quem chama).
 */
export function dayFrontCandidates(units: TaskUnit[], day: { commandPath?: unknown; commitment?: unknown }, today: string, except?: string): string[] {
    const list = units || [];
    const out: string[] = [];
    const push = (path: string | undefined) => {
        if (path && path !== except && !out.includes(path)) out.push(path);
    };
    const live = (unit: TaskUnit) => !unit.path.startsWith('TaskNotes/Archive/') && unit.status === 'in-progress';
    const commandPath = typeof day?.commandPath === 'string' ? day.commandPath.trim() : '';
    if (commandPath) push(list.find(unit => unit.path === commandPath && live(unit))?.path);
    const commitment = linkName(day?.commitment).trim();
    if (commitment) push(list.find(unit => live(unit) && (unit.name === commitment || unit.path.split('/').pop() === `${commitment}.md`))?.path);
    for (const unit of list) {
        if (live(unit) && unit.scheduled === today) push(unit.path);
    }
    return out;
}

export class NowTreeService {
    app: App;
    plugin: any;
    private unsubscribePomodoro: (() => void) | null = null;
    /** O `api.events` do TaskNotes em que a escuta do pomodoro está ligada. */
    private pomodoroEvents: unknown = null;
    /** As escritas no registro vão em fila: dois fechamentos juntos não se apagam. */
    private writing: Promise<unknown> = Promise.resolve();

    constructor(plugin: any) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    /** Liga as escutas: fim do pomodoro e fechamento do 🌙. */
    register() {
        this.plugin.registerEvent?.(this.app.workspace.on('dfm:protocol-complete' as any, (payload: any) => this.onProtocolComplete(payload)));
        this.attachPomodoro();
        this.plugin.register?.(() => this.unsubscribePomodoro?.());
    }

    /**
     * O que faz: o id que terminou é o do 🌙 (o papel `fechar_dia`, pela tabela vigente do
     * gerente; sem o gerente, a dos padrões da v0).
     */
    private ehDoFechamento(id: unknown): boolean {
        const manager = this.plugin?.manager;
        return typeof manager?.ehDoPapel === 'function' ? manager.ehDoPapel(id, [NIGHT_PAPEL]) : id === DEFINICOES_PADRAO.protocolos_por_papel[NIGHT_PAPEL];
    }

    /**
     * O que faz: no fim do 🌙, fecha os blocos que ficaram abertos — medido se o
     * pomodoro ainda roda na tarefa, senão estimado — e oferece a tela das concluídas
     * do dia que está sendo fechado (`nightDayOf`: o da Day, não o do relógio). Outros
     * protocolos não mexem no registro, e a continuação do 🌙 (o 🔎 Aprofundar depois
     * dele) não fecha nem oferece de novo: a primeira rodada já fez as duas coisas.
     * Não lança: o erro de gravação já é dito pela fila.
     */
    async onProtocolComplete(payload: any): Promise<BlockRecord[]> {
        if (!this.ehDoFechamento(payload?.id)) return [];
        if (payload?.continuation === true) return [];
        let closed: BlockRecord[] = [];
        try {
            closed = await this.closeOpenBlocks(null);
        } catch (e) {
            closed = [];
        }
        // Depois de fechar os blocos: a tela opcional das concluídas sem lugar e tempo.
        void this.offerNightCompletions(nightDayOf(payload, stampNow()));
        return closed;
    }

    /**
     * A tela do 🌙 (quem a desenha é a interface: `main.ts` a liga aqui). Recebe as
     * concluídas com o provável marcado e devolve as confirmadas, ou `null` ("Agora não").
     */
    nightScreen: ((items: Array<NightCandidate & { lugar: string; bloco_min: number }>) => Promise<Array<NightCandidate & { lugar: string; bloco_min: number }> | null>) | null = null;

    /** As concluídas de `dia` sem lugar e tempo no registro (a hora provável vem do `dateModified`). */
    async nightCandidatesFor(dia: string): Promise<NightCandidate[]> {
        const units = this.taskUnits();
        const modified = new Map<string, string>();
        const moment = (window as any).moment;
        for (const unit of units) {
            if (unit.status !== 'done' || unit.completed !== dia) continue;
            const file = this.app.vault.getAbstractFileByPath(unit.path);
            const raw = file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter?.dateModified : undefined;
            const local = raw && moment ? moment(raw) : null;
            if (local?.isValid?.()) modified.set(unit.path, local.format('YYYY-MM-DDTHH:mm'));
        }
        return nightCandidates(units, await this.blockRecords(dia), dia, modified);
    }

    /**
     * O que faz: no fim do 🌙, se há concluídas do dia sem lugar e tempo, oferece a tela;
     * o que ela confirmar entra no registro do mês. Sem tela ligada, sem concluídas ou
     * com "Agora não", nada muda. Não lança.
     */
    async offerNightCompletions(dia: string): Promise<BlockRecord[]> {
        try {
            if (!this.nightScreen) return [];
            const candidates = await this.nightCandidatesFor(dia);
            if (candidates.length === 0) return [];
            const last = lastChoice(await this.blockRecords(dia));
            const confirmed = await this.nightScreen(candidates.map(candidate => ({ ...candidate, ...probableNightChoice(candidate, last) })));
            if (!confirmed || confirmed.length === 0) return [];
            let written: BlockRecord[] = [];
            await this.updateLog(dia, records => {
                written = confirmNightRecords(records, confirmed, stampNow(), dia);
                return written;
            });
            return written;
        } catch (e) {
            console.error('DFM reputação contextual: a tela do 🌙 não gravou:', e);
            return [];
        }
    }

    /**
     * O que faz: a conclusão entra no registro com a hora real (o "Quando terminou?").
     * O bloco aberto da tarefa fecha na hora dita; sem bloco, fica o registro só de
     * conclusão. Medido só quando é "Agora" e o pomodoro ainda roda na tarefa.
     * Não lança: o registro é ausência de dado se falhar.
     */
    async recordCompletion(input: { taskPath: string; date: string; time: string | null; now?: boolean; lugar?: string; blocoMin?: number | null }): Promise<void> {
        try {
            const file = this.resolveTask(input.taskPath);
            const name = String(input.taskPath ?? '').split('/').pop()!.replace(/\.md$/, '');
            const unit = taskUnitFrom(file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined, file?.path ?? input.taskPath);
            const measured = input.now ? (await pomodoroRunsOn(this.app, input.taskPath)) || (file ? await pomodoroRunsOn(this.app, file.path) : false) : false;
            const fact: CompletionFact = {
                caminho: file?.path ?? input.taskPath,
                tarefa: unit.name || name,
                projeto: unit.projects[0] ?? '',
                tags: unit.tags,
                data: input.date,
                hora: input.time,
                medida: measured ? 'medido' : 'estimado',
                ...(input.lugar ? { lugar: input.lugar, bloco_min: input.blocoMin ?? null } : {}),
            };
            const month = input.date.slice(0, 7);
            const before = previousMonth(month);
            // O bloco aberto no mês anterior (o dia 31) fecha também; a linha nova vai para o mês do dia dito.
            if (before) await this.updateLog(`${before}-01`, records => withCompletion(records, fact, { append: false }));
            await this.updateLog(input.date, records => withCompletion(records, fact));
        } catch (e) {
            console.error('DFM reputação contextual: a conclusão não entrou no registro:', e);
        }
    }

    /**
     * O que faz: o provável de onde foi e quanto levou uma tarefa (a segunda linha do
     * "Quando terminou?"): o contexto e a estimativa dela, ou o último bloco registrado
     * (`probableNightChoice`, a mesma regra da tela do 🌙). Não lança: sem dado, o
     * primeiro lugar e 30 min.
     */
    async probableFor(taskPath: string): Promise<{ lugar: string; bloco_min: number }> {
        let unit: TaskUnit | null = null;
        try {
            const file = this.resolveTask(taskPath);
            unit = file ? taskUnitFrom(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path) : null;
        } catch (e) {
            unit = null;
        }
        let last: { lugar?: string; bloco_min?: number | null } = {};
        try { last = lastChoice(await this.blockRecords(stampNow().slice(0, 10))); } catch (e) { last = {}; }
        return probableNightChoice({ contexts: unit?.contexts ?? [], minutes: unit?.minutes ?? null }, last);
    }

    /** A tarefa pelo caminho, ou pelo nome em TaskNotes/ (concluir arquiva e muda a pasta). */
    resolveTask(pathOrName: string): TFile | null {
        const direct = this.app.vault.getAbstractFileByPath(pathOrName);
        if (direct instanceof TFile) return direct;
        const name = String(pathOrName ?? '').split('/').pop()!.replace(/\.md$/, '');
        return this.app.vault.getMarkdownFiles().find(f => f.path.startsWith('TaskNotes/') && f.basename === name) ?? null;
    }

    /**
     * O que faz: a frente anterior do 🔀 Mudei de frente — a tarefa do bloco aberto (o
     * mais recente primeiro); sem bloco, a do pomodoro do TaskNotes em curso; sem os dois,
     * a frente em andamento que a Day de hoje aponta ou as tarefas em andamento agendadas
     * para hoje (`dayFrontCandidates`). Só a que ainda está em andamento, e nunca a nova
     * (`except`). Mais de uma: quem chama pergunta qual pausar. Só lê.
     */
    async frontToPause(except?: string): Promise<string[]> {
        const today = stampNow().slice(0, 10);
        const records = await this.blockRecords(today);
        const open = records.filter(record => !record.fim).sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
        let paths = open.map(record => record.caminho);
        if (paths.length === 0) {
            try {
                const state = await tasknotesApi(this.app)?.pomodoro?.status?.();
                const path = state?.isRunning ? String(state?.currentSession?.taskPath ?? '') : '';
                if (path) paths = [path];
            } catch (e) {
                paths = [];
            }
        }
        if (paths.filter(path => path !== except).length === 0) {
            const dayFile = this.app.vault.getAbstractFileByPath(`${DAY_FOLDER}/${today}.md`);
            const fm = dayFile instanceof TFile ? this.app.metadataCache.getFileCache(dayFile)?.frontmatter ?? {} : {};
            paths = dayFrontCandidates(this.taskUnits(), { commandPath: fm.command_task_path, commitment: fm.compromisso_act }, today, except);
        }
        const out: string[] = [];
        for (const path of paths) {
            if (!path || path === except || out.includes(path)) continue;
            const file = this.app.vault.getAbstractFileByPath(path);
            const status = file instanceof TFile ? String(this.app.metadataCache.getFileCache(file)?.frontmatter?.status ?? '') : '';
            if (status === 'in-progress') out.push(path);
        }
        return out;
    }

    /**
     * O que faz: põe as frentes em pausa: próxima ação, sem `scheduled` (a pauta deixa de
     * mostrar as duas como "a única coisa"; decisão 3 de 16/10, arquitetura 4.3), e fecha
     * o bloco delas. Pelo TaskNotes quando ele está carregado; senão, pelo frontmatter.
     * Devolve os caminhos pausados.
     */
    async pauseFront(paths: string[]): Promise<string[]> {
        const done: string[] = [];
        const api = tasknotesApi(this.app);
        for (const path of paths || []) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) continue;
            let viaApi = false;
            if (api?.tasks?.setStatus && api?.tasks?.clearScheduled) {
                try {
                    await api.tasks.setStatus(path, 'next-action');
                    await api.tasks.clearScheduled(path);
                    viaApi = true;
                } catch (e) {
                    console.error(`DFM 🔀: o TaskNotes não pausou ${path}; gravando direto`, e);
                }
            }
            if (!viaApi) {
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
                    fm.status = 'next-action';
                    delete fm.scheduled;
                    fm.dateModified = new Date().toISOString();
                });
            }
            done.push(path);
        }
        if (done.length) await this.closeOpenBlocks(null, record => done.includes(record.caminho));
        return done;
    }

    /**
     * O que faz: escuta o fim do pomodoro do TaskNotes na API de agora. Chamada no
     * carregamento e, de forma preguiçosa, a cada gesto (`rank`, `openBlock`): se o
     * TaskNotes carregou depois, ou foi recarregado (a API e o `api.events` dele são
     * outros), a escuta velha sai e a nova entra. Já ligada na mesma API, não faz nada.
     * Sem a API (TaskNotes ainda carregando), não liga nada: a próxima chamada tenta.
     */
    attachPomodoro() {
        const events = (this.app as any)?.plugins?.plugins?.tasknotes?.api?.events ?? null;
        if (this.unsubscribePomodoro && events === this.pomodoroEvents) return;
        if (this.unsubscribePomodoro) {
            try { this.unsubscribePomodoro(); } catch (e) { /* a API velha já se foi */ }
            this.unsubscribePomodoro = null;
            this.pomodoroEvents = null;
        }
        if (!events) return;
        this.unsubscribePomodoro = onPomodoroEnd(this.app, (taskPath, event) => {
            void this.closeOpenBlocks('medido', record => record.caminho === taskPath, { interrompido: event === 'pomodoro.interrupted' });
        });
        this.pomodoroEvents = events;
    }

    /** A tabela de pesos do arquivo; sem o arquivo, tudo vale 0 e o problema é dito. */
    async loadWeights(): Promise<WeightTableParse> {
        try {
            const raw = await this.app.vault.adapter.read(DECISION_WEIGHTS_PATH);
            return parseWeightTable(JSON.parse(raw));
        } catch (e) {
            return { ...parseWeightTable({}), problemas: [`${DECISION_WEIGHTS_PATH} não foi lido`] };
        }
    }

    /** As tarefas da pasta como unidades (frontmatter do metadataCache). */
    taskUnits(folder = TASKS_FOLDER): TaskUnit[] {
        const prefix = `${String(folder || TASKS_FOLDER).replace(/\/+$/, '')}/`;
        return this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(prefix) || file.path.startsWith('TaskNotes/Archive/'))
            .map(file => taskUnitFrom(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path));
    }

    /** Os pais (`projects`) de uma nota qualquer, pelo nome. */
    parentsOf(name: string): string[] {
        const file = this.app.metadataCache.getFirstLinkpathDest?.(name, '');
        const raw = file ? this.app.metadataCache.getFileCache(file)?.frontmatter?.projects : undefined;
        const list = raw === undefined || raw === null || raw === '' ? [] : Array.isArray(raw) ? raw : [raw];
        return list.map(linkName).filter(Boolean);
    }

    /**
     * A Temporada do trimestre de `hoje`: a lista `temporada` da nota do trimestre (no
     * Q4, desde 25/10, os dois projetos centrais); vazia ou ausente, `departamentos_foco`
     * (a regra única, `temporadaFrom`). Os auxiliares entram pela linhagem: a tarefa de
     * um projeto que tem a central em `projects` sobe até ela.
     * O trimestre é o da semana de `hoje` (D6, a quinta-feira dela), como no painel e no
     * canvas: de 29 a 31/03/2027 (W13, quinta 01/04), o Q2, e não o Q1 do calendário.
     */
    temporadaOf(hoje: string): string[] {
        if (!DIA.test(String(hoje))) return [];
        const quarter = currentQuarter(String(hoje));
        const file = this.app.vault.getAbstractFileByPath(`${QUARTER_FOLDER}/${quarter}.md`);
        if (!(file instanceof TFile)) return [];
        return temporadaFrom(this.app.metadataCache.getFileCache(file)?.frontmatter);
    }

    /** Os registros do mês de `dia` e do anterior. */
    async blockRecords(dia: string): Promise<BlockRecord[]> {
        const month = String(dia).slice(0, 7);
        const out: BlockRecord[] = [];
        for (const m of [previousMonth(month), month]) {
            if (!m) continue;
            const file = this.app.vault.getAbstractFileByPath(blockLogPath(`${m}-01`));
            if (file instanceof TFile) out.push(...parseBlockLog(await this.app.vault.read(file)));
        }
        return out;
    }

    /** O lugar e o tempo do último bloco (o provável das duas perguntas). */
    async lastChoices(dia: string): Promise<{ lugar?: string; bloco_min?: number | null }> {
        try {
            return lastChoice(await this.blockRecords(dia));
        } catch (e) {
            return {};
        }
    }

    /** O contexto da decisão para um dia: semana, SMART da vez, Temporada, linhagem e reputação. */
    async decisionContext(units: TaskUnit[], request: { hoje: string; lugar?: string; blocoMin?: number | null }): Promise<DecisionContext> {
        const semana = isoWeekOf(request.hoje);
        const smartsDaVez = units
            .filter(unit => unit.type === 'tarefa_smart' && unit.status === 'in-progress' && unit.week === semana && !unit.archived)
            .map(unit => unit.name);
        const known = new Map(units.map(unit => [unit.name, unit.projects]));
        const parentsOf = (name: string) => known.get(name) ?? this.parentsOf(name);
        const linhagem = new Map(units.map(unit => [unit.name, lineageOf(unit.projects, parentsOf)]));
        let reputacao: BlockRecord[] = [];
        try { reputacao = await this.blockRecords(request.hoje); } catch (e) { reputacao = []; }
        return {
            hoje: request.hoje,
            semana,
            smartsDaVez,
            temporada: this.temporadaOf(request.hoje),
            lugar: request.lugar,
            blocoMin: request.blocoMin ?? null,
            reputacao,
            linhagem,
        };
    }

    /** A árvore do agora: as tarefas que cabem, pela ordem dos pesos. */
    async rank(request: NowRankRequest): Promise<NowRanking & { problemas: string[] }> {
        this.attachPomodoro();
        const { table, problemas } = await this.loadWeights();
        const units = this.taskUnits(request.folder);
        const ctx = await this.decisionContext(units, request);
        const ranking = rankForNow(units.filter(unit => !unit.path.startsWith('TaskNotes/Archive/')), ctx, table, buildTaskRelations(units), {
            lugar: request.lugar,
            tempoCap: request.tempoCap ?? null,
            pinned: request.pinned,
            pinnedWhen: request.pinnedWhen,
            habitos: this.habits(),
        });
        return { ...ranking, problemas };
    }

    /**
     * A mesma ordem para páginas do Dataview (a pauta). `tempoMin` é o teto; sem ele,
     * sem teto. Só lê.
     */
    async rankPages(pages: Iterable<any>, options: { hoje?: string; lugar?: string; tempoMin?: number | null } = {}): Promise<NowRanking & { problemas: string[] }> {
        const { table, problemas } = await this.loadWeights();
        const units = Array.from(pages || []).map(page => taskUnitFrom(page, String(page?.file?.path ?? '')));
        const hoje = options.hoje || stampNow().slice(0, 10);
        const ctx = await this.decisionContext(units, { hoje, lugar: options.lugar, blocoMin: options.tempoMin ?? null });
        return { ...rankForNow(units, ctx, table, buildTaskRelations(units), { lugar: options.lugar, tempoCap: options.tempoMin ?? null, habitos: this.habits() }), problemas };
    }

    /** Os hábitos do tracker (frontmatter do metadataCache); os de ação em treino viram candidatos. */
    habits(): Habit[] {
        const prefix = `${HABIT_TRACKER_FOLDER}/`;
        return this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(prefix))
            .map(file => parseHabit(file.path, this.app.metadataCache.getFileCache(file)?.frontmatter));
    }

    /**
     * O que faz: as SMART abertas da semana de `hoje`, a da vez (em andamento) primeiro.
     * Por quê: a tarefa nova (✨) escolhe a sua mãe entre elas antes do formulário
     * (decisão de 19/10: "Talvez se desse as opções de smart da semana para colocar ou
     * nao fosse melhor"); sem isso o TaskNotes põe a nota aberta (a Day) como projeto.
     * Entra → sai: data → nomes; semana sem SMART → [].
     */
    smartsDaSemana(hoje: string): string[] {
        return smartsDaSemanaDe(this.taskUnits(), isoWeekOf(hoje));
    }

    /**
     * O que faz: os projetos e departamentos ativos (nota-índice com `type: iniciativa`
     * e `status: active`, ou `type: departamento`), por nome. Só lê o metadataCache.
     */
    projetosAtivos(): string[] {
        const out = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const fm: any = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (!fm) continue;
            const type = String(fm.type ?? '');
            if ((type === 'iniciativa' && String(fm.status ?? '') === 'active') || type === 'departamento') out.add(file.basename);
        }
        return [...out].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    /** ✨ Trabalhar numa tarefa nova: o formulário do TaskNotes, já com o lugar e o tempo. */
    createTaskWithForm(prefill: TaskFormPrefill): Promise<string | null> {
        return openTaskForm(this.app, prefill);
    }

    /**
     * O bloco aberto pelo gesto: fecha o que estava aberto (o próximo gesto), registra
     * o novo e põe o pomodoro do TaskNotes na tarefa. O hábito escolhido (a nota em
     * `200 - FUNCTIONS/Habits/Tracker`) abre o bloco do mesmo jeito, marcado `habito`, sem
     * o pomodoro (o TaskNotes só o põe em tarefa); a marca vem quando o bloco fecha.
     */
    async openBlock(request: OpenBlockRequest): Promise<{ pomodoro: boolean; habito?: boolean }> {
        const file = this.app.vault.getAbstractFileByPath(request.taskPath);
        if (!(file instanceof TFile)) return { pomodoro: false };
        this.attachPomodoro();
        await this.closeOpenBlocks(null);
        const habito = file.path.startsWith(`${HABIT_TRACKER_FOLDER}/`);
        const unit = taskUnitFrom(this.app.metadataCache.getFileCache(file)?.frontmatter, file.path);
        const inicio = stampNow();
        const record: BlockRecord = {
            id: `${inicio}·${unit.name}`,
            data: request.dia || inicio.slice(0, 10),
            tarefa: unit.name,
            caminho: unit.path,
            projeto: habito ? '' : unit.projects[0] ?? '',
            tags: habito ? [] : unit.tags,
            lugar: request.lugar || '',
            bloco_min: request.blocoMin ?? null,
            inicio,
            ...(habito ? { habito: true } : {}),
        };
        await this.updateLog(record.data, records => [...records, record]);
        if (habito) return { pomodoro: false, habito: true };
        const minutes = request.blocoMin ? Math.min(request.blocoMin, this.pomodoroWorkMinutes()) : null;
        const pomodoro = await startPomodoroOn(this.app, unit.path, minutes);
        return { pomodoro };
    }

    /** A duração do pomodoro configurada no TaskNotes (o bloco curto não passa dela). */
    pomodoroWorkMinutes(): number {
        const value = Number((this.app as any)?.plugins?.plugins?.tasknotes?.settings?.pomodoroWorkDuration);
        return Number.isFinite(value) && value > 0 ? value : 25;
    }

    /**
     * Fecha os blocos abertos (deste mês e do anterior). `medida` nula: medido se o
     * pomodoro ainda roda na tarefa, senão estimado. O bloco de hábito que fecha feito
     * (`blockOutcomeOf`: sem o pomodoro interrompido) dá ao hábito a marca do dia do bloco,
     * pelo caminho do próprio motor (`recordDailyHabitEntry`).
     */
    async closeOpenBlocks(medida: BlockMeasure | null, somente?: (record: BlockRecord) => boolean, options: { interrompido?: boolean } = {}): Promise<BlockRecord[]> {
        const today = stampNow().slice(0, 10);
        const months = [today.slice(0, 7), previousMonth(today.slice(0, 7))].filter(Boolean);
        const closed: BlockRecord[] = [];
        for (const month of months) {
            await this.updateLog(`${month}-01`, async records => {
                const open = records.filter(record => !record.fim && (!somente || somente(record)));
                if (open.length === 0) return records;
                const units = this.taskUnits();
                let result = records;
                for (const record of open) {
                    const measure: BlockMeasure = medida ?? (await pomodoroRunsOn(this.app, record.caminho) ? 'medido' : 'estimado');
                    const step = closeBlockRecords(result, {
                        agora: stampNow(),
                        medida: measure,
                        saiu: r => blockOutcomeOf(r, units, { interrompido: options.interrompido }),
                        somente: r => r.id === record.id,
                    });
                    result = step.records;
                    closed.push(...step.fechados);
                }
                return result;
            });
        }
        for (const record of closed) {
            if (!record.habito || record.saiu !== 'concluída') continue;
            try {
                await this.plugin?.habitLog?.recordDailyHabitEntry?.(record.caminho, record.data);
            } catch (e) {
                console.error('DFM 🔁 hábito: a marca do bloco não foi gravada:', e);
            }
        }
        return closed;
    }

    /** Lê, transforma e grava o arquivo do mês de `dia`, em fila. */
    private updateLog(dia: string, transform: (records: BlockRecord[]) => BlockRecord[] | Promise<BlockRecord[]>): Promise<void> {
        const run = async () => {
            const path = blockLogPath(dia);
            const month = String(dia).slice(0, 7);
            const existing = this.app.vault.getAbstractFileByPath(path);
            const text = existing instanceof TFile ? await this.app.vault.read(existing) : null;
            const before = parseBlockLog(text);
            const after = await transform(before);
            if (after === before) return;
            const content = renderBlockLog(text, month, after);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
                return;
            }
            if (after.length === 0) return;
            const folder = path.split('/').slice(0, -1).join('/');
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                try { await this.app.vault.createFolder(folder); } catch (e) { /* já existe */ }
            }
            await this.app.vault.create(path, content);
        };
        const next = this.writing.then(run, run);
        this.writing = next.catch(error => console.error('DFM reputação contextual: registro do bloco não gravado:', error));
        return next;
    }
}

