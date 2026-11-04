/**
 * Os gestos da Missão que gravam: cada gesto vira uma intenção e a intenção vira um patch
 * só, montado pela tabela das setas (`canvas/edgeLinks.ts`).
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.2): "Mover é uma composição da
 * tabela, não uma regra nova". A seta de projeto acrescenta o vínculo e não apaga os
 * outros, e desligar a mãe devolve o projeto da SMART quando a ação fica sem mãe. Por
 * isso soltar no fio de outro projeto é, numa gravação só: tirar a mãe antiga, tirar o
 * projeto antigo e pôr o novo, nessa ordem; pôr numa SMART acrescenta a mãe e não tira as
 * outras (02/11), como desenhar mais uma seta SMART → ação no canvas.
 * Cada passo é um `Link` que `linkFor` devolveria para a seta do canvas, gravado por
 * `patchFor` ou `unpatchFor`: o gesto na Missão e a seta no canvas dão o mesmo frontmatter.
 *
 * A hora (§8.4) não é seta: é o próprio `scheduled` (`AAAA-MM-DDTHH:MM`), e mudar de dia
 * mantém a hora, como a seta dia → ação já faz.
 *
 * O Desfazer só desfaz o que ainda está lá (§12, a guarda de `unpatchFor`): cada campo
 * volta ao valor de antes só se ainda tem o valor que o gesto gravou.
 *
 * Módulo puro: sem Obsidian e sem DOM. Os patches são calculados sobre o frontmatter do
 * momento da gravação (`MissionBoard.updateTaskWith` chama a função com ele).
 * Prova: tests/missao/gestos.test.ts e tests/missao/gestosEquivalencia.test.ts.
 */
import { linkFor, patchFor, unpatchFor } from '../canvas/edgeLinks';
import type { End, Link, LinkTask, Patch, ProjectRef } from '../canvas/edgeLinks';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { listOf } from '../tasks/taskRecord';
import { isoWeekOf, weekDates } from '../engine/calendario';
import { DIA, SEMANA } from './formatos';

/* ---------------------------------------------------------------- tipos */

/** O que o gesto conhece da SMART de destino ou de origem (o mesmo que a ponta da seta). */
export type SmartDoGesto = LinkTask;

/**
 * Para onde um gesto leva a tarefa.
 * - `dia`: agendar no dia (a hora fica); a SMART vai para a semana do dia.
 * - `semana`: a ação agendada vai para o mesmo dia da semana na semana nova; sem dia, e a SMART, só a `week`.
 * - `sem-data`: tira o dia e a semana (a prateleira "Sem data").
 * - `hora`: a hora dentro do dia (`null` tira a hora).
 * - `projeto`: muda de projeto (tira a mãe e o projeto antigos, põe o novo).
 * - `ligar-smart`: pôr a ação numa SMART (a alça, o arrasto sobre ela, o "＋ Adicionar", a busca do
 *   "+ Nova ação"): acrescenta a mãe, como desenhar a seta; as outras mães ficam (30/10/2026: uma tarefa
 *   pode se ligar a várias SMART, e a segunda SMART é acrescentada à lista). Tirar uma mãe é o Desligar.
 * - `mae-tarefa`: a subtarefa (30/10): acrescenta a tarefa mãe ao `projects` (o jeito do TaskNotes), pela
 *   ligação de projeto da tabela das setas; as outras mães ficam (uma tarefa liga a mais de uma).
 * - `desligar`: desliga uma ligação (a seta apagada).
 */
export type Intencao =
    | { gesto: 'dia'; data: string }
    | { gesto: 'semana'; semana: string }
    | { gesto: 'sem-data' }
    | { gesto: 'hora'; hora: string | null }
    | { gesto: 'projeto'; projeto: ProjectRef; de: ProjectRef | null }
    | { gesto: 'ligar-smart'; smart: SmartDoGesto }
    | { gesto: 'mae-tarefa'; mae: SmartDoGesto }
    | { gesto: 'desligar'; ligacao: Link };

/** Um passo da composição: a ligação da tabela e se liga ou desliga. */
export interface Passo { link: Link; op: 'ligar' | 'desligar' }

