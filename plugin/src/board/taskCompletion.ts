/**
 * Por onde passa o fim de uma tarefa (concluir ou cancelar).
 *
 * Quem sabe encerrar uma tarefa é o TaskNotes: pela API dele, `done` e
 * `cancelled` disparam o `autoArchive` (a tarefa vai para `TaskNotes/Archive/`)
 * e emitem `task.completed`, que a gamificação e o motor de canvas escutam.
 * Gravar `status` direto no frontmatter não faz nada disso.
 *
 * Este módulo só decide (puro, sem `obsidian`); quem executa é o
 * `MissionBoard` (`boardPlugin.ts`). Decide também o "Quando terminou?" (o dia e a
 * hora da conclusão, e onde fica a linha) e a tela opcional do 🌙 (as concluídas do
 * dia sem lugar e tempo), da arquitetura universal 4.6; quem pergunta é
 * `ui/completionModals.ts`, quem grava é o `MetadataWatcher` e o `NowTreeService`.
 *
 * Erro e ataque: `apiVersion` vem de outro plugin e pode faltar ou mudar; só
 * a versão 1 (lida no TaskNotes 4.13.8) usa a API. Qualquer outra cai no
 * caminho antigo, com aviso, para o operador saber que a tarefa não arquivou.
 * Prova: `tests/board/taskCompletion.test.ts`.
 */
import type { TaskUnit } from '../engine/decisionWeights';
import type { Papel } from '../engine/papeisDeProtocolo';
import { addMinutes, type BlockRecord } from '../engine/blockLog';
import { NOW_TIME_OPTIONS } from '../engine/nowTree';
import { ehDia, partesDoDia } from '../engine/dia';
import { TASK_CONTEXTS } from '../engine/taskContexts';

/** Status que encerram a tarefa no TaskNotes deste vault (`isCompleted` + `autoArchive`). */
export const ENDING_STATUSES: ReadonlySet<string> = new Set(['done', 'cancelled']);

/**
 * O `task.completed` do TaskNotes chega também quando a tarefa é cancelada
 * (`cancelled` tem `isCompleted: true` no TaskNotes deste vault). Cancelar não é
 * concluir: não pontua na gamificação, não marca o hábito do Comando, não
 * fecha iniciativa e, no DFM Timeline da Day, vira só o registro neutro
 * "Tarefa cancelada". Status ausente conta como conclusão (o evento antigo não
 * trazia a tarefa).
 */
export function completionKind(status: unknown): 'done' | 'cancelled' {
    const s = String(status ?? '').trim().toLowerCase();
    return s === 'cancelled' || s === 'cancelado' || s === 'cancelada' ? 'cancelled' : 'done';
}

/* ------------------------------------------- cancelar: registro neutro */

/**
 * Onde fica o registro neutro de uma tarefa cancelada.
 *
 * Por quê: cancelar é neutro em toda escala (arquitetura universal 3.3; decisão 27
 * de 18/10/2026): não pontua, não cria Day e não conta como falta. Antes, cancelar
 * num dia sem Day criava a Day inteira só para a linha "Tarefa cancelada".
 * Concluir continua criando a Day; isto vale só para o cancelamento.
 *
 * Entrada: se a Day do dia existe e se a Week da semana existe.
 * Saída: `day` (a linha neutra no DFM Timeline da Day), `week` (a linha no
 * "### 📅 Log" da Week, sem criar a Day) ou `internal` (só o log do console,
 * sem criar nota nenhuma).
 * Prova: `tests/board/taskCompletion.test.ts` ("cancelar não cria a Day").
 */
export type NeutralRecordTarget = 'day' | 'week' | 'internal';

export function neutralRecordTarget(found: { day: boolean; week: boolean }): NeutralRecordTarget {
    if (found.day) return 'day';
    return found.week ? 'week' : 'internal';
}

/** A seção de registros da Week, a mesma que o motor já usa para os links (`logToWeeklyNote`). */
export const WEEK_LOG_SECTION = '### 📅 Log';

