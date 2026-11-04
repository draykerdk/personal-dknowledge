/**
 * As notas de período no cofre: a nota do trimestre, a nota de uma semana (e um campo dela) e a semana em
 * foco de um trimestre, lidas do cache de metadados do Obsidian.
 *
 * Por quê: estas leituras moravam no gerente do canvas do trimestre (`quarterCanvasManager.ts`), que se
 * aposentou em 02/11/2026 (aposentadoria, fase 2; Arquitetura §6, item 1). O painel (a seção Tempo) e o
 * cabeçalho do canvas de projeto seguem lendo-as; por isso mudaram de casa sem mudar o que fazem. Só lê: nada
 * aqui grava no cofre.
 *
 * Prova: tests/temporal/periodNotes.test.ts.
 */
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { chooseFocusWeek, quarterWeeks } from '../engine/calendario';
import type { FocusWeek, WeekNote } from '../engine/calendario';

/** As notas de P&D (rascunhos, planos) têm `type` de período às vezes e não contam como a nota do período. */
const FORA = '305 - P&D';

function today(): string {
    return (window as any).moment?.().format('YYYY-MM-DD') ?? new Date().toISOString().slice(0, 10);
}

export class PeriodNotes {
    constructor(private readonly app: App, private readonly hoje: () => string = today) {}

    private fm(file: TFile): Record<string, any> {
        return this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    }

    /** O que faz: a nota do trimestre (`type: quarterly_note`, `quarter` ou o nome), fora de P&D; sem ela, `null`. */
    quarterNote(quarter: string): TFile | null {
        return this.app.vault.getMarkdownFiles().find(f => {
            const fm = this.fm(f);
            return fm.type === 'quarterly_note' && String(fm.quarter ?? f.basename) === quarter && !f.path.includes(FORA);
        }) ?? null;
    }

    /** O que faz: o caminho da nota de uma semana (`type: weekly_note`); duas para a mesma semana: a de menor caminho. */
    weekNotePath(week: string): string | null {
        let found: string | null = null;
        for (const f of this.app.vault.getMarkdownFiles()) {
            if (f.path.includes(FORA)) continue;
            const fm = this.fm(f);
            if (fm.type === 'weekly_note' && String(fm.week || f.basename).trim() === week && (!found || f.path < found)) found = f.path;
        }
        return found;
    }

    /** O que faz: um campo do frontmatter da nota da semana (cru); sem nota ou sem o campo, `undefined`. */
    weekNoteField(week: string, key: string): unknown {
        const path = this.weekNotePath(week);
        const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
        return file instanceof TFile ? this.fm(file)[key] : undefined;
    }

    /** O que faz: as notas de semana das semanas do trimestre, com o estado e o `quarter` que cada uma diz. */
    weekNotes(quarter: string): WeekNote[] {
        const weeks = new Set(quarterWeeks(quarter));
        return this.app.vault.getMarkdownFiles()
            .filter(f => !f.path.includes(FORA))
            .map(f => ({ f, fm: this.fm(f) }))
            .filter(({ fm }) => fm.type === 'weekly_note' && weeks.has(String(fm.week)))
            .map(({ f, fm }) => ({ week: String(fm.week), path: f.path, status: String(fm.status ?? ''), quarter: String(fm.quarter ?? '') }));
    }

    /** O que faz: a semana em foco do trimestre, com o rótulo do caso (`chooseFocusWeek`). */
    focus(quarter: string): FocusWeek {
        return chooseFocusWeek(quarter, this.hoje(), this.weekNotes(quarter));
    }

    /** O que faz: só a semana em foco do trimestre. */
    focusWeek(quarter: string): string {
        return this.focus(quarter).week;
    }
}
