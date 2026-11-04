import { coldStorageDestination } from './areaIndex';
import { App, TFile, TFolder, Notice } from 'obsidian';
import type DFMPlugin from '../main';
import {
    completionKind,
    completionLogTarget,
    completionWeekLine,
    neutralRecordTarget,
    neutralWeekLine,
    recurringInstanceDate,
    releaseOffer,
    takeCompletionAnswer,
    takeCompletionNoticed,
    whenFromCompletedDate,
    withWeekLogLine,
    type CompletionWhen,
    type NeutralRecordTarget,
} from '../board/taskCompletion';
import { isoWeekOf } from './decisionWeights';
import { PROJECT_COLUMNS } from './missionPortfolio';
import { DIA } from './dia';
import { DOMAIN_MODELS_FOLDER, parseDomainModel, type DomainModel } from './domainModel';
import { habitoDaPassagem, habitoValeNoFormato, regraDaNota, regrasDosHabitos, type RegraDoHabito } from './habitoDoEstado';
import { definicoesDe } from '../definicoes';

/** Quanto tempo depois de gravada a mudança de estado ainda conta como de agora (a releitura do cofre ao abrir não marca). */
export const JANELA_DA_PASSAGEM_MS = 2 * 60 * 1000;

/**
 * Agora, em hora local: o dia, a hora e os dois juntos (`AAAA-MM-DDTHH:mm`). Pelo moment
 * do Obsidian quando ele existe; senão, pelo relógio.
 */
