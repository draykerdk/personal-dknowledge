/**
 * Liga o reparo das notas de período (`periodNoteRepair.ts`) ao vault: a nota de
 * semana ou de trimestre que nasce como cópia crua do modelo (o mini calendário e o
 * Periodic Notes só copiam) é regravada uma vez com o modelo renderizado, e o comando
 * "Preencher os marcadores crus desta nota" serve a nota que já tem conteúdo (a W43).
 *
 * Os efeitos vivem só aqui: a escuta do `create` (depois do layout pronto: na abertura
 * do vault o Obsidian emite `create` para cada arquivo), a leitura com espera (quem
 * cria pode escrever o conteúdo logo depois), a gravação por `vault.process` (que
 * relê e decide de novo no mesmo passo) e o aviso. Só API do vault: vale no celular.
 *
 * A Day recém-criada por outro (Periodic Notes, Calendar, o 🔮 Criar nota de amanhã)
 * ganha só o `quarter` pela regra da quinta-feira (27/10/2026), uma vez, ao nascer:
 * nenhuma outra linha muda, e a Day que já tem algo além do modelo fica como está.
 *
 * Conferir no app: `app.plugins.plugins['dfm-system'].periodNotes.preview('2026-W45')`
 * devolve o modelo da semana renderizado, sem gravar nada; `previewDay('2026-10-28')`,
 * o modelo da Day como o Periodic Notes o resolve, com o `quarter` da semana.
 */
import { Notice, TFile, type App, type Plugin, type TAbstractFile } from 'obsidian';
import {
    DAY_MODEL_PATH,
    DAY_NOTE_DIR,
    dayNoteAt,
    dayQuarterNoticeText,
    dayQuarterPlan,
    renderDayNote,
    type DayNote,
    type DayQuarterPlan,
    fillNoticeText,
    fillRawMarkers,
    modelPathOf,
    periodNoteAt,
    QUARTER_NOTE_DIR,
    WEEK_NOTE_DIR,
    periodRenderContext,
    renderPeriodNote,
    repairNoticeText,
    repairPlan,
    type FillResult,
    type PeriodNote,
    type PeriodRenderContext,
    type RepairPlan,
} from './periodNoteRepair';

/** Esperas antes de cada leitura (ms): a nota criada vazia ganha o texto logo depois. */
export const READ_DELAYS_MS: readonly number[] = [250, 1000, 3000];

export const FILL_COMMAND_ID = 'dfm-preencher-marcadores-crus';
export const FILL_COMMAND_NAME = 'Preencher os marcadores crus desta nota';

export class PeriodNoteRepairWatcher {
    private readonly app: App;
    private readonly pending = new Set<string>();
    /** A escuta do `create` está ligada (depois do layout pronto). */
    listening = false;
    /** O último reparo decidido (para conferir no app). */
    last: { path: string; plan: RepairPlan['action']; reason?: string } | null = null;
    /** A última decisão sobre o `quarter` de uma Day criada (para conferir no app). */
    lastDay: { path: string; plan: DayQuarterPlan['action']; from?: string; to?: string; reason?: string } | null = null;
    /** A pasta da Day que a escuta cobre (só o `quarter`). */
    readonly dayFolder = DAY_NOTE_DIR;

    constructor(private readonly plugin: Plugin) {
        this.app = plugin.app;
    }

