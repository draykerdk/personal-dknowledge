/**
 * O registro da reputação contextual (arquitetura universal 3.7 e 4.6, aprovadas em 19/10).
 *
 * Cada bloco aberto pelo gesto deixa uma linha: o tipo de tarefa (projeto e tags), o
 * lugar, o tamanho do bloco e o início. O fechamento (o pomodoro, o próximo gesto ou o
 * 🌙) completa o fim, se saiu (concluída, 📤 ou nada) e se o tempo foi medido ou
 * estimado. A conclusão ("Quando terminou?") fecha o bloco da tarefa na hora dita; sem
 * bloco, deixa um registro só de conclusão (sem lugar nem tempo), que a tela do 🌙 pode
 * completar. Só registra: o registro tardio é o uso normal, e a falta de registro é
 * ausência de dado, nunca conta contra nada.
 *
 * Um arquivo por mês, em `400 - MEMORY/100 - DAILY/Reputação contextual/Blocos AAAA-MM.md`.
 * As linhas ficam num bloco ```jsonl entre marcadores; o resto da nota é livre.
 * Este módulo só calcula (texto → registros → texto); quem lê e grava é o serviço.
 */

export const BLOCK_LOG_FOLDER = '400 - MEMORY/100 - DAILY/Reputação contextual';
export const BLOCK_LOG_START = '<!-- dfm-blocos:start -->';
export const BLOCK_LOG_END = '<!-- dfm-blocos:end -->';

export type BlockOutcome = 'concluída' | '📤' | 'nada';
export type BlockMeasure = 'medido' | 'estimado';

export interface BlockRecord {
    /** Identidade do bloco (o início e a tarefa), para o fechamento achar a linha. */
    id: string;
    /** O dia do bloco, `AAAA-MM-DD`. */
    data: string;
    /** Nome da tarefa. */
    tarefa: string;
    /** Caminho da tarefa no vault. */
    caminho: string;
    /** O pai direto (`projects`): a SMART, o projeto ou o departamento. */
    projeto: string;
    tags: string[];
    lugar: string;
    /** O tamanho do bloco escolhido, em minutos ("2 h ou mais" = 120). */
    bloco_min: number | null;
    /** Início, `AAAA-MM-DDTHH:mm` (hora local). */
    inicio: string;
    fim?: string;
    saiu?: BlockOutcome;
    medida?: BlockMeasure;
    /** A conclusão dita sem hora ("Ontem", "Outro dia"): início e fim no meio-dia, marcados. */
    sem_hora?: boolean;
    /** O bloco é de um hábito em treino (o 🔁 escolhido no gesto); `caminho` é a nota do hábito. */
    habito?: boolean;
}

/** O que faz: o caminho do arquivo do mês de um dia `AAAA-MM-DD`. */
export function blockLogPath(day: string): string {
    const month = String(day ?? '').slice(0, 7);
    return `${BLOCK_LOG_FOLDER}/Blocos ${month}.md`;
}

