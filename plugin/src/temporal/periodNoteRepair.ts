/**
 * A nota de semana ou de trimestre criada crua pelo Calendar ou pelo Periodic Notes,
 * preenchida como se o DFM a tivesse criado (decisão de 27/10/2026, "vamos de B").
 *
 * O problema: o mini calendário e o Periodic Notes só copiam o modelo. Os marcadores
 * do DFM (`{{targetweek:GGGG-[W]WW}}`, `{{targetquarter:YYYY-[Q]Q}}`) ficam crus e
 * `week:`/`quarter:` ficam vazios; o 🌳, ao achar a nota já existente, só funde o
 * frontmatter, e o corpo cru ficava cru para sempre (a W44 de 27/10, a W43, a W39).
 *
 * Aqui só há decisão e texto, sem Obsidian:
 * - `periodNoteAt`: o caminho é de uma nota de período (`Week/AAAA-Www.md`,
 *   `Quarterly/AAAA-Qn.md`) e qual período ela é, pelo nome;
 * - `repairPlan`: a nota é a cópia intocada do modelo (tolerando só espaço no fim
 *   da linha e a quebra de linha)? Então o texto renderizado; senão, nada;
 * - `fillRawMarkers`: para a nota que já tem conteúdo do operador, troca só os
 *   marcadores de data crus e preenche `week`/`quarter` vazios; nenhuma outra linha.
 * O renderizador é o do protocolo (`engine/templateTokens.ts`), com o relógio da nota
 * de período: o mesmo que o protocolo monta quando a nota está aberta.
 *
 * A Day fica de fora do preenchimento: o modelo dela só usa `{{date:…}}`, que o
 * Periodic Notes resolve sozinho (e o `createDailyNote` do plugin replica). Dela, só o
 * `quarter` é corrigido, pela regra da quinta-feira (no fim deste arquivo).
 */
import { QUARTER_TEMPLATE_PATH, quarterYear } from '../engine/cycleTemplate';
import { contextDayOf, periodOf } from '../engine/contextDate';
import {
    planWeekStart,
    renderTemplateTokens,
    resolveDateTokens,
    targetWeekStart,
    weekStartFromValue,
    type DateFactory,
    type DateValue,
    type TokenClock,
} from '../engine/templateTokens';
import { isoWeekOf, quarterOfWeek } from '../engine/calendario';
import { DIA, diaDoArquivo } from '../engine/dia';
import { SEMANA, TRIMESTRE, ehTrimestre } from '../engine/periodo';

export type PeriodKind = 'week' | 'quarter';

/** Uma nota de período: o tipo, o período (`2026-W44`, `2026-Q4`) e o caminho. */
export interface PeriodNote {
    kind: PeriodKind;
    id: string;
    path: string;
}

/** Onde mora cada nota de período e de que modelo ela nasce. */
export interface PeriodSpec {
    kind: PeriodKind;
    folder: string;
    pattern: RegExp;
    modelPath: string;
}

export const WEEK_NOTE_DIR = '300 - RUNTIME/302 - Daymiss/Week';
export const QUARTER_NOTE_DIR = '300 - RUNTIME/302 - Daymiss/Quarterly';
export const WEEK_MODEL_PATH = '200 - FUNCTIONS/Models/Week modelo.md';

/** As notas cobertas: a semana e o trimestre (a Day não deixa marcador cru). */
export const PERIOD_SPECS: readonly PeriodSpec[] = [
    { kind: 'week', folder: WEEK_NOTE_DIR, pattern: SEMANA, modelPath: WEEK_MODEL_PATH },
    { kind: 'quarter', folder: QUARTER_NOTE_DIR, pattern: TRIMESTRE, modelPath: QUARTER_TEMPLATE_PATH },
];

/** As variáveis e o relógio de uma renderização da nota de período. */
export interface PeriodRenderContext {
    variables: Record<string, string>;
    clock: TokenClock;
}

/** O que o reparo faz com uma nota criada agora. */
export type RepairPlan =
    | { action: 'preencher'; text: string }
    | { action: 'manter'; reason: string };

/** O que o "Preencher os marcadores crus" mudou. */
export interface FillResult {
    text: string;
    markers: number;
    fields: string[];
}

/** Os marcadores de data que o renderizador conhece (para contar o que foi trocado). */
const KNOWN_TOKEN = /{{(?:date|tomorrow|yesterday|hoje|amanha|planweek|targetweek|targetquarter):.*?}}|{{weekday:[a-zA-Z0-9_]*:[1-7]:.*?}}/g;

