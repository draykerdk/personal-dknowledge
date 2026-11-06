/**
 * Uma TaskNote lida do frontmatter, no formato que canvas, quadro e painel usam.
 *
 * Módulo puro. Diferente do `MissionSnapshot`, que só carrega o que está aberto,
 * aqui entram também as concluídas — sem elas não há progresso nem histórico.
 */
import type { TaskInfo } from '../project/projectCanvasModel';
import { linkTarget } from '../project/projectCanvasModel';
import { parseMinutes, parseSchedule } from '../engine/taskSemantics';
import { diaNoInicio } from '../engine/dia';

/**
 * A peça do fluxo de criação (`peca:` na TaskNote): 🔥 `ignicao` é a parte nova
 * (roteiro, criativo, primeira versão); 📤 `soltar` é publicar, subir, ligar a
 * campanha. Qualquer outro valor não é peça (o juiz `task_doctor.py` aponta).
 */
export type Peca = 'ignicao' | 'soltar';

export function pecaOf(raw: unknown): Peca | '' {
    const value = String(listOf(raw)[0] ?? '').trim().toLowerCase();
    return value === 'ignicao' || value === 'soltar' ? value : '';
}

export interface TaskRecord extends TaskInfo {
    title: string;
    priority: string;
    /** `YYYY-MM-DD` de `scheduled`, ou vazio. */
    scheduled: string;
    /**
     * `HH:MM` de `scheduled` (`2026-10-28T14:00`), ou vazio: a hora marcada é o próprio
     * `scheduled`, sem campo novo (arquitetura da Missão, 8.4). Pela leitura única
     * `parseSchedule`, a mesma do snapshot.
     */
    scheduledTime?: string;
    contexts: string[];
    /** Tags sem `#`, minúsculas. */
    tags: string[];
    impacto: number | null;
    /** Tarefas que bloqueiam esta (nomes), das duas formas: `[[x]]` e `{uid: "[[x]]"}`. */
    blockedBy: string[];
    /** `YYYY-MM-DD` de `dateCreated`, ou vazio. O `created` antigo se aposentou no Passo 0 (0a): não é lido. */
    created: string;
    /** Minutos de `timeEstimate`; sem estimativa é `null`, nunca zero. */
    timeEstimate?: number | null;
    /** 🔥/📤 do fluxo de criação; vazio quando a tarefa não é peça. */
    peca?: Peca | '';
    /** Regra de recorrência do TaskNotes (`DTSTART…FREQ=…`); vazio = tarefa única. */
    recurrence?: string;
    /** A natureza da SMART (`manutencao`, a de rotina, 02/11); sem o campo na nota, a chave não existe. */
    natureza?: string;
    /** O fim declarado da SMART (`entrega_observavel`, `criterio_suficiente`, 02/11); sem o campo na nota, a chave não existe. */
    entregaObservavel?: string;
    criterioSuficiente?: string;
    /** A SMART do trecho (02/11): a candidata escolhida no 🤝 Decidir do 🌍 (`destino`, o nome); sem o campo, a chave não existe. */
    destino?: string;
    /** O dia em que o 🔄 Revisar o trecho revisou a SMART (`revisado`, `AAAA-MM-DD`, 02/11); sem o campo, a chave não existe. */
    revisado?: string;
    /** De onde a tarefa veio (`origem`: `registrar_feito`, `agente`, `arvore`…, 05/11, a trilha de uso a conta); sem o campo, a chave não existe. */
    origem?: string;
}

export function listOf(raw: unknown): unknown[] {
    return Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
}

/** O texto de um campo livre (a lista vale pelos itens, juntos); o que não é texto, vazio. */
function textOf(raw: unknown): string {
    return listOf(raw).filter(v => typeof v === 'string' || typeof v === 'number').map(v => String(v).trim()).filter(Boolean).join(' · ');
}

function day(raw: unknown): string {
    return diaNoInicio(String(listOf(raw)[0] ?? ''));
}

export function toTaskRecord(path: string, basename: string, fm: Record<string, any>, tags: string[]): TaskRecord {
    const impacto = Number(fm.impacto);
    return {
        path,
        basename,
        title: String(fm.title ?? basename),
        type: String(fm.type ?? 'task').trim() || 'task',
        status: String(fm.status ?? '').trim(),
        priority: String(fm.priority ?? '').trim(),
        projects: listOf(fm.projects).map(linkTarget).filter(Boolean),
        week: String(fm.week ?? '').trim(),
        due: day(fm.due),
        scheduled: day(fm.scheduled),
        scheduledTime: parseSchedule(fm.scheduled).time,
        completedDate: day(fm.completedDate),
        contexts: listOf(fm.contexts).map(c => String(c).trim()).filter(Boolean),
        tags: tags.map(t => t.replace(/^#/, '').toLowerCase()),
        impacto: fm.impacto !== undefined && fm.impacto !== '' && Number.isFinite(impacto) ? impacto : null,
        blockedBy: listOf(fm.blockedBy).map(b => linkTarget(b && typeof b === 'object' ? (b as any).uid : b)).filter(Boolean),
        created: day(fm.dateCreated),
        timeEstimate: parseMinutes(fm.timeEstimate),
        peca: pecaOf(fm.peca),
        recurrence: String(listOf(fm.recurrence)[0] ?? '').trim(),
        ...(String(listOf(fm.natureza)[0] ?? '').trim() ? { natureza: String(listOf(fm.natureza)[0]).trim() } : {}),
        ...(textOf(fm.entrega_observavel) ? { entregaObservavel: textOf(fm.entrega_observavel) } : {}),
        ...(textOf(fm.criterio_suficiente) ? { criterioSuficiente: textOf(fm.criterio_suficiente) } : {}),
        ...(linkTarget(listOf(fm.destino)[0]) ? { destino: linkTarget(listOf(fm.destino)[0]) } : {}),
        ...(day(fm.revisado) ? { revisado: day(fm.revisado) } : {}),
        ...(String(listOf(fm.origem)[0] ?? '').trim() ? { origem: String(listOf(fm.origem)[0]).trim() } : {}),
    };
}

/** A tag que o TaskNotes usa para reconhecer tarefa (`taskIdentificationMethod: tag`). */
export function isTaskTagged(tags: string[]): boolean {
    return tags.some(tag => /^#?task(\/|$)/i.test(tag));
}