function nowParts(): { date: string; time: string; stamp: string } {
    const m = (globalThis as any).window?.moment?.();
    let date = m?.format ? String(m.format('YYYY-MM-DD')) : '';
    let time = m?.format ? String(m.format('HH:mm')) : '';
    if (!DIA.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return { date, time, stamp: `${date}T${time}` };
}

export class MetadataWatcher {
    plugin: DFMPlugin;
    app: App;
    /** Os tipos cujos estados marcam um hábito (03/11), lidos dos modelos; vazio até o cofre abrir. */
    regrasDosHabitos: RegraDoHabito[] = [];
    /** O status visto de cada nota dessas regras: é contra ele que a passagem se mede. */
    estadosVistos = new Map<string, string>();

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    register() {
        // 1. Register TaskNotes API events if available (with retry logic)
        const registerTaskNotesEvents = () => {
            const tasknotes = (this.app as any).plugins.plugins.tasknotes;
            if (tasknotes && tasknotes.api && tasknotes.api.events) {
                // Escuta apenas quando uma tarefa do TaskNotes é concluída de verdade
                this.plugin.registerEvent(
                    tasknotes.api.events.on('task.completed', (event: any) => {
                        this.handleTaskCompletedEvent(event);
                    })
                );
                
                // A recorrente conclui por instância: o status não muda, e o TaskNotes
                // emite `recurring.instance.completed` em vez de `task.completed`. Sem
                // esta escuta, concluir a recorrente não perguntava "Quando terminou?",
                // não deixava linha na Day nem na Week e não entrava na reputação (4.6).
                // A instância pulada (`recurring.instance.skipped`) não é conclusão.
                this.plugin.registerEvent(
                    tasknotes.api.events.on('recurring.instance.completed', (event: any) => {
                        void this.handleRecurringInstanceCompleted(event);
                    })
                );

                // A escuta de `task.updated` ("fiz meu melhor hoje") só pontuava e saiu com o
                // arquivamento da gamificação (29/10/2026).

                // O Pomodoro concluído marca o hábito "08 - Concluir um Pomodoro".
                this.plugin.registerEvent(
                    tasknotes.api.events.on('pomodoro.completed', (event: any) => {
                        this.handlePomodoroCompletedEvent(event);
                    })
                );


                
                console.log("DFM System: Mapeamento avançado da API do TaskNotes registrado.");
                return true;
            }
            return false;
        };

        if (!registerTaskNotesEvents()) {
            console.log("DFM System: API do TaskNotes não encontrada na inicialização. Agendando retentativas para registro dos eventos de tarefa...");
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (registerTaskNotesEvents() || attempts >= 5) {
                    clearInterval(interval);
                    if (attempts >= 5 && !(this.app as any).plugins.plugins.tasknotes?.api) {
                        new Notice("DFM System: API do TaskNotes não encontrada. A conclusão de tarefas pelo TaskNotes não será registrada.");
                    }
                }
            }, 1000);
        }

        // 2. Register global metadata watcher ONLY for README and Canvas files (for Cold Storage)
        this.plugin.registerEvent(
            this.app.metadataCache.on('changed', (file, data, cache) => {
                if (!this.app.workspace.layoutReady) return;
                
                const isCentralNote = file.basename === file.parent?.name || file.extension === 'canvas' || file.basename === '000 - INDEX';
                if (isCentralNote) {
                    this.handleColdStorageChange(file, cache);
                }
                // 3. O estado que marca um hábito (03/11): o roteiro que passa a gravado marca o 🎥 do dia.
                void this.handleEstadoDaNota(file, cache);
            })
        );
        // Os modelos e a fotografia dos estados de agora, quando o cofre abre; o modelo que muda relê as regras.
        this.app.workspace.onLayoutReady?.(() => { void this.carregarHabitosDosEstados(); });
        this.plugin.registerEvent(
            this.app.vault.on('modify', (file: any) => {
                if (String(file?.path ?? '').startsWith(`${DOMAIN_MODELS_FOLDER}/`)) void this.carregarHabitosDosEstados();
            })
        );
        this.plugin.registerEvent(
            this.app.vault.on('rename', (file: any, antes: string) => {
                if (!this.estadosVistos.has(antes)) return;
                this.estadosVistos.set(String(file?.path ?? ''), this.estadosVistos.get(antes)!);
                this.estadosVistos.delete(antes);
            })
        );
    }

    /**
     * O que faz: lê os modelos dos tipos (`Config/dominios`), guarda as regras dos estados que marcam um hábito e a
     * fotografia do status de cada nota delas agora.
     * Por quê: a passagem se mede contra o status visto; a fotografia ao abrir faz a releitura do cofre não marcar nada.
     * Erro e ataque: o modelo que não se lê fica de fora (com o motivo no console); sem a pasta, nenhuma regra.
     */
    async carregarHabitosDosEstados(): Promise<void> {
        const pasta = this.app.vault.getAbstractFileByPath(DOMAIN_MODELS_FOLDER);
        const arquivos = pasta instanceof TFolder ? pasta.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'json') : [];
        const modelos: DomainModel[] = [];
        for (const f of arquivos) {
            try {
                const modelo = parseDomainModel(JSON.parse(await this.app.vault.read(f)), f.basename).modelo;
                if (modelo) modelos.push(modelo);
            } catch (e) {
                console.warn(`DFM: o modelo ${f.path} não se lê; os estados dele não marcam hábito`, e);
            }
        }
        this.regrasDosHabitos = regrasDosHabitos(modelos);
        this.estadosVistos.clear();
        if (!this.regrasDosHabitos.length) return;
        for (const f of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
            if (regraDaNota(this.regrasDosHabitos, f.path, fm?.type)) this.estadosVistos.set(f.path, String(fm?.status ?? '').trim());
        }
    }

    /**
     * O que faz: a nota de um tipo com regra mudou: guarda o status novo e, quando a passagem marca um hábito
     * (`habitoDaPassagem`) e a mudança é de agora, marca o dia de hoje pelo caminho de sempre do motor.
     * Por quê: 03/11, "o hábito de criar vídeos": o roteiro que entra em gravado (pelo menu de status da Missão, pela
     * nota ou pelo registro da bancada) marca o 🎥 Gravar 1 conteúdo; ir de gravado a editado não marca de novo.
     * Erro e ataque: a mudança antiga (a releitura do cofre ao abrir, a sincronização) só atualiza o status visto;
     * a marca é idempotente por dia (`recordDailyHabitEntry`); a nota do hábito que não existe só avisa no console.
     */
    async handleEstadoDaNota(file: TFile, cache: any): Promise<boolean> {
        if (!this.regrasDosHabitos.length || !file?.path) return false;
        const fm = cache?.frontmatter;
        const regra = regraDaNota(this.regrasDosHabitos, file.path, fm?.type);
        if (!regra) return false;
        const depois = String(fm?.status ?? '').trim();
        const antes = this.estadosVistos.has(file.path) ? this.estadosVistos.get(file.path)! : null;
        this.estadosVistos.set(file.path, depois);
        if (Math.abs(Date.now() - Number(file.stat?.mtime ?? 0)) > JANELA_DA_PASSAGEM_MS) return false;
        const habito = habitoValeNoFormato(regra, fm) ? habitoDaPassagem(regra, antes, depois) : null;
        if (!habito) return false;
        const marcou = await this.plugin.habitLog.recordDailyHabitEntry(habito);
        if (marcou) new Notice(`Hábito marcado hoje: ${habito.split('/').pop()!.replace(/\.md$/, '')} (${file.basename}: ${depois})`, 5000);
        return marcou;
    }

    async handleColdStorageChange(file: TFile, cache: any) {
        if (!cache || !cache.frontmatter) return;
        
        // CRITICAL FIX: Only process if the file was physically modified in the last 30 seconds.
        // Prevents startup floods for Cold Storage.
        if (Math.abs(Date.now() - file.stat.mtime) > 30000) return;

        const status = cache.frontmatter.status;
        if (status) {
            const st = String(status).toLowerCase();
            if (st === 'concluido' || st === 'concluído' || st === 'done' || st === 'cancelled' || st === 'cancelado') {
                // Frente permanente (departamento/área) não "termina": arquivar move a pasta
                // inteira e faz o Obsidian reescrever os wikilinks do vault, o que é caro de
                // reverter. Um status errado no frontmatter não pode causar isso sozinho.
                if (this.isPermanentFront(cache.frontmatter)) {
                    console.warn(`DFM System: Cold Storage ignorado em "${file.path}" — type/scope indicam frente permanente (status: ${st}).`);
                    new Notice(`Cold Storage ignorado: "${file.basename}" é uma frente permanente e não foi arquivada. Corrija o status se o arquivamento era intencional.`, 10000);
                    return;
                }
                await this.processColdStorage(file, st);
            }
        }
    }

    /**
     * Uma frente permanente é aquela que, por definição, não fecha: departamentos e áreas,
     * ou qualquer nota cujo `scope` declare continuidade. Serve de trava para o Cold Storage.
     */
    isPermanentFront(frontmatter: any): boolean {
        if (!frontmatter) return false;

        const type = String(frontmatter.type ?? '').toLowerCase().trim();
        if (type === 'departamento' || type === 'area' || type === 'área') return true;

        const scope = String(frontmatter.scope ?? '').toLowerCase();
        return scope.includes('contínuo') || scope.includes('continuo')
            || scope.includes('permanente') || scope.includes('sem fechamento');
    }

    async handleTaskCompletedEvent(event: any) {
        // A pontuação da conclusão (pontos e E.C.H. pelas tags, impacto, complexidade e
        // pomodoros, com a lista `completedTasknotes` em `settings.gamification`) saiu em
        // 29/10/2026, com o arquivamento da gamificação. A guarda que exigia
        // `settings.gamification` antes de tudo saiu junto: a conclusão não depende dela.
        const { task } = event;
        const taskPath = event.taskPath || event.path;
        if (!task || !taskPath) return;

        const displayName = task.title || taskPath.split('/').pop()?.replace('.md', '') || 'Tarefa';

        // O TaskNotes emite `task.completed` também ao cancelar. Cancelar não é
        // concluir: só um registro neutro (na Day que existe, ou na Week, sem criar
        // nota), sem hábito do Comando e sem fechar iniciativa (se for retomada e
        // concluída depois, conta nessa hora).
        const status = task.status ?? event.after?.status ?? this.statusOf(taskPath);
        if (completionKind(status) === 'cancelled') {
            await this.logNeutralCancel(displayName, taskPath);
            return;
        }

        // "Quando terminou?" (arquitetura 4.6): a resposta dada no quadro, o dia que o
        // TaskNotes já trouxe ("Complete on"), ou a pergunta agora. A linha vai para a Day
        // daquele dia (ou a Week, sem criar a Day) e a reputação recebe a hora real.
        const when = await this.completionWhenFor(event, taskPath, displayName);
        await this.recordCompletion(displayName, taskPath, when);
        // O hábito do Comando é o de hoje: a conclusão dita de outro dia não o marca.
        if (when.date === nowParts().date) await this.markDailyCommandCompletion(taskPath);

        const customProps = task.customProperties || {};
        // 📤 concluído fora do quadro (checkbox, nota, celular): a mesma oferta de
        // "📤 Registrar onde saiu" que o cartão faz. Concluído pelo quadro, ele já avisou.
        const pecaRaw = customProps.peca ?? task.peca ?? this.frontmatterOf(taskPath)?.peca;
        const peca = Array.isArray(pecaRaw) ? pecaRaw[0] : pecaRaw;
        const alreadyNoticed = takeCompletionNoticed(taskPath);
        if (releaseOffer(peca) && !alreadyNoticed) {
            const name = taskPath.split('/').pop()?.replace(/\.md$/, '') || displayName;
            (this.plugin as any).board?.completedNotice?.(name, peca);
        }
        // Auto-check for Meta completion
        await this.checkMetaCompletionForTask(taskPath);
    }

    /**
     * O que faz: a instância concluída de uma recorrente vira conclusão como as outras:
     * o "Quando terminou?" (o dia da instância responde quando é antes de hoje), a linha
     * na Day daquele dia ou na Week, e a reputação contextual. A recorrente não é
     * arquivada nem tem a data de conclusão regravada (o TaskNotes guarda as instâncias
     * em `complete_instances`). Não pontua: é registro, não premiação.
     */
    async handleRecurringInstanceCompleted(event: any): Promise<NeutralRecordTarget | null> {
        const taskPath = event?.taskPath || event?.path || event?.task?.path;
        const date = recurringInstanceDate(event);
        if (!taskPath || !date) return null;
        const displayName = event?.task?.title || String(taskPath).split('/').pop()?.replace(/\.md$/, '') || 'Tarefa';
        const when = await this.completionWhenFor({ ...event, task: { ...(event?.task ?? {}), completedDate: date }, after: undefined }, taskPath, displayName);
        return this.recordCompletion(displayName, taskPath, when, { keepCompletedDate: true });
    }

    /**
     * O registro neutro do cancelamento, sem criar nota (decisão 27 de 18/10/2026):
     * a Day de hoje, se existe; senão a Week da semana, se existe; senão só o
     * console. Quem decide o lugar é `neutralRecordTarget`; aqui só se executa.
     */
    async logNeutralCancel(displayName: string, taskPath: string): Promise<NeutralRecordTarget> {
        const now = (window as any).moment();
        const date = now.format('YYYY-MM-DD');
        const week = now.format('GGGG-[W]WW');
        const files: TFile[] = this.app?.vault?.getMarkdownFiles?.() ?? [];
        const day = files.find(f => f.name === `${date}.md`);
        const weekNote = files.find(f => f.name === `${week}.md` && !f.path.includes('305 - P&D'));
        const target = neutralRecordTarget({ day: Boolean(day), week: Boolean(weekNote) });
        if (target === 'day') {
            await this.plugin.logToDailyTimeline('task', displayName, taskPath, true, undefined, 'cancelada');
        } else if (target === 'week' && weekNote) {
            const content = await this.app.vault.read(weekNote);
            const next = withWeekLogLine(content, neutralWeekLine({ date, time: now.format('HH:mm'), title: displayName, taskPath }));
            if (next !== content) await this.app.vault.modify(weekNote, next);
        } else {
            console.log(`DFM: tarefa cancelada sem Day (${date}) nem Week (${week}); nenhuma nota foi criada: ${taskPath}`);
        }
        return target;
    }

    /**
     * A pergunta "Quando terminou?" (quem a desenha é a interface: `main.ts` a liga aqui).
     * Sem ela (testes, carregamento), a conclusão vale "Agora".
     */
    askWhen: ((taskName: string, taskPath?: string) => Promise<CompletionWhen | null>) | null = null;

    /**
     * O que faz: de quando é esta conclusão. Ordem: a resposta dada no quadro (que
     * concluiu pela API e já perguntou); concluída por programa (a ponte do DSH passa
     * um contexto de mutação com `source`): agora, sem pergunta; o dia que o TaskNotes
     * trouxe no "Complete on" (antes de hoje): esse dia, sem perguntar de novo; senão a
     * pergunta, e fechar sem escolher vale "Agora" (o já marcado).
     */
    async completionWhenFor(event: any, taskPath: string, displayName: string): Promise<CompletionWhen> {
        const now = nowParts();
        const agora: CompletionWhen = { choice: 'agora', date: now.date, time: now.time };
        const fromBoard = takeCompletionAnswer(taskPath);
        if (fromBoard) return fromBoard;
        if (event?.context?.source) return agora;
        const said = whenFromCompletedDate(event?.task?.completedDate ?? event?.after?.completedDate, now.stamp);
        if (said) return said;
        if (!this.askWhen) return agora;
        try {
            return (await this.askWhen(displayName, taskPath)) ?? agora;
        } catch (e) {
            console.error('DFM: a pergunta "Quando terminou?" falhou; vale agora', e);
            return agora;
        }
    }

    /**
     * O que faz: grava a conclusão no lugar do dia dito (arquitetura 4.6).
     * - Hoje: a linha no DFM Timeline da Day de hoje (criando a Day, como sempre).
     * - Outro dia: a Day daquele dia, se existe; senão o "### 📅 Log" da Week daquele dia,
     *   sem criar a Day; sem as duas, só o log interno. Sem hora dita, a linha diz "sem hora".
     * - A data de conclusão da tarefa passa a ser a dita.
     * - A reputação contextual recebe a hora real (`nowTree.recordCompletion`).
     * Quem decide o lugar é `completionLogTarget`; aqui só se executa.
     */
    async recordCompletion(displayName: string, taskPath: string, when: CompletionWhen, options: { keepCompletedDate?: boolean } = {}): Promise<NeutralRecordTarget> {
        const now = nowParts();
        const isToday = when.date === now.date;
        let target: NeutralRecordTarget = 'day';
        if (isToday && when.choice === 'agora') {
            await this.plugin.logToDailyTimeline('task', displayName, taskPath, true);
        } else {
            if (!isToday && !options.keepCompletedDate) await this.ensureCompletedDate(taskPath, when.date);
            const files: TFile[] = this.app?.vault?.getMarkdownFiles?.() ?? [];
            const day = files.some(f => f.name === `${when.date}.md`);
            const weekId = isoWeekOf(when.date);
            const weekNote = files.find(f => f.name === `${weekId}.md` && !f.path.includes('305 - P&D'));
            target = completionLogTarget({ today: isToday, day, week: Boolean(weekNote) });
            const moment = (globalThis as any).window?.moment;
            if (target === 'day' && moment) {
                const time = moment(`${when.date} ${when.time ?? '12:00'}`, 'YYYY-MM-DD HH:mm');
                await this.plugin.logToDailyTimeline('task', displayName, taskPath, true, time, undefined, { noCreate: !isToday, noHour: !when.time });
            } else if (target === 'week' && weekNote) {
                const content = await this.app.vault.read(weekNote);
                const next = withWeekLogLine(content, completionWeekLine({ date: when.date, time: when.time, title: displayName, taskPath }));
                if (next !== content) await this.app.vault.modify(weekNote, next);
            } else {
                console.log(`DFM: conclusão de ${when.date} sem Day nem Week (${weekId}); nenhuma nota foi criada: ${taskPath}`);
            }
        }
        await (this.plugin as any).nowTree?.recordCompletion?.({
            taskPath, date: when.date, time: when.time, now: when.choice === 'agora',
            // Onde foi e quanto levou, quando a segunda linha do "Quando terminou?" foi confirmada.
            ...(when.lugar ? { lugar: when.lugar, blocoMin: when.bloco_min ?? null } : {}),
        });
        return target;
    }

    /**
     * O que faz: a data de conclusão da tarefa passa a ser a dita. A tarefa pode ter ido
     * para `TaskNotes/Archive/` (concluir arquiva): procura pelo nome. Já certa, não grava.
     */
    async ensureCompletedDate(taskPath: string, date: string): Promise<boolean> {
        const vault = this.app?.vault;
        if (!vault?.getAbstractFileByPath) return false;
        const name = String(taskPath ?? '').split('/').pop()!.replace(/\.md$/, '');
        const direct = vault.getAbstractFileByPath(taskPath);
        const file = direct instanceof TFile ? direct
            : (vault.getMarkdownFiles?.() ?? []).find((f: TFile) => f.path.startsWith('TaskNotes/') && f.basename === name);
        if (!(file instanceof TFile)) return false;
        const current = String(this.app.metadataCache?.getFileCache(file)?.frontmatter?.completedDate ?? '').slice(0, 10);
        if (current === date) return false;
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, any>) => {
            fm.completedDate = date;
        });
        return true;
    }

    /** O `status` do frontmatter da tarefa, quando o evento não o traz. */
    private statusOf(taskPath: string): unknown {
        return this.frontmatterOf(taskPath)?.status;
    }

    private frontmatterOf(taskPath: string): Record<string, any> | undefined {
        const file = this.app?.vault?.getAbstractFileByPath?.(taskPath);
        if (!(file instanceof TFile)) return undefined;
        return this.app.metadataCache?.getFileCache(file)?.frontmatter;
    }

    /** O Pomodoro concluído marca o hábito do dia; os pontos que dava saíram em 29/10/2026. */
    async handlePomodoroCompletedEvent(_event: any) {
        await this.plugin.habitLog.recordDailyHabitEntry(
            '200 - FUNCTIONS/Habits/Tracker/08 - Concluir um Pomodoro.md'
        );
    }

    /** Marca o hábito somente quando a task concluída é a escolhida no Comando do Dia. */
    async markDailyCommandCompletion(taskPath: string): Promise<boolean> {
        if (!this.app.vault?.getAbstractFileByPath) return false;
        const today = (window as any).moment().format('YYYY-MM-DD');
        const dailyPath = `300 - RUNTIME/302 - Daymiss/Day/${today}.md`;
        const dailyNote = this.app.vault.getAbstractFileByPath(dailyPath);
        if (!(dailyNote instanceof TFile)) return false;

        const frontmatter = this.app.metadataCache?.getFileCache(dailyNote)?.frontmatter || {};
        if (frontmatter.command_task_path !== taskPath) return false;

        return this.plugin.habitLog.recordDailyHabitEntry(
            '200 - FUNCTIONS/Habits/Tracker/09 - Concluir o Comando do Dia.md'
        );
    }



    async processColdStorage(file: TFile, status: string) {
        let projectFolder = file.parent;
        if (!projectFolder) return;

        // Traverse upwards until we find the root project folder directly inside PROJECTS, DEPARTMENTS, or AREAS
        let current = projectFolder;
        // As colunas do kanban, da fonte única (`PROJECT_STAGES`): uma cópia aqui divergiria na coluna nova.
        const kanbanColumns = PROJECT_COLUMNS;
        while (current && current.parent) {
            const parentName = current.parent.name;
            if (parentName === '100 - PROJECTS' || 
                parentName === '200 - DEPARTMENTS' || 
                parentName === '100 - AREAS' ||
                kanbanColumns.includes(parentName)) {
                projectFolder = current;
                break;
            }
            if (current.parent.path === '/' || current.parent.path === '') {
                break;
            }
            current = current.parent;
        }
        
        if (!projectFolder.path.includes('100 - PROJECTS') && !projectFolder.path.includes('200 - DEPARTMENTS') && !projectFolder.path.includes('100 - AREAS')) return;

        // Skip if already in history
        if (projectFolder.path.includes('900 - HISTORICO') || projectFolder.path.includes('900 - ARCHIVE')) return;

        // Defesa em profundidade: o gatilho pode ter sido um canvas ou um 000 - INDEX, cujo
        // frontmatter não é o da nota central da pasta. Antes de mover, conferir a nota central.
        const centralNote = this.app.vault.getAbstractFileByPath(`${projectFolder.path}/${projectFolder.name}.md`);
        if (centralNote instanceof TFile) {
            const centralFrontmatter = this.app.metadataCache.getFileCache(centralNote)?.frontmatter;
            if (this.isPermanentFront(centralFrontmatter)) {
                console.warn(`DFM System: Cold Storage abortado para "${projectFolder.path}" — a nota central declara frente permanente.`);
                new Notice(`Cold Storage abortado: "${projectFolder.name}" é uma frente permanente e não foi arquivada.`, 10000);
                return;
            }
        }

        // O destino é apenas calculado para constar na sugestão. Não criar a pasta de
        // destino aqui: criar diretório é efeito colateral, e nada será movido agora.
        // É a coluna `5 - Done` da área (a coluna é a dona do estágio); a pasta que já
        // está lá não tem o que sugerir (areaIndex.coldStorageDestination).
        const newFolderPath = coldStorageDestination(projectFolder.path);
        if (!newFolderPath) return;

        if (this.app.vault.getAbstractFileByPath(newFolderPath)) {
            new Notice(`"${projectFolder.name}" já existe nos arquivados — confira antes de arquivar este.`, 8000);
            return;
        }

        // DECISÃO 19/07/2026: automação SUGERE rota, humano MUDA rota.
        // Mover a pasta faz o Obsidian reescrever os wikilinks do vault inteiro, e devolver
        // a pasta pelo disco não desfaz essa reescrita. Como o gatilho é um salvamento (que
        // o Obsidian Sync, os templates e os agentes também produzem) e não uma decisão, o
        // custo de um falso positivo supera de longe o ganho de um acerto. Em vez de mover,
        // registramos a sugestão numa fila de revisão.
        await this.queueArchiveSuggestion(projectFolder, file, status, newFolderPath);
    }

    /**
     * Registra a sugestão de arquivamento na fila de revisão, sem mover nada.
     * Idempotente: não duplica a mesma pasta na fila.
     */
    async queueArchiveSuggestion(projectFolder: TFolder, file: TFile, status: string, suggestedPath: string) {
        const inbox = definicoesDe(this.plugin).pastas.inbox;
        const queuePath = `${inbox}/Arquivamento sugerido.md`;

        // Data local — toISOString() devolve UTC e desloca o dia conforme o fuso.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const marker = `\`${projectFolder.path}\``;
        const entry = `- [ ] **${projectFolder.name}** — \`status: ${status}\` em "${file.basename}" · detectado em ${today}\n`
            + `    - origem: ${marker}\n`
            + `    - destino sugerido: \`${suggestedPath}\`\n`;

        try {
            await this.ensureFolderExists(inbox);
            const existing = this.app.vault.getAbstractFileByPath(queuePath);

            if (existing instanceof TFile) {
                const content = await this.app.vault.read(existing);
                if (content.includes(marker)) return; // já sugerido, não duplicar
                await this.app.vault.append(existing, entry);
            } else {
                const header = `# Arquivamento sugerido\n\n`
                    + `> Projetos cujo \`status\` indica encerramento. **Nada é movido automaticamente.**\n`
                    + `> Para arquivar, use o dashboard ou o \`activate_project.py\` — assim o Obsidian\n`
                    + `> reescreve os wikilinks de forma controlada e você sabe quando aconteceu.\n\n`;
                await this.app.vault.create(queuePath, header + entry);
            }

            new Notice(`Arquivamento sugerido para "${projectFolder.name}". Nada foi movido — veja a fila no INBOX.`, 8000);
        } catch (e) {
            console.error('DFM System: falha ao registrar sugestão de arquivamento', e);
        }
    }

    async ensureFolderExists(path: string) {
        if (!this.app.vault.getAbstractFileByPath(path)) {
            try {
                await this.app.vault.createFolder(path);
            } catch (e) {
                console.error(`DFM System: Error creating folder ${path}`, e);
            }
        }
    }

    linksTo(val: any, targetFile: TFile): boolean {
        if (!val) return false;
        if (Array.isArray(val)) {
            return val.some(v => this.linksTo(v, targetFile));
        }
        if (typeof val === 'object' && val.path) {
            return val.path === targetFile.path || val.path.endsWith('/' + targetFile.name);
        }
        if (typeof val === 'string') {
            return val.includes(targetFile.basename) || val.includes(targetFile.path);
        }
        return false;
    }

    async checkMetaCompletionForTask(taskPath: string) {
        const taskFile = this.app.vault.getAbstractFileByPath(taskPath);
        if (!(taskFile instanceof TFile)) return;

        const cache = this.app.metadataCache.getFileCache(taskFile);
        if (!cache || !cache.frontmatter) return;

        const fm = cache.frontmatter;
        const linkedMetaKeys = ['projects', 'tarefa_smart', 'projeto', 'meta_target'];
        const potentialLinks: any[] = [];
        for (const key of linkedMetaKeys) {
            if (fm[key]) {
                const val = fm[key];
                if (Array.isArray(val)) {
                    potentialLinks.push(...val);
                } else {
                    potentialLinks.push(val);
                }
            }
        }

        const resolvedMetas: TFile[] = [];
        for (const rawLink of potentialLinks) {
            if (!rawLink) continue;
            let linkpath = '';
            if (typeof rawLink === 'string') {
                linkpath = rawLink.replace(/[\[\]]/g, '').split('|')[0].trim();
            } else if (typeof rawLink === 'object' && rawLink.path) {
                linkpath = rawLink.path;
            }
            
            if (linkpath) {
                const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, taskPath);
                if (resolved && resolved instanceof TFile) {
                    const resolvedFMCache = this.app.metadataCache.getFileCache(resolved);
                    const resolvedType = resolvedFMCache?.frontmatter?.type;
                    // Nova arquitetura: Iniciativas temporárias e Departamentos permanentes
                    // Compatibilidade legada: tags meta-smart
                    const isIniciativa = resolvedType === 'iniciativa' || resolvedType === 'departamento';
                    const isLegacyMeta = (resolvedFMCache?.frontmatter?.tags || []).some((t: string) => t.includes("meta-smart"));
                    if (isIniciativa || isLegacyMeta) {
                        resolvedMetas.push(resolved);
                    }
                }
            }
        }

        if (resolvedMetas.length === 0) return;

        const dv = (this.app as any).plugins.plugins.dataview?.api;
        if (!dv) {
            console.warn("DFM MetadataWatcher: Dataview API não disponível para checagem de Iniciativas.");
            return;
        }

        for (const metaFile of resolvedMetas) {
            const metaCache = this.app.metadataCache.getFileCache(metaFile);
            if (!metaCache || !metaCache.frontmatter || metaCache.frontmatter.status !== 'active') {
                continue;
            }

            const allTasks = dv.pages('"TaskNotes/Tasks"');
            const linkedTasks = allTasks.filter((t: any) => {
                return this.linksTo(t.projects, metaFile) || 
                       this.linksTo(t.tarefa_smart, metaFile) || 
                       this.linksTo(t.projeto, metaFile) ||
                       this.linksTo(t.meta_target, metaFile);
            });

            if (linkedTasks.length === 0) continue;

            let allCompleted = true;
            for (const t of linkedTasks) {
                const tFile = this.app.vault.getAbstractFileByPath(t.file.path);
                if (tFile && tFile instanceof TFile) {
                    if (tFile.path === taskPath) continue;

                    const tCache = this.app.metadataCache.getFileCache(tFile);
                    const tStatus = String(tCache?.frontmatter?.status || '').toLowerCase();
                    const tArchived = tCache?.frontmatter?.archived;
                    
                    if (tArchived === true) continue;

                    if (tStatus !== 'done' && tStatus !== 'concluido' && tStatus !== 'concluído') {
                        allCompleted = false;
                        break;
                    }
                }
            }

            if (allCompleted) {
                // Os pontos por fechar a iniciativa ou a meta saíram em 29/10/2026.
                await this.app.fileManager.processFrontMatter(metaFile, (fmObj) => {
                    fmObj.status = 'done';
                });
            }
        }
    }
}