/**
 * O que faz: a nota de período de um caminho (filha direta da pasta, nome do período,
 * `.md`), ou `null`.
 * Por quê: só a nota de semana e de trimestre nasce crua do Calendar e do Periodic Notes.
 * Erro e ataque: semana que não existe no ano (`2025-W53`), subpasta (`Week/Canvases/`),
 * outra extensão e nome com sufixo ficam de fora.
 */
export function periodNoteAt(path: string | null | undefined, specs: readonly PeriodSpec[] = PERIOD_SPECS): PeriodNote | null {
    const match = String(path ?? '').match(/^(.*)\/([^/]+)\.md$/);
    if (!match) return null;
    const [, folder, basename] = match;
    const spec = specs.find(candidate => candidate.folder === folder && candidate.pattern.test(basename));
    if (!spec) return null;
    if (spec.kind === 'week') {
        const period = periodOf({ kind: 'week', id: basename });
        if (!period || isoWeekOf(period.start) !== basename) return null;
    }
    return { kind: spec.kind, id: basename, path: String(path) };
}

/** O caminho do modelo de que a nota nasce. */
export function modelPathOf(note: PeriodNote, specs: readonly PeriodSpec[] = PERIOD_SPECS): string | null {
    return specs.find(spec => spec.kind === note.kind)?.modelPath ?? null;
}

/**
 * O que faz: as variáveis e o relógio que o protocolo monta com a nota aberta: a data
 * de contexto é hoje, se hoje cai no período, ou o primeiro dia dele (`contextDayOf`);
 * a semana-alvo é a da nota (`targetWeekStart` com `_active_basename`); o trimestre-alvo
 * é o da data de contexto.
 * Por quê: "como se o DFM a tivesse criado" é renderizar com o mesmo relógio.
 * Entra → sai: a nota, hoje (`AAAA-MM-DD`), o moment e o relógio de verdade → o contexto,
 * ou `null` se o período não se lê.
 */
export function periodRenderContext(note: PeriodNote, today: string, parse: DateFactory, now: () => DateValue): PeriodRenderContext | null {
    const day = contextDayOf({ kind: note.kind, id: note.id }, today);
    if (!day) return null;
    const context = parse(day, 'YYYY-MM-DD', true);
    if (!context?.isValid?.()) return null;
    const folder = note.path.includes('/') ? note.path.slice(0, note.path.lastIndexOf('/')) : '';
    const variables: Record<string, string> = { _active_folder: folder, _active_basename: note.id, _active_path: note.path };
    const planWeek = () => planWeekStart(context);
    const targetWeek = () => targetWeekStart(variables, () => context, planWeek, parse);
    // Como no `run()` do protocolo: a semana-alvo da rodada como variável.
    variables._target_week = targetWeek().format('GGGG-[W]WW');
    const clock: TokenClock = {
        context,
        planWeek,
        targetWeek,
        targetQuarter: () => context.clone(),
        now,
        weekStartOf: key => weekStartFromValue(key ? variables[key] : '', parse, planWeek),
    };
    return { variables, clock };
}

/**
 * O que faz: os campos que o protocolo grava pelo período: na semana, `week` e
 * `quarter` (o da quinta-feira, `quarterOfWeek`); no trimestre, `quarter` e `year`.
 * Por quê: o 🌳 grava `week` e `quarter` (`{{weekday:_target_week:4:YYYY-[Q]Q}}`), e o
 * planejamento trimestral, `quarter` e `year`.
 */
export function periodFields(note: PeriodNote): Record<string, string> {
    if (note.kind === 'week') return { week: note.id, quarter: quarterOfWeek(note.id) ?? '' };
    return { quarter: note.id, year: quarterYear(note.id) };
}