    /** Liga a escuta do `create` e o comando. */
    register(): void {
        this.app.workspace.onLayoutReady(() => {
            this.plugin.registerEvent(this.app.vault.on('create', file => { void this.onCreate(file); }));
            this.listening = true;
        });
        this.plugin.addCommand({
            id: FILL_COMMAND_ID,
            name: FILL_COMMAND_NAME,
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                const note = file ? periodNoteAt(file.path) : null;
                if (!file || !note) return false;
                if (!checking) void this.fillActive(file, note);
                return true;
            },
        });
    }

    /** O contexto de renderização de hoje para a nota. */
    private contextFor(note: PeriodNote): PeriodRenderContext | null {
        const moment = (window as any).moment;
        return periodRenderContext(note, moment().format('YYYY-MM-DD'), moment, () => moment());
    }

    /** O texto atual do modelo da nota, ou `null` se ele não existe. */
    private async modelOf(note: PeriodNote): Promise<string | null> {
        const path = modelPathOf(note);
        const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
        return file instanceof TFile ? this.app.vault.read(file) : null;
    }

    /** O texto do arquivo depois das esperas (a nota criada vazia ganha o texto logo depois). */
    private async readAfterCreate(path: string): Promise<{ file: TFile; text: string } | null> {
        let current: TFile | null = null;
        let text = '';
        for (const delay of READ_DELAYS_MS) {
            await new Promise(resolve => window.setTimeout(resolve, delay));
            const found = this.app.vault.getAbstractFileByPath(path);
            if (!(found instanceof TFile)) return null;
            current = found;
            text = await this.app.vault.read(found);
            if (text.trim() !== '') break;
        }
        return current && text.trim() !== '' ? { file: current, text } : null;
    }

    /** O texto atual do modelo da Day, ou `null`. */
    private async dayModel(): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(DAY_MODEL_PATH);
        return file instanceof TFile ? this.app.vault.read(file) : null;
    }

    /**
     * A Day recém-criada: se nasceu do modelo e o `quarter` difere do da semana, troca só
     * essa linha, uma vez. Nota que já tinha algo além do modelo: nada.
     */
    async onCreateDay(file: TFile, day: DayNote): Promise<void> {
        if (this.pending.has(file.path)) return;
        this.pending.add(file.path);
        try {
            const read = await this.readAfterCreate(file.path);
            if (!read) return;
            const model = await this.dayModel();
            if (model === null) return;
            const plan = dayQuarterPlan(read.text, model, day.date);
            this.lastDay = plan.action === 'corrigir'
                ? { path: day.path, plan: plan.action, from: plan.from, to: plan.to }
                : { path: day.path, plan: plan.action, reason: plan.reason };
            if (plan.action !== 'corrigir') return;
            let wrote: string | null = null;
            await this.app.vault.process(read.file, latest => {
                // Decide de novo sobre o texto do momento da gravação: se algo já foi
                // escrito na Day, ela fica como está.
                const again = dayQuarterPlan(latest, model, day.date);
                if (again.action !== 'corrigir') return latest;
                wrote = again.to;
                return again.text;
            });
            if (wrote) new Notice(dayQuarterNoticeText(day.date, wrote));
        } catch (error) {
            console.error(`DFM: a correção do trimestre de ${file.path} falhou:`, error);
        } finally {
            this.pending.delete(file.path);
        }
    }

    /** A nota recém-criada: lê com espera e, se for a cópia crua do modelo, regrava uma vez. */
    async onCreate(file: TAbstractFile): Promise<void> {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        const day = dayNoteAt(file.path);
        if (day) return this.onCreateDay(file, day);
        const note = periodNoteAt(file.path);
        if (!note || this.pending.has(file.path)) return;
        this.pending.add(file.path);
        try {
            const read = await this.readAfterCreate(file.path);
            if (!read) return;
            const { file: current, text } = read;
            const model = await this.modelOf(note);
            const context = this.contextFor(note);
            if (model === null || !context) return;
            const plan = repairPlan(text, model, note, context);
            this.last = { path: note.path, plan: plan.action, reason: plan.action === 'manter' ? plan.reason : undefined };
            if (plan.action !== 'preencher') return;
            let wrote = false;
            await this.app.vault.process(current, latest => {
                // Decide de novo sobre o texto do momento da gravação: se o operador já
                // escreveu algo, a nota fica como está.
                const again = repairPlan(latest, model, note, context);
                if (again.action !== 'preencher') return latest;
                wrote = true;
                return again.text;
            });
            if (wrote) new Notice(repairNoticeText(note));
        } catch (error) {
            console.error(`DFM: o preenchimento de ${file.path} pelo modelo falhou:`, error);
        } finally {
            this.pending.delete(file.path);
        }
    }

    /** O comando: troca os marcadores crus da nota ativa e preenche os campos vazios. */
    async fillActive(file: TFile, note: PeriodNote): Promise<FillResult | null> {
        const context = this.contextFor(note);
        if (!context) return null;
        const done: { result: FillResult | null } = { result: null };
        try {
            await this.app.vault.process(file, text => {
                const result = fillRawMarkers(text, note, context);
                done.result = result;
                return result.markers > 0 || result.fields.length > 0 ? result.text : text;
            });
        } catch (error) {
            console.error(`DFM: preencher os marcadores de ${file.path} falhou:`, error);
            new Notice(`⚠️ Não deu para preencher ${note.id}: veja o console.`, 6000);
            return null;
        }
        if (done.result) new Notice(fillNoticeText(note, done.result));
        return done.result;
    }

    /** O modelo renderizado para um período (`2026-W45`, `2026-Q4`), sem gravar nada. */
    async preview(id: string): Promise<string | null> {
        const note = periodNoteAt(`${/-Q/.test(id) ? QUARTER_NOTE_DIR : WEEK_NOTE_DIR}/${id}.md`);
        if (!note) return null;
        const model = await this.modelOf(note);
        const context = this.contextFor(note);
        return model === null || !context ? null : renderPeriodNote(model, note, context);
    }

    /**
     * O modelo da Day para uma data (`2026-10-28`), resolvido como o Periodic Notes o
     * resolve (`{{date:…}}`), com o `quarter` da semana, sem gravar nada.
     */
    async previewDay(date: string): Promise<string | null> {
        const moment = (window as any).moment;
        const day = moment(String(date ?? ''), 'YYYY-MM-DD', true);
        if (!day?.isValid?.()) return null;
        const model = await this.dayModel();
        return model === null ? null : renderDayNote(model, day, 'YYYY-MM-DD', moment());
    }
}
