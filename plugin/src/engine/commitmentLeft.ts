/**
 * O compromisso que o 🌙 deixou: a mesma regra da pauta (`compromissoDaUltimaDay`, em
 * `200 - FUNCTIONS/Scripts/day_context.js`), para o gesto, o ▶️ e o Deep Work porem no
 * topo o mesmo compromisso que a pauta mostra como "a única coisa".
 *
 * Por quê: grupo 3 das jornadas (aprovado em 16/10): "o compromisso vem da última Day
 * que o tiver". O gesto só lia a Day de ontem; depois de um dia sem Day, a pauta dizia
 * "compromisso deixado em DD/MM" e o gesto não o destacava.
 *
 * Este módulo só calcula. O script da pauta é JavaScript do Dataview e não importa
 * TypeScript: as duas cópias são conferidas pelo mesmo teste de contrato
 * (`tests/engine/commitmentLeft.test.ts`), caso a caso.
 */
import { DIA, partesDoDia } from './dia';

/** O que o 🌙 grava quando pula o compromisso (o novo e o das Days de antes de 19/10). */
export const NO_COMMITMENT_TEXTS: ReadonlyArray<string> = ['sem compromisso agora', 'Sem conexão contextual'];

/** Uma Day: o nome (`AAAA-MM-DD`) e o valor do campo do compromisso (`gatilho_amanha`). */
export interface DayCommitment {
    name: string;
    value: unknown;
}


function isEmptyValue(value: unknown): boolean {
    return value === undefined || value === null
        || (typeof value === 'string' && !value.trim())
        || (Array.isArray(value) && value.length === 0);
}

/**
 * O que faz: o compromisso da última Day antes de `today` que tem o campo preenchido, e
 * o dia dela. Anda para trás a partir de ontem e para na primeira Day com o campo; se
 * essa noite fechou sem compromisso, não há compromisso deixado (a noite mais recente
 * decide, e uma promessa mais antiga não volta por cima dela).
 * Erro e ataque: nome que não é dia, Day de hoje ou do futuro, campo vazio: ignorados.
 */
export function lastLeftCommitment(days: Iterable<DayCommitment> | null | undefined, today: string): { raw: unknown; dia: string } | null {
    const earlier = Array.from(days || [])
        .filter(day => DIA.test(String(day?.name ?? '')) && (!today || day.name < today))
        .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    for (const day of earlier) {
        if (isEmptyValue(day.value)) continue;
        const raw = Array.isArray(day.value) ? day.value[0] : day.value;
        return NO_COMMITMENT_TEXTS.includes(String(raw ?? '').trim()) ? null : { raw: day.value, dia: day.name };
    }
    return null;
}