/** O que faz: o mês anterior de `AAAA-MM` (o bloco aberto no dia 31 fecha no dia 1). */
export function previousMonth(month: string): string {
    // Forma própria (não é a `DIA`): o mês `AAAA-MM` do arquivo de registro, sem o dia.
    const match = String(month ?? '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    const year = Number(match[1]);
    const m = Number(match[2]);
    return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * O que faz: lê os registros do bloco ```jsonl entre os marcadores.
 * Erro e ataque: linha que não é JSON, ou sem `id`, é ignorada (o resto continua); sem
 * marcadores, não há registro.
 */
export function parseBlockLog(text: string | null | undefined): BlockRecord[] {
    const source = String(text ?? '');
    const start = source.indexOf(BLOCK_LOG_START);
    const end = source.indexOf(BLOCK_LOG_END);
    if (start < 0 || end < start) return [];
    const records: BlockRecord[] = [];
    for (const line of source.slice(start + BLOCK_LOG_START.length, end).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === 'object' && typeof value.id === 'string' && value.id) records.push(value as BlockRecord);
        } catch (e) {
            // linha estragada à mão: fica de fora, o resto vale
        }
    }
    return records;
}

/**
 * O que faz: devolve o texto da nota do mês com os registros dados entre os
 * marcadores; o que estiver fora deles (o que ele escrever na nota) não muda.
 * Sem texto (nota nova), monta a nota inteira.
 */
export function renderBlockLog(text: string | null | undefined, month: string, records: BlockRecord[]): string {
    const lines = (records || []).map(record => JSON.stringify(record));
    const block = `${BLOCK_LOG_START}\n\`\`\`jsonl\n${lines.join('\n')}${lines.length ? '\n' : ''}\`\`\`\n${BLOCK_LOG_END}`;
    const source = String(text ?? '');
    const start = source.indexOf(BLOCK_LOG_START);
    const end = source.indexOf(BLOCK_LOG_END);
    if (start >= 0 && end > start) {
        return `${source.slice(0, start)}${block}${source.slice(end + BLOCK_LOG_END.length)}`;
    }
    if (source.trim()) return `${source.trimEnd()}\n\n${block}\n`;
    return [
        '---',
        'type: reputacao_contextual',
        `mes: "${month}"`,
        '---',
        '',
        `# Blocos ${month}`,
        '',
        '> Registro automático dos blocos abertos pelo 🤝 gesto: o tipo de tarefa, o lugar, o tamanho do bloco e se saiu. É daqui que sai o peso "aprendizado". Só registra; a falta de registro é ausência de dado.',
        '',
        block,
        '',
    ].join('\n');
}

/** O que faz: soma minutos a um horário `AAAA-MM-DDTHH:mm` (sem fuso: hora local). */
export function addMinutes(stamp: string, minutes: number): string {
    // Forma própria (não é a `DIA`): o horário `AAAA-MM-DDTHH:mm` do bloco, com a hora obrigatória e os cinco números.
    const match = String(stamp ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match || !Number.isFinite(minutes)) return String(stamp ?? '');
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])));
    date.setUTCMinutes(date.getUTCMinutes() + Math.round(minutes));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export interface BlockClosing {
    /** Agora, `AAAA-MM-DDTHH:mm`. */
    agora: string;
    /** `medido`: o pomodoro mediu; `estimado`: o fim vem do tamanho do bloco. */
    medida: BlockMeasure;
    /** Se saiu, por registro (lido da tarefa na hora de fechar). */
    saiu: (record: BlockRecord) => BlockOutcome;
    /** Fecha só os que passarem (ex.: o bloco da tarefa do pomodoro que terminou). */
    somente?: (record: BlockRecord) => boolean;
}

/**
 * O que faz: completa os blocos ainda abertos com fim, se saiu e a medida.
 * Por quê: o bloco fecha com o pomodoro, com o próximo gesto ou no 🌙 (4.5); sem o
 * pomodoro, entra a estimativa, marcada (4.6), e o fim estimado nunca passa de agora.
 * Entra → sai: registros → { registros (cópia), fechados }; o bloco já fechado não muda.
 * Prova: tests/engine/blockLog.test.ts ("fechar").
 */
export function closeBlockRecords(records: BlockRecord[], closing: BlockClosing): { records: BlockRecord[]; fechados: BlockRecord[] } {
    const fechados: BlockRecord[] = [];
    const out = (records || []).map(record => {
        if (record.fim) return record;
        if (closing.somente && !closing.somente(record)) return record;
        const estimated = addMinutes(record.inicio, record.bloco_min ?? 120);
        const fim = closing.medida === 'medido' || estimated > closing.agora ? closing.agora : estimated;
        const closed: BlockRecord = { ...record, fim, saiu: closing.saiu(record), medida: closing.medida };
        fechados.push(closed);
        return closed;
    });
    return { records: out, fechados };
}

/**
 * O que faz: o tipo de tarefa já rendeu neste lugar e neste tamanho de bloco?
 * Por quê: o peso "aprendizado" (4.2 e 4.6): o mesmo tipo (o mesmo projeto ou uma tag
 * em comum) saiu (concluída ou 📤) num bloco fechado do mesmo lugar e tamanho. Sem
 * dado, não: vale 0.
 */
export function learnedFit(records: BlockRecord[], query: { projeto: string; tags: string[]; lugar: string; bloco_min: number | null }): boolean {
    if (!query?.lugar || !Array.isArray(records) || records.length === 0) return false;
    const tags = new Set((query.tags || []).filter(Boolean));
    return records.some(record => Boolean(record.fim)
        && (record.saiu === 'concluída' || record.saiu === '📤')
        && record.lugar === query.lugar
        && (record.bloco_min ?? null) === (query.bloco_min ?? null)
        && ((query.projeto && record.projeto === query.projeto) || (record.tags || []).some(tag => tags.has(tag))));
}

/**
 * O que faz: o lugar e o tamanho do último bloco registrado (o provável, já marcado).
 * O registro só de conclusão (sem lugar, deixado pelo "Quando terminou?") não conta:
 * ele não diz onde a pessoa estava.
 */
export function lastChoice(records: BlockRecord[]): { lugar?: string; bloco_min?: number | null } {
    const sorted = [...(records || [])].filter(record => Boolean(record?.lugar))
        .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    const last = sorted[sorted.length - 1];
    return last ? { lugar: last.lugar || undefined, bloco_min: last.bloco_min ?? null } : {};
}