/** O texto para comparar: sem BOM, `\n` como quebra, sem espaço no fim da linha nem linhas vazias no fim. */
export function comparableText(text: string): string {
    return String(text ?? '')
        .replace(/^﻿/, '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n+$/, '');
}

/**
 * O que faz: preenche, no frontmatter, cada campo de `fields` que está vazio (`campo:`,
 * `campo: ""` ou `campo: ''`), como `campo: "valor"`. Nenhuma outra linha muda; campo
 * ausente não é criado; campo com valor, ou com lista nas linhas seguintes, fica.
 * Por quê: "preencher `week`/`quarter` só se vazio", sem regravar o YAML inteiro.
 */
export function fillEmptyFields(text: string, fields: Record<string, string>): { text: string; filled: string[] } {
    const lines = String(text ?? '').split('\n');
    const filled: string[] = [];
    if (lines.length < 2 || lines[0].replace(/^﻿/, '').trim() !== '---') return { text: String(text ?? ''), filled };
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (close < 0) return { text: String(text ?? ''), filled };
    for (let index = 1; index < close; index++) {
        const match = lines[index].match(/^([A-Za-z0-9_-]+):[ \t]*(?:""|'')?[ \t]*(\r?)$/);
        if (!match) continue;
        const [, key, cr] = match;
        const value = fields[key];
        if (!value || filled.includes(key)) continue;
        if (/^\s+-/.test(lines[index + 1] ?? '')) continue;
        lines[index] = `${key}: "${value}"${cr}`;
        filled.push(key);
    }
    return { text: lines.join('\n'), filled };
}

/**
 * O que faz: o modelo renderizado para o período: o renderizador do protocolo
 * (`renderTemplateTokens`) e os campos do período preenchidos.
 * Prova: tests/temporal/periodNoteRepair.test.ts.
 */
export function renderPeriodNote(model: string, note: PeriodNote, context: PeriodRenderContext): string {
    const rendered = renderTemplateTokens(model, context.variables, context.clock);
    return fillEmptyFields(rendered, periodFields(note)).text;
}

/**
 * O que faz: decide o reparo da nota recém-criada: só a cópia intocada do modelo
 * (igual ao texto atual dele, tolerando espaço no fim da linha e a quebra de linha)
 * vira o modelo renderizado. Qualquer linha a mais ou diferente: nada.
 * Por quê: nunca tocar uma nota que tem algo além da cópia crua.
 * Entra → sai: o texto da nota, o do modelo, a nota e o contexto → o plano.
 * Erro e ataque: modelo vazio ou sem marcador a preencher → nada (o texto renderizado
 * não é cópia crua, então reparar duas vezes não muda nada).
 * Prova: tests/temporal/periodNoteRepair.test.ts.
 */
export function repairPlan(noteText: string, modelText: string, note: PeriodNote, context: PeriodRenderContext): RepairPlan {
    if (!String(modelText ?? '').trim()) return { action: 'manter', reason: 'o modelo está vazio' };
    if (comparableText(noteText) !== comparableText(modelText)) return { action: 'manter', reason: 'a nota não é a cópia crua do modelo' };
    const text = renderPeriodNote(modelText, note, context);
    if (comparableText(text) === comparableText(noteText)) return { action: 'manter', reason: 'o modelo não tem marcador a preencher' };
    return { action: 'preencher', text };
}

/**
 * O que faz: na nota que já tem conteúdo do operador, troca só os marcadores de data
 * crus que o renderizador conhece (`resolveDateTokens`), fora dos blocos de código, e
 * preenche `week`/`quarter` (ou `quarter`/`year`) vazios. Nenhuma outra linha muda.
 * Por quê: a W43 nasceu crua e já tem o que ele escreveu (27/10/2026).
 * Entra → sai: o texto, a nota e o contexto → o texto novo, quantos marcadores e quais
 * campos foram preenchidos.
 * Erro e ataque: `{{nome}}` de protocolo e `[[ ]]` ficam como estão (são do texto
 * dele); código em bloco (```dataviewjs) não é tocado.
 * Prova: tests/temporal/periodNoteRepair.test.ts.
 */
export function fillRawMarkers(noteText: string, note: PeriodNote, context: PeriodRenderContext): FillResult {
    const lines = String(noteText ?? '').split('\n');
    let markers = 0;
    let inFence = false;
    const out = lines.map(line => {
        if (/^\s*(?:>\s*)*(```|~~~)/.test(line)) {
            inFence = !inFence;
            return line;
        }
        if (inFence || !line.includes('{{')) return line;
        const before = (line.match(KNOWN_TOKEN) || []).length;
        if (before === 0) return line;
        const resolved = resolveDateTokens(line, context.clock);
        markers += before - (resolved.match(KNOWN_TOKEN) || []).length;
        return resolved;
    });
    const { text, filled } = fillEmptyFields(out.join('\n'), periodFields(note));
    return { text, markers, fields: filled };
}

/* ------------------------------------------------------------------ a Day */

/**
 * O trimestre da Day pela regra da quinta-feira (padrão de uso, 27/10/2026: "a semana
 * pertence ao trimestre da quinta-feira dela, em todo lugar").
 *
 * O problema: o modelo da Day grava `quarter: {{date:YYYY-[Q]Q}}`, o trimestre do
 * calendário, que o Periodic Notes resolve sozinho (ele só conhece `{{date}}` e
 * `{{time}}`). A 2026-09-28 é da W40, que é do Q4, mas a Day dizia Q3. O conserto mora
 * no plugin, não no marcador: o `createDailyNote` grava o trimestre da semana, e a escuta
 * das notas criadas corrige só o `quarter` da Day que outro criou (Periodic Notes,
 * Calendar, o 🔮 Criar nota de amanhã), uma vez, ao nascer.
 */
export const DAY_NOTE_DIR = '300 - RUNTIME/302 - Daymiss/Day';
export const DAY_MODEL_PATH = '200 - FUNCTIONS/Models/Day modelo.md';

/** Uma Day: a data (`AAAA-MM-DD`) e o caminho. */
export interface DayNote {
    date: string;
    path: string;
}

/** A correção do `quarter` de uma Day. */
export interface DayQuarterFix {
    text: string;
    changed: boolean;
    /** O valor que estava (vazio, se estava vazio). */
    from: string;
    /** O trimestre da semana da data. */
    to: string;
}

/** O que a escuta faz com a Day criada agora. */
export type DayQuarterPlan =
    | { action: 'corrigir'; text: string; from: string; to: string }
    | { action: 'manter'; reason: string };

/**
 * O que faz: a Day de um caminho (filha direta da pasta da Day, nome `AAAA-MM-DD` de uma
 * data que existe, `.md`), ou `null`.
 * Erro e ataque: subpasta, nome com sufixo (`2026-10-27 - Nota`), data impossível
 * (`2026-02-30`) e outra extensão ficam de fora.
 */
export function dayNoteAt(path: string | null | undefined): DayNote | null {
    const texto = String(path ?? '');
    const barra = texto.lastIndexOf('/');
    const date = barra < 0 ? '' : diaDoArquivo(texto.slice(barra + 1));
    if (!date || texto.slice(0, barra) !== DAY_NOTE_DIR) return null;
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
    return { date, path: String(path) };
}

/**
 * O que faz: o trimestre de uma data pela regra da quinta-feira: o da semana ISO dela
 * (`quarterOfWeek(isoWeekOf(data))`). 2026-09-28 (W40) → 2026-Q4; 2026-12-31 (W53) →
 * 2026-Q4; 2027-01-01 (sexta da 2026-W53) → 2026-Q4. Data ilegível → `null`.
 */
export function dayQuarterOf(date: string): string | null {
    if (!DIA.test(String(date ?? ''))) return null;
    return quarterOfWeek(isoWeekOf(date));
}

/** O frontmatter do texto: o índice da linha que fecha, ou -1. */
function frontmatterClose(lines: string[]): number {
    if (lines.length < 2 || lines[0].replace(/^﻿/, '').trim() !== '---') return -1;
    return lines.findIndex((line, index) => index > 0 && line.trim() === '---');
}

/**
 * O que faz: troca só o valor de `quarter:` no frontmatter pelo trimestre da semana da
 * data, quando ele difere. O valor que estava vazio (`quarter:`, `quarter: ""`) ou era
 * um trimestre (`2026-Q3`, com ou sem aspas) muda; as aspas que havia ficam. Nenhuma
 * outra linha muda; campo ausente não é criado; valor que não é trimestre (texto dele,
 * lista) fica como está.
 * Entra → sai: o texto e a data → o texto e o que mudou.
 * Prova: tests/temporal/periodNoteRepair.test.ts ("o trimestre da Day").
 */
export function fixDayQuarter(text: string, date: string): DayQuarterFix {
    const original = String(text ?? '');
    const to = dayQuarterOf(date) ?? '';
    const same = (from = ''): DayQuarterFix => ({ text: original, changed: false, from, to });
    if (!to) return same();
    const lines = original.split('\n');
    const close = frontmatterClose(lines);
    if (close < 0) return same();
    for (let index = 1; index < close; index++) {
        const match = lines[index].match(/^quarter:([ \t]*)(["']?)([^"'\r]*?)\2([ \t]*)(\r?)$/);
        if (!match) continue;
        const [, space, quote, value, tail, cr] = match;
        const from = value.trim();
        if (from === to) return same(from);
        if (from !== '' && !ehTrimestre(from)) return same(from);
        if (from === '' && /^\s+-/.test(lines[index + 1] ?? '')) return same(from);
        lines[index] = `quarter:${space || ' '}${quote}${to}${quote}${tail}${cr}`;
        return { text: lines.join('\n'), changed: true, from, to };
    }
    return same();
}

/** O corpo (depois do frontmatter), para comparar com o do modelo. */
function bodyOf(text: string): string {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const close = frontmatterClose(lines);
    return comparableText((close < 0 ? lines : lines.slice(close + 1)).join('\n')).trim();
}

/**
 * O que faz: decide a correção do `quarter` da Day recém-criada. Só a Day que acabou de
 * nascer do modelo (o corpo, depois do frontmatter, igual ao do modelo atual, tolerando
 * espaço no fim da linha e as linhas vazias das pontas) tem o `quarter` corrigido; a Day
 * com qualquer coisa a mais (texto dele, um registro) fica como está.
 * Por quê: "nunca nas notas que já existem, nunca nas edições" (27/10/2026). O `create`
 * também chega para a Day que o Sync ou um checkout trazem: com o corpo diferente do
 * modelo de hoje, ela não é uma Day que nasceu agora.
 * Entra → sai: o texto da Day, o do modelo e a data → o plano.
 * Prova: tests/temporal/periodNoteRepair.test.ts ("o trimestre da Day").
 */
export function dayQuarterPlan(noteText: string, modelText: string, date: string): DayQuarterPlan {
    if (!String(modelText ?? '').trim()) return { action: 'manter', reason: 'o modelo está vazio' };
    if (bodyOf(noteText) !== bodyOf(modelText)) return { action: 'manter', reason: 'a Day não é a que nasceu do modelo' };
    const fix = fixDayQuarter(noteText, date);
    if (!fix.to) return { action: 'manter', reason: 'a data não se lê' };
    if (!fix.changed) return { action: 'manter', reason: fix.from === fix.to ? 'o trimestre já é o da semana' : 'sem quarter a corrigir' };
    return { action: 'corrigir', text: fix.text, from: fix.from, to: fix.to };
}

/** O aviso da correção: "Day 2026-09-28: trimestre 2026-Q4 (o da quinta-feira da semana)". */
export function dayQuarterNoticeText(date: string, to: string): string {
    return `Day ${date}: trimestre ${to} (o da quinta-feira da semana)`;
}

/**
 * O que faz: o modelo da Day com os marcadores que o Periodic Notes resolve: `{{date}}`
 * e `{{time}}` (com deslocamento, `{{date+1d:FMT}}`, e formato), `{{title}}` e os dias
 * da semana (`{{monday:FMT}}`), e depois o `quarter` pela regra da quinta-feira.
 * Por quê: o `createDailyNote` do plugin replica o Periodic Notes; a regra dele, aqui,
 * pode ser conferida sem criar nota (`periodNotes.previewDay('2026-10-28')`).
 * Entra → sai: o modelo, o dia (moment), o formato do nome e o agora (moment) → o texto.
 * Prova: tests/temporal/periodNoteRepair.test.ts ("o trimestre da Day").
 */
export function renderDayNote(rawContent: string, day: any, format: string, now: any): string {
    const filename = day.format(format);
    const content = String(rawContent ?? '')
        .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_: string, _timeOrDate: string, calc: string, timeDelta: string, unit: string, momentFormat: string) => {
            const currentDate = day.clone().set({
                hour: now.get('hour'),
                minute: now.get('minute'),
                second: now.get('second'),
            });
            if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
            if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
            return currentDate.format(format);
        })
        .replace(/{{\s*title\s*}}/gi, filename)
        .replace(/{{\s*time\s*}}/gi, now.format('HH:mm'))
        .replace(/{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi, (_: string, dayOfWeek: string, momentFormat: string) => {
            const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
            const dayNum = days[dayOfWeek.toLowerCase() as keyof typeof days] ?? 0;
            return day.clone().weekday(dayNum).format(momentFormat.trim());
        });
    return fixDayQuarter(content, day.format('YYYY-MM-DD')).text;
}

/** O nome do período no aviso: "Semana 2026-W44", "Trimestre 2026-Q4". */
export function periodLabelOf(note: PeriodNote): string {
    return `${note.kind === 'week' ? 'Semana' : 'Trimestre'} ${note.id}`;
}

/** O aviso do reparo: "Semana 2026-W44 preenchida pelo modelo". */
export function repairNoticeText(note: PeriodNote): string {
    return `${periodLabelOf(note)} ${note.kind === 'week' ? 'preenchida' : 'preenchido'} pelo modelo`;
}

/** O aviso do "Preencher os marcadores crus desta nota". */
export function fillNoticeText(note: PeriodNote, result: FillResult): string {
    if (result.markers === 0 && result.fields.length === 0) return `${periodLabelOf(note)}: nenhum marcador cru para preencher.`;
    const parts: string[] = [];
    if (result.markers > 0) parts.push(`${result.markers} ${result.markers === 1 ? 'marcador preenchido' : 'marcadores preenchidos'}`);
    if (result.fields.length > 0) parts.push(`${result.fields.join(' e ')} ${result.fields.length === 1 ? 'preenchido' : 'preenchidos'}`);
    return `${periodLabelOf(note)}: ${parts.join('; ')}.`;
}