/** O que faz: o nome da nota do compromisso (`[[Nome|alias]]` → `Nome`); texto sem link → `null`. */
export function commitmentNoteName(raw: unknown): string | null {
    const first = Array.isArray(raw) ? raw[0] : raw;
    const name = String(first ?? '').match(/\[\[([^\]|#]+)/)?.[1]?.split('/').pop()?.trim();
    return name || null;
}

/**
 * O que faz: quando o compromisso foi deixado, como a pauta diz: "ontem" quando é a Day
 * de ontem, senão o dia como `DD/MM`.
 */
export function leftWhenLabel(dia: string, today: string): string {
    if (!DIA.test(String(dia ?? ''))) return '';
    const p = partesDoDia(String(today ?? ''));
    if (p) {
        const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia - 1));
        const pad = (x: number) => String(x).padStart(2, '0');
        const yesterday = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        if (dia === yesterday) return 'ontem';
    }
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** O que faz: a marca da tarefa deixada pelo 🌙 na lista do gesto (`🌙 deixada ontem` ou `🌙 deixada em 16/10`). */
export function leftCommitmentMark(when?: string | null): string {
    return !when || when === 'ontem' ? '🌙 deixada ontem' : `🌙 deixada em ${when}`;
}

/*
 * O compromisso deixado para hoje e o Comando do Dia, como a Day os grava (02/11, o inventário da
 * aposentadoria, item 1: "o fio entre fechar um dia e abrir o seguinte"). As contas moravam no
 * Mission Control antigo (`missionControl.inheritedCommitment` e o `command` de `interpretCycle`), que
 * só o cartão aposentado do Dia mostrava; mudaram de casa para cá, e o painel antigo e a Missão leem
 * daqui (`missao/comandoDoDia.ts`).
 */

/**
 * O que faz: o texto de um valor do frontmatter, como o painel o mostra: a lista vira "a · b", a data vira
 * `AAAA-MM-DD`, o objeto vira vazio.
 * Entra → sai: o valor cru → o texto, sem espaço nas pontas.
 * Erro e ataque: `null`, `undefined` e o objeto que não é data dão vazio; a lista com vazios os pula.
 */
export function textoDoValor(raw: unknown): string {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) return raw.map(item => textoDoValor(item)).filter(Boolean).join(' · ');
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
    if (typeof raw === 'object') return '';
    return String(raw).trim();
}

/**
 * O que faz: o valor do `gatilho_amanha` como compromisso: o 🌙 que fechou sem compromisso vira vazio.
 * Por quê: contá-lo como preenchido mostraria uma promessa que não foi feita; as Days de antes de 19/10
 * trazem o texto genérico do seletor, lido do mesmo jeito (`NO_COMMITMENT_TEXTS`).
 * Entra → sai: o texto → ele mesmo (sem espaço nas pontas), ou vazio.
 */
export function tomorrowTriggerValue(raw: string): string {
    const value = String(raw ?? '').trim();
    return NO_COMMITMENT_TEXTS.includes(value) ? '' : value;
}

/** Os status em que o compromisso deixado segue executável (o filtro da pauta e do ▶️). */
export const LEFT_COMMITMENT_OPEN: ReadonlyArray<string> = ['next-action', 'in-progress'];

/**
 * O que faz: o compromisso que o 🌙 deixou para hoje, pela regra da pauta: a última Day antes de hoje com
 * `gatilho_amanha` (`lastLeftCommitment`), quando foi deixado (`leftWhenLabel`) e, se é o link de uma
 * TaskNote, o caminho dela.
 * Por quê: depois de um dia sem Day (28/10/2026), a pauta dizia `🌙 Deixado em 27/10` e o painel não
 * mostrava nada; e mostrava a tarefa já concluída, que a pauta esconde (`compromissoDeOntem`, day_context.js).
 * Entra → sai: as Days (nome e `gatilho_amanha`), hoje, quem acha a TaskNote pelo nome (`null` quando o
 * nome não é de uma TaskNote) e o leitor do texto → { text, when, taskPath } ou `null`.
 * Erro e ataque: a TaskNote fora de next-action e in-progress (concluída, cancelada, em espera, algum dia)
 * não é mais o compromisso de hoje: `null`. Texto sem link fica como texto.
 * Prova: tests/engine/missionLeftCommitment.test.ts e tests/engine/commitmentLeft.test.ts.
 */
export function inheritedCommitment(
    days: Iterable<DayCommitment> | null | undefined,
    today: string,
    taskOf: (name: string) => { path: string; status: string } | null,
    texto: (raw: unknown) => string = textoDoValor,
): { text: string; when: string; taskPath: string } | null {
    const left = lastLeftCommitment(days, today);
    if (!left) return null;
    const text = tomorrowTriggerValue(texto(left.raw));
    if (!text) return null;
    const name = commitmentNoteName(left.raw);
    const task = name ? taskOf(name) : null;
    if (task && !LEFT_COMMITMENT_OPEN.includes(String(task.status ?? ''))) return null;
    return { text, when: leftWhenLabel(left.dia, today), taskPath: task?.path ?? '' };
}

/** O que faz: o rótulo do compromisso deixado, como a pauta escreve (`🌙 Deixado ontem`, `🌙 Deixado em 27/10`). */
export function leftTriggerLabel(when: string): string {
    return `🌙 Deixado ${!when || when === 'ontem' ? 'ontem' : `em ${when}`}`;
}

/** O que o ▶️ deixou na Day: a entrega suficiente, o valor, a ação, o compromisso 🤝 e a tarefa ligada. */
export interface ComandoDaDay {
    unicaCoisa: string;
    valor: string;
    acao: string;
    compromisso: string;
    taskPath: string;
}

/** Os campos da Day que o Comando do Dia lê (o leitor da Missão pede só estes). */
export const CAMPOS_DO_COMANDO: ReadonlyArray<string> = [
    'entrega_reduzida', 'resultado_suficiente', 'unica_coisa', 'foco', 'valor', 'valor_hyadhuad', 'valor_semana',
    'acao_comando', 'tarefa_smart', 'compromisso_act', 'macro_foco', 'command_task_path', 'gatilho_amanha',
];

/**
 * O que faz: o Comando do Dia que o ▶️ gravou na Day: a entrega suficiente (a reduzida vence, com ↘️), o
 * valor, a ação, o compromisso 🤝 e o caminho da tarefa ligada.
 * Por quê: o ▶️ grava no frontmatter; as Days antigas tinham o comando em campo inline (`acao_comando::`),
 * que só o painel antigo lê do corpo e passa em `inline`; a ordem das leituras é a do cartão antigo.
 * Entra → sai: o frontmatter, os campos inline (vazio sem o corpo) e o leitor do texto → o comando, com
 * vazio no que a Day não tem.
 * Erro e ataque: `||` e não `??`: o ▶️ curto grava `valor` vazio, e o vazio não esconde o resto.
 * Prova: tests/engine/missionControl.test.ts ("interpretCycle") e tests/engine/commitmentLeft.test.ts.
 */
export function comandoDaDay(
    frontmatter: Record<string, unknown> | null | undefined,
    inline: Record<string, string> = {},
    texto: (raw: unknown) => string = textoDoValor,
): ComandoDaDay {
    const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const first = (keys: string[]) => {
        for (const key of keys) {
            const value = texto(fm[key]);
            if (value) return value;
        }
        return '';
    };
    const reduced = texto(fm.entrega_reduzida);
    return {
        unicaCoisa: (reduced ? `↘️ ${reduced}` : '') || first(['resultado_suficiente', 'unica_coisa']) || inline.unica_coisa || texto(fm.foco),
        valor: first(['valor', 'valor_hyadhuad']) || inline.valor_hyadhuad || inline.valor || texto(fm.valor_semana),
        acao: texto(fm.acao_comando) || inline.acao_comando || inline.tarefa_smart || texto(fm.tarefa_smart),
        compromisso: texto(fm.compromisso_act) || inline.macro_foco || texto(fm.macro_foco),
        taskPath: texto(fm.command_task_path),
    };
}