/** A conclusão de uma tarefa, como o "Quando terminou?" a disse (4.6). */
export interface CompletionFact {
    caminho: string;
    tarefa: string;
    projeto: string;
    tags: string[];
    /** O dia dito, `AAAA-MM-DD`. */
    data: string;
    /** A hora dita (`HH:mm`), ou `null` ("Ontem", "Outro dia"). */
    hora: string | null;
    /** `medido`: o pomodoro ainda rodava na tarefa quando ela foi concluída agora. */
    medida: BlockMeasure;
    /** Onde foi e quanto levou, se a pessoa confirmou a segunda linha do "Quando terminou?". */
    lugar?: string;
    bloco_min?: number | null;
}

/** A hora posta na conclusão dita sem hora (início e fim no meio-dia do dia dito). */
export const NO_HOUR_STAMP_TIME = '12:00';

/**
 * O que faz: a conclusão entra no registro com a hora real.
 * - Bloco aberto da tarefa: fecha no horário dito (nunca antes do início); sem hora,
 *   pelo tamanho do bloco. Saiu: concluída.
 * - Sem bloco aberto, um bloco dela fechado no mesmo dia como "nada" (o pomodoro acabou
 *   antes de concluir): passa a "concluída", sem mexer no fim.
 * - Sem bloco nenhum, com o lugar e o tamanho confirmados (a segunda linha do "Quando
 *   terminou?"): um bloco "estimado" no dia dito; sem hora, com início e fim no
 *   meio-dia e a marca `sem_hora`.
 * - Sem bloco nenhum, sem lugar e com hora: um registro só de conclusão (sem lugar nem
 *   tempo), que a tela do 🌙 completa; sem hora nem lugar, nada entra.
 * `append: false` só fecha e marca (o mês anterior, onde um bloco pode ter ficado aberto).
 * A mesma conclusão duas vezes não duplica. Sem mudança, devolve o mesmo array.
 * Prova: tests/engine/blockLog.test.ts ("a conclusão com a hora").
 */
export function withCompletion(records: BlockRecord[], fact: CompletionFact, options: { append?: boolean } = {}): BlockRecord[] {
    const list = records || [];
    const same = (record: BlockRecord) => record.caminho === fact.caminho || record.tarefa === fact.tarefa;
    const stamp = fact.hora ? `${fact.data}T${fact.hora}` : null;
    if (list.some(record => !record.fim && same(record))) {
        return list.map(record => {
            if (record.fim || !same(record)) return record;
            const fim = stamp ? (stamp < record.inicio ? record.inicio : stamp) : addMinutes(record.inicio, record.bloco_min ?? 120);
            return { ...record, fim, saiu: 'concluída' as BlockOutcome, medida: stamp ? fact.medida : 'estimado' };
        });
    }
    const closedNothing = [...list].reverse().find(record => same(record) && record.data === fact.data && record.saiu === 'nada');
    if (closedNothing) return list.map(record => (record === closedNothing ? { ...record, saiu: 'concluída' as BlockOutcome } : record));
    if (options.append === false) return list;
    const minutes = Number(fact.bloco_min);
    if (fact.lugar && Number.isFinite(minutes) && minutes > 0) {
        const fim = stamp ?? `${fact.data}T${NO_HOUR_STAMP_TIME}`;
        const id = stamp ? `${stamp}·${fact.tarefa}·conclusão` : `${fact.data}·${fact.tarefa}·conclusão`;
        if (list.some(record => record.id === id || (same(record) && record.data === fact.data && record.saiu === 'concluída' && (!stamp || record.fim === stamp)))) return list;
        return [...list, {
            id, data: fact.data, tarefa: fact.tarefa, caminho: fact.caminho, projeto: fact.projeto, tags: fact.tags || [],
            lugar: fact.lugar, bloco_min: minutes, inicio: addMinutes(fim, -minutes), fim, saiu: 'concluída', medida: 'estimado',
            ...(stamp ? {} : { sem_hora: true }),
        }];
    }
    if (!stamp) return list;
    const id = `${stamp}·${fact.tarefa}·conclusão`;
    if (list.some(record => record.id === id || (same(record) && record.fim === stamp && record.saiu === 'concluída'))) return list;
    return [...list, {
        id, data: fact.data, tarefa: fact.tarefa, caminho: fact.caminho, projeto: fact.projeto, tags: fact.tags || [],
        lugar: '', bloco_min: null, inicio: stamp, fim: stamp, saiu: 'concluída', medida: 'estimado',
    }];
}