/**
 * A linha neutra na Week: data e hora (a Week cobre 7 dias), "Tarefa cancelada" e
 * o link da tarefa como o DFM Timeline da Day o escreve.
 */
export function neutralWeekLine(input: { date: string; time: string; title: string; taskPath: string }): string {
    return weekLogLine('Tarefa cancelada', input);
}

/**
 * O que faz: a linha de um registro de tarefa na Week (`- **[data hora] O quê:** link`).
 * Sem hora (concluída "Ontem" ou "Outro dia"), só a data.
 */
function weekLogLine(what: string, input: { date: string; time?: string | null; title: string; taskPath: string }): string {
    const ref = String(input.taskPath ?? '').replace(/\.md$/, '');
    const link = ref ? `[[${ref}|${input.title}]]` : input.title;
    const when = input.time ? `${input.date} ${input.time}` : input.date;
    return `- **[${when}] ${what}:** ${link}`;
}

/**
 * O texto da Week com a linha logo abaixo de `### 📅 Log` (o mais novo em cima, como
 * nos links do motor); sem a seção, ela nasce no fim. A mesma linha duas vezes não
 * entra (o evento pode chegar repetido).
 */
export function withWeekLogLine(content: string, line: string): string {
    const text = String(content ?? '');
    if (text.split('\n').some(l => l === line)) return text;
    const lines = text.split('\n');
    const header = lines.findIndex(l => l.trim() === WEEK_LOG_SECTION);
    if (header === -1) return `${text.trimEnd()}\n\n${WEEK_LOG_SECTION}\n${line}\n`;
    lines.splice(header + 1, 0, line);
    return lines.join('\n');
}

/* ------------------------------------- concluir: "Quando terminou?" */

/**
 * `Quando terminou?` (arquitetura universal 4.6, desde 19/10/2026: a conclusão às vezes
 * é marcada em outro dia). Concluir uma tarefa pergunta numa linha: Agora (já marcado) ·
 * Mais cedo hoje (pede a hora) · Ontem · Outro dia. A data de conclusão é a dita; a
 * linha do registro vai para a Day daquele dia, ou para a Week se aquela Day não
 * existir (sem criar a Day); a reputação contextual recebe a hora real.
 * Registro tardio é o uso normal: nada aqui cobra a hora certa nem a falta dela.
 */
export const COMPLETION_WHEN_PROMPT = 'Quando terminou?';

export type CompletionWhenChoice = 'agora' | 'mais_cedo' | 'ontem' | 'outro_dia';

/** As quatro respostas, na ordem da linha; a primeira vem marcada. */
export const COMPLETION_WHEN_OPTIONS: ReadonlyArray<{ choice: CompletionWhenChoice; label: string }> = [
    { choice: 'agora', label: 'Agora' },
    { choice: 'mais_cedo', label: 'Mais cedo hoje' },
    { choice: 'ontem', label: 'Ontem' },
    { choice: 'outro_dia', label: 'Outro dia' },
];

/**
 * A resposta: o dia (`AAAA-MM-DD`) e a hora (`HH:mm`, ou `null` quando não foi dita).
 * Na conclusão dita depois (não "Agora"), também onde foi e quanto levou, se a pessoa
 * confirmou a segunda linha (`withCompletionPlace`).
 */
export interface CompletionWhen {
    choice: CompletionWhenChoice;
    date: string;
    time: string | null;
    lugar?: string;
    bloco_min?: number | null;
}

/**
 * A segunda linha do "Quando terminou?" (arquitetura 4.6: "a tarefa concluída depois
 * pergunta numa linha só onde foi e quanto levou, com o provável já marcado. Um toque
 * confirma"). Só quando a escolha não é "Agora" (com "Agora", o bloco aberto ou a tela
 * do 🌙 já sabem). Pular não muda nada: a falta do dado é ausência de dado.
 */
