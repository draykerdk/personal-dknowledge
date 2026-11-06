/**
 * O uso de um gesto do sistema: em quantos dias ele foi feito, pelos registros que já existem.
 *
 * Por quê: a trilha de uso (05/11/2026, a nota "Atrito na abertura diária e trilha didática de hábito
 * de uso"): o cartão do gesto da semana se marca pelo uso real, e a Árvore de Progressão "Hábito de uso
 * do sistema" desbloqueia o nível seguinte pelo mesmo número. A árvore só contava notas de uma pasta, notas
 * de um tipo com um campo igual e tarefas feitas; nada disso diz "fechou o dia três vezes". Esta é a
 * contagem mínima que faltava, e as duas leem daqui: o critério `uso` da árvore (`progressionEngine.ts`)
 * e a trilha da Missão (`src/missao/trilha.ts`).
 *
 * As fontes são as que o sistema já grava: a linha que o motor escreve na Day com o id do protocolo
 * (`marcaDoProtocolo`, desde 02/11), a `origem` e a conclusão da TaskNote, a mãe SMART dela, e, para o
 * gesto que não deixa rastro próprio (mover a que ficou de antes, decidir na triagem), a marca que a
 * Missão guarda no salvamento do plugin. Conta dias, não vezes: três rodadas no mesmo dia são um dia de uso.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/usoDosGestos.test.ts.
 */
import { DIA } from './dia';
import { protocoloDaMarca } from './protocolGroups';

/** Uma forma de contar o uso de um gesto (a configuração diz qual; um gesto pode ter várias). */
export type ContaDoGesto =
    /** Os dias com a linha do motor de um destes protocolos na Day (a marca do id, sem as interrompidas). */
    | { protocolos: string[] }
    /** Os dias de conclusão das TaskNotes com uma destas `origem` (o "＋ O que fiz" é `registrar_feito`). */
    | { origem: string[] }
    /** Os dias de criação das ações que têm uma SMART mãe. */
    | { ligadaASmart: true }
    /** Os dias em que a Missão marcou este gesto no salvamento (o gesto que não deixa outro rastro). */
    | { marca: string };

/** Uma TaskNote como a contagem a lê: a origem, o dia da conclusão, o da criação e se tem SMART mãe. */
export interface TarefaDoUso { origem?: string; concluida?: string; criada?: string; comSmart?: boolean }

/** O que a contagem lê. */
export interface FontesDoUso {
    /** Os protocolos com linha do motor em cada Day (`protocolosDaDay`), pelo dia `AAAA-MM-DD`. */
    protocolosPorDia: Readonly<Record<string, readonly string[]>>;
    tarefas: readonly TarefaDoUso[];
    /** As marcas da Missão no salvamento: o nome do gesto → os dias. */
    marcas: Readonly<Record<string, readonly string[]>>;
}

const ID = /^[a-z0-9_]+$/;
const textos = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(x => String(x ?? '').trim()).filter(x => ID.test(x));

/**
 * O que faz: uma forma de contar lida do JSON da configuração; o que não serve dá `null`.
 * Entra → sai: `{ "protocolos": [...] }`, `{ "origem": [...] }`, `{ "ligada_a_smart": true }` ou
 * `{ "marca": "..." }` → a conta.
 * Erro e ataque: id com espaço, barra ou maiúscula fica de fora; a lista vazia não conta; duas chaves num
 * objeto só valem pela primeira que serve, na ordem acima.
 * Prova: tests/engine/usoDosGestos.test.ts ("a conta lida").
 */
export function lerContaDoGesto(raw: unknown): ContaDoGesto | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.protocolos !== undefined) { const ids = textos(o.protocolos); return ids.length ? { protocolos: ids } : null; }
    if (o.origem !== undefined) { const ids = textos(o.origem); return ids.length ? { origem: ids } : null; }
    if (o.ligada_a_smart === true) return { ligadaASmart: true };
    if (o.marca !== undefined) { const [m] = textos(o.marca); return m ? { marca: m } : null; }
    return null;
}

/**
 * O que faz: os protocolos que rodaram numa Day, pelas linhas que o motor escreve (`**[hora] Protocolo …
 * executado:**` ou `**[hora] Rótulo**`, com a marca invisível do id no fim).
 * Por quê: a linha do motor é o registro de que o protocolo rodou; a marca do id não muda quando o nome muda.
 * Entra → sai: o texto da Day → os ids, sem repetir, na ordem.
 * Erro e ataque: a linha "interrompido (rascunho)" não conta; a linha sem a marca (as Days de antes de
 * 02/11) não conta; a marca de captura não é de protocolo.
 * Prova: tests/engine/usoDosGestos.test.ts ("as linhas da Day").
 */
export function protocolosDaDay(texto: string | null | undefined): string[] {
    const out: string[] = [];
    for (const linha of String(texto ?? '').split('\n')) {
        const id = protocoloDaMarca(linha);
        if (!id || /interrompido/.test(linha) || !/\*\*\[\d{1,2}:\d{2}\]/.test(linha)) continue;
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

/**
 * O que faz: os dias de uso de um gesto pelas contas dele, de `desde` em diante.
 * Entra → sai: as contas, as fontes e o primeiro dia que vale (`''` = todos) → os dias, sem repetir, em ordem.
 * Erro e ataque: dia que não é `AAAA-MM-DD` fica de fora; conta desconhecida não conta.
 * Prova: tests/engine/usoDosGestos.test.ts ("os dias de uso").
 */
export function diasDeUso(contas: readonly ContaDoGesto[], fontes: FontesDoUso, desde = ''): string[] {
    const dias = new Set<string>();
    const pos = (d: unknown) => { const s = String(d ?? '').slice(0, 10); if (DIA.test(s) && s >= desde) dias.add(s); };
    for (const c of contas) {
        if ('protocolos' in c) {
            for (const [dia, ids] of Object.entries(fontes.protocolosPorDia ?? {})) if (ids.some(id => c.protocolos.includes(id))) pos(dia);
        } else if ('origem' in c) {
            for (const t of fontes.tarefas ?? []) if (t.origem && c.origem.includes(t.origem) && t.concluida) pos(t.concluida);
        } else if ('ligadaASmart' in c) {
            for (const t of fontes.tarefas ?? []) if (t.comSmart && t.criada) pos(t.criada);
        } else if ('marca' in c) {
            for (const d of fontes.marcas?.[c.marca] ?? []) pos(d);
        }
    }
    return [...dias].sort();
}

/**
 * O que faz: lê o critério `uso | <gesto> | <n>` da árvore de progressão: o gesto e a meta (sem o número,
 * `null`: vale a meta das definições).
 * Erro e ataque: gesto fora do formato de id, ou número que não é inteiro positivo, dá `null` (o nível não se cumpre).
 * Prova: tests/engine/usoDosGestos.test.ts ("o critério da árvore").
 */
export function criterioDeUso(partes: readonly string[]): { gesto: string; meta: number | null } | null {
    if (partes[0] !== 'uso' || partes.length < 2 || partes.length > 3) return null;
    const gesto = String(partes[1] ?? '').trim();
    if (!ID.test(gesto)) return null;
    if (partes.length === 2 || !String(partes[2] ?? '').trim()) return { gesto, meta: null };
    const n = Number(String(partes[2]).trim());
    return Number.isInteger(n) && n > 0 ? { gesto, meta: n } : null;
}