/** O que o cálculo precisa saber do cofre (as mesmas perguntas do contexto da seta). */
export interface ContextoDoGesto {
    /** Há uma SMART com este nome? (decide se a ação ainda tem mãe; `unpatchFor`). */
    isSmartName(name: string): boolean;
    /** A SMART pelo nome, com os projetos dela (para devolver o projeto ao desligar a mãe). */
    smartPorNome?(name: string): SmartDoGesto | null;
    /** O status que a tarefa ganha ao ganhar um dia ou uma semana (a saída da entrada, 02/11); `null`, nenhum. */
    aoGanharLugar?(status: string): string | null;
}

/** O resultado: o patch (ou `null`, nada a mudar), os passos da tabela e o problema, se houver. */
export interface PatchDoGesto { patch: Patch | null; passos: Passo[]; problema?: string }

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));
const vazio = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** A ponta da tarefa, como a seta a vê. */
function pontaDa(tarefa: LinkTask): End {
    return { kind: tarefa.type === 'tarefa_smart' ? 'smart' : 'action', task: tarefa };
}

/** O dia agendado no frontmatter (sem a hora), ou `''`. */
function diaAgendado(fm: Record<string, any>): string {
    return String(listOf(fm.scheduled)[0] ?? '').slice(0, 10).match(DIA)?.[0] ?? '';
}

/**
 * O que faz: o mesmo dia da semana numa semana nova (`2026-10-28` na W45 → `2026-11-04`).
 * Entra → sai: a data e a semana → a data, ou `''` sem dado que sirva.
 */