export const COMPLETION_PLACE_PROMPT = '🧭 Onde foi e quanto levou?';
export const COMPLETION_PLACE_INFO = 'O provável já vem marcado; um toque confirma. Pular não muda nada.';
export const COMPLETION_PLACE_CONFIRM = '✅ Confirmar';
export const COMPLETION_PLACE_SKIP = 'Pular';

/** O que faz: a escolha pede a segunda linha (onde e quanto)? Só a dita depois. */
export function asksCompletionPlace(choice: CompletionWhenChoice): boolean {
    return choice !== 'agora';
}

/**
 * O que faz: junta à resposta o lugar e o tamanho confirmados. Só o vocabulário vale (um
 * dos 6 contextos e um dos tamanhos da árvore do agora); fora dele, a resposta volta como
 * estava (sem lugar), como no "Pular".
 */
export function withCompletionPlace(when: CompletionWhen, place: { lugar?: unknown; bloco_min?: unknown } | null | undefined): CompletionWhen {
    const lugar = String(place?.lugar ?? '');
    const minutes = Number(place?.bloco_min);
    const known = (TASK_CONTEXTS as readonly string[]).includes(lugar) && NOW_TIME_OPTIONS.some(option => option.minutes === minutes);
    return known ? { ...when, lugar, bloco_min: minutes } : when;
}

/** O que faz: o dia `n` dias depois (ou antes) de `AAAA-MM-DD`; texto inválido → vazio. */
export function shiftDay(day: string, n: number): string {
    const p = partesDoDia(String(day ?? ''));
    if (!p) return '';
    const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia + n));
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** O que faz: `AAAA-MM-DD` que existe no calendário (31/02 não). */
export function isCalendarDay(day: unknown): boolean {
    const text = String(day ?? '');
    return ehDia(text) && shiftDay(text, 0) === text;
}

/**
 * O que faz: a hora digitada → `HH:mm`. Aceita "14", "14h", "14h30", "14:30", "9:05".
 * Erro e ataque: fora de 00:00–23:59 ou outro formato → `null` (a pergunta não fecha).
 */