export function mesmoDiaNaSemana(data: string, semana: string): string {
    if (!DIA.test(data) || !SEMANA.test(semana)) return '';
    const d = new Date(`${data}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return '';
    const i = (d.getUTCDay() + 6) % 7;
    return weekDates(semana)[i] ?? '';
}

/* ---------------------------------------------------------------- passos */

/**
 * O que faz: os passos da tabela das setas que um gesto pede, na ordem do §3.2, sobre o
 * frontmatter do momento.
 * Por quê: o gesto nunca é regra nova: cada passo é o `Link` que `linkFor` dá para a
 * seta equivalente no canvas.
 * Entra → sai: o frontmatter, a tarefa (como a ponta da seta), a intenção e o contexto →
 * os passos, ou o problema em palavras.
 * Erro e ataque: data ou semana que não são do formato, a SMART no dia (a SMART é da
 * semana: vai para a semana do dia), soltar no próprio projeto ou na própria SMART (nada
 * a mudar), a hora sem dia, a SMART como alvo dela mesma.
 */
export function passosDoGesto(fm: Record<string, any>, tarefa: LinkTask, intencao: Intencao, ctx: ContextoDoGesto): { passos: Passo[]; problema?: string } {
    const ponta = pontaDa(tarefa);
    const ehSmart = ponta.kind === 'smart';
    const ligar = (link: Link | null): Passo[] => (link ? [{ link, op: 'ligar' }] : []);
    const desligar = (link: Link | null): Passo[] => (link ? [{ link, op: 'desligar' }] : []);
    switch (intencao.gesto) {
        case 'dia': {
            if (!DIA.test(intencao.data)) return { passos: [], problema: 'a data não é do formato AAAA-MM-DD' };
            const semana = isoWeekOf(intencao.data);
            // A SMART é da semana (a seta dia ↔ SMART não grava): vai para a semana do dia.
            if (ehSmart) return { passos: ligar(linkFor({ kind: 'week', week: semana }, ponta)) };
            return { passos: ligar(linkFor({ kind: 'day', date: intencao.data, week: semana }, ponta)) };
        }
        case 'semana': {
            if (!SEMANA.test(intencao.semana)) return { passos: [], problema: 'a semana não é do formato AAAA-Www' };
            const dia = ehSmart ? '' : diaAgendado(fm);
            const novo = dia ? mesmoDiaNaSemana(dia, intencao.semana) : '';
            if (novo) return { passos: ligar(linkFor({ kind: 'day', date: novo, week: intencao.semana }, ponta)) };
            return { passos: ligar(linkFor({ kind: 'week', week: intencao.semana }, ponta)) };
        }
        case 'sem-data': {
            const passos: Passo[] = [];
            const dia = diaAgendado(fm);
            if (dia && !ehSmart) passos.push(...desligar(linkFor({ kind: 'day', date: dia, week: isoWeekOf(dia) }, ponta)));
            const semana = String(fm.week ?? '').trim();
            if (SEMANA.test(semana)) passos.push(...desligar(linkFor({ kind: 'week', week: semana }, ponta)));
            return { passos };
        }
        case 'hora':
            return { passos: [] };
        case 'projeto': {
            const novo = intencao.projeto;
            const de = intencao.de;
            if (de && de.keys.map(fold).includes(fold(novo.name))) return { passos: [], problema: 'já está neste projeto' };
            const passos: Passo[] = [];
            if (!ehSmart) {
                // 1. Tirar a mãe antiga (cada SMART do `projects`).
                for (const item of listOf(fm.projects)) {
                    const nome = linkTarget(item);
                    if (!ctx.isSmartName(nome)) continue;
                    const smart = ctx.smartPorNome?.(nome) ?? { path: '', basename: nome, type: 'tarefa_smart', projects: [] };
                    passos.push(...desligar(linkFor({ kind: 'smart', task: smart }, ponta)));
                }
            }
            // 2. Tirar o projeto antigo; 3. pôr o novo.
            if (de) passos.push(...desligar(linkFor({ kind: 'project', project: de }, ponta)));
            passos.push(...ligar(linkFor({ kind: 'project', project: novo }, ponta)));
            return { passos };
        }
        case 'ligar-smart': {
            if (ehSmart) return { passos: [], problema: 'a alça liga a SMART a uma ação' };
            if (intencao.smart.path && intencao.smart.path === tarefa.path) return { passos: [], problema: 'a SMART não liga a ela mesma' };
            return { passos: ligar(linkFor({ kind: 'smart', task: intencao.smart }, ponta)) };
        }
        case 'mae-tarefa': {
            if (intencao.mae.path && intencao.mae.path === tarefa.path) return { passos: [], problema: 'a tarefa não é subtarefa dela mesma' };
            return { passos: ligar(linkFor({ kind: 'project', project: { name: intencao.mae.basename, keys: [fold(intencao.mae.basename)] } }, ponta)) };
        }
        case 'desligar':
            return { passos: [{ link: intencao.ligacao, op: 'desligar' }] };
    }
}

/**
 * O que faz: aplica os passos, um depois do outro, sobre uma cópia do frontmatter, e devolve
 * o patch que leva do frontmatter de entrada ao de saída (`null` apaga a chave).
 * Por quê: "numa gravação só" (§3.2): o patch composto é gravado de uma vez pelo
 * `updateTaskWith`, e cada passo decide sobre o resultado do passo anterior.
 * Entra → sai: o frontmatter (não é mutado), os passos e o contexto → o patch, ou `null`.
 */
export function comporPassos(fm: Record<string, any>, passos: readonly Passo[], ctx: Pick<ContextoDoGesto, 'isSmartName'>): Patch | null {
    const atual: Record<string, any> = clone(fm) ?? {};
    const tocadas = new Set<string>();
    for (const { link, op } of passos) {
        const patch = op === 'ligar' ? patchFor(atual, link) : unpatchFor(atual, link, ctx);
        if (!patch) continue;
        for (const [k, v] of Object.entries(patch)) {
            tocadas.add(k);
            if (v === null || v === undefined) delete atual[k];
            else atual[k] = clone(v);
        }
    }
    const out: Patch = {};
    for (const k of tocadas) if (!same(fm[k], atual[k])) out[k] = atual[k] === undefined ? null : atual[k];
    return Object.keys(out).length ? out : null;
}

/**
 * O que faz: o patch da hora dentro do dia (`2026-10-28` + `14:00` → `2026-10-28T14:00`;
 * `null` tira a hora e deixa o dia).
 * Por quê: §8.4: "a hora é o próprio `scheduled`, sem campo novo".
 * Erro e ataque: a hora sem dia agendado, a hora fora de `HH:MM`, a SMART (não tem `scheduled`).
 */
export function patchDaHora(fm: Record<string, any>, tarefa: Pick<LinkTask, 'type'>, hora: string | null): { patch: Patch | null; problema?: string } {
    if (tarefa.type === 'tarefa_smart') return { patch: null, problema: 'a SMART não tem dia nem hora: ela é da semana' };
    const dia = diaAgendado(fm);
    if (!dia) return { patch: null, problema: 'a hora precisa de um dia: agende antes' };
    if (hora !== null && !HORA.test(hora)) return { patch: null, problema: 'a hora não é do formato HH:MM' };
    const novo = hora ? `${dia}T${hora}` : dia;
    return { patch: same(fm.scheduled, novo) ? null : { scheduled: novo } };
}

/**
 * O que faz: o patch de um gesto sobre o frontmatter do momento (os passos compostos, ou a hora).
 * Entra → sai: o frontmatter, a tarefa, a intenção e o contexto → `PatchDoGesto`.
 * Prova: tests/missao/gestosEquivalencia.test.ts (o mesmo frontmatter da seta no canvas).
 */
export function patchDoGesto(fm: Record<string, any>, tarefa: LinkTask, intencao: Intencao, ctx: ContextoDoGesto): PatchDoGesto {
    if (intencao.gesto === 'hora') {
        const h = patchDaHora(fm, tarefa, intencao.hora);
        return { patch: h.patch, passos: [], ...(h.problema ? { problema: h.problema } : {}) };
    }
    const { passos, problema } = passosDoGesto(fm, tarefa, intencao, ctx);
    if (problema) return { patch: null, passos, problema };
    const patch = comporPassos(fm, passos, ctx);
    // A tarefa da entrada que ganha um dia ou uma semana sai da entrada (D1, 02/11), no mesmo patch e no mesmo Desfazer.
    const status = (intencao.gesto === 'dia' || intencao.gesto === 'semana') ? ctx.aoGanharLugar?.(String(fm.status ?? '')) : null;
    if (patch && status) patch.status = status;
    return { patch, passos };
}

/* ---------------------------------------------------------------- desfazer */

/**
 * O que faz: o patch que desfaz uma gravação, só nos campos que ainda têm o valor gravado.
 * Por quê: §12, "o Desfazer só desfaz o que ainda está lá": a seta no canvas, o painel, o
 * TaskNotes ou o Sync podem ter mudado o campo depois; esse campo fica como está.
 * Entra → sai: o frontmatter de agora, os valores de antes (`undefined` = não existia) e o
 * patch gravado (`null` = apagou) → o patch de volta (ou `null`) e os campos que ficaram.
 * Erro e ataque: o campo apagado pelo gesto que voltou a existir por fora fica; a lista
 * igual em outra ordem conta como mudada (fica).
 */
export function patchDeDesfazer(fm: Record<string, any>, antes: Record<string, unknown>, gravado: Patch): { patch: Patch | null; ficaram: string[] } {
    const patch: Patch = {};
    const ficaram: string[] = [];
    for (const [k, v] of Object.entries(gravado)) {
        const ainda = v === null || v === undefined ? vazio(fm[k]) : same(fm[k], v);
        if (!ainda) { ficaram.push(k); continue; }
        const volta = antes[k];
        if (same(fm[k], volta) || (vazio(fm[k]) && volta === undefined)) continue;
        patch[k] = volta === undefined ? null : clone(volta);
    }
    return { patch: Object.keys(patch).length ? patch : null, ficaram };
}

/* ---------------------------------------------------------------- textos */

const quem = (t: Pick<LinkTask, 'type'>) => (t.type === 'tarefa_smart' ? 'SMART' : 'Ação');

/** O que faz: o texto do aviso de um gesto ("Ação X → projeto Y"). */
export function rotuloDoGesto(tarefa: Pick<LinkTask, 'basename' | 'type'>, intencao: Intencao): string {
    const nome = `${quem(tarefa)} ${tarefa.basename}`;
    switch (intencao.gesto) {
        case 'dia': return tarefa.type === 'tarefa_smart' ? `${nome} → semana ${isoWeekOf(intencao.data).slice(-3)}` : `${nome} → ${intencao.data.slice(8, 10)}/${intencao.data.slice(5, 7)}`;
        case 'semana': return `${nome} → ${intencao.semana.slice(-3)}`;
        case 'sem-data': return `${nome} → sem data`;
        case 'hora': return intencao.hora ? `${nome} → ${intencao.hora}` : `${nome} → sem hora`;
        case 'projeto': return `${nome} → projeto ${intencao.projeto.name}`;
        case 'ligar-smart': return `${nome} → SMART ${intencao.smart.basename}`;
        case 'mae-tarefa': return `${nome} → subtarefa de ${intencao.mae.basename}`;
        case 'desligar': return `Desligado: ${nome} ↛ ${intencao.ligacao.value ?? 'sem dia'}`;
    }
}