export function parseClockTime(raw: unknown): string | null {
    const m = String(raw ?? '').trim().match(/^(\d{1,2})(?:\s*[:hH]\s*(\d{2})?)?$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * O que faz: a resposta da linha → o dia e a hora da conclusão.
 * Entra: a escolha, agora (`AAAA-MM-DDTHH:mm`, hora local) e o que foi digitado (a hora
 * no "Mais cedo hoje", o dia no "Outro dia"). Sai: `CompletionWhen`, ou `null` quando o
 * digitado não serve (hora depois de agora, dia no futuro, texto que não é hora/dia).
 * "Ontem" e "Outro dia" não pedem a hora: ela fica `null` (o "Outro dia" que cai em
 * hoje vale como agora).
 * Prova: tests/board/taskCompletion.test.ts ("Quando terminou?").
 */
export function completionWhen(choice: CompletionWhenChoice, now: string, input?: unknown): CompletionWhen | null {
    const today = String(now ?? '').slice(0, 10);
    const nowTime = String(now ?? '').slice(11, 16);
    if (!isCalendarDay(today) || !/^\d{2}:\d{2}$/.test(nowTime)) return null;
    if (choice === 'agora') return { choice, date: today, time: nowTime };
    if (choice === 'mais_cedo') {
        const time = parseClockTime(input);
        return time && time <= nowTime ? { choice, date: today, time } : null;
    }
    if (choice === 'ontem') return { choice, date: shiftDay(today, -1), time: null };
    if (choice === 'outro_dia') {
        const date = String(input ?? '').trim();
        if (!isCalendarDay(date) || date > today) return null;
        return { choice, date, time: date === today ? nowTime : null };
    }
    return null;
}

/**
 * O que faz: a conclusão que já chegou com a data dita pelo TaskNotes ("Complete on" numa
 * data escolhida, "Completed on schedule/on due"). Dia antes de hoje → a resposta (sem
 * hora; não pergunta de novo); hoje, futuro ou vazio → `null` (pergunta).
 */
export function whenFromCompletedDate(completedDate: unknown, now: string): CompletionWhen | null {
    const today = String(now ?? '').slice(0, 10);
    const date = String(completedDate ?? '').slice(0, 10);
    if (!isCalendarDay(date) || !isCalendarDay(today) || date >= today) return null;
    return { choice: date === shiftDay(today, -1) ? 'ontem' : 'outro_dia', date, time: null };
}

/**
 * O que faz: o dia da instância concluída de uma tarefa recorrente, lido do evento
 * `recurring.instance.completed` do TaskNotes 4.13. O evento não traz o dia: ele é a
 * entrada nova de `complete_instances` (o `after` menos o `before`; a mais recente, se
 * vierem várias). Aceita também `date`/`targetDate`/`data.date`, se o TaskNotes os mandar.
 * Sem dia válido → `null` (nada a registrar).
 */
export function recurringInstanceDate(event: any): string | null {
    const day = (value: unknown) => {
        const text = String(value ?? '').slice(0, 10);
        return isCalendarDay(text) ? text : null;
    };
    const direct = day(event?.date) ?? day(event?.targetDate) ?? day(event?.data?.date);
    if (direct) return direct;
    const list = (value: unknown) => (Array.isArray(value) ? value.map(day).filter((d): d is string => Boolean(d)) : []);
    const before = new Set(list(event?.before?.complete_instances));
    const added = list(event?.after?.complete_instances ?? event?.task?.complete_instances).filter(d => !before.has(d)).sort();
    return added.length ? added[added.length - 1] : null;
}

/** O que faz: o horário da conclusão (`AAAA-MM-DDTHH:mm`), ou `null` sem hora dita. */
export function completionStamp(when: Pick<CompletionWhen, 'date' | 'time'>): string | null {
    return when?.time ? `${when.date}T${when.time}` : null;
}

/**
 * O que faz: onde fica a linha da conclusão.
 * Por quê: concluir hoje continua criando a Day (decisões 12 e 27 de 16 e 18/10); a
 * conclusão de outro dia vai para a Day daquele dia se ela existe, senão para a Week
 * daquele dia, sem criar a Day (4.6); sem as duas, só o log interno.
 */
export function completionLogTarget(found: { today: boolean; day: boolean; week: boolean }): NeutralRecordTarget {
    if (found.today || found.day) return 'day';
    return found.week ? 'week' : 'internal';
}

/** A linha da conclusão na Week (o dia, a hora se foi dita, e o link). */
export function completionWeekLine(input: { date: string; time: string | null; title: string; taskPath: string }): string {
    return weekLogLine('Conclusão de tarefa', input);
}

/**
 * A resposta do "Quando terminou?" dada no quadro, esperando o `task.completed` do
 * TaskNotes: o observador do evento a usa e não pergunta de novo. A chave é o nome (o
 * arquivamento muda a pasta); a resposta vence em 60 s.
 */
const answered = new Map<string, { when: CompletionWhen; at: number }>();

export function markCompletionAnswer(pathOrName: string, when: CompletionWhen, now = Date.now()): void {
    answered.set(keyOf(pathOrName), { when, at: now });
}

/** A resposta dada no quadro para esta conclusão (e consome a marca), ou `null`. */
export function takeCompletionAnswer(pathOrName: string, now = Date.now(), ttlMs = 60_000): CompletionWhen | null {
    const key = keyOf(pathOrName);
    const hit = answered.get(key);
    answered.delete(key);
    return hit && now - hit.at <= ttlMs ? hit.when : null;
}

export const RECURRING_NOTICE ='Tarefa recorrente: conclua pelo TaskNotes. Abrindo a nota.';
export const NO_API_DONE_NOTICE = 'TaskNotes indisponível: concluída sem arquivar';
export const NO_API_CANCELLED_NOTICE = 'TaskNotes indisponível: cancelada sem arquivar';

export interface CompletionInput {
    /** O status pedido (`done`, `cancelled` ou outro). */
    status: string;
    /** `recurrence` do frontmatter da tarefa (regra RRULE ou vazio). */
    recurrence: unknown;
    /** `plugins.tasknotes.api.apiVersion`, ou `undefined` sem o TaskNotes. */
    apiVersion: unknown;
}

export type CompletionRoute =
    /** Recorrente conclui por instância: abre a nota e não grava nada. */
    | { via: 'open-note'; notice: string }
    /** `api.tasks.complete(path, { status: 'done' })`. */
    | { via: 'api-complete' }
    /** `api.tasks.setStatus(path, status)`. */
    | { via: 'api-status' }
    /** Grava `status` no frontmatter; `notice` diz o que deixou de acontecer. */
    | { via: 'frontmatter'; notice: string | null };

function hasRecurrence(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
}

/**
 * Decide o caminho de uma troca de status.
 * - Status que não encerra: frontmatter, sem aviso (não é assunto daqui).
 * - Recorrente: a regra de antes fica. Concluir abre a nota (conclui por
 *   instância, no TaskNotes); cancelar grava o frontmatter, como já gravava.
 * - API v1: concluir por `complete`, cancelar por `setStatus`.
 * - Sem API: frontmatter, com o aviso de que não arquivou.
 */
export function completionRoute(input: CompletionInput): CompletionRoute {
    const { status } = input;
    if (!ENDING_STATUSES.has(status)) return { via: 'frontmatter', notice: null };
    if (hasRecurrence(input.recurrence)) {
        return status === 'done' ? { via: 'open-note', notice: RECURRING_NOTICE } : { via: 'frontmatter', notice: null };
    }
    if (input.apiVersion === 1) return status === 'done' ? { via: 'api-complete' } : { via: 'api-status' };
    return { via: 'frontmatter', notice: withoutArchiveNotice(status) };
}

/**
 * O aviso de quando a tarefa encerra sem o TaskNotes (API ausente ou que
 * recusou o pedido): ela fica com o status, mas não vai para o arquivo.
 */
export function withoutArchiveNotice(status: string): string {
    return status === 'done' ? NO_API_DONE_NOTICE : NO_API_CANCELLED_NOTICE;
}

/* ------------------------------------------------------------ reabrir */

export const NO_API_REOPEN_ARCHIVED_NOTICE = 'TaskNotes indisponível: reaberta, mas continua em TaskNotes/Archive';

/**
 * A tarefa está arquivada pelo TaskNotes? Tag `archived` (o `archiveTag` deste
 * vault) ou a pasta `TaskNotes/Archive/` (`archiveFolder`).
 */
export function isArchivedTask(task: { path: string; tags?: string[] }): boolean {
    return (task.tags ?? []).some(tag => tag.replace(/^#/, '').toLowerCase() === 'archived')
        || task.path.startsWith('TaskNotes/Archive/');
}

export type ReopenRoute =
    /** `api.tasks.uncomplete(path, { status })` e, se arquivada, `api.tasks.archive(path, false)`. */
    | { via: 'api'; unarchive: boolean }
    /** Grava `status` no frontmatter; `notice` avisa quando ela continua no arquivo. */
    | { via: 'frontmatter'; notice: string | null };

/**
 * Reabrir uma tarefa concluída. Pela API v1 do TaskNotes, o status volta e a
 * tarefa sai do arquivo (concluir arquiva, pelo `autoArchive` de `done`); trocar
 * só o status deixaria a tarefa aberta dentro de `TaskNotes/Archive/`.
 */
export function reopenRoute(input: { archived: boolean; apiVersion: unknown }): ReopenRoute {
    if (input.apiVersion === 1) return { via: 'api', unarchive: input.archived };
    return { via: 'frontmatter', notice: input.archived ? NO_API_REOPEN_ARCHIVED_NOTICE : null };
}

/**
 * Qual método do `MissionBoard` recebe um status escolhido num menu
 * (submenu DFM, menu de status do cartão): concluir e cancelar não passam
 * por `updateTask`, que só grava o campo. Tirar uma tarefa feita ou cancelada
 * (`current`) para um status aberto é reabrir (`reopenTask`: o TaskNotes desfaz a
 * conclusão e a tira do arquivo); só o campo deixava a tarefa aberta em
 * `TaskNotes/Archive/`, fora da árvore do agora, dos pesos e das vistas.
 */
export function statusWriter(status: string, current?: unknown): 'completeTask' | 'setStatus' | 'updateTask' | 'reopenTask' {
    if (status === 'done') return 'completeTask';
    if (status === 'cancelled') return 'setStatus';
    if (ENDING_STATUSES.has(String(current ?? ''))) return 'reopenTask';
    return 'updateTask';
}

/* ------------------------------------------------- 📤 soltar → registro */

/**
 * O papel do protocolo que registra onde a peça saiu (no cofre de origem, o 🎬 Bloco de Criação
 * com a etapa 📤 Publicar já respondida); sem protocolo para ele, a oferta não aparece.
 */
export const RELEASE_PAPEL: Papel = 'registrar_publicacao';
export const RELEASE_ACTION_LABEL = '📤 Registrar onde saiu';

/**
 * Concluir uma peça 📤 (`peca: soltar`) oferece registrar onde ela saiu — o
 * link fica no registro do Bloco de Criação, que alimenta o "no ar" da semana.
 * Só oferece: o registro é opcional e nada espera por ele. Outra tarefa → `null`.
 */
export function releaseOffer(peca: unknown): { label: string; papel: Papel } | null {
    return String(peca ?? '').trim().toLowerCase() === 'soltar' ? { label: RELEASE_ACTION_LABEL, papel: RELEASE_PAPEL } : null;
}

/**
 * Quem já mostrou o aviso da conclusão. O quadro conclui pela API do TaskNotes,
 * que emite `task.completed`; o observador desse evento também oferece o
 * "📤 Registrar onde saiu" (conclusão pelo checkbox, pela nota, pelo celular).
 * O quadro marca a tarefa antes de concluir e o observador consome a marca: um
 * aviso só. A chave é o nome (o arquivamento muda a pasta); a marca vence em 10 s.
 */
const noticed = new Map<string, number>();
const keyOf = (pathOrName: string) => String(pathOrName ?? '').split('/').pop()!.replace(/\.md$/, '');

export function markCompletionNoticed(pathOrName: string, now = Date.now()): void {
    noticed.set(keyOf(pathOrName), now);
}

/** `true` se o quadro já avisou desta conclusão (e consome a marca). */
export function takeCompletionNoticed(pathOrName: string, now = Date.now(), ttlMs = 10_000): boolean {
    const key = keyOf(pathOrName);
    const at = noticed.get(key);
    noticed.delete(key);
    return at !== undefined && now - at <= ttlMs;
}

/* ------------------------- 🌙: as concluídas do dia sem lugar e tempo */

/**
 * A tela opcional do 🌙 (arquitetura 4.6): recolhe as concluídas do dia sem registro
 * de lugar e tempo, com o provável marcado, e um toque confirma todas. Registro tardio
 * é o normal; ignorar a tela não muda nada (a falta de registro é ausência de dado).
 */
export const NIGHT_COMPLETIONS_PROMPT = '🧭 Onde e em quanto tempo saíram as concluídas de hoje?';
export const NIGHT_COMPLETIONS_INFO = 'Opcional. O provável já vem marcado; mude só o que não for. É daqui que o sistema aprende onde cada tipo de tarefa rende.';
export const NIGHT_CONFIRM_LABEL = '✅ Confirmar todas';
export const NIGHT_SKIP_LABEL = 'Agora não';

/** Uma concluída do dia ainda sem lugar e tempo. */
export interface NightCandidate {
    caminho: string;
    tarefa: string;
    projeto: string;
    tags: string[];
    contexts: string[];
    minutes: number | null;
    /** A hora real da conclusão (`AAAA-MM-DDTHH:mm`), se se sabe. */
    fim: string | null;
    /** O registro só de conclusão (sem lugar) que a confirmação completa; `null` = nenhum. */
    recordId: string | null;
}

/**
 * O que faz: o registro só de conclusão (deixado pelo "Quando terminou?", sem lugar nem
 * tempo). Ele nasce com o início igual ao fim (`withCompletion`); um bloco de verdade
 * sem lugar (o aberto pelo 🤝 do canvas antes de perguntar o lugar) tem início antes do
 * fim e não é só conclusão.
 */
export function isCompletionOnlyRecord(record: BlockRecord): boolean {
    return Boolean(record?.fim) && record?.inicio === record?.fim && !record?.lugar && (record?.bloco_min ?? null) === null && record?.saiu === 'concluída';
}

/**
 * O que faz: o registro de uma concluída que ainda não diz onde foi: o só de conclusão
 * e o bloco real fechado sem lugar. A tela do 🌙 completa os dois.
 */
export function needsNightPlace(record: BlockRecord): boolean {
    return Boolean(record?.fim) && !record?.lugar && record?.saiu === 'concluída';
}

const sameTask = (record: Pick<BlockRecord, 'caminho' | 'tarefa'>, unit: Pick<TaskUnit, 'path' | 'name'>) =>
    record.caminho === unit.path || record.tarefa === unit.name;

/**
 * O que faz: as concluídas de `day` sem lugar e tempo no registro.
 * Entra: as tarefas (inclusive o arquivo), os registros do mês e a hora da última
 * mudança de cada tarefa naquele dia (o provável da hora, quando o registro não a tem).
 * Sai: os registros só de conclusão do dia (com a hora real) e as tarefas concluídas no
 * dia que não têm registro nenhum dele, na ordem da hora.
 */
export function nightCandidates(units: TaskUnit[], records: BlockRecord[], day: string, modifiedAt: Map<string, string> = new Map()): NightCandidate[] {
    const list = units || [];
    const recs = records || [];
    const out: NightCandidate[] = [];
    const unitOf = (record: BlockRecord) => list.find(unit => unit.path === record.caminho) ?? list.find(unit => unit.name === record.tarefa);
    for (const record of recs) {
        if (record.data !== day || !needsNightPlace(record)) continue;
        const unit = unitOf(record);
        out.push({
            caminho: record.caminho, tarefa: record.tarefa, projeto: record.projeto, tags: record.tags || [],
            contexts: unit?.contexts ?? [], minutes: unit?.minutes ?? null, fim: record.fim ?? null, recordId: record.id,
        });
    }
    for (const unit of list) {
        if (unit.status !== 'done' || unit.completed !== day) continue;
        if (recs.some(record => record.data === day && sameTask(record, unit))) continue;
        const stamp = modifiedAt.get(unit.path) ?? null;
        out.push({
            caminho: unit.path, tarefa: unit.name, projeto: unit.projects[0] ?? '', tags: unit.tags,
            contexts: unit.contexts, minutes: unit.minutes, fim: stamp && stamp.startsWith(day) ? stamp : null, recordId: null,
        });
    }
    // Pela hora (a sem hora por último); empate, pelo nome.
    const byTime = (a: NightCandidate, b: NightCandidate) => (a.fim === b.fim ? 0 : a.fim === null ? 1 : b.fim === null ? -1 : a.fim < b.fim ? -1 : 1);
    return out.sort((a, b) => byTime(a, b) || a.tarefa.localeCompare(b.tarefa, 'pt-BR'));
}

/**
 * O que faz: o provável de cada concluída, já marcado.
 * Lugar: o contexto da tarefa, se ela tem um só; entre vários, o último usado se está
 * entre eles, senão o primeiro; sem contexto, o último usado (ou o primeiro da lista).
 * Tempo: o menor bloco que cabe a estimativa (15 min, 30 min, 1 h, 2 h ou mais); sem
 * estimativa, o último tamanho usado (ou 30 min).
 */
export function probableNightChoice(candidate: Pick<NightCandidate, 'contexts' | 'minutes'>, last: { lugar?: string; bloco_min?: number | null } = {}): { lugar: string; bloco_min: number } {
    const contexts = candidate?.contexts ?? [];
    const lugar = contexts.length === 1 ? contexts[0]
        : contexts.length > 1 ? (last.lugar && contexts.includes(last.lugar) ? last.lugar : contexts[0])
            : (last.lugar && (TASK_CONTEXTS as readonly string[]).includes(last.lugar) ? last.lugar : TASK_CONTEXTS[0]);
    const minutes = candidate?.minutes ?? null;
    const fit = minutes !== null ? NOW_TIME_OPTIONS.find(option => option.minutes >= minutes) : undefined;
    const lastSize = NOW_TIME_OPTIONS.find(option => option.minutes === last.bloco_min);
    const bloco_min = minutes !== null ? (fit ?? NOW_TIME_OPTIONS[NOW_TIME_OPTIONS.length - 1]).minutes : (lastSize?.minutes ?? 30);
    return { lugar, bloco_min };
}

/**
 * O que faz: o fim provável de uma concluída sem hora, no dia que o 🌙 está fechando.
 * No mesmo dia, a hora da confirmação; depois da meia-noite (o 🌙 da Day de ontem), o
 * fim daquele dia (23:59): a tarefa saiu antes de o dia virar. Sem dia válido, agora.
 */
export function nightFallbackEnd(nowStamp: string, day?: string): string {
    if (!day || !isCalendarDay(day) || String(nowStamp ?? '').startsWith(day)) return nowStamp;
    return `${day}T23:59`;
}

/**
 * O que faz: grava as escolhas confirmadas no registro do mês.
 * - O registro só de conclusão ganha o lugar, o tamanho e o início (o fim menos o
 *   tamanho), marcado "estimado".
 * - O bloco real fechado sem lugar (início antes do fim) ganha só o lugar e o tamanho:
 *   o início e a medida dele são reais e ficam.
 * - A concluída sem registro ganha um bloco novo, "estimado", com o fim na hora real
 *   (ou, sem ela, `nightFallbackEnd`).
 * `day` é o dia que o 🌙 está fechando: a linha nova é desse dia, também depois da
 * meia-noite. Entra → sai: registros e confirmações → registros (cópia).
 */
export function confirmNightRecords(
    records: BlockRecord[],
    confirmed: Array<NightCandidate & { lugar: string; bloco_min: number }>,
    nowStamp: string,
    day?: string,
): BlockRecord[] {
    let out = [...(records || [])];
    for (const item of confirmed || []) {
        const fim = item.fim ?? nightFallbackEnd(nowStamp, day);
        const inicio = addMinutes(fim, -(item.bloco_min || 0));
        if (item.recordId) {
            out = out.map(record => {
                if (record.id !== item.recordId) return record;
                if (!isCompletionOnlyRecord(record)) return { ...record, lugar: item.lugar, bloco_min: record.bloco_min ?? item.bloco_min };
                return { ...record, lugar: item.lugar, bloco_min: item.bloco_min, inicio, medida: 'estimado' };
            });
            continue;
        }
        const id = `${fim}·${item.tarefa}·conclusão`;
        if (out.some(record => record.id === id)) continue;
        out.push({
            id, data: day && isCalendarDay(day) ? day : fim.slice(0, 10), tarefa: item.tarefa, caminho: item.caminho, projeto: item.projeto, tags: item.tags,
            lugar: item.lugar, bloco_min: item.bloco_min, inicio, fim, saiu: 'concluída', medida: 'estimado',
        });
    }
    return out;
}
